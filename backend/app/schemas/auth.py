from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
import re


class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    razorpay_key_id: Optional[str] = None
    razorpay_key_secret: Optional[str] = None
    store_website_url: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("razorpay_key_id")
    @classmethod
    def rzp_key_format(cls, v):
        if v and not v.startswith("rzp_test_") and not v.startswith("rzp_live_"):
            raise ValueError("Razorpay Key ID must start with rzp_test_ or rzp_live_")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    merchant_id: str
    role: str
    name: str


class MerchantPublic(BaseModel):
    id: str
    name: str
    email: str
    role: str
    store_website_url: Optional[str]
    crawl_status: str

    class Config:
        from_attributes = True
