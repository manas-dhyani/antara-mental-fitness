from datetime import datetime, timezone
from beanie import Document
from pydantic import EmailStr

class User(Document):
    email: EmailStr
    username: str
    hashed_password: str
    created_at: datetime = datetime.now(timezone.utc)
    streak: int = 0
    last_active: datetime = datetime.now(timezone.utc)
    preferences: dict = {}

    class Settings:
        name = "users"
        indexes = ["email"]     