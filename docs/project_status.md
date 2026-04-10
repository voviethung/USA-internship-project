# 📊 Pharma Voice Assistant — Project Status

> Cập nhật lần cuối: **2026-04-10**

---

## 🏗️ Tổng quan tiến độ

| Phase   | Trạng thái    | Tiến độ |
|---------|---------------|---------|
| Phase 1 | 🟡 Đang thực hiện | **85%** |
| Phase 2 | ⚪ Chưa bắt đầu   | 0%      |
| Phase 3 | ⚪ Chưa bắt đầu   | 0%      |

---

## ✅ Phase 1 — Core Features

### Đã hoàn thành ✅

| # | Task | File(s) | Ghi chú |
|---|------|---------|---------|
| 1 | Project setup & config | `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js` | Next.js 14.2, TypeScript, Tailwind CSS |
| 2 | Environment variables | `.env.local`, `.env.example` | Groq, Supabase, Cloudinary keys |
| 3 | AI Provider (Groq + OpenAI) | `lib/ai-provider.ts` | Dual provider — switch via `AI_PROVIDER` env var |
| 4 | Speech-to-text | `lib/ai-provider.ts` | Groq: whisper-large-v3-turbo / OpenAI: whisper-1 |
| 5 | Translate + Suggest reply (GPT) | `lib/ai-provider.ts` | Groq: llama-3.3-70b / OpenAI: gpt-4o-mini |
| 6 | API Route — process audio | `app/api/process-audio/route.ts` | POST `/api/process-audio` — STT → GPT → JSON |
| 7 | API Route — upload file | `app/api/upload-file/route.ts` | POST `/api/upload-file` → Cloudinary |
| 8 | Cloudinary integration | `lib/cloudinary.ts` | Upload ảnh, PDF, PPT, Word, Excel (max 10MB) |
| 9 | Rate limiter | `lib/rate-limit.ts` | In-memory, 10 req/min (audio), 20 req/min (upload) |
| 10 | Audio Recorder component | `components/Recorder.tsx` | Hold-to-speak, hỗ trợ webm + mp4 (iOS) |
| 11 | Result display component | `components/ResultBox.tsx` | Transcript EN, Translation VI, Suggested reply |
| 12 | Play button (TTS) | `components/PlayButton.tsx` | Browser speechSynthesis API |
| 13 | File attachment component | `components/FileAttachment.tsx` | Upload UI với preview + remove |
| 14 | Offline quick replies | `components/OfflineBanner.tsx` | 5 câu quick reply khi mất mạng |
| 15 | Header component | `components/Header.tsx` | Online/offline indicator |
| 16 | Main page (single screen) | `app/page.tsx` | Mobile-first, full-height layout |
| 17 | Global styles + animations | `app/globals.css` | Recording pulse, loading dots, safe area |
| 18 | App layout + metadata | `app/layout.tsx` | PWA metadata, viewport, service worker register |
| 19 | PWA manifest | `public/manifest.json` | name, icons, standalone display |
| 20 | Service Worker | `public/sw.js` | Network-first, offline cache fallback |
| 21 | Supabase client | `lib/supabase.ts` | Browser client with SSR support |
| 22 | Supabase schema | `supabase/schema.sql` | conversations + profiles tables, RLS policies |
| 23 | TypeScript types | `lib/types.ts` | ProcessResult, APIResponse, UploadedFile |
| 24 | Build successful | `.next/` | ✅ `next build` passed — no errors |

### Chưa hoàn thành ⏳

| # | Task | Mức độ | Ghi chú |
|---|------|--------|---------|
| 1 | PWA icons | 🔴 Thiếu | `public/icons/` trống — cần icon-192.png + icon-512.png |
| 2 | Chạy schema trên Supabase | 🔴 Chưa chạy | Cần vào SQL Editor chạy `supabase/schema.sql` |
| 3 | Test thực tế (E2E) | 🟡 Chưa test | Cần test mic, upload, AI trên mobile thật |
| 4 | Deploy lên Vercel | 🟡 Chưa deploy | Cần connect repo GitHub + set env vars |

---

## ⚪ Phase 2 — Auth + History (Chưa bắt đầu)

| # | Task | Trạng thái |
|---|------|------------|
| 1 | Supabase Auth (email/magic link) | ⚪ |
| 2 | Login/Register UI | ⚪ |
| 3 | Lưu conversations vào Supabase | ⚪ |
| 4 | History page — xem lại hội thoại cũ | ⚪ |
| 5 | User profile/settings | ⚪ |
| 6 | UI polish — animations, transitions | ⚪ |

---

## ⚪ Phase 3 — Optimization (Chưa bắt đầu)

| # | Task | Trạng thái |
|---|------|------------|
| 1 | Offline fallback nâng cao | ⚪ |
| 2 | Performance optimization | ⚪ |
| 3 | Caching strategies cải thiện | ⚪ |
| 4 | Audio compression trước khi gửi | ⚪ |
| 5 | OpenAI TTS (thay thế browser TTS) | ⚪ |
| 6 | Nâng cấp lên native (nếu cần) | ⚪ |

---

## 📁 Cấu trúc Project hiện tại

```
USA-internship-project/
├── app/
│   ├── api/
│   │   ├── process-audio/route.ts    ← STT + GPT API
│   │   └── upload-file/route.ts      ← Cloudinary upload API
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                      ← Main single-screen UI
├── components/
│   ├── FileAttachment.tsx
│   ├── Header.tsx
│   ├── OfflineBanner.tsx
│   ├── PlayButton.tsx
│   ├── Recorder.tsx
│   └── ResultBox.tsx
├── lib/
│   ├── ai-provider.ts               ← Groq / OpenAI abstraction
│   ├── cloudinary.ts                 ← File upload utility
│   ├── rate-limit.ts
│   ├── supabase.ts
│   └── types.ts
├── public/
│   ├── icons/                        ← ⚠️ TRỐNG — cần thêm icons
│   ├── manifest.json
│   └── sw.js
├── supabase/
│   └── schema.sql                    ← ⚠️ Chưa chạy trên Supabase
├── docs/
│   ├── project_guide.md
│   └── project_status.md             ← File này
├── .env.local
├── .env.example
├── .gitignore
├── next.config.mjs
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## 🔑 Services & Credentials

| Service | Trạng thái | Ghi chú |
|---------|------------|---------|
| Groq API | ✅ Configured | whisper-large-v3-turbo + llama-3.3-70b |
| OpenAI API | ⚪ Optional | Chưa có key — dùng khi set `AI_PROVIDER=openai` |
| Supabase | ✅ Configured | Project ID: waudbcfqklrbibonxljw |
| Cloudinary | ✅ Configured | Cloud: dsstbuq9d |
| Vercel | ⚪ Chưa deploy | — |

---

## 🚨 Action Items tiếp theo

1. **Tạo PWA icons** (icon-192.png, icon-512.png) — logo xanh dương pharma
2. **Chạy SQL schema** trên Supabase Dashboard → SQL Editor
3. **Test trên localhost** — `npm run dev` → test mic + upload trên Chrome mobile
4. **Deploy Vercel** — push GitHub → connect Vercel → set env vars
5. **Bắt đầu Phase 2** — Auth + History

---

## 📝 Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-04-10 | Init project: Next.js + Tailwind + PWA setup |
| 2026-04-10 | Core features: Recorder, STT, GPT, TTS, ResultBox |
| 2026-04-10 | Tích hợp Cloudinary cho file upload (ảnh, PDF, PPT, Word) |
| 2026-04-10 | Supabase schema design (conversations + profiles + RLS) |
| 2026-04-10 | Build thành công ✅ |
