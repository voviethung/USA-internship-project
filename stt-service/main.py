import os
import subprocess
import tempfile
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

MODEL_NAME = os.getenv("WHISPER_MODEL", "small")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
SHARED_KEY = os.getenv("STT_SHARED_KEY", "")
BEAM_SIZE = int(os.getenv("WHISPER_BEAM_SIZE", "5"))
BEST_OF = int(os.getenv("WHISPER_BEST_OF", "5"))

app = FastAPI(title="Self-hosted STT API", version="1.0.0")
model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)


def is_empty_sequence_error(err: Exception) -> bool:
    return "empty sequence" in str(err).lower() or "max() arg is an empty sequence" in str(err).lower()


def transcribe_safe(audio_path: str, kwargs: dict) -> tuple[list, object]:
    """Run transcription and degrade empty-sequence failures into empty transcript results."""
    attempt_kwargs: list[dict] = []

    preferred_language = kwargs.get("language")

    # 1) If UI provided language, try it first (with/without VAD)
    if preferred_language:
        attempt_kwargs.append({**kwargs, "language": preferred_language, "vad_filter": False})
        attempt_kwargs.append({**kwargs, "language": preferred_language, "vad_filter": True})

    # 2) Then auto language detection (with/without VAD)
    auto_kwargs = {k: v for k, v in kwargs.items() if k != "language"}
    attempt_kwargs.append({**auto_kwargs, "vad_filter": False})
    attempt_kwargs.append({**auto_kwargs, "vad_filter": True})

    # 3) Last-resort forced candidates
    for forced_language in ("en", "vi"):
        if forced_language != preferred_language:
            attempt_kwargs.append({**kwargs, "language": forced_language, "vad_filter": False})

    last_error: Exception | None = None

    for current_kwargs in attempt_kwargs:
        try:
            segments, info = model.transcribe(audio_path, **current_kwargs)
            segment_list = list(segments)
            text = join_segments(segment_list)

            if text:
                return segment_list, info
        except Exception as err:
            if is_empty_sequence_error(err):
                last_error = err
                continue
            raise

    if last_error is not None:
        return [], None

    return [], None


def join_segments(segments: list) -> str:
    return " ".join(seg.text.strip() for seg in segments).strip()


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
    x_stt_key: str | None = Header(default=None),
):
    if SHARED_KEY and x_stt_key != SHARED_KEY:
        raise HTTPException(status_code=401, detail="Invalid STT key")

    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    print(f"[transcribe] filename={file.filename}, content_type={file.content_type}, language={language}")

    suffix = os.path.splitext(file.filename)[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
        temp_path = temp.name
        content = await file.read()
        print(f"[transcribe] audio size={len(content)} bytes")
        if not content:
            raise HTTPException(status_code=400, detail="Empty audio file")
        temp.write(content)

    wav_retry_path = f"{temp_path}.wav"
    try:
        kwargs = {
            "beam_size": BEAM_SIZE,
            "best_of": BEST_OF,
            "temperature": 0.0,
            "condition_on_previous_text": True,
            "task": "transcribe",
        }
        if language:
            kwargs["language"] = language

        try:
            segments, _info = transcribe_safe(temp_path, kwargs)
        except Exception as first_err:
            try:
                subprocess.run(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        temp_path,
                        "-ar",
                        "16000",
                        "-ac",
                        "1",
                        wav_retry_path,
                    ],
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                segments, _info = transcribe_safe(wav_retry_path, kwargs)
            except Exception as second_err:
                raise HTTPException(
                    status_code=422,
                    detail=f"STT decode failed. direct={first_err}; ffmpeg_retry={second_err}",
                )

        text = join_segments(segments)
        detected_language = getattr(_info, "language", None) if _info is not None else None
        language_probability = getattr(_info, "language_probability", None) if _info is not None else None
        print(
            f"[transcribe] segments={len(segments)}, detected_language={detected_language}, "
            f"language_probability={language_probability}, text='{text}'"
        )
        result = {"text": text}
        print(f"[transcribe] returning: {result}")
        return result
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"STT internal error: {err}")
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
        try:
            os.remove(wav_retry_path)
        except OSError:
            pass
