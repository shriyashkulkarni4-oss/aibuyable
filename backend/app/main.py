import sys
import asyncio
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


from app.config import settings
from app.db import engine, Base

# Import all models so they register with SQLAlchemy before table creation
from app.models import Merchant, Guardrail, Product, Order, AuditLog  # noqa

# Import routers
from app.routers.auth import router as auth_router
from app.routers.merchant import router as merchant_router
from app.routers.orders import router as orders_router
from app.routers.chat import router as chat_router
from app.routers.agentic import router as agentic_router, well_known_router
from app.routers.admin import router as admin_router
from app.routers.internal import router as internal_router
from app.routers.webhooks import router as webhooks_router
from app.routers.payment import router as payment_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all DB tables, reset stuck crawl statuses, and seed admin on startup."""
    logger.info("Starting AIBuyable Gateway API...")
    Base.metadata.create_all(bind=engine)
    await seed_admin()

    # Self-healing: Reset any stuck 'crawling' status from previous runs
    from app.db import SessionLocal
    db_cleanup = SessionLocal()
    try:
        stuck = db_cleanup.query(Merchant).filter(Merchant.crawl_status == "crawling").all()
        if stuck:
            for m in stuck:
                m.crawl_status = "idle"
            db_cleanup.commit()
            logger.info(f"Self-healing: Reset {len(stuck)} stuck crawling status(es) to 'idle'.")
    except Exception as e:
        db_cleanup.rollback()
        logger.warning(f"Startup crawl status cleanup failed: {e}")
    finally:
        db_cleanup.close()

    logger.info("✅ Database tables created & verified. API ready.")
    yield
    logger.info("Shutting down AIBuyable Gateway API.")


app = FastAPI(
    title="AIBuyable Gateway API",
    description="Agentic Commerce Control Center for Razorpay Merchants",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# CORS — allow the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(auth_router)
app.include_router(merchant_router)
app.include_router(orders_router)
app.include_router(chat_router)
app.include_router(agentic_router)
app.include_router(well_known_router)
app.include_router(admin_router)
app.include_router(internal_router)
app.include_router(webhooks_router)
app.include_router(payment_router)


@app.get("/")
def root():
    return {
        "service": "AIBuyable Gateway API",
        "version": "1.0.0",
        "docs": "/api/docs",
        "status": "running",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


async def seed_admin():
    """Seed the admin account if it doesn't exist."""
    from app.db import SessionLocal
    from app.auth.hashing import hash_password
    import uuid

    db = SessionLocal()
    try:
        existing = db.query(Merchant).filter(Merchant.email == settings.ADMIN_EMAIL).first()
        if not existing:
            admin = Merchant(
                id=str(uuid.uuid4()),
                name=settings.ADMIN_NAME,
                email=settings.ADMIN_EMAIL,
                password_hash=hash_password(settings.ADMIN_PASSWORD),
                role="admin",
            )
            db.add(admin)
            db.commit()
            logger.info(f"✅ Admin account seeded: {settings.ADMIN_EMAIL}")
        else:
            logger.info(f"Admin account already exists: {settings.ADMIN_EMAIL}")
    except Exception as e:
        logger.error(f"Admin seed failed: {e}")
    finally:
        db.close()
