from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from config import settings

# Import all models
from models.user import User
from models.journal import JournalEntry
from models.chat import ChatSession
from models.mood import MoodLog

async def init_db():
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    database = client[settings.MONGODB_DB_NAME]
    
    await init_beanie(
        database=database,
        document_models=[User, JournalEntry, ChatSession, MoodLog]
    )
    print("MongoDB and Beanie initialized successfully.")