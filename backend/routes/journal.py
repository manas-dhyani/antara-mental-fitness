from fastapi import APIRouter, Depends, HTTPException
from models.journal import JournalEntry
from models.user import User
from dependencies import get_current_user
from services.vector_service import vector_service
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/journal", tags=["Journal"])

class JournalCreate(BaseModel):
    title: str
    content: str
    mood_score: float
    tags: List[str] = []

@router.post("/")
async def create_entry(data: JournalCreate, user: User = Depends(get_current_user)):
    # 1. Save to MongoDB
    entry = JournalEntry(
        user_id=user.id,
        title=data.title,
        content=data.content,
        mood_score=data.mood_score,
        tags=data.tags,
        embedding_status="pending"
    )
    await entry.insert()

    # 2. Vectorize for AI Context (Phase 2 Service)
    try:
        metadata = {
            "journal_id": str(entry.id),
            "mood_score": data.mood_score,
            "tags": ",".join(data.tags)
        }
        await vector_service.upsert_journal(
            user_id=str(user.id),
            journal_id=str(entry.id),
            content=data.content,
            metadata=metadata
        )
        entry.embedding_status = "done"
        entry.chroma_doc_id = str(entry.id)
        await entry.save()
    except Exception as e:
        entry.embedding_status = "failed"
        await entry.save()
        print(f"Vectorization failed: {e}")

    return entry

@router.get("/", response_model=List[JournalEntry])
async def list_entries(user: User = Depends(get_current_user)):
    return await JournalEntry.find(JournalEntry.user_id == user.id).sort("-created_at").to_list()