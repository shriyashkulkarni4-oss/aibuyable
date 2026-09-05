import json
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db import get_db
from app.auth.dependencies import get_current_user, require_role
from app.models.merchant import Merchant
from app.models.product import Product
from app.models.guardrail import Guardrail
from app.schemas.merchant import (
    ProductPublic, ProductUpdate, GuardrailPublic, GuardrailUpdate, CrawlStatusResponse,
    MerchantProfilePublic, MerchantProfileUpdate,
)
from app.auth.hashing import hash_password, verify_password
from app.auth.encryption import encrypt_secret, decrypt_secret
from app.crawler.crawler import run_crawl
from app.audit.audit_logger import log_event

router = APIRouter(prefix="/api/v1/merchant", tags=["merchant"])


# ─── Profile ───────────────────────────────────────────────────────────────

@router.get("/me", response_model=MerchantProfilePublic)
def get_profile(
    db: Session = Depends(get_db),
    current_user: Merchant = Depends(get_current_user),
):
    """Return the logged-in merchant's profile."""
    return MerchantProfilePublic(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        store_website_url=current_user.store_website_url,
        razorpay_key_id=current_user.razorpay_key_id,
        has_razorpay_secret=bool(current_user.razorpay_key_secret_enc),
        crawl_status=current_user.crawl_status,
        created_at=current_user.created_at,
    )


