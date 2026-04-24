import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
import argostranslate.package
import argostranslate.translate

SHARED_KEY = os.getenv("ARGOS_SHARED_KEY", "")
LANG_PAIRS = os.getenv("ARGOS_LANG_PAIRS", "en-vi,vi-en")

app = FastAPI(title="Self-hosted Argos Translation API", version="1.0.0")


def _parse_pairs() -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for raw in LANG_PAIRS.split(","):
        raw = raw.strip()
        if not raw or "-" not in raw:
            continue
        src, dst = raw.split("-", 1)
        src = src.strip().lower()
        dst = dst.strip().lower()
        if src and dst:
            pairs.append((src, dst))
    return pairs


def _ensure_packages_installed() -> None:
    wanted = _parse_pairs()
    if not wanted:
        return

    argostranslate.package.update_package_index()
    available = argostranslate.package.get_available_packages()

    for src, dst in wanted:
        installed_languages = argostranslate.translate.get_installed_languages()
        installed_codes = {lang.code for lang in installed_languages}
        if src in installed_codes and dst in installed_codes:
            src_lang = next((lang for lang in installed_languages if lang.code == src), None)
            dst_lang = next((lang for lang in installed_languages if lang.code == dst), None)
            if src_lang and dst_lang and src_lang.get_translation(dst_lang):
                continue

        match = next(
            (
                pkg
                for pkg in available
                if pkg.from_code.lower() == src and pkg.to_code.lower() == dst
            ),
            None,
        )
        if not match:
            raise RuntimeError(f"No Argos package found for {src}->{dst}")

        package_path = match.download()
        argostranslate.package.install_from_path(package_path)


def _translate(text: str, source_lang: str, target_lang: str) -> str:
    installed_languages = argostranslate.translate.get_installed_languages()
    src = next((lang for lang in installed_languages if lang.code == source_lang), None)
    dst = next((lang for lang in installed_languages if lang.code == target_lang), None)

    if not src or not dst:
        raise RuntimeError(f"Language not installed: {source_lang}->{target_lang}")

    translation = src.get_translation(dst)
    if not translation:
        raise RuntimeError(f"Translation package missing: {source_lang}->{target_lang}")

    return translation.translate(text)


class TranslateRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str


@app.on_event("startup")
def startup_event() -> None:
    # Packages should already be installed at build time via install_packages.py.
    # This is a fallback in case the volume cache is empty (e.g. first run after volume wipe).
    try:
        _ensure_packages_installed()
    except Exception as exc:
        # Log but do NOT crash the server — /translate will return 500 for missing packages.
        print(f"[argos-api] WARNING: package install on startup failed: {exc}", flush=True)


@app.get("/health")
def health():
    return {
        "ok": True,
        "lang_pairs": _parse_pairs(),
    }


@app.post("/translate")
def translate(payload: TranslateRequest, x_translate_key: str | None = Header(default=None)):
    if SHARED_KEY and x_translate_key != SHARED_KEY:
        raise HTTPException(status_code=401, detail="Invalid translate key")

    text = payload.text.strip()
    source_lang = payload.source_lang.strip().lower()
    target_lang = payload.target_lang.strip().lower()

    if not text:
        return {"translated_text": ""}

    if source_lang not in {"en", "vi"} or target_lang not in {"en", "vi"}:
        raise HTTPException(status_code=400, detail="Only en/vi are supported")

    try:
        translated_text = _translate(text, source_lang, target_lang)
        return {"translated_text": translated_text}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Argos translate failed: {err}")
