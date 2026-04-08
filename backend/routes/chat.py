from fastapi import APIRouter, Depends, HTTPException
from models.chat import ChatSession
from models.user import User
from dependencies import get_current_user
from services.llm_service import llm_service
from services.vector_service import vector_service
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/chat", tags=["Chat"])

class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None

@router.post("/message")
async def chat_with_ai(data: ChatRequest, user: User = Depends(get_current_user)):
    # 1. Retrieve or create session
    session_id = data.session_id or str(uuid.uuid4())
    session = await ChatSession.find_one(
        ChatSession.user_id == user.id, 
        ChatSession.session_id == session_id
    )
    
    if not session:
        session = ChatSession(user_id=user.id, session_id=session_id, messages=[])
        await session.insert()

    # 2. RAG: Search ChromaDB for journal context
    # This makes the AI "remember" what the user wrote in their journals
    context = await vector_service.query_journals(user_id=str(user.id), query=data.message)

    # 3. Get AI Response from Groq
    chain = llm_service.get_chat_chain(journal_context=context)
    
    # Format history for LangChain
    history = [{"role": m["role"], "content": m["content"]} for m in session.messages[-10:]]
    
    response = await chain.ainvoke({
        "input": data.message,
        "chat_history": history
    })

    ai_content = response

    # 4. Update MongoDB History
    user_msg = {"role": "human", "content": data.message, "timestamp": datetime.now(timezone.utc)}
    ai_msg = {"role": "ai", "content": ai_content, "timestamp": datetime.now(timezone.utc)}
    
    session.messages.extend([user_msg, ai_msg])
    session.last_message_at = datetime.now(timezone.utc)
    await session.save()

    return {
        "session_id": session_id,
        "response": ai_content,
        "context_used": bool(context)
    }