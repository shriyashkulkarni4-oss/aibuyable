from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


# ─── Merchant Profile Schemas ─────────────────────────────────────────────────

class MerchantProfilePublic(BaseModel):
    id: str
    name: str
    email: str
    store_website_url: Optional[str]
    razorpay_key_id: Optional[str]
    has_razorpay_secret: bool
    crawl_status: str
    created_at: datetime

    class Config:
        from_attributes = True


class MerchantProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    store_website_url: Optional[str] = None
    razorpay_key_id: Optional[str] = None
    razorpay_key_secret: Optional[str] = None   # plain text — encrypted before storing
    current_password: Optional[str] = None       # required only when changing password
    new_password: Optional[str] = None


# ─── Product Schemas ──────────────────────────────────────────────────────────

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    stock_qty: Optional[int] = None
    is_active: Optional[bool] = None
    image_url: Optional[str] = None
    category: Optional[str] = None


class ProductPublic(BaseModel):
    id: str
    merchant_id: str
    external_id: Optional[str]
    name: str
    description: Optional[str]
    price: float
    currency: str
    stock_qty: int
    image_url: Optional[str]
    category: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Guardrail Schemas ────────────────────────────────────────────────────────

class GuardrailUpdate(BaseModel):
    max_discount_percent: Optional[float] = None
    max_auto_approve_amount: Optional[float] = None
    require_hitl_above_amount: Optional[float] = None
    daily_agent_spend_cap: Optional[float] = None
    allowed_payment_methods: Optional[List[str]] = None


class GuardrailPublic(BaseModel):
    id: str
    merchant_id: str
    max_discount_percent: float
    max_auto_approve_amount: float
    require_hitl_above_amount: float
    daily_agent_spend_cap: Optional[float]
    allowed_payment_methods: List[str]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


# ─── Crawl Schemas ────────────────────────────────────────────────────────────

class CrawlStatusResponse(BaseModel):
    merchant_id: str
    crawl_status: str
    crawl_error: Optional[str]
    products_count: int
