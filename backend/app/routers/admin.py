import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from app.db import get_db
from app.auth.dependencies import require_role
from app.models.merchant import Merchant
from app.models.product import Product
from app.models.order import Order
from app.models.audit_log import AuditLog
from app.models.guardrail import Guardrail

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/merchants")
def list_merchants(
    db: Session = Depends(get_db),
    current_user: Merchant = Depends(require_role("admin")),
):
    """
    Platform-wide merchant list with metrics.
    Admin read-only — cannot edit merchant guardrails or place orders.
    """
    merchants = db.query(Merchant).filter(Merchant.role == "merchant").all()
    result = []

    for m in merchants:
        product_count = db.query(Product).filter(Product.merchant_id == m.id).count()
        order_count = db.query(Order).filter(Order.merchant_id == m.id).count()

        # GMV = sum of paid/approved orders
        gmv_row = db.query(func.sum(Order.total_amount)).filter(
            Order.merchant_id == m.id,
            Order.status.in_(["paid", "approved"]),
        ).scalar()
        gmv = float(gmv_row or 0)

        # Auto-approved vs HITL vs failed
        auto_approved = db.query(Order).filter(
            Order.merchant_id == m.id,
            Order.status.in_(["approved", "paid"]),
        ).count()
        hitl_escalated = db.query(Order).filter(
            Order.merchant_id == m.id,
            Order.status == "hitl_pending",
        ).count()
        failed = db.query(Order).filter(
            Order.merchant_id == m.id,
            Order.status.in_(["failed", "cancelled"]),
        ).count()

        result.append({
            "id": m.id,
            "name": m.name,
            "email": m.email,
            "store_website_url": m.store_website_url,
            "crawl_status": m.crawl_status,
            "product_count": product_count,
            "order_count": order_count,
            "gmv": gmv,
            "auto_approved": auto_approved,
            "hitl_escalated": hitl_escalated,
            "failed": failed,
            "created_at": m.created_at,
        })

    # Platform-wide stats
    total_gmv_row = db.query(func.sum(Order.total_amount)).filter(
        Order.status.in_(["paid", "approved"])
    ).scalar()

    return {
        "merchants": result,
        "platform_stats": {
            "total_merchants": len(merchants),
            "total_gmv": float(total_gmv_row or 0),
            "total_orders": sum(m["order_count"] for m in result),
            "total_auto_approved": sum(m["auto_approved"] for m in result),
            "total_hitl_escalated": sum(m["hitl_escalated"] for m in result),
            "total_failed": sum(m["failed"] for m in result),
        },
    }


@router.get("/merchants/{merchant_id}")
def get_merchant_detail(
    merchant_id: str,
    db: Session = Depends(get_db),
    current_user: Merchant = Depends(require_role("admin")),
):
    """Admin drill-down for a single merchant — guardrails, products, orders, audit log."""
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Merchant not found")

    guardrail = db.query(Guardrail).filter(Guardrail.merchant_id == merchant_id).first()
    products = db.query(Product).filter(Product.merchant_id == merchant_id).limit(50).all()
    orders = db.query(Order).filter(Order.merchant_id == merchant_id).order_by(Order.created_at.desc()).limit(50).all()
    audit_logs = db.query(AuditLog).filter(AuditLog.merchant_id == merchant_id).order_by(AuditLog.created_at.desc()).limit(100).all()

    def parse_guardrail(g):
        if not g:
            return None
        try:
            methods = json.loads(g.allowed_payment_methods or "[]")
        except Exception:
            methods = []
        return {
            "max_discount_percent": g.max_discount_percent,
            "max_auto_approve_amount": g.max_auto_approve_amount,
            "require_hitl_above_amount": g.require_hitl_above_amount,
            "daily_agent_spend_cap": g.daily_agent_spend_cap,
            "allowed_payment_methods": methods,
        }

    def parse_order(o):
        try:
            items = json.loads(o.items or "[]")
        except Exception:
            items = []
        return {
            "id": o.id,
            "source": o.source,
            "status": o.status,
            "total_amount": o.total_amount,
            "items": items,
            "created_at": o.created_at,
        }

    def parse_log(l):
        try:
            input_snap = json.loads(l.input_snapshot) if l.input_snapshot else None
        except Exception:
            input_snap = None
        try:
            output_snap = json.loads(l.output_snapshot) if l.output_snapshot else None
        except Exception:
            output_snap = None
        return {
            "id": l.id,
            "order_id": l.order_id,
            "actor": l.actor,
            "step": l.step,
            "decision": l.decision,
            "reason": l.reason,
            "input_snapshot": input_snap,
            "output_snapshot": output_snap,
            "created_at": l.created_at,
        }

    return {
        "merchant": {
            "id": merchant.id,
            "name": merchant.name,
            "email": merchant.email,
            "store_website_url": merchant.store_website_url,
            "crawl_status": merchant.crawl_status,
            "created_at": merchant.created_at,
        },
        "guardrails": parse_guardrail(guardrail),
        "products": [{"id": p.id, "name": p.name, "price": p.price, "stock_qty": p.stock_qty, "is_active": p.is_active} for p in products],
        "orders": [parse_order(o) for o in orders],
        "audit_logs": [parse_log(l) for l in audit_logs],
    }
