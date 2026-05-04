import os
import re
import subprocess
import tempfile
import requests
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel
from pydantic import BaseModel

MODEL_NAME = os.getenv("WHISPER_MODEL", "small")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
SHARED_KEY = os.getenv("STT_SHARED_KEY", "")
BEAM_SIZE = int(os.getenv("WHISPER_BEAM_SIZE", "5"))
BEST_OF = int(os.getenv("WHISPER_BEST_OF", "5"))

ARGOS_URL = os.getenv("ARGOS_URL", "http://argos-api:8001")
ARGOS_KEY = os.getenv("ARGOS_SHARED_KEY", "")
MERGE_MIN_SCORE = float(os.getenv("WHISPER_MERGE_MIN_SCORE", "0.60"))

HALLUCINATION_PATTERNS = [
    r"\bsubscribe\b",
    r"\blike\s+and\s+share\b",
    r"\bnh(ớ|o)\s*đ(ă|a)ng\s*k(ý|i)\b",
    r"\bh(a|ã)y\s+subscribe\b",
    r"\bk(e|ê)nh\s+ghi(e|ề)n\s+m(i|ì)\s+g(o|õ)\b",
]


class TranslateRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str


def argos_translate(text: str, source_lang: str) -> str | None:
    """Call internal Argos Translate service. Returns translated text or None on failure."""
    if not text.strip():
        return None
    target_lang = "vi" if source_lang == "en" else "en"
    try:
        headers = {"Content-Type": "application/json"}
        if ARGOS_KEY:
            headers["x-translate-key"] = ARGOS_KEY
        resp = requests.post(
            f"{ARGOS_URL}/translate",
            json={"text": text, "source_lang": source_lang, "target_lang": target_lang},
            headers=headers,
            timeout=10,
        )
        if resp.ok:
            data = resp.json()
            return data.get("translated_text") or None
        print(f"[argos] HTTP {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[argos] translate failed: {e}")
    return None


def argos_translate_to_target(text: str, source_lang: str, target_lang: str) -> str | None:
    """Call internal Argos Translate service with explicit target language."""
    source_lang = source_lang.strip().lower()
    target_lang = target_lang.strip().lower()
    if source_lang not in {"en", "vi"} or target_lang not in {"en", "vi"}:
        return None
    if source_lang == target_lang:
        return text
    if not text.strip():
        return None

    try:
        headers = {"Content-Type": "application/json"}
        if ARGOS_KEY:
            headers["x-translate-key"] = ARGOS_KEY
        resp = requests.post(
            f"{ARGOS_URL}/translate",
            json={"text": text, "source_lang": source_lang, "target_lang": target_lang},
            headers=headers,
            timeout=10,
        )
        if resp.ok:
            data = resp.json()
            return data.get("translated_text") or None
        print(f"[argos] HTTP {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"[argos] translate failed: {e}")
    return None

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
        attempt_kwargs.append({**kwargs, "language": preferred_language, "vad_filter": True})
        attempt_kwargs.append({**kwargs, "language": preferred_language, "vad_filter": False})

    # 2) Then auto language detection (with/without VAD)
    auto_kwargs = {k: v for k, v in kwargs.items() if k != "language"}
    attempt_kwargs.append({**auto_kwargs, "vad_filter": True})
    attempt_kwargs.append({**auto_kwargs, "vad_filter": False})

    # 3) Last-resort forced candidates
    for forced_language in ("en", "vi"):
        if forced_language != preferred_language:
            attempt_kwargs.append({**kwargs, "language": forced_language, "vad_filter": True})
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


def strip_hallucination_phrases(text: str) -> tuple[str, bool]:
    if not text:
        return "", False

    parts = re.split(r"([.!?\n]+)", text)
    kept: list[str] = []
    removed = False

    for idx in range(0, len(parts), 2):
        sentence = parts[idx].strip()
        sep = parts[idx + 1] if idx + 1 < len(parts) else ""
        if not sentence:
            continue

        lower_sentence = sentence.lower()
        is_hallucinated = any(re.search(pattern, lower_sentence) for pattern in HALLUCINATION_PATTERNS)
        if is_hallucinated:
            removed = True
            continue

        kept.append(f"{sentence}{sep}".strip())

    cleaned = " ".join(part for part in kept if part).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned, removed


def dedupe_consecutive_sentences(text: str) -> tuple[str, bool]:
    """Drop consecutive duplicated sentences often produced by STT drift/hallucination."""
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return "", False

    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", normalized) if part.strip()]
    if len(parts) <= 1:
        return normalized, False

    deduped: list[str] = []
    removed = False
    previous_key = ""
    for sentence in parts:
        key = re.sub(r"[^a-z0-9]", "", sentence.lower())
        if key and key == previous_key:
            removed = True
            continue
        deduped.append(sentence)
        previous_key = key

    return " ".join(deduped).strip(), removed


def is_likely_hallucinated_text(
    text: str,
    segments: list,
    language_probability: float | None,
) -> bool:
    """Heuristic guard for Whisper drift/hallucination on low-quality audio chunks."""
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return False

    words = re.findall(r"\b\w+\b", normalized.lower())
    if len(words) >= 14:
        unique_ratio = len(set(words)) / max(len(words), 1)
        if unique_ratio < 0.35:
            return True

    phrases: dict[str, int] = {}
    for i in range(len(words) - 2):
        tri = " ".join(words[i : i + 3])
        phrases[tri] = phrases.get(tri, 0) + 1
    if phrases and max(phrases.values()) >= 4:
        return True

    avg_logprobs: list[float] = []
    no_speech_probs: list[float] = []
    for seg in segments:
        avg_logprob = getattr(seg, "avg_logprob", None)
        no_speech_prob = getattr(seg, "no_speech_prob", None)
        if isinstance(avg_logprob, (int, float)):
            avg_logprobs.append(float(avg_logprob))
        if isinstance(no_speech_prob, (int, float)):
            no_speech_probs.append(float(no_speech_prob))

    if language_probability is not None and language_probability < 0.45 and len(words) >= 8:
        return True

    if avg_logprobs:
        mean_avg_logprob = sum(avg_logprobs) / len(avg_logprobs)
        if mean_avg_logprob < -1.35 and len(words) >= 8:
            return True

    if no_speech_probs:
        mean_no_speech = sum(no_speech_probs) / len(no_speech_probs)
        if mean_no_speech > 0.75 and len(words) >= 5:
            return True

    return False


def score_transcript_quality(segments: list, text: str) -> float:
    if not text.strip():
        return 0.0

    avg_logprobs: list[float] = []
    no_speech_probs: list[float] = []
    for seg in segments:
        avg_logprob = getattr(seg, "avg_logprob", None)
        no_speech_prob = getattr(seg, "no_speech_prob", None)
        if isinstance(avg_logprob, (int, float)):
            avg_logprobs.append(float(avg_logprob))
        if isinstance(no_speech_prob, (int, float)):
            no_speech_probs.append(float(no_speech_prob))

    score = 1.0
    compact_len = len(re.sub(r"\s+", "", text))
    if compact_len < 4:
        score -= 0.3

    if avg_logprobs:
        mean_avg_logprob = sum(avg_logprobs) / len(avg_logprobs)
        if mean_avg_logprob < -1.0:
            score -= 0.25
        if mean_avg_logprob < -1.5:
            score -= 0.25

    if no_speech_probs:
        mean_no_speech = sum(no_speech_probs) / len(no_speech_probs)
        if mean_no_speech > 0.6:
            score -= 0.35
        if mean_no_speech > 0.8:
            score -= 0.2

    return max(0.0, min(1.0, score))


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
    }


