from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # Auth
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Encryption (Fernet key for Razorpay secrets)
    ENCRYPTION_KEY: str

    # Gemini
    GOOGLE_API_KEY: str
    DEFAULT_GEMINI_MODEL: str = "gemini-3.6-flash"

    # Razorpay
    RAZORPAY_MODE: str = "test"  # hard-locked

    # Application
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_URL: str = "http://localhost:8000"

    # Admin seed
    ADMIN_EMAIL: str = "admin@aibuyable.com"
    ADMIN_PASSWORD: str = "Admin@123456"
    ADMIN_NAME: str = "Platform Admin"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
