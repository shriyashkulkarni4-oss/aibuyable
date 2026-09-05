"""
Guardrail Decision Engine — Pure Python, No LLM

This module implements the merchant-defined safety guardrails.
ALL decisions are deterministic Python code, NOT LLM-based.
This is the core "bounded" and "explainable" property of AIBuyable.

The decision table is evaluated top-to-bottom, first match wins:
1. total_amount > require_hitl_above_amount → hitl_required
2. requested_discount_percent > max_discount_percent → hitl_required
3. total_amount > max_auto_approve_amount → hitl_required
4. daily_agent_spend_cap would be exceeded → hitl_required
5. none of the above → auto_approve

Unit tests for this module cover:
- Exactly at threshold (boundary)
- Just above threshold
- Just below threshold
- Multiple conditions firing simultaneously (first-match wins)
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class GuardrailResult:
    """
    Outcome of a guardrail evaluation.
    guardrail_decision: 'auto_approve' | 'hitl_required' | 'blocked'
    guardrail_reason: Plain-English explanation naming exactly which rule fired.
                      This is the explainability artifact visible in the audit log and UI.
    """
    guardrail_decision: str
    guardrail_reason: str
    applied_discount_percent: float  # The actual discount that will be applied (after capping)


def cap_discount(requested_pct: float, max_pct: float) -> float:
    """
    Cap the discount at the merchant's maximum.
    This is enforced in CODE, not by prompting the LLM.
    The LLM CANNOT grant more than this cap regardless of what it generates.

    Args:
        requested_pct: Discount % the buyer requested
        max_pct: Merchant's configured maximum (from guardrails table)
    Returns:
        The actual discount to apply — always <= max_pct
    """
    return min(requested_pct, max_pct)


def compute_pricing(
    subtotal: float,
    applied_discount_percent: float,
) -> dict:
    """
    Compute final pricing from live product prices (never trust LLM-stated price).

    Args:
        subtotal: Sum of (unit_price * qty) for all line items
        applied_discount_percent: Capped discount percent (from cap_discount)
    Returns:
        {subtotal, discount_amount, total_amount}
    """
    discount_amount = round(subtotal * applied_discount_percent / 100, 2)
    total_amount = round(subtotal - discount_amount, 2)
    return {
        "subtotal": round(subtotal, 2),
        "discount_amount": discount_amount,
        "total_amount": total_amount,
    }


def evaluate_guardrails(
    pricing: dict,
    requested_discount_percent: float,
    guardrail_config: dict,
    daily_spent: float = 0.0,
) -> GuardrailResult:
    """
    Evaluate the merchant's guardrail rules and return a decision.

    This function is the single gate that all orders must pass through.
    It is NEVER bypassed regardless of caller (in-portal agent or external API).
    It runs identically for both.

    Decision table (first match wins):
    1. total > require_hitl_above_amount → hitl_required
    2. requested_discount > max_discount_percent → hitl_required
       (discount was already CAPPED in cap_discount, but a request ABOVE the cap
        is always surfaced to the merchant for visibility even if the capped amount
        would technically fit within other limits)
    3. total > max_auto_approve_amount → hitl_required
    4. daily_agent_spend_cap exceeded → hitl_required
    5. none → auto_approve

    Args:
        pricing: Result of compute_pricing() — {subtotal, discount_amount, total_amount}
        requested_discount_percent: What the buyer originally asked for (before capping)
        guardrail_config: Dict with keys matching the Guardrail model fields
        daily_spent: Aggregate INR already spent today via agent orders (for cap check)

    Returns:
        GuardrailResult with decision, human-readable reason, and applied discount
    """
    total = pricing["total_amount"]
    max_discount = guardrail_config.get("max_discount_percent", 15.0)
    max_auto_approve = guardrail_config.get("max_auto_approve_amount", 5000.0)
    require_hitl_above = guardrail_config.get("require_hitl_above_amount", 10000.0)
    daily_cap = guardrail_config.get("daily_agent_spend_cap")

    applied_discount = cap_discount(requested_discount_percent, max_discount)

    # ── Rule 1: Hard HITL threshold (overrides everything) ──────────────────
    if total > require_hitl_above:
        return GuardrailResult(
            guardrail_decision="hitl_required",
            guardrail_reason=(
                f"Order total ₹{total:,.2f} exceeds your mandatory HITL threshold of "
                f"₹{require_hitl_above:,.2f} — sent for your approval."
            ),
            applied_discount_percent=applied_discount,
        )

    # ── Rule 2: Discount request above cap (visibility for merchant) ─────────
    if requested_discount_percent > max_discount:
        return GuardrailResult(
            guardrail_decision="hitl_required",
            guardrail_reason=(
                f"Requested discount {requested_discount_percent:.1f}% exceeds your "
                f"maximum allowed discount of {max_discount:.1f}%. "
                f"A capped discount of {applied_discount:.1f}% was computed — "
                f"escalated for your review."
            ),
            applied_discount_percent=applied_discount,
        )

    # ── Rule 3: Auto-approve amount ceiling ──────────────────────────────────
    if total > max_auto_approve:
        return GuardrailResult(
            guardrail_decision="hitl_required",
            guardrail_reason=(
                f"Order total ₹{total:,.2f} exceeds your auto-approve ceiling of "
                f"₹{max_auto_approve:,.2f} — sent for your approval."
            ),
            applied_discount_percent=applied_discount,
        )

    # ── Rule 4: Daily spend cap ───────────────────────────────────────────────
    if daily_cap is not None and (daily_spent + total) > daily_cap:
        return GuardrailResult(
            guardrail_decision="hitl_required",
            guardrail_reason=(
                f"This order (₹{total:,.2f}) would bring today's agent-originated spend "
                f"to ₹{daily_spent + total:,.2f}, exceeding your daily cap of "
                f"₹{daily_cap:,.2f} — sent for your approval."
            ),
            applied_discount_percent=applied_discount,
        )

    # ── Rule 5: Auto-approve ─────────────────────────────────────────────────
    discount_note = ""
    if applied_discount > 0:
        discount_note = f" A {applied_discount:.1f}% discount was applied."
    return GuardrailResult(
        guardrail_decision="auto_approve",
        guardrail_reason=(
            f"Order total ₹{total:,.2f} is within your auto-approve ceiling of "
            f"₹{max_auto_approve:,.2f} and all guardrail conditions are met.{discount_note}"
        ),
        applied_discount_percent=applied_discount,
    )
