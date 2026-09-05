"""
LangGraph Pipeline Nodes

Each node is a pure function: CheckoutState -> CheckoutState (partial update).
Nodes write to the audit log and update the state. They never raise exceptions
to the caller — all errors are caught, logged, and surfaced as fallback messages.

LLM usage is STRICTLY LIMITED to:
  - parse_intent: extract structured fields from free text
  - (optional) compose_final_message: for richer phrasing (currently using templates)

ALL money math, guardrail decisions, and Razorpay calls are plain Python.
"""

import json
import uuid
import logging
import time
from datetime import datetime, date
from typing import Optional


from sqlalchemy.orm import Session
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

from app.agent.state import CheckoutState
from app.agent.guardrails import evaluate_guardrails, cap_discount, compute_pricing
from app.agent.razorpay_client import RazorpayClient, RazorpayError
from app.audit.audit_logger import log_event
from app.models.product import Product
from app.models.order import Order
from app.models.merchant import Merchant
from app.models.guardrail import Guardrail
from app.auth.encryption import decrypt_secret
from app.config import settings

logger = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_razorpay_client(merchant: Merchant) -> RazorpayClient:
    key_id = merchant.razorpay_key_id or ""
    key_secret = decrypt_secret(merchant.razorpay_key_secret_enc or "")
    return RazorpayClient(key_id, key_secret)


def _get_daily_agent_spend(db: Session, merchant_id: str) -> float:
    """Sum of total_amount for approved/paid agent orders created today."""
    today_start = datetime.combine(date.today(), datetime.min.time())
    orders = db.query(Order).filter(
        Order.merchant_id == merchant_id,
        Order.source.in_(["in_portal_agent", "external_ai_buyer"]),
        Order.status.in_(["approved", "paid"]),
        Order.created_at >= today_start,
    ).all()
    return sum(o.total_amount for o in orders)


# ─── Node 1: parse_intent ─────────────────────────────────────────────────────

