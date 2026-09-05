import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.db import Base


def gen_uuid():
    return str(uuid.uuid4())


class AuditLog(Base):
    """
    Every automated decision in the LangGraph pipeline writes a row here.
    The audit trail is one click away from any order in the UI.
    No order may reach 'paid' without a 'guardrail_check' row with decision='allowed'
    or a 'hitl_approved' row — enforced at the application layer.
    """
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=gen_uuid)
    merchant_id = Column(String, ForeignKey("merchants.id"), nullable=False, index=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=True, index=True)

    # Who took the action
    actor = Column(String, nullable=False)
    # 'agent' | 'merchant' | 'admin' | 'system' | 'external_ai_buyer'

    # Which pipeline step generated this row
    step = Column(String, nullable=False)
    # e.g. 'parse_intent', 'catalog_fetch', 'guardrail_check',
    #       'razorpay_order_created', 'fallback_triggered', 'escalated_to_hitl',
    #       'hitl_approved', 'hitl_rejected', 'crawl_completed', 'guardrail_updated'

    # Outcome of this step
    decision = Column(String, nullable=False)
    # 'allowed' | 'blocked' | 'escalated' | 'info'

    # Plain-English explanation — this is the explainability artifact for judging
    reason = Column(Text, nullable=True)

    # Full JSON snapshots for deep debugging (stored as JSON strings)
    input_snapshot = Column(Text, nullable=True)
    output_snapshot = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    merchant = relationship("Merchant", back_populates="audit_logs")
    order = relationship("Order", back_populates="audit_logs")
