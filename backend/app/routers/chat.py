from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.auth.dependencies import get_current_user
from app.models.merchant import Merchant
from app.schemas.agent import ChatMessageRequest, ChatMessageResponse
from app.agent.graph import run_from_chat

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


@router.post("/message", response_model=ChatMessageResponse)
def chat_message(
    request: ChatMessageRequest,
    db: Session = Depends(get_db),
    current_user: Merchant = Depends(get_current_user),
):
    """
    In-Portal AI Buyer Chatbot — drives the real LangGraph checkout pipeline.

    This is a REAL, LIVE endpoint — no mocking, no scripted responses.
    Every call invokes Gemini for intent parsing, queries the live DB catalog,
    runs the real guardrail decision table, and (if approved) calls the real
    Razorpay Test Mode API to generate a real payment link.
    """
    # Merchants can chat against their own merchant_id
    # (or any, for demo purposes — they might test as a buyer)
    if request.merchant_id != current_user.id and current_user.role != "admin":
        # Allow merchant to chat against their own store
        raise HTTPException(status_code=403, detail="Access denied")

    state = run_from_chat(
        db=db,
        merchant_id=request.merchant_id,
        buyer_message=request.message,
        buyer_reference=request.buyer_reference or f"portal-{current_user.id}",
    )

    return ChatMessageResponse(
        final_message=state.get("final_message", ""),
        current_step=state.get("current_step", ""),
        order_id=state.get("order_id"),
        status=state.get("guardrail_decision", ""),
        payment_link_url=state.get("payment_link_url"),
        guardrail_decision=state.get("guardrail_decision"),
        guardrail_reason=state.get("guardrail_reason"),
        fallback_triggered=state.get("fallback_triggered", False),
        llm_used=state.get("llm_used", "Gemini 2.5 Flash"),
        matched_products=state.get("matched_products"),
    )