def parse_intent_node(state: CheckoutState, db: Session) -> dict:
    """
    Uses Gemini to extract structured intent from free-text buyer message.
    Only called for in-portal chat flow; external API skips this node.
    LLM call returns: {is_intent_to_buy, product_query, quantity, requested_discount_percent, greeting_response}
    """
    buyer_message = state.get("buyer_message", "").strip()
    merchant_id = state["merchant_id"]

    log_event(
        db=db, merchant_id=merchant_id,
        step="parse_intent", decision="info",
        actor="agent",
        input_snapshot={"buyer_message": buyer_message},
        reason="Parsing buyer's natural language message into structured intent.",
    )

    lower_msg = buyer_message.lower().strip("!.,?")
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    store_name = merchant.name if merchant else "our store"

    # Check for basic greetings first
    greetings = {"hi", "hello", "hey", "hola", "namaste", "good morning", "good afternoon", "good evening", "help", "who are you", "what can you do"}
    if lower_msg in greetings or len(lower_msg) <= 2:
        greeting_text = f"Hello! 👋 I am the AI Shopping Assistant for **{store_name}**.\n\nHow can I help you today? You can search for products (e.g. *Headphones*, *Smartwatch*, *Keyboard*), ask about prices, or request special discounts!"
        llm_used = f"Gemini 2.5 Flash ({settings.DEFAULT_GEMINI_MODEL})" if settings.GOOGLE_API_KEY else "Fallback Parser"
        return {
            "parsed_intent": {"is_intent_to_buy": False, "product_query": ""},
            "is_intent_to_buy": False,
            "action": "greeting",
            "llm_used": llm_used,
            "current_step": "Greeting",
            "final_message": greeting_text,
            "guardrail_decision": "info",
            "guardrail_reason": "Greeting message.",
        }

    # Check for explicit checkout vs search action keywords
    explicit_checkout_keywords = {"buy", "order", "checkout", "purchase", "pay", "get 1", "get 2", "get 3", "place order"}
    is_explicit_checkout = any(kw in lower_msg for kw in explicit_checkout_keywords)
    default_action = "checkout" if is_explicit_checkout else "search"

    prompt = f"""You are an AI Shopping Assistant for '{store_name}'.
Analyze the buyer's message and return ONLY valid JSON with these fields:
{{
  "is_intent_to_buy": <boolean - true if the user wants to search for, inspect, or buy products; false if it is just a greeting, hi, hello, or general non-shopping query>,
  "action": "<string - 'checkout' ONLY if user explicitly wants to buy/order/checkout a specific item or clicked buy now; 'search' if user is browsing, searching, or asking what products exist>",
  "greeting_response": <string - friendly response if is_intent_to_buy is false>,
  "product_query": "<string - target product name if buying/searching, otherwise empty>",
  "quantity": <integer, default 1>,
  "requested_discount_percent": <float 0-100, default 0.0>
}}

Buyer Message: "{buyer_message}"

Rules for 'action':
- Use 'checkout' ONLY if user explicitly says 'buy', 'order', 'checkout', 'purchase', or requests an immediate payment link for a specific item.
- Use 'search' if user asks 'do you have X?', 'show me books', 'what products do you have?', 'looking for X', 'I want a laptop', or general browsing.

Important: Return ONLY the JSON object, no markdown code blocks, no explanation."""

    parsed = {
        "is_intent_to_buy": True,
        "action": default_action,
        "product_query": buyer_message,
        "quantity": 1,
        "requested_discount_percent": 0.0
    }
    llm_used = "Fallback Parser"

    if settings.GOOGLE_API_KEY:
        try:
            llm = ChatGoogleGenerativeAI(
                model=settings.DEFAULT_GEMINI_MODEL,
                google_api_key=settings.GOOGLE_API_KEY,
                temperature=0,
            )
            response = llm.invoke([HumanMessage(content=prompt)])
            content = response.content.strip()
            # Strip markdown fences if present
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            parsed = json.loads(content)
            llm_used = f"Gemini 2.5 Flash ({settings.DEFAULT_GEMINI_MODEL})"
        except Exception as e:
            logger.warning(f"Gemini parse_intent failed: {e}. Using fallback.")
            parsed = {
                "is_intent_to_buy": True,
                "action": default_action,
                "product_query": buyer_message,
                "quantity": 1,
                "requested_discount_percent": 0.0
            }
            llm_used = "Fallback Parser"

    if not parsed.get("is_intent_to_buy", True):
        greeting = parsed.get("greeting_response") or f"Hello! 👋 I am the AI Shopping Assistant for **{store_name}**.\n\nHow can I help you today? Feel free to ask about our available products!"
        return {
            "parsed_intent": parsed,
            "is_intent_to_buy": False,
            "action": "greeting",
            "llm_used": llm_used,
            "current_step": "Greeting",
            "final_message": greeting,
            "guardrail_decision": "info",
            "guardrail_reason": "Greeting or non-shopping query.",
        }

    log_event(
        db=db, merchant_id=merchant_id,
        step="parse_intent", decision="info",
        actor="agent",
        output_snapshot={"parsed_intent": parsed, "llm_used": llm_used},
        reason=f"Intent parsed via {llm_used}: action='{parsed.get('action')}', looking for '{parsed.get('product_query')}', qty {parsed.get('quantity')}, discount {parsed.get('requested_discount_percent')}%",
    )

    return {
        "parsed_intent": parsed,
        "is_intent_to_buy": True,
        "action": parsed.get("action", default_action),
        "llm_used": llm_used,
        "requested_discount_percent": float(parsed.get("requested_discount_percent", 0.0)),
        "current_step": "Searching catalog...",
    }


# ─── Node 2: get_catalog ──────────────────────────────────────────────────────

