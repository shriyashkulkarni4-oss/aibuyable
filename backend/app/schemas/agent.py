from pydantic import BaseModel
from typing import Optional, List


# ─── Chat Schema ──────────────────────────────────────────────────────────────

class ChatMessageRequest(BaseModel):
    merchant_id: str
    message: str
    buyer_reference: Optional[str] = "in-portal-session"
    session_id: Optional[str] = None


class ChatMessageResponse(BaseModel):
    final_message: str
    current_step: str
    order_id: Optional[str]
    status: Optional[str]
    payment_link_url: Optional[str]
    guardrail_decision: Optional[str]
    guardrail_reason: Optional[str]
    fallback_triggered: bool = False
    llm_used: Optional[str] = "Gemini 2.5 Flash"
    matched_products: Optional[List[dict]] = None




# ─── External Agentic Commerce Schemas ───────────────────────────────────────

class ExternalCheckoutItem(BaseModel):
    product_id: str
    qty: int


class ExternalCheckoutRequest(BaseModel):
    merchant_id: str
    buyer_reference: str
    items: List[ExternalCheckoutItem]
    requested_discount_percent: Optional[float] = 0.0


class ExternalCheckoutResponse(BaseModel):
    order_id: str
    status: str
    total_amount: Optional[float]
    payment_link_url: Optional[str]
    explanation: str


# ─── Fault Injection Schema ───────────────────────────────────────────────────

class FaultInjectionResponse(BaseModel):
    fault_type: str
    buyer_facing_message: str
    order_id: Optional[str]
    audit_step: str
    audit_reason: str
    order_status: str
