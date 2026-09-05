"""
LangGraph StateGraph — Checkout Pipeline

Wires all nodes into the explicit state machine described in the spec.

Two entry points:
  - run_from_chat(): In-portal buyer chat → starts at parse_intent
  - run_from_external(): External AI buyer → starts at select_and_price
    (catalog reading already done by the external agent via the catalog API)

The guardrail_check node CANNOT be bypassed by either entry point.
Both paths go through check_discount_eligibility → guardrail_check → {create_razorpay_order | escalate_to_hitl}.
"""

import json
import logging
from typing import Optional
from sqlalchemy.orm import Session

from app.agent.state import CheckoutState
from app.agent.nodes import (
    parse_intent_node,
    get_catalog_node,
    select_and_price_node,
    check_discount_eligibility_node,
    guardrail_check_node,
    create_razorpay_order_node,
    escalate_to_hitl_node,
    fallback_handler_node,
    compose_final_message_node,
)
from app.models.guardrail import Guardrail

logger = logging.getLogger(__name__)


def _load_guardrails(db: Session, merchant_id: str) -> dict:
    """Load merchant guardrails from DB into a plain dict for the state."""
    g = db.query(Guardrail).filter(Guardrail.merchant_id == merchant_id).first()
    if not g:
        return {
            "max_discount_percent": 15.0,
            "max_auto_approve_amount": 5000.0,
            "require_hitl_above_amount": 10000.0,
            "daily_agent_spend_cap": None,
            "allowed_payment_methods": ["upi", "card", "netbanking", "wallet"],
        }
    try:
        methods = json.loads(g.allowed_payment_methods or '[]')
    except Exception:
        methods = ["upi", "card", "netbanking", "wallet"]
    return {
        "max_discount_percent": g.max_discount_percent,
        "max_auto_approve_amount": g.max_auto_approve_amount,
        "require_hitl_above_amount": g.require_hitl_above_amount,
        "daily_agent_spend_cap": g.daily_agent_spend_cap,
        "allowed_payment_methods": methods,
    }


def _run_pipeline(state: CheckoutState, db: Session, start_node: str) -> CheckoutState:
    """
    Execute the checkout pipeline manually (without LangGraph's compiled graph)
    for maximum reliability and debuggability in the hackathon scope.

    Each node updates the state dict in place; we check for terminal conditions
    after each node that can produce them.
    """
    # Load guardrails into state
    state["guardrails_config"] = _load_guardrails(db, state["merchant_id"])

    # Defaults
    state.setdefault("fallback_triggered", False)
    state.setdefault("fallback_reason", None)
    state.setdefault("final_message", "")
    state.setdefault("current_step", "Starting...")
    state.setdefault("order_id", None)
    state.setdefault("payment_link_url", None)
    state.setdefault("guardrail_decision", "")
    state.setdefault("guardrail_reason", "")
    state.setdefault("parsed_intent", {})
    state.setdefault("matched_products", [])
    state.setdefault("selected_items", [])
    state.setdefault("pricing", {"subtotal": 0.0, "discount_amount": 0.0, "total_amount": 0.0})
    state.setdefault("applied_discount_percent", 0.0)
    state.setdefault("requested_discount_percent", 0.0)

    try:
        # ── Step 1: parse_intent (in-portal only) ─────────────────────────
        if start_node == "parse_intent":
            updates = parse_intent_node(state, db)
            state.update(updates)

            # Terminal: non-shopping intent or greeting
            if state.get("is_intent_to_buy") is False or state.get("guardrail_decision") == "info":
                return state

            # ── Step 2: get_catalog ───────────────────────────────────────
            updates = get_catalog_node(state, db)
            state.update(updates)

            # Terminal: no match OR search action mode
            if not state.get("matched_products") or state.get("action") == "search" or state.get("guardrail_decision") == "info":
                updates = compose_final_message_node(state, db)
                state.update(updates)
                return state

        # ── Step 3: select_and_price ──────────────────────────────────────
        updates = select_and_price_node(state, db)
        state.update(updates)

        # Terminal: stock error or blocked
        if state.get("guardrail_decision") == "blocked":
            updates = compose_final_message_node(state, db)
            state.update(updates)
            return state

        # ── Step 4: check_discount_eligibility ────────────────────────────
        updates = check_discount_eligibility_node(state, db)
        state.update(updates)

        # ── Step 5: guardrail_check (THE GATE — cannot be bypassed) ───────
        updates = guardrail_check_node(state, db)
        state.update(updates)

        # ── Branch based on guardrail decision ────────────────────────────
        if state["guardrail_decision"] == "auto_approve":
            # ── Step 6a: create_razorpay_order ────────────────────────────
            updates = create_razorpay_order_node(state, db)
            state.update(updates)

            if state.get("fallback_triggered"):
                # ── Fallback handler ──────────────────────────────────────
                updates = fallback_handler_node(state, db)
                state.update(updates)
        else:
            # ── Step 6b: escalate_to_hitl ─────────────────────────────────
            updates = escalate_to_hitl_node(state, db)
            state.update(updates)

        # ── Step 7: compose_final_message ─────────────────────────────────
        if not state.get("final_message"):
            updates = compose_final_message_node(state, db)
            state.update(updates)

    except Exception as e:
        logger.exception(f"Unhandled pipeline error: {e}")
        state["final_message"] = (
            "⚠️ An unexpected error occurred processing your request. "
            "Your order has been saved and our team has been notified. "
            "Please try again or contact support."
        )
        state["current_step"] = "Error"
        state["fallback_triggered"] = True

    return state