def get_catalog_node(state: CheckoutState, db: Session) -> dict:
    """
    Fetches active products for the merchant and finds the best text matches.
    If action is 'search', returns matching products without creating an order.
    """
    merchant_id = state["merchant_id"]
    parsed_intent = state.get("parsed_intent", {})
    product_query = parsed_intent.get("product_query", state.get("buyer_message", ""))
    action = state.get("action") or parsed_intent.get("action", "search")

    products = db.query(Product).filter(
        Product.merchant_id == merchant_id,
        Product.is_active == True,
        Product.stock_qty > 0,
    ).all()

    query_lower = product_query.lower()
    matched = []
    for p in products:
        name_lower = p.name.lower()
        desc_lower = (p.description or "").lower()
        category_lower = (p.category or "").lower()
        if (query_lower in name_lower or
                any(word in name_lower for word in query_lower.split() if len(word) > 2) or
                query_lower in desc_lower or
                query_lower in category_lower):
            matched.append({
                "id": p.id,
                "name": p.name,
                "price": p.price,
                "stock_qty": p.stock_qty,
                "description": p.description,
                "image_url": p.image_url,
                "category": p.category,
            })

    log_event(
        db=db, merchant_id=merchant_id,
        step="catalog_fetch", decision="info",
        actor="agent",
        output_snapshot={"matched_count": len(matched), "query": product_query, "top_matches": matched[:3]},
        reason=f"Found {len(matched)} products matching '{product_query}'. Action mode: {action}",
    )

    if not matched:
        return {
            "matched_products": [],
            "action": "search",
            "current_step": "No matching products",
            "final_message": f"I couldn't find any products matching '{product_query}' in our store catalog.\n\nPlease try searching for items like *Headphones*, *Smartwatch*, *Keyboard*, or *Power Bank*!",
            "guardrail_decision": "info",
            "guardrail_reason": "No matching products found.",
        }

    # If action is 'search', display products to user without starting checkout
    if action == "search":
        items_md = "\n".join([
            f"{i+1}. **{p['name']}** — ₹{p['price']:,.2f} ({p.get('category') or 'General'})\n   _{p.get('description', '')[:120]}..._"
            for i, p in enumerate(matched)
        ])
        
        final_msg = (
            f"Here are the matching products I found in our store catalog:\n\n"
            f"{items_md}\n\n"
            f"💡 **How to order:** Click **'Buy Now'** on any product card below, or reply with e.g. *'buy {matched[0]['name']}'* to generate your payment link!"
        )

        return {
            "matched_products": matched,
            "action": "search",
            "current_step": "Products Found",
            "final_message": final_msg,
            "guardrail_decision": "info",
            "guardrail_reason": "Catalog search results presented to buyer.",
        }

    return {
        "matched_products": matched,
        "action": "checkout",
        "current_step": "Checking availability...",
    }


# ─── Node 3: select_and_price ─────────────────────────────────────────────────

