import os
import time

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-production-key!")
ALGORITHM = "HS256"
TOKEN_EXPIRE = 86400  # 24 hours

security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: int) -> str:
    payload = {"sub": str(user_id), "exp": int(time.time()) + TOKEN_EXPIRE}
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    try:
        payload = jwt.decode(creds.credentials, SECRET, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise ValueError
        return int(user_id)
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def require_admin(user_id: int = Depends(get_current_user)) -> int:
    from database import get_db

    db = get_db()
    user = db.execute("SELECT is_admin FROM users WHERE id=?", (user_id,)).fetchone()
    db.close()
    if not user or not user["is_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user_id
