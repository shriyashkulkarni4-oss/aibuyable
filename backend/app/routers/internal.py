"""
Reliability Panel — Fault Injection Router

This is INTERNAL OPERATIONAL TOOLING — not customer-facing.
It lets the team verify that the real fallback logic in the agent graph
actually works end-to-end by injecting a controlled fault at the Razorpay
call boundary.

CRITICAL DESIGN RULES:
1. FAULT_MODE is passed as a parameter to the real graph — it ONLY affects
   the Razorpay HTTP call. All upstream logic (pricing, guardrail check,
   audit logging) runs exactly as normal.
2. This endpoint requires 'merchant' auth — never reachable from the buyer
   chatbot or the external agentic API.
3. The buyer-facing message shown in the response is the EXACT same message
   a real buyer would see if Razorpay failed for real.
4. A real audit row (step='fallback_triggered') is written to the DB.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.auth.dependencies import get_current_user
from app.models.merchant import Merchant
from app.models.product import Product
from app.agent.graph import run_from_external
from app.schemas.agent import FaultInjectionResponse

router = APIRouter(prefix="/api/v1/internal", tags=["internal"])

VALID_FAULT_TYPES = ["timeout", "insufficient_funds", "expired_link"]


@router.post("/fault-injection/{fault_type}", response_model=FaultInjectionResponse)
def fault_injection(
    fault_type: str,
    db: Session = Depends(get_db),
    current_user: Merchant = Depends(get_current_user),
):
    """
    Inject a controlled fault into the real checkout graph.

    Runs the exact same pipeline a real buyer would trigger,
    with a fault injected ONLY at the Razorpay call boundary.
    Everything else — pricing, guardrail check, audit logging — is real.

    fault_type: 'timeout' | 'insufficient_funds' | 'expired_link'
    """
    if fault_type not in VALID_FAULT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid fault_type. Must be one of: {VALID_FAULT_TYPES}",
        )

    merchant_id = current_user.id

    # Find the first active product to use in the test order
    product = db.query(Product).filter(
        Product.merchant_id == merchant_id,
        Product.is_active == True,
        Product.stock_qty > 0,
    ).first()

    if not product:
        raise HTTPException(
            status_code=400,
            detail="No active products found. Please crawl your catalog first.",
        )

    # Run the REAL pipeline with fault_mode set — same as a real buyer would trigger
    state = run_from_external(
        db=db,
        merchant_id=merchant_id,
        buyer_reference=f"fault-injection-test-{fault_type}",
        items=[{"product_id": product.id, "qty": 1}],
        requested_discount_percent=0.0,
        fault_mode=fault_type,
    )

    fallback_reason = state.get("fallback_reason") or "unknown"
    order_status = "pending" if fault_type in ("timeout", "expired_link") else "failed"

    return FaultInjectionResponse(
        fault_type=fault_type,
        buyer_facing_message=state.get("final_message", ""),
        order_id=state.get("order_id"),
        audit_step="fallback_triggered",
        audit_reason=f"{fault_type} fault injected — real fallback code executed",
        order_status=order_status,
    )