def select_and_price_node(state: CheckoutState, db: Session) -> dict:
    """
    Resolves matched products into selected items with live prices.
    Checks stock. Computes subtotal from DB prices (NEVER LLM-stated prices).

    For external API flow: state already has selected_items set from the request;
    this node verifies stock and recomputes prices from DB.
    """
    merchant_id = state["merchant_id"]
    parsed_intent = state.get("parsed_intent", {})
    quantity = int(parsed_intent.get("quantity", 1))
    matched = state.get("matched_products", [])

    # External API flow: items come pre-specified
    external_items = state.get("selected_items", [])
    if external_items and not matched:
        # Re-fetch from DB to get live prices
        selected_items = []
        subtotal = 0.0
        for item in external_items:
            product = db.query(Product).filter(Product.id == item["product_id"]).first()
            if not product or not product.is_active:
                return {
                    "current_step": "Product unavailable",
                    "final_message": f"Product {item['product_id']} is no longer available.",
                    "guardrail_decision": "blocked",
                    "guardrail_reason": "Requested product is inactive or not found.",
                }
            if product.stock_qty < item["qty"]:
                return {
                    "current_step": "Insufficient stock",
                    "final_message": f"Sorry, we only have {product.stock_qty} units of '{product.name}' available (you requested {item['qty']}).",
                    "guardrail_decision": "blocked",
                    "guardrail_reason": f"Insufficient stock for {product.name}.",
                }
            line_total = product.price * item["qty"]
            subtotal += line_total
            selected_items.append({
                "product_id": product.id,
                "name": product.name,
                "qty": item["qty"],
                "unit_price": product.price,
                "discount_percent": 0.0,  # applied later in check_discount
                "line_total": line_total,
            })
    else:
        # In-portal flow: use top match + requested quantity
        if not matched:
            return {
                "current_step": "No products found",
                "final_message": "I couldn't find any matching products.",
                "guardrail_decision": "blocked",
                "guardrail_reason": "No matching products.",
            }
        top = matched[0]
        product = db.query(Product).filter(Product.id == top["id"]).first()
        if not product or not product.is_active:
            return {
                "current_step": "Product unavailable",
                "final_message": f"'{top['name']}' is no longer available.",
                "guardrail_decision": "blocked",
                "guardrail_reason": "Product inactive.",
            }
        if product.stock_qty < quantity:
            return {
                "current_step": "Insufficient stock",
                "final_message": f"Sorry, we only have {product.stock_qty} units of '{product.name}' in stock (you requested {quantity}).",
                "guardrail_decision": "blocked",
                "guardrail_reason": f"Insufficient stock for {product.name}.",
            }
        line_total = product.price * quantity
        subtotal = line_total
        selected_items = [{
            "product_id": product.id,
            "name": product.name,
            "qty": quantity,
            "unit_price": product.price,  # live price from DB
            "discount_percent": 0.0,
            "line_total": line_total,
        }]

    log_event(
        db=db, merchant_id=merchant_id,
        step="pricing_computed", decision="info",
        actor="agent",
        output_snapshot={"selected_items": selected_items, "subtotal": subtotal},
        reason=f"Priced {len(selected_items)} line item(s). Subtotal: ₹{subtotal:,.2f} (live DB prices, not LLM-stated).",
    )

    return {
        "selected_items": selected_items,
        "pricing": {"subtotal": subtotal, "discount_amount": 0.0, "total_amount": subtotal},
        "current_step": "Checking discount eligibility...",
    }


# ─── Node 4: check_discount_eligibility ──────────────────────────────────────

def check_discount_eligibility_node(state: CheckoutState, db: Session) -> dict:
    """
    Caps the discount at the merchant's maximum. Enforced in code — NOT by LLM.
    """
    merchant_id = state["merchant_id"]
    requested = state.get("requested_discount_percent", 0.0)
    guardrails_config = state.get("guardrails_config", {})
    max_discount = guardrails_config.get("max_discount_percent", 15.0)
    subtotal = state.get("pricing", {}).get("subtotal", 0.0)

    applied = cap_discount(requested, max_discount)
    pricing = compute_pricing(subtotal, applied)

    decision = "allowed" if applied == requested else "capped"
    reason = (
        f"Discount of {applied:.1f}% applied."
        if applied == requested
        else f"Requested discount {requested:.1f}% exceeded cap of {max_discount:.1f}%. Applied {applied:.1f}%."
    )

    log_event(
        db=db, merchant_id=merchant_id,
        step="discount_check", decision=decision,
        actor="agent",
        input_snapshot={"requested_discount_percent": requested, "max_discount_percent": max_discount},
        output_snapshot={"applied_discount_percent": applied, "pricing": pricing},
        reason=reason,
    )

    # Update line items with applied discount
    selected_items = state.get("selected_items", [])
    for item in selected_items:
        item["discount_percent"] = applied
        item["line_total"] = round(item["unit_price"] * item["qty"] * (1 - applied / 100), 2)

    return {
        "applied_discount_percent": applied,
        "pricing": pricing,
        "selected_items": selected_items,
        "current_step": "Running guardrail checks...",
    }


