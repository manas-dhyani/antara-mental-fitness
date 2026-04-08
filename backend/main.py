from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from db.mongo import init_db
from routes import auth, journal, chat, insights # Added chat and insights

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="Mental Fitness App API", lifespan=lifespan)

# Add CORS so your React/Next.js frontend can talk to the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Change this to your frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(journal.router)
app.include_router(chat.router)
app.include_router(insights.router)

@app.get("/")
async def health_check():
    return {"status": "ok"}