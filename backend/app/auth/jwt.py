from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from app.config import settings


def create_access_token(merchant_id: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": merchant_id, "role": role, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(merchant_id: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": merchant_id, "role": role, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None