# ─── Node 5: guardrail_check ──────────────────────────────────────────────────

def guardrail_check_node(state: CheckoutState, db: Session) -> dict:
    """
    THE GATE — evaluates the merchant's guardrail rules.
    This node MUST run before any Razorpay call. Cannot be bypassed.
    Writes a mandatory audit row regardless of outcome.
    """
    merchant_id = state["merchant_id"]
    pricing = state.get("pricing", {})
    requested_discount = state.get("requested_discount_percent", 0.0)
    guardrails_config = state.get("guardrails_config", {})
    daily_spent = _get_daily_agent_spend(db, merchant_id)

    result = evaluate_guardrails(
        pricing=pricing,
        requested_discount_percent=requested_discount,
        guardrail_config=guardrails_config,
        daily_spent=daily_spent,
    )

    # Mandatory audit row — written BEFORE any branching
    audit_decision = "allowed" if result.guardrail_decision == "auto_approve" else "escalated"
    log_event(
        db=db, merchant_id=merchant_id,
        step="guardrail_check", decision=audit_decision,
        actor="agent",
        input_snapshot={"pricing": pricing, "requested_discount": requested_discount, "daily_spent": daily_spent},
        output_snapshot={"guardrail_decision": result.guardrail_decision, "reason": result.guardrail_reason},
        reason=result.guardrail_reason,
    )

    return {
        "guardrail_decision": result.guardrail_decision,
        "guardrail_reason": result.guardrail_reason,
        "applied_discount_percent": result.applied_discount_percent,
        "current_step": "Guardrail check complete.",
    }


# ─── Node 6a: create_razorpay_order ──────────────────────────────────────────

def create_razorpay_order_node(state: CheckoutState, db: Session) -> dict:
    """
    Creates a Razorpay order + payment link.
    Called only if guardrail_decision == 'auto_approve'.
    On success: writes order to DB, decrements stock, returns payment link URL.
    On failure: routes to fallback_handler.
    """
    merchant_id = state["merchant_id"]
    order_id = state.get("order_id") or str(uuid.uuid4())
    pricing = state.get("pricing", {})
    selected_items = state.get("selected_items", [])
    source = state.get("source", "in_portal_agent")
    buyer_reference = state.get("buyer_reference", "")
    fault_mode = state.get("fault_mode")  # Only set by Reliability Panel

    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    rzp = _get_razorpay_client(merchant)

    try:
        # Always use INR — Razorpay's UPI / Netbanking / Indian cards only work in INR.
        # Foreign-currency product prices (USD, GBP) are treated as INR at face value.
        description = f"AIBuyable Order - {', '.join(i['name'] for i in selected_items[:3])}"
        rzp_order = rzp.create_order(
            amount_inr=pricing["total_amount"],
            order_id=order_id,
            merchant_id=merchant_id,
            source=source,
            currency="INR",
            fault_mode=fault_mode,
        )

        # Create payment link — callback_url brings buyer back to our success page
        callback_url = f"{settings.BACKEND_URL}/api/v1/payment/verify"
        payment_link = rzp.create_payment_link(
            amount_inr=pricing["total_amount"],
            order_id=order_id,
            description=description,
            currency="INR",
            callback_url=callback_url,
            fault_mode=fault_mode,
        )

        # Save order to DB
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            order = Order(id=order_id)
            db.add(order)
            
        order.merchant_id = merchant_id
        order.source = source
        order.buyer_reference = buyer_reference
        order.status = "approved"
        order.items = json.dumps(selected_items)
        order.requested_discount_percent = state.get("requested_discount_percent", 0.0)
        order.subtotal = pricing["subtotal"]
        order.discount_amount = pricing["discount_amount"]
        order.total_amount = pricing["total_amount"]
        order.razorpay_order_id = rzp_order.get("id")
        order.razorpay_payment_link_id = payment_link.get("id")
        order.razorpay_payment_link_url = payment_link.get("short_url")

        # Note: Stock decrement has been moved to the /payment/verify webhook
        # to ensure stock is only reduced upon actual successful payment.
        db.commit()

        log_event(
            db=db, merchant_id=merchant_id,
            order_id=order_id,
            step="razorpay_order_created", decision="allowed",
            actor="agent",
            output_snapshot={
                "razorpay_order_id": rzp_order.get("id"),
                "payment_link_url": payment_link.get("short_url"),
                "total_amount": pricing["total_amount"],
            },
            reason=f"Razorpay order and payment link created successfully. Total: ₹{pricing['total_amount']:,.2f}",
        )

        return {
            "order_id": order_id,
            "razorpay_order_id": rzp_order.get("id"),
            "payment_link_url": payment_link.get("short_url"),
            "fallback_triggered": False,
            "current_step": "Payment link ready!",
        }

    except RazorpayError as e:
        # Route to fallback — NEVER surface raw exception
        logger.error(f"Razorpay error for order {order_id}: {e}")
        return {
            "order_id": order_id,
            "fallback_triggered": True,
            "fallback_reason": e.fault_type or "razorpay_error",
            "_razorpay_error_message": str(e),
            "current_step": "Payment gateway issue — handling gracefully...",
        }


