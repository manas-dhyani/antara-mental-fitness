from datetime import datetime, timezone
from beanie import Document, PydanticObjectId
from pydantic import Field
class MoodLog(Document):
    user_id: PydanticObjectId
    mood_score: int
    mood_label: str
    note: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    logged_at: datetime = datetime.now(timezone.utc)


    class Settings:
        name = "mood_logs"