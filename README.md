# Pharma Voice Assistant 🏥

AI-powered PWA voice assistant for pharmaceutical interns — captures speech, transcribes it, translates it quickly between English and Vietnamese, and suggests professional follow-up when needed.

## Features

- 🎤 **Voice Recording** — Hold to speak, optimized for short live segments
- 🔄 **Speech-to-Text** — Powered by self-hosted `faster-whisper` or managed fallback
- 🇻🇳 **Fast Translation** — Local Argos Translate (`en↔vi`) for low-latency segment translation
- 💬 **Smart Replies** — Suggested professional responses (EN + VI) when enabled
- 📝 **On-demand Summary** — Generate summaries only when requested to reduce token usage
- 🔊 **Text-to-Speech** — Listen to suggested replies
- 📎 **File Attachment** — Upload images, PDFs, PPT, Word to Cloudinary
- 📡 **Offline Mode** — Quick reply cards when no connection
- 📱 **PWA** — Install as mobile app, works standalone

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **AI / LLM**: Groq or OpenAI for summaries, replies, and managed fallback
- **Speech-to-Text**: Self-hosted `faster-whisper` on Machine B
- **Translation**: Self-hosted Argos Translate on Machine B (internal Docker network)
- **Database**: Supabase (Auth + PostgreSQL)
- **File Storage**: Cloudinary
- **Deploy**: Vercel + Docker + Cloudflare Tunnel

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys

# 3. Run Supabase schema
# Go to Supabase Dashboard → SQL Editor → paste supabase/schema.sql → Run

# 4. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your phone (same WiFi) or use Chrome DevTools mobile emulation.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_PROVIDER` | Yes | `groq` or `openai` |
| `GROQ_API_KEY` | If groq | Groq API key |
| `OPENAI_API_KEY` | If openai | OpenAI API key |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API secret |
| `SELF_HOSTED_STT_URL` | No | URL of Machine B STT API (Cloudflare Tunnel domain) |
| `SELF_HOSTED_STT_KEY` | No | Shared key sent as `x-stt-key` header to self-hosted STT |
| `SELF_HOSTED_STT_MODE` | No | `off`, `prefer` (default), or `only` |

Notes:

- Current recommended architecture does **not** require Vercel to call Argos directly.
- Local Argos translation happens inside Machine B through `stt-api -> argos-api`.
- Older `SELF_HOSTED_TRANSLATE_*` variables are no longer needed for the preferred deployment flow.

## Self-hosted STT + Offline Translation (Machine B)

Run Docker services on Machine B:

```bash
docker compose up -d --build
```

Machine B environment variables (Docker):

- `STT_SHARED_KEY`: shared secret checked by STT API
- `WHISPER_MODEL`: default `small`
- `WHISPER_DEVICE`: `cpu` or `cuda`
- `WHISPER_COMPUTE_TYPE`: default `int8`
- `ARGOS_SHARED_KEY`: shared secret for Argos `/translate`
- `ARGOS_LANG_PAIRS`: default `en-vi,vi-en`
- `CLOUDFLARED_COMMAND`: optional override for cloudflared command
  - Quick tunnel (default): `tunnel --no-autoupdate --url http://stt-api:8000`
  - Named tunnel: `tunnel --no-autoupdate run --token <cloudflare-tunnel-token>`

Current internal flow on Machine B:

```text
audio upload -> stt-api -> Whisper transcript -> argos-api -> translation
```

`argos-api` is intended to stay internal to Docker. No separate public Argos tunnel is required for the current architecture.

Machine A environment variables (Next.js app):

- `SELF_HOSTED_STT_URL=https://<named-tunnel-domain>`
- `SELF_HOSTED_STT_KEY=<shared-secret>`
- `SELF_HOSTED_STT_MODE=prefer`
- `GROQ_API_KEY=<api-key>` for summaries / LLM fallback

Recommended behavior:

- Use self-hosted STT as the first choice for live processing
- Let Machine B perform local Argos translation internally
- Keep Groq/OpenAI for summary generation and fallback cases only

## Deploy to Vercel

1. Push to GitHub
2. Import repo in [Vercel](https://vercel.com)
3. Add app environment variables in Vercel project settings, especially `SELF_HOSTED_STT_URL`, `SELF_HOSTED_STT_KEY`, and `SELF_HOSTED_STT_MODE`
4. Deploy 🚀

Vercel does not need any Argos public URL in the current setup.

## Project Structure

```
app/
  api/
    process-audio/route.ts   ← Voice processing API
    upload-file/route.ts      ← File upload API
  layout.tsx, page.tsx        ← Main UI
components/                   ← React components
lib/                          ← Utilities (AI, Cloudinary, Supabase)
public/                       ← PWA manifest, icons, service worker
supabase/                     ← Database schema
```

## License

Private — Internal use only.