# ─── Node 6b: escalate_to_hitl ───────────────────────────────────────────────

def escalate_to_hitl_node(state: CheckoutState, db: Session) -> dict:
    """
    Saves order as hitl_pending. A separate hitl_resume graph handles
    the merchant's Approve action.
    """
    merchant_id = state["merchant_id"]
    order_id = state.get("order_id") or str(uuid.uuid4())
    pricing = state.get("pricing", {})
    selected_items = state.get("selected_items", [])
    source = state.get("source", "in_portal_agent")
    buyer_reference = state.get("buyer_reference", "")
    guardrail_reason = state.get("guardrail_reason", "")

    # Create the order in hitl_pending state
    order = Order(
        id=order_id,
        merchant_id=merchant_id,
        source=source,
        buyer_reference=buyer_reference,
        status="hitl_pending",
        items=json.dumps(selected_items),
        requested_discount_percent=state.get("requested_discount_percent", 0.0),
        subtotal=pricing.get("subtotal", 0.0),
        discount_amount=pricing.get("discount_amount", 0.0),
        total_amount=pricing.get("total_amount", 0.0),
    )
    db.add(order)
    db.commit()

    log_event(
        db=db, merchant_id=merchant_id,
        order_id=order_id,
        step="escalated_to_hitl", decision="escalated",
        actor="agent",
        output_snapshot={"guardrail_reason": guardrail_reason, "total": pricing.get("total_amount")},
        reason=guardrail_reason,
    )

    return {
        "order_id": order_id,
        "current_step": "Awaiting merchant approval",
        "final_message": (
            f"Your order (₹{pricing.get('total_amount', 0):,.2f}) has been sent to "
            f"the merchant for approval.\n\n**Reason:** {guardrail_reason}\n\n"
            f"You'll be notified once it's reviewed. Order ID: `{order_id}`"
        ),
    }


# ─── Node: fallback_handler ───────────────────────────────────────────────────