def run_from_chat(
    db: Session,
    merchant_id: str,
    buyer_message: str,
    buyer_reference: str = "in-portal-session",
    fault_mode: Optional[str] = None,
) -> CheckoutState:
    """Entry point for in-portal AI Buyer Chatbot. Starts at parse_intent."""
    state: CheckoutState = {
        "merchant_id": merchant_id,
        "buyer_message": buyer_message,
        "buyer_reference": buyer_reference,
        "source": "in_portal_agent",
        "fault_mode": fault_mode,
        # All other fields populated by nodes
        "parsed_intent": {},
        "matched_products": [],
        "selected_items": [],
        "requested_discount_percent": 0.0,
        "applied_discount_percent": 0.0,
        "guardrails_config": {},
        "pricing": {},
        "guardrail_decision": "",
        "guardrail_reason": "",
        "order_id": None,
        "razorpay_order_id": None,
        "payment_link_url": None,
        "fallback_triggered": False,
        "fallback_reason": None,
        "final_message": "",
        "current_step": "Parsing intent...",
    }
    return _run_pipeline(state, db, start_node="parse_intent")


def run_from_external(
    db: Session,
    merchant_id: str,
    buyer_reference: str,
    items: list,
    requested_discount_percent: float = 0.0,
    fault_mode: Optional[str] = None,
) -> CheckoutState:
    """
    Entry point for External AI Buyer API.
    Skips parse_intent and get_catalog (external agent read the catalog directly).
    Starts at select_and_price — SAME guardrail logic applies.
    """
    state: CheckoutState = {
        "merchant_id": merchant_id,
        "buyer_message": "",
        "buyer_reference": buyer_reference,
        "source": "external_ai_buyer",
        "fault_mode": fault_mode,
        "parsed_intent": {},
        "matched_products": [],
        "selected_items": items,  # Pre-specified by external agent
        "requested_discount_percent": requested_discount_percent,
        "applied_discount_percent": 0.0,
        "guardrails_config": {},
        "pricing": {},
        "guardrail_decision": "",
        "guardrail_reason": "",
        "order_id": None,
        "razorpay_order_id": None,
        "payment_link_url": None,
        "fallback_triggered": False,
        "fallback_reason": None,
        "final_message": "",
        "current_step": "Verifying items...",
    }
    return _run_pipeline(state, db, start_node="select_and_price")


def run_hitl_resume(
    db: Session,
    order_id: str,
    merchant_id: str,
    approved_by: str,
) -> dict:
    """
    Triggered by the merchant's Approve action in the HITL Inbox.
    Re-enters the pipeline at create_razorpay_order for the already-escalated order.
    """
    from app.models.order import Order
    from app.audit.audit_logger import log_event

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        return {"error": "Order not found"}

    if order.status != "hitl_pending":
        return {"error": f"Order is in status '{order.status}', not 'hitl_pending'"}

    # Mark HITL approval
    from datetime import datetime
    order.hitl_approved_by = approved_by
    order.hitl_approved_at = datetime.utcnow()
    db.commit()

    log_event(
        db=db, merchant_id=merchant_id,
        order_id=order_id,
        step="hitl_approved", decision="allowed",
        actor="merchant",
        output_snapshot={"approved_by": approved_by},
        reason=f"Merchant approved the order. Proceeding to payment link creation.",
    )

    # Build state from saved order
    try:
        items = json.loads(order.items or "[]")
    except Exception:
        items = []

    state: CheckoutState = {
        "merchant_id": merchant_id,
        "buyer_message": "",
        "buyer_reference": order.buyer_reference or "",
        "source": order.source,
        "fault_mode": None,
        "parsed_intent": {},
        "matched_products": [],
        "selected_items": items,
        "requested_discount_percent": order.requested_discount_percent,
        "applied_discount_percent": order.requested_discount_percent,
        "guardrails_config": {},
        "pricing": {
            "subtotal": order.subtotal,
            "discount_amount": order.discount_amount,
            "total_amount": order.total_amount,
        },
        "guardrail_decision": "auto_approve",  # merchant explicitly approved
        "guardrail_reason": "Merchant manually approved this order via HITL Inbox.",
        "order_id": order_id,
        "razorpay_order_id": None,
        "payment_link_url": None,
        "fallback_triggered": False,
        "fallback_reason": None,
        "final_message": "",
        "current_step": "Creating payment link...",
    }

    updates = create_razorpay_order_node(state, db)
    state.update(updates)

    if state.get("fallback_triggered"):
        updates = fallback_handler_node(state, db)
        state.update(updates)

    return {
        "order_id": order_id,
        "payment_link_url": state.get("payment_link_url"),
        "status": "approved",
        "final_message": state.get("final_message", "Order approved and payment link created."),
    }
