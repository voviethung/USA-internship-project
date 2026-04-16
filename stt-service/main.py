import os
import subprocess
import tempfile
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

MODEL_NAME = os.getenv("WHISPER_MODEL", "small")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
SHARED_KEY = os.getenv("STT_SHARED_KEY", "")

app = FastAPI(title="Self-hosted STT API", version="1.0.0")
model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)


def is_empty_sequence_error(err: Exception) -> bool:
    return "empty sequence" in str(err).lower() or "max() arg is an empty sequence" in str(err).lower()


def transcribe_safe(audio_path: str, kwargs: dict) -> tuple[list, object]:
    """Run transcription and degrade empty-sequence failures into empty transcript results."""
    attempt_kwargs: list[dict] = []

    # Start with VAD disabled to catch weak audio
    if kwargs.get("language"):
        attempt_kwargs.append({**kwargs, "vad_filter": False})
        attempt_kwargs.append(kwargs)
    else:
        attempt_kwargs.append({**kwargs, "vad_filter": False})
        for forced_language in ("en", "vi"):
            attempt_kwargs.append({**kwargs, "language": forced_language, "vad_filter": False})
            attempt_kwargs.append(
                {**kwargs, "language": forced_language}
            )

    last_error: Exception | None = None

    for current_kwargs in attempt_kwargs:
        try:
            segments, info = model.transcribe(audio_path, **current_kwargs)
            return list(segments), info
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
            "beam_size": 1,
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
        print(f"[transcribe] segments count={len(segments)}, text='{text}'")
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