def fallback_handler_node(state: CheckoutState, db: Session) -> dict:
    """
    Handles Razorpay failures gracefully.
    - Razorpay timeout: retry once, mark order as pending, offer to notify buyer
    - Insufficient funds: suggest different payment method
    - Expired payment link: issue a fresh link

    The buyer ALWAYS gets one of the templated messages below.
    Raw exceptions are NEVER surfaced.
    """
    merchant_id = state["merchant_id"]
    order_id = state.get("order_id")
    fallback_reason = state.get("fallback_reason", "razorpay_error")
    error_message = state.get("_razorpay_error_message", "")
    pricing = state.get("pricing", {})

    # Update order status
    if order_id:
        order = db.query(Order).filter(Order.id == order_id).first()
        if order:
            if fallback_reason == "razorpay_timeout":
                order.status = "pending"
                order.failure_reason = "Payment gateway timeout — retry pending"
            elif fallback_reason == "insufficient_funds":
                order.status = "failed"
                order.failure_reason = "Insufficient funds"
            elif fallback_reason == "payment_link_expired":
                order.status = "pending"
                order.failure_reason = "Payment link expired — awaiting refresh"
            else:
                order.status = "failed"
                order.failure_reason = fallback_reason
            db.commit()

    # Templated buyer-facing messages (never raw exception text)
    messages = {
        "razorpay_timeout": (
            "⚠️ Payment gateway is momentarily unavailable — I've saved your order "
            "and will retry automatically. **You won't be charged twice.** "
            f"Order ID: `{order_id}`"
        ),
        "insufficient_funds": (
            "❌ Your payment didn't go through due to insufficient funds. "
            "Would you like to try a different payment method? "
            f"Order ID: `{order_id}`"
        ),
        "payment_link_expired": (
            "⏰ That payment link expired — here's a fresh one, valid for 15 minutes. "
            f"Order ID: `{order_id}`"
        ),
    }
    buyer_message = messages.get(fallback_reason, (
        "⚠️ There was an issue processing your payment. Your order has been saved. "
        f"Please contact support with Order ID: `{order_id}`"
    ))

    log_event(
        db=db, merchant_id=merchant_id,
        order_id=order_id,
        step="fallback_triggered", decision="escalated",
        actor="agent",
        input_snapshot={"fallback_reason": fallback_reason},
        output_snapshot={"buyer_message": buyer_message, "order_status": "pending/failed"},
        reason=f"Fallback triggered: {fallback_reason}. Buyer shown a graceful, specific message.",
    )

    return {
        "fallback_triggered": True,
        "fallback_reason": fallback_reason,
        "final_message": buyer_message,
        "current_step": "Handled gracefully",
    }


# ─── Node: compose_final_message ─────────────────────────────────────────────

def compose_final_message_node(state: CheckoutState, db: Session) -> dict:
    """
    Assembles the final buyer-facing message.
    Uses templates (not LLM) for reliability and consistency.
    Always includes: what was ordered, final price after discount, payment link or status.
    """
    # If message was already set by a terminal node, pass through
    if state.get("final_message") and state.get("guardrail_decision") in ("blocked", None):
        return {}

    if state.get("final_message") and state.get("fallback_triggered"):
        return {}

    pricing = state.get("pricing", {})
    selected_items = state.get("selected_items", [])
    payment_link = state.get("payment_link_url")
    order_id = state.get("order_id")
    guardrail_decision = state.get("guardrail_decision", "")
    guardrail_reason = state.get("guardrail_reason", "")
    applied_discount = state.get("applied_discount_percent", 0.0)

    # Build items summary
    items_text = "\n".join(
        f"- {i['name']} × {i['qty']} @ ₹{i['unit_price']:,.2f} = ₹{i['line_total']:,.2f}"
        for i in selected_items
    )

    if guardrail_decision == "auto_approve" and payment_link:
        discount_note = f"\n💰 Discount ({applied_discount:.1f}%): -₹{pricing.get('discount_amount', 0):,.2f}" if applied_discount > 0 else ""
        message = (
            f"✅ **Order Confirmed!**\n\n"
            f"**Items:**\n{items_text}\n\n"
            f"**Subtotal:** ₹{pricing.get('subtotal', 0):,.2f}{discount_note}\n"
            f"**Total:** ₹{pricing.get('total_amount', 0):,.2f}\n\n"
            f"**[Pay Now →]({payment_link})**\n\n"
            f"Order ID: `{order_id}`"
        )
    elif guardrail_decision == "hitl_required":
        message = state.get("final_message", "Your order has been escalated for merchant approval.")
    else:
        message = state.get("final_message", "Your request has been processed.")

    return {"final_message": message, "current_step": "Done"}
