import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from app.db import Base


def gen_uuid():
    return str(uuid.uuid4())


class Merchant(Base):
    __tablename__ = "merchants"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="merchant")  # 'merchant' | 'admin'
    store_website_url = Column(String, nullable=True)
    razorpay_key_id = Column(String, nullable=True)           # stored plaintext (not secret)
    razorpay_key_secret_enc = Column(Text, nullable=True)     # Fernet-encrypted
    crawl_status = Column(String, nullable=False, default="not_started")
    # not_started | crawling | completed | failed
    crawl_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    guardrail = relationship("Guardrail", back_populates="merchant", uselist=False)
    products = relationship("Product", back_populates="merchant")
    orders = relationship("Order", back_populates="merchant")
    audit_logs = relationship("AuditLog", back_populates="merchant")