@router.put("/me", response_model=MerchantProfilePublic)
def update_profile(
    update: MerchantProfileUpdate,
    db: Session = Depends(get_db),
    current_user: Merchant = Depends(get_current_user),
):
    """Update the logged-in merchant's profile.
    
    Handles:
    - name, email, store_website_url: direct field updates
    - razorpay_key_id: stored plaintext (not secret)
    - razorpay_key_secret: re-encrypted with Fernet before storing
    - new_password: requires current_password to be correct
    """
    merchant = db.query(Merchant).filter(Merchant.id == current_user.id).first()
    changed_fields = []

    if update.name is not None:
        merchant.name = update.name
        changed_fields.append("name")

    if update.email is not None and update.email != merchant.email:
        # Check email uniqueness
        existing = db.query(Merchant).filter(
            Merchant.email == update.email,
            Merchant.id != merchant.id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use by another account")
        merchant.email = update.email
        changed_fields.append("email")

    if update.store_website_url is not None:
        merchant.store_website_url = update.store_website_url
        changed_fields.append("store_website_url")

    if update.razorpay_key_id is not None:
        merchant.razorpay_key_id = update.razorpay_key_id
        changed_fields.append("razorpay_key_id")

    if update.razorpay_key_secret is not None and update.razorpay_key_secret.strip():
        merchant.razorpay_key_secret_enc = encrypt_secret(update.razorpay_key_secret)
        changed_fields.append("razorpay_key_secret")

    if update.new_password:
        if not update.current_password:
            raise HTTPException(status_code=400, detail="current_password is required to set a new password")
        if not verify_password(update.current_password, merchant.password_hash):
            raise HTTPException(status_code=401, detail="Current password is incorrect")
        if len(update.new_password) < 8:
            raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
        merchant.password_hash = hash_password(update.new_password)
        changed_fields.append("password")

    if not changed_fields:
        raise HTTPException(status_code=400, detail="No changes provided")

    db.commit()
    db.refresh(merchant)

    log_event(
        db=db, merchant_id=merchant.id,
        step="profile_updated", decision="info",
        actor="merchant",
        output_snapshot={"fields_updated": changed_fields},
        reason=f"Merchant updated profile: {changed_fields}",
    )

    return MerchantProfilePublic(
        id=merchant.id,
        name=merchant.name,
        email=merchant.email,
        store_website_url=merchant.store_website_url,
        razorpay_key_id=merchant.razorpay_key_id,
        has_razorpay_secret=bool(merchant.razorpay_key_secret_enc),
        crawl_status=merchant.crawl_status,
        created_at=merchant.created_at,
    )


# ─── Crawl ────────────────────────────────────────────────────────────────────

@router.post("/{merchant_id}/crawl/start", status_code=status.HTTP_202_ACCEPTED)
def start_crawl(
    merchant_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Merchant = Depends(get_current_user),
):
    """Kick off a crawl job for the merchant's store URL. Returns 202 immediately."""
    if current_user.id != merchant_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    if not merchant.store_website_url:
        raise HTTPException(
            status_code=400,
            detail="No store URL configured. Please update your profile with a store_website_url."
        )

    if merchant.crawl_status == "crawling":
        return {"message": "A crawl is already in progress.", "crawl_status": "crawling"}

    background_tasks.add_task(run_crawl, merchant_id, merchant.store_website_url, db)

    return {"message": "Crawl started.", "crawl_status": "crawling"}


@router.get("/{merchant_id}/crawl/status", response_model=CrawlStatusResponse)
def crawl_status(
    merchant_id: str,
    db: Session = Depends(get_db),
    current_user: Merchant = Depends(get_current_user),
):
    """Poll crawl status. Used by frontend every 2s during onboarding."""
    if current_user.id != merchant_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    products_count = db.query(Product).filter(Product.merchant_id == merchant_id).count()

    return CrawlStatusResponse(
        merchant_id=merchant_id,
        crawl_status=merchant.crawl_status,
        crawl_error=merchant.crawl_error,
        products_count=products_count,
    )


# ─── Products ─────────────────────────────────────────────────────────────────

@router.get("/{merchant_id}/products", response_model=List[ProductPublic])
def list_products(
    merchant_id: str,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: Merchant = Depends(get_current_user),
):
    """List products for a merchant.
    
    Pass ?active_only=false to retrieve ALL products including inactive ones
    (used by the Catalog Editor page to show price=0 items needing attention).
    """
    if current_user.id != merchant_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    query = db.query(Product).filter(Product.merchant_id == merchant_id)
    if active_only:
        query = query.filter(Product.is_active == True)

    return query.order_by(Product.created_at.desc()).all()


@router.put("/{merchant_id}/products/{product_id}", response_model=ProductPublic)
def update_product(
    merchant_id: str,
    product_id: str,
    update: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: Merchant = Depends(get_current_user),
):
    """Update a product's fields.
    
    Also syncs raw_scraped_json with any updated price/name/category
    so the AI agent's catalog view always has accurate data.
    """
    if current_user.id != merchant_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    product = db.query(Product).filter(
        Product.id == product_id,
        Product.merchant_id == merchant_id,
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(product, field, value)

    # Sync raw_scraped_json so the agent catalog always has current prices
    if any(k in update_data for k in ("price", "name", "category", "currency", "description")):
        try:
            existing_raw = json.loads(product.raw_scraped_json or "{}")
        except Exception:
            existing_raw = {}
        existing_raw.update({
            k: update_data[k]
            for k in ("price", "name", "category", "currency", "description")
            if k in update_data
        })
        existing_raw["merchant_edited"] = True
        product.raw_scraped_json = json.dumps(existing_raw)

    product.updated_at = __import__('datetime').datetime.utcnow()
    db.commit()
    db.refresh(product)

    log_event(
        db=db, merchant_id=merchant_id,
        step="product_updated", decision="info",
        actor="merchant",
        output_snapshot={"product_id": product_id, "fields_updated": list(update_data.keys())},
        reason=f"Merchant manually updated product '{product.name}': {list(update_data.keys())}",
    )

    return product


# ─── Guardrails ───────────────────────────────────────────────────────────────

@router.get("/{merchant_id}/guardrails", response_model=GuardrailPublic)
def get_guardrails(
    merchant_id: str,
    db: Session = Depends(get_db),
    current_user: Merchant = Depends(get_current_user),
):
    if current_user.id != merchant_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    g = db.query(Guardrail).filter(Guardrail.merchant_id == merchant_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Guardrails not configured")

    try:
        methods = json.loads(g.allowed_payment_methods or "[]")
    except Exception:
        methods = []

    return GuardrailPublic(
        id=g.id,
        merchant_id=g.merchant_id,
        max_discount_percent=g.max_discount_percent,
        max_auto_approve_amount=g.max_auto_approve_amount,
        require_hitl_above_amount=g.require_hitl_above_amount,
        daily_agent_spend_cap=g.daily_agent_spend_cap,
        allowed_payment_methods=methods,
        updated_at=g.updated_at,
    )


@router.put("/{merchant_id}/guardrails", response_model=GuardrailPublic)
def update_guardrails(
    merchant_id: str,
    update: GuardrailUpdate,
    db: Session = Depends(get_db),
    current_user: Merchant = Depends(get_current_user),
):
    if current_user.id != merchant_id:
        raise HTTPException(status_code=403, detail="Only the merchant can update their guardrails")

    g = db.query(Guardrail).filter(Guardrail.merchant_id == merchant_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Guardrails not found")

    update_data = update.model_dump(exclude_unset=True)

    if "allowed_payment_methods" in update_data:
        update_data["allowed_payment_methods"] = json.dumps(update_data["allowed_payment_methods"])

    for field, value in update_data.items():
        setattr(g, field, value)

    db.commit()
    db.refresh(g)

    # Audit every guardrail save
    log_event(
        db=db, merchant_id=merchant_id,
        step="guardrail_updated", decision="info",
        actor="merchant",
        output_snapshot=update_data,
        reason=f"Merchant updated guardrail settings: {list(update_data.keys())}",
    )

    try:
        methods = json.loads(g.allowed_payment_methods or "[]")
    except Exception:
        methods = []

    return GuardrailPublic(
        id=g.id,
        merchant_id=g.merchant_id,
        max_discount_percent=g.max_discount_percent,
        max_auto_approve_amount=g.max_auto_approve_amount,
        require_hitl_above_amount=g.require_hitl_above_amount,
        daily_agent_spend_cap=g.daily_agent_spend_cap,
        allowed_payment_methods=methods,
        updated_at=g.updated_at,
    )
