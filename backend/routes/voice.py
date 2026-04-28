from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from dependencies import get_current_user
from models.user import User
from services.stt_service import stt_service

router = APIRouter(prefix="/voice", tags=["Voice"])


@router.post("/transcribe")
async def transcribe_audio(
    user: User = Depends(get_current_user),
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
    model: str | None = Form(default=None),
):
    # 'user' is only used to enforce JWT protection.
    _ = user

    if not file:
        raise HTTPException(status_code=400, detail="Missing audio file")

    try:
        result = await stt_service.transcribe(
            filename=file.filename or "audio",
            content_type=file.content_type,
            file_obj=file.file,
            model=model,
            language=language,
        )
        return {"text": result.text, "model": result.model}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")

