from fastapi import APIRouter, Depends
from models.journal import JournalEntry
from models.mood import MoodLog
from models.user import User
from dependencies import get_current_user
from services.llm_service import llm_service
from datetime import datetime, timedelta, timezone
import json 
import re 

router = APIRouter(prefix="/insights", tags=["Insights"])

@router.get("/weekly")
async def get_weekly_insights(user: User = Depends(get_current_user)):
    # 1. Fetch last 7 days of data
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    
    journals = await JournalEntry.find(
        JournalEntry.user_id == user.id,
        JournalEntry.created_at >= seven_days_ago
    ).to_list()
    
    moods = await MoodLog.find(
        MoodLog.user_id == user.id,
        MoodLog.created_at >= seven_days_ago # Changed 'logged_at' to 'created_at' to match standard models
    ).to_list()

    # 2. Safety Check: If no data, return a graceful response
    if not journals and not moods:
        return {
            "summary": "I don't have enough data from the past week yet. Try writing a few more journal entries!",
            "patterns": [],
            "suggestions": ["Write your first journal entry", "Log your mood today"],
            "affirmation": "Every step forward is progress."
        }

    # 3. Format for LLM
    journal_text = "\n".join([f"- {j.content}" for j in journals]) if journals else "No journals this week."
    mood_summary = ", ".join([f"{m.mood_score}" for m in moods]) if moods else "No mood logs."

    # 4. Call Groq using our service method
    prompt = f"""
Analyze the user's emotional patterns based on their recent activity.

MOODS: {mood_summary}

Return a JSON object with:
'summary', 'patterns' (list), 'suggestions' (list), 'affirmation'.

Keep the tone empathetic like a wellness companion.
"""
    
    # Using the existing get_response method from our service
    response = await llm_service.get_response(
    user_input=prompt,
    chat_history=[],  # no chat history for insights
    journal_context=journal_text  # pass journal context here
)
    cleaned = re.sub(r"```json|```", "", response).strip()

    try:
        return json.loads(cleaned)
    except:
        return {
        "summary": response,
        "patterns": [],
        "suggestions": [],
        "affirmation": ""
    }
    # response is already a string because of our StrOutputParser
    