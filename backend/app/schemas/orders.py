from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime


# ─── Order Schemas ────────────────────────────────────────────────────────────

class OrderLineItem(BaseModel):
    product_id: str
    qty: int
    unit_price: float
    discount_percent: float
    line_total: float


class OrderPublic(BaseModel):
    id: str
    merchant_id: str
    source: str
    buyer_reference: Optional[str]
    status: str
    items: List[dict]
    requested_discount_percent: float
    subtotal: float
    discount_amount: float
    total_amount: float
    razorpay_order_id: Optional[str]
    razorpay_payment_link_id: Optional[str]
    razorpay_payment_link_url: Optional[str]
    failure_reason: Optional[str]
    hitl_approved_by: Optional[str]
    hitl_approved_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── HITL Schemas ─────────────────────────────────────────────────────────────

class HITLRejectRequest(BaseModel):
    reason: Optional[str] = None


# ─── Audit Log Schemas ────────────────────────────────────────────────────────

class AuditLogPublic(BaseModel):
    id: str
    merchant_id: str
    order_id: Optional[str]
    actor: str
    step: str
    decision: str
    reason: Optional[str]
    input_snapshot: Optional[Any]
    output_snapshot: Optional[Any]
    created_at: datetime

    class Config:
        from_attributes = True
