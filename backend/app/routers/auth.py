from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db import get_db
from app.models.merchant import Merchant
from app.models.guardrail import Guardrail
from app.schemas.auth import SignupRequest, LoginRequest, TokenResponse
from app.auth.hashing import hash_password, verify_password
from app.auth.jwt import create_access_token, create_refresh_token
from app.auth.encryption import encrypt_secret
import uuid

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(request: SignupRequest, db: Session = Depends(get_db)):
    """Create a new merchant account and return JWT tokens."""
    # Check if email already exists
    existing = db.query(Merchant).filter(Merchant.email == request.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    merchant_id = str(uuid.uuid4())
    encrypted_secret = encrypt_secret(request.razorpay_key_secret) if request.razorpay_key_secret else None

    merchant = Merchant(
        id=merchant_id,
        name=request.name,
        email=request.email,
        password_hash=hash_password(request.password),
        role="merchant",
        store_website_url=request.store_website_url,
        razorpay_key_id=request.razorpay_key_id,
        razorpay_key_secret_enc=encrypted_secret,
        crawl_status="not_started",
    )
    db.add(merchant)

    # Create default guardrails for this merchant
    guardrail = Guardrail(
        merchant_id=merchant_id,
        max_discount_percent=15.0,
        max_auto_approve_amount=5000.0,
        require_hitl_above_amount=10000.0,
        daily_agent_spend_cap=None,
        allowed_payment_methods='["upi","card","netbanking","wallet"]',
    )
    db.add(guardrail)
    db.commit()

    access_token = create_access_token(merchant_id, "merchant")
    refresh_token = create_refresh_token(merchant_id, "merchant")

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        merchant_id=merchant_id,
        role="merchant",
        name=merchant.name,
    )


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate with email + password; returns JWT tokens."""
    merchant = db.query(Merchant).filter(Merchant.email == request.email).first()
    if not merchant or not verify_password(request.password, merchant.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token(merchant.id, merchant.role)
    refresh_token = create_refresh_token(merchant.id, merchant.role)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        merchant_id=merchant.id,
        role=merchant.role,
        name=merchant.name,
    )
