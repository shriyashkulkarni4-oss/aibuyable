import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.db import Base


def gen_uuid():
    return str(uuid.uuid4())


class Order(Base):
    """
    Status flow:
    pending → hitl_pending → approved → paid
                           ↘ cancelled (rejected by merchant)
    pending → approved → paid
    pending → failed
    pending → expired
    """
    __tablename__ = "orders"

    id = Column(String, primary_key=True, default=gen_uuid)
    merchant_id = Column(String, ForeignKey("merchants.id"), nullable=False, index=True)

    # Source of the order
    source = Column(String, nullable=False)  # 'in_portal_agent' | 'external_ai_buyer'
    buyer_reference = Column(String, nullable=True)  # session id / external agent id

    # Order lifecycle status
    status = Column(String, nullable=False, default="pending")
    # pending | hitl_pending | approved | paid | failed | expired | cancelled

    # Line items — JSON string: [{product_id, qty, unit_price, discount_percent, line_total}]
    items = Column(Text, nullable=False, default="[]")

    requested_discount_percent = Column(Float, nullable=False, default=0.0)
    subtotal = Column(Float, nullable=False, default=0.0)
    discount_amount = Column(Float, nullable=False, default=0.0)
    total_amount = Column(Float, nullable=False, default=0.0)

    # Razorpay fields
    razorpay_order_id = Column(String, nullable=True)
    razorpay_payment_link_id = Column(String, nullable=True)
    razorpay_payment_link_url = Column(String, nullable=True)

    # Failure tracking
    failure_reason = Column(Text, nullable=True)

    # HITL fields — HITL cannot be bypassed; these fields are the gate
    hitl_approved_by = Column(String, nullable=True)  # merchant user id
    hitl_approved_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    merchant = relationship("Merchant", back_populates="orders")
    audit_logs = relationship("AuditLog", back_populates="order")
