from datetime import datetime, timezone
from beanie import Document, PydanticObjectId

class ChatSession(Document):
    user_id: PydanticObjectId
    session_id: str
    messages: list[dict] = [] # [{role, content, timestamp}]
    created_at: datetime = datetime.now(timezone.utc)
    last_message_at: datetime = datetime.now(timezone.utc)
    context_summary: str = ""

    class Settings:
        name = "chat_sessions"