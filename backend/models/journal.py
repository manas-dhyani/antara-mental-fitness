from datetime import datetime, timezone
from beanie import Document, PydanticObjectId

class JournalEntry(Document):
    user_id: PydanticObjectId
    title: str
    content: str
    mood_score: float
    tags: list[str] = []
    created_at: datetime = datetime.now(timezone.utc)
    chroma_doc_id: str | None = None
    embedding_status: str = "pending" # "pending" | "done" | "failed"

    class Settings:
        name = "journals"