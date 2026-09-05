"""
Razorpay Webhooks Router

Handles payment status callbacks from Razorpay Test Mode.
- payment.captured → order status = 'paid', stock confirmed decremented
- payment.failed → order status = 'failed', stock restored (if pre-decremented)
"""

import json
import logging
from fastapi import APIRouter, Request, HTTPException
from sqlalchemy.orm import Session
from fastapi import Depends

from app.db import get_db
from app.models.order import Order
from app.models.product import Product
from app.audit.audit_logger import log_event

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])


@router.post("/razorpay")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Handle Razorpay webhook events.
    In test mode, Razorpay sends these events when payment status changes.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event = body.get("event", "")
    payload = body.get("payload", {})

    if event == "payment.captured":
        # Payment successful
        payment = payload.get("payment", {}).get("entity", {})
        razorpay_order_id = payment.get("order_id")

        if razorpay_order_id:
            order = db.query(Order).filter(
                Order.razorpay_order_id == razorpay_order_id
            ).first()
            if order and order.status == "approved":
                order.status = "paid"
                db.commit()

                log_event(
                    db=db, merchant_id=order.merchant_id,
                    order_id=order.id,
                    step="payment_captured", decision="allowed",
                    actor="system",
                    output_snapshot={"razorpay_payment_id": payment.get("id")},
                    reason=f"Payment captured successfully. Amount: ₹{payment.get('amount', 0) / 100:,.2f}",
                )
                logger.info(f"Order {order.id} marked as paid")

    elif event == "payment.failed":
        # Payment failed — restore stock
        payment = payload.get("payment", {}).get("entity", {})
        razorpay_order_id = payment.get("order_id")
        error_reason = payment.get("error_reason", "unknown")

        if razorpay_order_id:
            order = db.query(Order).filter(
                Order.razorpay_order_id == razorpay_order_id
            ).first()
            if order and order.status == "approved":
                order.status = "failed"
                order.failure_reason = error_reason
                db.commit()

                # Restore stock
                try:
                    items = json.loads(order.items or "[]")
                    for item in items:
                        product = db.query(Product).filter(Product.id == item["product_id"]).first()
                        if product:
                            product.stock_qty += item.get("qty", 0)
                    db.commit()
                except Exception as e:
                    logger.error(f"Stock restore failed for order {order.id}: {e}")

                log_event(
                    db=db, merchant_id=order.merchant_id,
                    order_id=order.id,
                    step="payment_failed", decision="blocked",
                    actor="system",
                    output_snapshot={"error_reason": error_reason},
                    reason=f"Payment failed: {error_reason}. Stock restored.",
                )

    return {"received": True, "event": event}
