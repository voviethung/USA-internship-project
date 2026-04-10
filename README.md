# Pharma Voice Assistant 🏥

AI-powered PWA voice assistant for pharmaceutical interns — translates English speech to Vietnamese and suggests professional replies.

## Features

- 🎤 **Voice Recording** — Hold to speak, auto-detects English
- 🔄 **Speech-to-Text** — Powered by Groq Whisper / OpenAI Whisper
- 🇻🇳 **Translation** — English → Vietnamese with pharma context
- 💬 **Smart Replies** — Suggested professional responses (EN + VI)
- 🔊 **Text-to-Speech** — Listen to suggested replies
- 📎 **File Attachment** — Upload images, PDFs, PPT, Word to Cloudinary
- 📡 **Offline Mode** — Quick reply cards when no connection
- 📱 **PWA** — Install as mobile app, works standalone

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **AI**: Groq (free) or OpenAI — configurable via env
- **Database**: Supabase (Auth + PostgreSQL)
- **File Storage**: Cloudinary
- **Deploy**: Vercel

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

## Deploy to Vercel

1. Push to GitHub
2. Import repo in [Vercel](https://vercel.com)
3. Add all environment variables in Vercel project settings
4. Deploy 🚀

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
