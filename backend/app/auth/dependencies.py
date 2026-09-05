from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.db import get_db
from app.auth.jwt import decode_token
from app.models.merchant import Merchant

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Merchant:
    """Extract and validate JWT; return the authenticated Merchant object."""
    token = credentials.credentials
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    merchant_id = payload.get("sub")
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return merchant


def require_role(role: str):
    """FastAPI dependency factory — raises 403 if the user does not have the expected role."""
    def dependency(current_user: Merchant = Depends(get_current_user)) -> Merchant:
        if current_user.role != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {role}",
            )
        return current_user
    return dependency
