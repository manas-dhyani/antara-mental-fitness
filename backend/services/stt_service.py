from __future__ import annotations

from dataclasses import dataclass
from typing import BinaryIO

from config import settings


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    model: str


class STTService:
    """
    Speech-to-text using Groq's OpenAI-compatible endpoint:
    /openai/v1/audio/transcriptions
    """

    def __init__(self) -> None:
        self.default_model = settings.GROQ_STT_MODEL
        self.default_language = settings.GROQ_STT_LANGUAGE

    async def transcribe(
        self,
        *,
        filename: str,
        content_type: str | None,
        file_obj: BinaryIO,
        model: str | None = None,
        language: str | None = None,
    ) -> TranscriptionResult:
        # Import here so the API can still start if groq isn't installed yet.
        from groq import AsyncGroq

        client = AsyncGroq(api_key=settings.GROQ_API_KEY)

        chosen_model = model or self.default_model
        chosen_language = language if language is not None else self.default_language

        # Groq's SDK mirrors OpenAI's: audio.transcriptions.create(...)
        # The SDK expects a (filename, file_bytes_or_fileobj, content_type) tuple.
        transcription = await client.audio.transcriptions.create(
            file=(filename, file_obj, content_type or "application/octet-stream"),
            model=chosen_model,
            language=chosen_language,
        )

        text = getattr(transcription, "text", None) or ""
        return TranscriptionResult(text=text, model=chosen_model)


stt_service = STTService()

