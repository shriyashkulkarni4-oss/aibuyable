import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Float, Integer, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.db import Base


def gen_uuid():
    return str(uuid.uuid4())


class Product(Base):
    __tablename__ = "products"

    id = Column(String, primary_key=True, default=gen_uuid)
    merchant_id = Column(String, ForeignKey("merchants.id"), nullable=False, index=True)

    # external_id is the URL slug or JSON-LD ID from the scraped site
    external_id = Column(String, nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=False)  # INR, base price — never trust LLM for this
    currency = Column(String, nullable=False, default="INR")
    stock_qty = Column(Integer, nullable=False, default=100)
    # Default 100 if unknown from scrape — displayed as "estimated stock" in UI
    image_url = Column(String, nullable=True)
    category = Column(String, nullable=True)
    # Full raw scrape stored for traceability/debugging
    raw_scraped_json = Column(Text, nullable=True)  # JSON string
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    merchant = relationship("Merchant", back_populates="products")
