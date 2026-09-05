"""
Razorpay Client Wrapper

Wraps the razorpay SDK with:
1. Idempotency — uses order_id as the receipt field, preventing duplicate charges
2. FAULT_MODE injection hook — ONLY used by the Reliability Panel (/internal/fault-injection)
   Never used by the real buyer chatbot or external API
3. Graceful error handling — all exceptions are caught and re-raised as RazorpayError

IMPORTANT: FAULT_MODE is a parameter, not a global flag. It is passed explicitly
by the fault injection router. The real buyer chatbot and external API never pass it.
"""

import time
import logging
from typing import Optional, Literal
import requests as requests_lib

logger = logging.getLogger(__name__)

FaultType = Literal["timeout", "insufficient_funds", "expired_link", None]


class RazorpayError(Exception):
    """Structured exception for Razorpay API failures."""
    def __init__(self, message: str, fault_type: Optional[str] = None):
        super().__init__(message)
        self.fault_type = fault_type


class RazorpayClient:
    def __init__(self, key_id: str, key_secret: str):
        self.key_id = key_id
        self.key_secret = key_secret
        self._client = None
        if key_id and key_secret:
            try:
                import razorpay
                self._client = razorpay.Client(auth=(key_id, key_secret))
            except Exception as e:
                logger.warning(f"Razorpay client init failed: {e}")

    def _inject_fault(self, fault_mode: FaultType):
        """
        Inject a controlled fault for the Reliability Panel.
        NEVER called by real buyer or external API paths.
        """
        if fault_mode == "timeout":
            raise RazorpayError(
                "Payment gateway is momentarily unavailable — I've saved your order "
                "and will retry automatically. You won't be charged twice.",
                fault_type="razorpay_timeout",
            )
        elif fault_mode == "insufficient_funds":
            raise RazorpayError(
                "Your payment didn't go through due to insufficient funds. "
                "Want to try a different payment method?",
                fault_type="insufficient_funds",
            )
        elif fault_mode == "expired_link":
            raise RazorpayError(
                "That payment link expired — here's a fresh one, valid for 15 minutes.",
                fault_type="payment_link_expired",
            )

    def create_order(
        self,
        amount_inr: float,
        order_id: str,
        merchant_id: str,
        source: str,
        currency: str = "INR",
        fault_mode: FaultType = None,
    ) -> dict:
        """
        Create a Razorpay order.
        amount_inr: Amount in the given currency (not paise — we convert here)
        order_id: Our internal order ID — used as the idempotency receipt
        currency: ISO currency code (INR, USD, GBP, EUR etc.) — default INR
        """
        if fault_mode:
            self._inject_fault(fault_mode)

        if not self._client:
            # Demo mode — return mock response
            return {
                "id": f"order_DEMO_{order_id[:8]}",
                "amount": int(amount_inr * 100),
                "currency": currency,
                "receipt": order_id,
                "status": "created",
                "_demo": True,
            }

        amount_paise = int(amount_inr * 100)  # paise / cents / pence
        try:
            order = self._client.order.create({
                "amount": amount_paise,
                "currency": currency.upper(),
                "receipt": order_id,  # idempotency key
                "notes": {
                    "merchant_id": merchant_id,
                    "source": source,
                    "platform": "aibuyable",
                },
            })
            return order
        except Exception as e:
            logger.error(f"Razorpay order creation failed: {e}")
            raise RazorpayError(str(e))

    def create_payment_link(
        self,
        amount_inr: float,
        order_id: str,
        description: str,
        currency: str = "INR",
        callback_url: str = "",
        fault_mode: FaultType = None,
        expire_in_minutes: int = 15,
    ) -> dict:
        """
        Create a Razorpay Payment Link.
        currency: ISO code — default INR. Payment links support INR only on most plans;
                  if a non-INR currency is passed, we still create in that currency.
        Returns a dict with at minimum: {"id": ..., "short_url": ...}
        """
        if fault_mode:
            self._inject_fault(fault_mode)

        if not self._client:
            # Demo mode
            return {
                "id": f"plink_DEMO_{order_id[:8]}",
                "short_url": f"https://rzp.io/i/DEMO_{order_id[:8]}",
                "status": "created",
                "_demo": True,
            }

        amount_paise = int(amount_inr * 100)
        # Razorpay requires expire_by >= 15 min in future; use 30 min + buffer
        expire_by = int(time.time()) + max(expire_in_minutes, 30) * 60

        try:
            payload = {
                "amount": amount_paise,
                "currency": currency.upper(),
                "description": description[:255] if description else "AIBuyable Order",
                "expire_by": expire_by,
                "reference_id": order_id,
                "notify": {"sms": False, "email": False},
                "reminder_enable": False,
            }
            # Add callback so Razorpay redirects buyer back to our app after payment
            if callback_url:
                payload["callback_url"] = callback_url
                payload["callback_method"] = "get"  # GET redirect with query params
            link = self._client.payment_link.create(payload)
            return link
        except Exception as e:
            logger.error(f"Razorpay payment link creation failed: {e}")
            raise RazorpayError(str(e))

    def get_payment_link_status(self, link_id: str) -> Optional[str]:
        """Return current status of a payment link (e.g. 'created', 'paid', 'expired')."""
        if not self._client:
            return "created"
        try:
            link = self._client.payment_link.fetch(link_id)
            return link.get("status")
        except Exception as e:
            logger.warning(f"Could not fetch payment link status: {e}")
            return None

    def refresh_payment_link(
        self,
        amount_inr: float,
        order_id: str,
        description: str,
    ) -> dict:
        """Issue a fresh payment link for an expired one (same order, no duplicate order created)."""
        return self.create_payment_link(
            amount_inr=amount_inr,
            order_id=order_id,
            description=description,
            expire_in_minutes=15,
        )
