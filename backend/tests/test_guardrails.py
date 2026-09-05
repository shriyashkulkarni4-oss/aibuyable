"""
Guardrail Boundary Tests

These tests verify the core "bounded" property of AIBuyable:
- Discount capping is enforced in code (not LLM-dependent)
- HITL gate fires at, above, and below each threshold
- No order can exceed guardrail limits via any combination of inputs

Run with: pytest tests/test_guardrails.py -v
"""

import pytest
from app.agent.guardrails import (
    evaluate_guardrails,
    cap_discount,
    compute_pricing,
    GuardrailResult,
)

# Standard guardrail config used in most tests
STANDARD_CONFIG = {
    "max_discount_percent": 15.0,
    "max_auto_approve_amount": 5000.0,
    "require_hitl_above_amount": 10000.0,
    "daily_agent_spend_cap": None,
}


# ─── cap_discount Tests ───────────────────────────────────────────────────────

class TestCapDiscount:
    def test_below_cap(self):
        """Discount below cap passes through unchanged."""
        assert cap_discount(10.0, 15.0) == 10.0

    def test_exactly_at_cap(self):
        """Discount exactly at cap is allowed."""
        assert cap_discount(15.0, 15.0) == 15.0

    def test_above_cap_is_capped(self):
        """Discount above cap is capped at max — enforced in code, not LLM."""
        assert cap_discount(20.0, 15.0) == 15.0

    def test_zero_discount(self):
        assert cap_discount(0.0, 15.0) == 0.0

    def test_zero_cap(self):
        """Zero cap means no discount ever passes."""
        assert cap_discount(5.0, 0.0) == 0.0

    def test_very_large_request_capped(self):
        """Even 100% discount request is capped."""
        assert cap_discount(100.0, 15.0) == 15.0


# ─── compute_pricing Tests ────────────────────────────────────────────────────

class TestComputePricing:
    def test_no_discount(self):
        pricing = compute_pricing(1000.0, 0.0)
        assert pricing["subtotal"] == 1000.0
        assert pricing["discount_amount"] == 0.0
        assert pricing["total_amount"] == 1000.0

    def test_10_percent_discount(self):
        pricing = compute_pricing(1000.0, 10.0)
        assert pricing["discount_amount"] == 100.0
        assert pricing["total_amount"] == 900.0

    def test_15_percent_discount(self):
        pricing = compute_pricing(5000.0, 15.0)
        assert pricing["discount_amount"] == 750.0
        assert pricing["total_amount"] == 4250.0

    def test_rounding(self):
        """Pricing should round to 2 decimal places."""
        pricing = compute_pricing(999.99, 10.0)
        assert pricing["discount_amount"] == 100.0  # 99.999 → 100.0
        assert pricing["total_amount"] <= 999.99


# ─── evaluate_guardrails Tests ────────────────────────────────────────────────

class TestGuardrailAutoApprove:
    """Tests for auto_approve path — all conditions within limits."""

    def test_small_order_auto_approved(self):
        pricing = compute_pricing(1000.0, 0.0)
        result = evaluate_guardrails(pricing, 0.0, STANDARD_CONFIG)
        assert result.guardrail_decision == "auto_approve"

    def test_exactly_at_auto_approve_ceiling(self):
        """Order exactly at the ceiling is auto-approved."""
        pricing = compute_pricing(5000.0, 0.0)
        result = evaluate_guardrails(pricing, 0.0, STANDARD_CONFIG)
        assert result.guardrail_decision == "auto_approve"

    def test_just_below_auto_approve_ceiling(self):
        pricing = compute_pricing(4999.99, 0.0)
        result = evaluate_guardrails(pricing, 0.0, STANDARD_CONFIG)
        assert result.guardrail_decision == "auto_approve"

    def test_discount_exactly_at_cap_auto_approved(self):
        """10% discount request with 10% cap — auto-approved."""
        config = {**STANDARD_CONFIG, "max_discount_percent": 10.0}
        pricing = compute_pricing(1000.0, 10.0)
        result = evaluate_guardrails(pricing, 10.0, config)
        assert result.guardrail_decision == "auto_approve"
        assert result.applied_discount_percent == 10.0

    def test_reason_string_mentions_amount(self):
        """Auto-approve reason must mention the order total and ceiling."""
        pricing = compute_pricing(2000.0, 0.0)
        result = evaluate_guardrails(pricing, 0.0, STANDARD_CONFIG)
        assert "2,000.00" in result.guardrail_reason or "auto-approve" in result.guardrail_reason.lower()


