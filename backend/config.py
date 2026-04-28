from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    GROQ_API_KEY: str
    GROQ_STT_MODEL: str = "whisper-large-v3-turbo"
    GROQ_STT_LANGUAGE: str | None = None
    MONGODB_URI: str
    MONGODB_DB_NAME: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 10080
    CHROMA_PERSIST_DIR: str = "./chroma_store"
    HUGGINGFACE_API_KEY: str  # Add this line
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"

settings = Settings()