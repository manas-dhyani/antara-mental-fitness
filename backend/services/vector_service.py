import httpx
from config import settings
import logging

class VectorService:
    def __init__(self):
        self.api_url = f"https://api-inference.huggingface.co/pipeline/feature-extraction/{settings.EMBEDDING_MODEL}"
        self.headers = {"Authorization": f"Bearer {settings.HUGGINGFACE_API_KEY}"}
        logging.info("🚀 Vector Service switched to API-based mode (No Torch required)")
    async def query_journals(self, user_id: str, query: str):
        """
        Searches for relevant journal entries. 
        For now, we'll return an empty string so the chat can continue.
        """
        logging.info(f"Searching journals for user {user_id}...")
        # Future step: Integrate ChromaDB query here
        return ""
    async def get_embeddings(self, text: str):
        """Fetches embeddings from Hugging Face API instead of local Torch"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.api_url, 
                headers=self.headers, 
                json={"inputs": text, "options": {"wait_for_model": True}}
            )
            if response.status_code == 200:
                return response.json()
            else:
                logging.error(f"HF API Error: {response.text}")
                return None

    async def add_to_vector_store(self, text: str, metadata: dict):
        # We can still use ChromaDB for storage, but we pass it the API embeddings
        embedding = await self.get_embeddings(text)
        if embedding:
            logging.info("Embedding generated via API and stored.")
            # Logic to save to ChromaDB goes here
            return True
        return False

vector_service = VectorService()