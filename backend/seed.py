import sys
import os
import uuid

# Ensure backend directory is on python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db import engine, Base, SessionLocal
from app.models.merchant import Merchant
from app.models.guardrail import Guardrail
from app.models.product import Product
from app.models.order import Order
from app.models.audit_log import AuditLog
from app.auth.hashing import get_password_hash


def seed_database():
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Check if admin already exists
        existing_admin = db.query(Merchant).filter(Merchant.role == "admin").first()
        if not existing_admin:
            print("Creating default Admin user...")
            admin = Merchant(
                id=str(uuid.uuid4()),
                name="Platform Admin",
                email="admin@aibuyable.com",
                password_hash=get_password_hash("admin123"),
                role="admin",
                crawl_status="idle"
            )
            db.add(admin)
            db.commit()
            print("[SUCCESS] Admin created: admin@aibuyable.com / admin123")
        else:
            print("[INFO] Admin user already exists.")

        # Check if demo merchant exists
        existing_merchant = db.query(Merchant).filter(Merchant.email == "demo@merchant.com").first()
        if not existing_merchant:
            print("Creating Demo Merchant user...")
            demo_merchant = Merchant(
                id=str(uuid.uuid4()),
                name="Demo ElectroStore",
                email="demo@merchant.com",
                password_hash=get_password_hash("merchant123"),
                role="merchant",
                store_website_url="https://demo-electrostore.example.com",
                crawl_status="completed"
            )
            db.add(demo_merchant)
            db.flush()

            # Default Guardrails for Demo Merchant
            demo_guardrail = Guardrail(
                id=str(uuid.uuid4()),
                merchant_id=demo_merchant.id,
                max_discount_percent=15.0,
                max_auto_approve_amount=10000.0,
                require_hitl_above_amount=50000.0,
                daily_agent_spend_cap=100000.0,
                allowed_payment_methods=["card", "upi", "netbanking"]
            )
            db.add(demo_guardrail)

            # Sample Products for Demo Merchant
            sample_products = [
                Product(
                    id=str(uuid.uuid4()),
                    merchant_id=demo_merchant.id,
                    external_id="PROD-001",
                    name="Wireless Noise-Canceling Headphones",
                    description="Premium over-ear Bluetooth headphones with active noise cancellation and 30-hour battery life.",
                    price=14999.0,
                    currency="INR",
                    stock_qty=25,
                    category="Electronics",
                    image_url="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80",
                    is_active=True
                ),
                Product(
                    id=str(uuid.uuid4()),
                    merchant_id=demo_merchant.id,
                    external_id="PROD-002",
                    name="Smart Fitness Watch V2",
                    description="Waterproof smartwatch with continuous heart rate monitoring, GPS tracking, and AMOLED display.",
                    price=4999.0,
                    currency="INR",
                    stock_qty=50,
                    category="Wearables",
                    image_url="https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&q=80",
                    is_active=True
                ),
                Product(
                    id=str(uuid.uuid4()),
                    merchant_id=demo_merchant.id,
                    external_id="PROD-003",
                    name="Ergonomic Mechanical Keyboard",
                    description="Hot-swappable RGB mechanical keyboard with tactile switches and custom PBT keycaps.",
                    price=7999.0,
                    currency="INR",
                    stock_qty=15,
                    category="Peripherals",
                    image_url="https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&q=80",
                    is_active=True
                ),
                Product(
                    id=str(uuid.uuid4()),
                    merchant_id=demo_merchant.id,
                    external_id="PROD-004",
                    name="Ultra-Slim Power Bank 20000mAh",
                    description="Fast charging power bank with dual USB-C Power Delivery ports.",
                    price=2499.0,
                    currency="INR",
                    stock_qty=100,
                    category="Accessories",
                    image_url="https://images.unsplash.com/photo-1609592424009-40d7c7112028?w=500&q=80",
                    is_active=True
                )
            ]
            db.add_all(sample_products)
            db.commit()
            print("[SUCCESS] Demo Merchant created: demo@merchant.com / merchant123")
            print("[SUCCESS] Guardrails & 4 Sample Products seeded successfully!")
        else:
            print("[INFO] Demo Merchant already exists.")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error seeding database: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
