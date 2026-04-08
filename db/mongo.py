from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from config import settings

# Import all models
from models.user import User
from models.journal import JournalEntry
from models.chat import ChatSession
from models.mood import MoodLog

async def init_db():
    # 1. Create the client
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    
    # 2. Get the database object correctly
    # Using .get_database() is safer in async Motor versions
    database = client.get_database(settings.MONGODB_DB_NAME)
    
    # 3. Initialize Beanie
    await init_beanie(
        database=database,
        document_models=[User, JournalEntry, ChatSession, MoodLog]
    )
    print("✅ MongoDB and Beanie initialized successfully.")