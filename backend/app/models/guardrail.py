import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, Integer, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.db import Base


def gen_uuid():
    return str(uuid.uuid4())


class Guardrail(Base):
    __tablename__ = "guardrails"

    id = Column(String, primary_key=True, default=gen_uuid)
    merchant_id = Column(String, ForeignKey("merchants.id"), nullable=False, unique=True)

    # Discount ceiling — agent never grants more than this, enforced in code
    max_discount_percent = Column(Float, nullable=False, default=15.0)

    # Amount at/under which auto-approve fires (if discount also within cap)
    max_auto_approve_amount = Column(Float, nullable=False, default=5000.0)

    # Forces HITL regardless of other conditions once total exceeds this
    require_hitl_above_amount = Column(Float, nullable=False, default=10000.0)

    # Daily aggregate spend cap across all agent-originated orders (optional)
    daily_agent_spend_cap = Column(Float, nullable=True)

    # JSON list e.g. '["upi","card","netbanking"]'
    allowed_payment_methods = Column(Text, nullable=False, default='["upi","card","netbanking","wallet"]')

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    merchant = relationship("Merchant", back_populates="guardrail")
