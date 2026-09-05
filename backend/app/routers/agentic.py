"""
External Agentic Commerce API — for ChatGPT, Claude, Shopping Bots

Scope for v1: discovery → catalog read → guardrail-aware checkout request
Full conversational negotiation stays inside the in-portal agent.

Every external call is audited with actor='external_ai_buyer'.
"""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.merchant import Merchant
from app.models.product import Product
from app.models.guardrail import Guardrail
from app.schemas.agent import ExternalCheckoutRequest, ExternalCheckoutResponse
from app.agent.graph import run_from_external
from app.config import settings

router = APIRouter(tags=["agentic"])
well_known_router = APIRouter(tags=["discovery"])


# ─── Discovery Manifest ───────────────────────────────────────────────────────

@well_known_router.get("/.well-known/agentic-commerce.json")
def agentic_discovery(
    merchant_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    ACP-lite discovery manifest. External AI buyers hit this first to discover
    the merchant's capabilities, endpoints, and auth requirements.
    """
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    return {
        "protocol": "aibuyable-acp-lite/1.0",
        "merchant_id": merchant_id,
        "merchant_name": merchant.name,
        "capabilities": ["catalog_read", "checkout_request", "guardrail_disclosure"],
        "endpoints": {
            "catalog": f"{settings.BACKEND_URL}/api/v1/agentic/catalog?merchant_id={merchant_id}",
            "catalog_global": f"{settings.BACKEND_URL}/api/v1/agentic/catalog/all",
            "guardrails": f"{settings.BACKEND_URL}/api/v1/agentic/guardrails?merchant_id={merchant_id}",
            "checkout": f"{settings.BACKEND_URL}/api/v1/agentic/checkout",
        },
        "auth": {
            "type": "none_for_read",
            "checkout_requires": "merchant_id + valid product_ids",
        },
        "version": "1.0",
        "platform": "AIBuyable Gateway",
    }


# ─── Catalog Read ─────────────────────────────────────────────────────────────

@router.get("/api/v1/agentic/catalog/all")
def agentic_global_catalog(
    limit: int = Query(default=100, ge=1, le=1000),
    category: str = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Open Global Product Catalog for all AI LLMs (ChatGPT, Claude, Shopping Agents).
    Returns active products across ALL merchants on the platform without requiring a merchant_id.
    Includes merchant attribution for multi-merchant agentic shopping.
    """
    query = db.query(Product, Merchant).join(Merchant, Product.merchant_id == Merchant.id).filter(
        Product.is_active == True,
        Product.stock_qty > 0,
    )

    if category:
        query = query.filter(Product.category.ilike(f"%{category}%"))

    results = query.limit(limit).all()

    return [
        {
            "id": p.id,
            "merchant_id": m.id,
            "merchant_name": m.name,
            "store_website_url": m.store_website_url or "",
            "name": p.name,
            "price": p.price,
            "currency": p.currency,
            "stock_qty": p.stock_qty,
            "category": p.category or "",
            "description": (p.description or "")[:300],
            "image_url": p.image_url or "",
        }
        for p, m in results
    ]


@router.get("/api/v1/agentic/catalog")
def agentic_catalog(
    merchant_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Token-lean catalog for external AI buyers filtered by merchant_id.
    No internal fields (raw_scraped_json, etc.) exposed.
    """
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    products = db.query(Product).filter(
        Product.merchant_id == merchant_id,
        Product.is_active == True,
        Product.stock_qty > 0,
    ).all()

    return [
        {
            "id": p.id,
            "name": p.name,
            "price": p.price,
            "currency": p.currency,
            "stock_qty": p.stock_qty,
            "category": p.category or "",
            "description": (p.description or "")[:300],
            "image_url": p.image_url or "",
        }
        for p in products
    ]



# ─── Guardrail Disclosure ─────────────────────────────────────────────────────

@router.get("/api/v1/agentic/guardrails")
def agentic_guardrails(
    merchant_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Transparency endpoint — lets external agents know upfront what will/won't
    auto-approve, so they don't need to guess or probe via checkout.
    """
    g = db.query(Guardrail).filter(Guardrail.merchant_id == merchant_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Merchant guardrails not found")

    try:
        methods = json.loads(g.allowed_payment_methods or "[]")
    except Exception:
        methods = []

    return {
        "max_discount_percent": g.max_discount_percent,
        "max_auto_approve_amount": g.max_auto_approve_amount,
        "require_hitl_above_amount": g.require_hitl_above_amount,
        "allowed_payment_methods": methods,
        "note": "Orders exceeding max_auto_approve_amount or requested_discount above max_discount_percent will be escalated to the merchant for manual approval (HITL).",
    }


# ─── Checkout Request ─────────────────────────────────────────────────────────

@router.post("/api/v1/agentic/checkout", response_model=ExternalCheckoutResponse)
def agentic_checkout(
    request: ExternalCheckoutRequest,
    db: Session = Depends(get_db),
):
    """
    External AI Buyer checkout endpoint.
    Enters the shared LangGraph pipeline at select_and_price —
    SAME guardrail logic as the in-portal agent. No shortcuts.

    Every call is audited with actor='external_ai_buyer'.
    """
    merchant = db.query(Merchant).filter(Merchant.id == request.merchant_id).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    # Convert request items to the format expected by the pipeline
    items = [{"product_id": item.product_id, "qty": item.qty} for item in request.items]

    state = run_from_external(
        db=db,
        merchant_id=request.merchant_id,
        buyer_reference=request.buyer_reference,
        items=items,
        requested_discount_percent=request.requested_discount_percent or 0.0,
    )

    status_map = {
        "auto_approve": "approved",
        "hitl_required": "hitl_pending",
        "blocked": "cancelled",
        "": "failed",
    }
    order_status = status_map.get(state.get("guardrail_decision", ""), "failed")

    return ExternalCheckoutResponse(
        order_id=state.get("order_id") or "N/A",
        status=order_status,
        total_amount=state.get("pricing", {}).get("total_amount"),
        payment_link_url=state.get("payment_link_url"),
        explanation=state.get("guardrail_reason") or state.get("final_message", ""),
    )
