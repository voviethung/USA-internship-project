import os
import tempfile
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

MODEL_NAME = os.getenv("WHISPER_MODEL", "small")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
SHARED_KEY = os.getenv("STT_SHARED_KEY", "")

app = FastAPI(title="Self-hosted STT API", version="1.0.0")
model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)


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

    try:
        kwargs = {
            "beam_size": 1,
            "vad_filter": True,
        }
        if language:
            kwargs["language"] = language

        segments, _info = model.transcribe(temp_path, **kwargs)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        return {"text": text}
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