@app.post("/translate")
def translate_text(
    payload: TranslateRequest,
    x_translate_key: str | None = Header(default=None),
):
    expected_key = ARGOS_KEY or SHARED_KEY
    if expected_key and x_translate_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid translate key")

    text = payload.text.strip()
    source_lang = payload.source_lang.strip().lower()
    target_lang = payload.target_lang.strip().lower()

    if not text:
        return {"translated_text": ""}

    if source_lang not in {"en", "vi"} or target_lang not in {"en", "vi"}:
        raise HTTPException(status_code=400, detail="Only en/vi are supported")

    translated = argos_translate_to_target(text, source_lang, target_lang)
    if translated is None:
        raise HTTPException(status_code=500, detail="Argos translate failed")

    return {"translated_text": translated}


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
            "condition_on_previous_text": False,
            "vad_filter": True,
            "vad_parameters": {
                "min_silence_duration_ms": 400,
                "speech_pad_ms": 140,
            },
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

        raw_text = join_segments(segments)
        text, hallucination_removed = strip_hallucination_phrases(raw_text)
        text, repeat_removed = dedupe_consecutive_sentences(text)
        hallucination_removed = hallucination_removed or repeat_removed

        detected_language = getattr(_info, "language", None) if _info is not None else None
        language_probability = getattr(_info, "language_probability", None) if _info is not None else None

        quality_score = score_transcript_quality(segments, text)
        if isinstance(language_probability, (int, float)) and language_probability < 0.55:
            quality_score = max(0.0, quality_score - 0.2)

        if language and detected_language and language != detected_language:
            if isinstance(language_probability, (int, float)) and language_probability < 0.85:
                quality_score = max(0.0, quality_score - 0.2)

        likely_hallucinated = is_likely_hallucinated_text(
            text,
            segments,
            float(language_probability) if isinstance(language_probability, (int, float)) else None,
        )
        if likely_hallucinated:
            text = ""
            hallucination_removed = True

        should_merge = quality_score >= MERGE_MIN_SCORE and bool(text.strip())
        print(
            f"[transcribe] segments={len(segments)}, detected_language={detected_language}, "
            f"language_probability={language_probability}, quality_score={quality_score:.3f}, "
            f"should_merge={should_merge}, hallucination_removed={hallucination_removed}, text='{text}'"
        )

        # Determine source language: prefer UI-provided, fallback to Whisper detected
        source_lang = language or detected_language or "en"
        if source_lang not in ("en", "vi"):
            source_lang = "en"

        # Quick translation via internal Argos (no external API, no quota)
        translation = None
        if text:
            translation = argos_translate(text, source_lang)
            print(f"[argos] translation='{translation}'")

        result = {
            "text": text,
            "source_lang": source_lang,
            "translation": translation,
            "quality_score": quality_score,
            "should_merge": should_merge,
            "hallucination_removed": hallucination_removed,
        }
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