class TestGuardrailHITLRequired:
    """Tests for hitl_required path — various threshold violations."""

    def test_just_above_auto_approve_ceiling(self):
        """One rupee over the ceiling triggers HITL."""
        pricing = compute_pricing(5001.0, 0.0)
        result = evaluate_guardrails(pricing, 0.0, STANDARD_CONFIG)
        assert result.guardrail_decision == "hitl_required"

    def test_well_above_auto_approve_ceiling(self):
        pricing = compute_pricing(8000.0, 0.0)
        result = evaluate_guardrails(pricing, 0.0, STANDARD_CONFIG)
        assert result.guardrail_decision == "hitl_required"

    def test_discount_above_cap_triggers_hitl(self):
        """Discount request above cap triggers HITL even if total is small."""
        pricing = compute_pricing(1000.0, 15.0)  # after cap applied
        result = evaluate_guardrails(pricing, 20.0, STANDARD_CONFIG)  # requested 20%
        assert result.guardrail_decision == "hitl_required"

    def test_discount_above_cap_but_capped(self):
        """The applied discount is still capped even when HITL fires."""
        pricing = compute_pricing(1000.0, 15.0)
        result = evaluate_guardrails(pricing, 20.0, STANDARD_CONFIG)
        assert result.guardrail_decision == "hitl_required"
        assert result.applied_discount_percent == 15.0  # capped, not 20

    def test_require_hitl_above_amount_overrides(self):
        """require_hitl_above_amount fires even for small totals if threshold is set low."""
        config = {**STANDARD_CONFIG, "require_hitl_above_amount": 500.0}
        pricing = compute_pricing(600.0, 0.0)
        result = evaluate_guardrails(pricing, 0.0, config)
        assert result.guardrail_decision == "hitl_required"

    def test_daily_cap_exceeded_triggers_hitl(self):
        """Daily spend cap exceeded triggers HITL."""
        config = {**STANDARD_CONFIG, "daily_agent_spend_cap": 10000.0}
        pricing = compute_pricing(3000.0, 0.0)
        result = evaluate_guardrails(pricing, 0.0, config, daily_spent=8000.0)
        assert result.guardrail_decision == "hitl_required"

    def test_daily_cap_not_exceeded_auto_approved(self):
        """Daily cap not exceeded — auto-approved."""
        config = {**STANDARD_CONFIG, "daily_agent_spend_cap": 10000.0}
        pricing = compute_pricing(1000.0, 0.0)
        result = evaluate_guardrails(pricing, 0.0, config, daily_spent=8000.0)
        # 8000 + 1000 = 9000 < 10000 → auto_approve
        assert result.guardrail_decision == "auto_approve"

    def test_hitl_reason_is_specific(self):
        """Reason string must name exactly which rule fired."""
        pricing = compute_pricing(6000.0, 0.0)
        result = evaluate_guardrails(pricing, 0.0, STANDARD_CONFIG)
        assert "5,000" in result.guardrail_reason or "auto-approve" in result.guardrail_reason.lower()
        assert result.guardrail_decision == "hitl_required"


class TestGuardrailEdgeCases:
    """Edge cases and boundary conditions."""

    def test_zero_amount_order(self):
        """Zero-amount order auto-approves."""
        pricing = compute_pricing(0.0, 0.0)
        result = evaluate_guardrails(pricing, 0.0, STANDARD_CONFIG)
        assert result.guardrail_decision == "auto_approve"

    def test_no_daily_cap_configured(self):
        """daily_agent_spend_cap=None means no daily cap check."""
        config = {**STANDARD_CONFIG, "daily_agent_spend_cap": None}
        pricing = compute_pricing(1000.0, 0.0)
        result = evaluate_guardrails(pricing, 0.0, config, daily_spent=999999.0)
        # Should still auto-approve because no cap is set
        assert result.guardrail_decision == "auto_approve"

    def test_hitl_above_overrides_auto_approve_ceiling(self):
        """require_hitl_above fires before max_auto_approve check (rule 1 first)."""
        # Set require_hitl_above LOWER than max_auto_approve (unusual but valid)
        config = {
            "max_discount_percent": 15.0,
            "max_auto_approve_amount": 5000.0,
            "require_hitl_above_amount": 2000.0,  # lower than auto-approve ceiling
            "daily_agent_spend_cap": None,
        }
        pricing = compute_pricing(3000.0, 0.0)
        result = evaluate_guardrails(pricing, 0.0, config)
        # Rule 1 (require_hitl_above_amount=2000) fires first
        assert result.guardrail_decision == "hitl_required"
        assert "2,000" in result.guardrail_reason

    def test_llm_cannot_override_discount_cap(self):
        """
        Verifies the fundamental 'bounded' property:
        Even if an LLM outputs a discount of 50%, cap_discount ensures
        only max_discount_percent is ever applied.
        """
        llm_output_discount = 50.0  # simulate LLM trying to give 50%
        actual_applied = cap_discount(llm_output_discount, 15.0)
        assert actual_applied == 15.0, "LLM discount override not prevented!"

        pricing = compute_pricing(1000.0, actual_applied)
        assert pricing["discount_amount"] == 150.0  # only 15%, never 50%
        assert pricing["total_amount"] == 850.0
