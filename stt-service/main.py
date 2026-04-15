import os
import subprocess
import tempfile
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

MODEL_NAME = os.getenv("WHISPER_MODEL", "small")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
SHARED_KEY = os.getenv("STT_SHARED_KEY", "")

app = FastAPI(title="Self-hosted STT API", version="1.0.0")
model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)


def transcribe_safe(audio_path: str, kwargs: dict) -> tuple[list, object]:
    """Run transcription with a small fallback when language detection has no candidates."""
    try:
        segments, info = model.transcribe(audio_path, **kwargs)
        return list(segments), info
    except ValueError as err:
        # faster-whisper can raise this on very short/silent chunks when auto language detect fails.
        if "empty sequence" not in str(err).lower():
            raise

        if kwargs.get("language"):
            return [], None

        for forced_language in ("en", "vi"):
            forced_kwargs = {**kwargs, "language": forced_language}
            try:
                segments, info = model.transcribe(audio_path, **forced_kwargs)
                return list(segments), info
            except ValueError as forced_err:
                if "empty sequence" in str(forced_err).lower():
                    continue
                raise

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
    language: str | None = None,
    x_stt_key: str | None = Header(default=None),
):
    if SHARED_KEY and x_stt_key != SHARED_KEY:
        raise HTTPException(status_code=401, detail="Invalid STT key")

    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    suffix = os.path.splitext(file.filename)[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
        temp_path = temp.name
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty audio file")
        temp.write(content)

    wav_retry_path = f"{temp_path}.wav"
    try:
        kwargs = {
            "beam_size": 1,
            "vad_filter": True,
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

        if not text:
            relaxed_kwargs = {**kwargs, "vad_filter": False}
            retry_source = wav_retry_path if os.path.exists(wav_retry_path) else temp_path
            retry_segments, _retry_info = transcribe_safe(retry_source, relaxed_kwargs)
            text = join_segments(retry_segments)

        return {"text": text}
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
