"""
CheckoutState — Shared state object for the LangGraph checkout pipeline.

This state flows through all nodes. Every field is set by a specific node
and readable by all downstream nodes for full traceability.
"""

from typing import TypedDict, Optional


class CheckoutState(TypedDict):
    # ── Inputs ──────────────────────────────────────────────────────────────
    merchant_id: str
    buyer_message: str          # Raw natural language (in-portal flow; empty for external)
    buyer_reference: str        # Session ID or external agent ID
    source: str                 # 'in_portal_agent' | 'external_ai_buyer'
    fault_mode: Optional[str]   # ONLY set by Reliability Panel, NEVER by real buyer flows

    # ── parse_intent output ──────────────────────────────────────────────────
    parsed_intent: dict         # {product_query, quantity, requested_discount_percent}

    # ── get_catalog / select_and_price ───────────────────────────────────────
    matched_products: list      # Top product matches from DB
    selected_items: list        # [{product_id, qty, unit_price}]
    requested_discount_percent: float

    # ── check_discount_eligibility ───────────────────────────────────────────
    applied_discount_percent: float  # After cap_discount() — code-enforced

    # ── Pricing ──────────────────────────────────────────────────────────────
    guardrails_config: dict
    pricing: dict               # {subtotal, discount_amount, total_amount}

    # ── guardrail_check output ───────────────────────────────────────────────
    guardrail_decision: str     # 'auto_approve' | 'hitl_required' | 'blocked'
    guardrail_reason: str       # Plain-English reason (the explainability artifact)

    # ── Order tracking ───────────────────────────────────────────────────────
    order_id: Optional[str]
    razorpay_order_id: Optional[str]
    payment_link_url: Optional[str]

    # ── Failure handling ─────────────────────────────────────────────────────
    fallback_triggered: bool
    fallback_reason: Optional[str]

    # ── Terminal output ──────────────────────────────────────────────────────
    final_message: str          # Shown to buyer (never a raw stack trace)
    current_step: str           # Shown as step badge in chatbot UI
