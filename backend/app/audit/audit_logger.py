import json
import uuid
from datetime import datetime
from typing import Optional, Any
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog


def log_event(
    db: Session,
    merchant_id: str,
    step: str,
    decision: str,
    reason: Optional[str] = None,
    actor: str = "agent",
    order_id: Optional[str] = None,
    input_snapshot: Optional[Any] = None,
    output_snapshot: Optional[Any] = None,
) -> AuditLog:
    """
    Write a single audit log row.

    This function is called by every LangGraph node, every HITL action,
    every crawl completion, and every guardrail config change.
    It is NEVER optional — every automated decision must have a corresponding row.

    Args:
        db: SQLAlchemy session
        merchant_id: The merchant this event belongs to
        step: Pipeline step identifier (e.g. 'guardrail_check', 'razorpay_order_created')
        decision: Outcome ('allowed', 'blocked', 'escalated', 'info')
        reason: Plain-English explanation (the explainability artifact for judging)
        actor: Who triggered this ('agent', 'merchant', 'admin', 'system', 'external_ai_buyer')
        order_id: Associated order (nullable)
        input_snapshot: Full input state snapshot (for debugging)
        output_snapshot: Full output state snapshot (for debugging)
    """
    log = AuditLog(
        id=str(uuid.uuid4()),
        merchant_id=merchant_id,
        order_id=order_id,
        actor=actor,
        step=step,
        decision=decision,
        reason=reason,
        input_snapshot=json.dumps(input_snapshot, default=str) if input_snapshot is not None else None,
        output_snapshot=json.dumps(output_snapshot, default=str) if output_snapshot is not None else None,
        created_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
