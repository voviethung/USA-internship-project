# Pharma Voice Assistant - Project Status

> Updated: **2026-04-15**

---

## Progress Overview

| Phase   | Status              | Progress |
|---------|---------------------|----------|
| Phase 1 | Done                | **100%** |
| Phase 2 | Done                | **100%** |
| Phase 3 | Done                | **100%** |
| Phase 4 | In Progress         | **~85%** |

---

## Phase 1 - Core Features (100%)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 1 | Project setup | package.json, tsconfig.json, next.config.mjs, tailwind.config.ts | Next.js 14.2, TS, Tailwind |
| 2 | AI Provider | lib/ai-provider.ts | Groq + OpenAI dual provider |
| 3 | STT + GPT | lib/ai-provider.ts | Whisper + LLM |
| 4 | API Routes | app/api/process-audio, app/api/upload-file | Audio + Cloudinary |
| 5 | Core UI | Recorder, ResultBox, PlayButton, FileAttachment, OfflineBanner, Header | Full component suite |
| 6 | PWA | manifest.json, sw.js, SVG icons | Standalone, offline |
| 7 | Supabase | schema.sql, lib/supabase.ts | Deployed, RLS active |
| 8 | Build + Git | GitHub voviethung/USA-internship-project | Pushed |

---

## Phase 2 - Auth + History (100%)

| # | Task | Files | Notes |
|---|------|-------|-------|
| 1 | Auth infra | supabase-server.ts, middleware.ts, auth/callback | Server client + route protection |
| 2 | AuthProvider | components/AuthProvider.tsx | useAuth() hook |
| 3 | Login page | app/login/page.tsx | Sign In, Register, Magic Link |
| 4 | Navigation | components/BottomNav.tsx | Home, History, Profile tabs |
| 5 | Save conversations | app/page.tsx | Auto-save to Supabase |
| 6 | History page | app/history/page.tsx | List, expand, delete |
| 7 | Profile page | app/profile/page.tsx | Name, provider, stats |

---

## Phase 3 - Optimization (100%)

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | Enhanced Service Worker | public/sw.js | Done |
| 2 | Offline request queue | lib/offline-queue.ts | Done |
| 3 | Audio compression | lib/audio-utils.ts, Recorder.tsx | Done |
| 4 | Server TTS API | app/api/tts/route.ts | Done |
| 5 | Enhanced PlayButton | components/PlayButton.tsx | Done |
| 6 | Toast notifications | components/Toast.tsx | Done |
| 7 | Loading skeletons | components/Skeleton.tsx | Done |
| 8 | UI polish | globals.css | Done |
| 9 | Build and push | commit 2fc626d | Done |

---

## Phase 4 - Internship Management (~85%)

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Role system | lib/types.ts, lib/roles.ts | Done | 3 roles: admin, mentor, student |
| 2 | Phase 4 DB schema | scripts/phase4-schema.sql | Done | mentor_students, lectures, tasks, notifications tables + RLS + triggers |
| 3 | Route protection (RBAC) | middleware.ts, lib/roles.ts | ⚠️ Partial | Middleware logic exists but auth temporarily disabled for dev |
| 4 | Admin API | app/api/admin/users/route.ts | Done | GET all users, PATCH role/profile (admin-only) |
| 5 | Dashboard page | app/dashboard/page.tsx | Done | 7 stats cards, quick actions, role badge (admin/mentor only) |
| 6 | Student management | app/students/page.tsx | Done | List, search, edit profile, mentor assignment (admin/mentor) |
| 7 | Mentor management | app/mentors/page.tsx | Done | List, promote/demote, view assigned students (admin only) |
| 8 | Lecture management | app/lectures/page.tsx | Done | Full CRUD, search/filter by category, publish toggle |
| 9 | Task management | app/tasks/page.tsx | Done | Full CRUD, assign to students, priority & due date, status tabs |
| 10 | Notifications | app/notifications/page.tsx, lib/notifications.ts | ⚠️ Partial | Read/mark-read UI done; server helper done; no real-time push yet |
| 11 | BottomNav (role-aware) | components/BottomNav.tsx | Done | 9 tabs, role-based visibility, scrollable overflow |
| 12 | Rate limiter | lib/rate-limit.ts | Done | In-memory, per-IP, configurable window |
| 13 | Version bump | package.json | Done | v0.4.0 |

### Phase 4 - Remaining items

- [ ] Re-enable auth guard in middleware (currently disabled for guest access)
- [ ] Real-time audio chunking with context buffering for EN/VI auto-detect and near-real-time translation — send small audio chunks with previous context, then merge partial transcript before final translation
- [ ] Real-time / push notifications (Supabase Realtime or WebSocket)
- [ ] File upload integration for lectures (currently URL-only)
- [ ] Unread notification badge on BottomNav 🔔 tab
- [ ] Admin API: DELETE endpoint, pagination, input validation
- [ ] Automatic overdue task detection (cron / DB trigger)
- [ ] Dashboard charts/graphs & date-range filtering

### Phase 4 - New direction (Cost optimization + reliability)

- [x] Realtime chunk flow stabilized with cumulative audio upload (avoid invalid media fragments)
- [x] Queue failure guard (stop retry loop when a chunk fails)
- [x] STT fallback logic for non-meaningful transcript outputs
- [x] Quota-aware chat fallback strategy (Groq quota exhaustion handling)
- [x] Self-host STT service (`faster-whisper`) via Docker on local machine
- [x] Expose local STT through Cloudflare Tunnel for remote app access (quick tunnel running)
- [x] Add provider routing config (managed STT vs self-host STT)
- [x] Add secure auth header/key for tunnel endpoint
- [x] Add healthcheck + auto fallback to managed provider when local tunnel/service is down
- [x] Switch from quick tunnel to Cloudflare named tunnel (stable production domain)

#### Deployment model selected: Case 2 (separated machines)

- **Machine A (App Node):** runs Next.js app (`yarn dev` / Vercel deployment)
- **Machine B (STT Node):** runs Docker services (`stt-api` + `cloudflared`)
- App on Machine A calls Machine B through Cloudflare Tunnel URL using shared auth header

Planned environment variables:

- **Machine A (app):**
	- `SELF_HOSTED_STT_URL=https://<named-tunnel-domain>`
	- `SELF_HOSTED_STT_KEY=<shared-secret>`
- **Machine B (stt docker):**
	- `STT_SHARED_KEY=<shared-secret>`
	- `WHISPER_MODEL=small` (or tuned per hardware)
	- `WHISPER_DEVICE=cpu` (or `cuda` if GPU)
	- `CLOUDFLARED_COMMAND=tunnel --no-autoupdate run --token <cloudflare-tunnel-token>` (for named tunnel)

Operational notes:

- Prefer **Cloudflare named tunnel** (stable domain), avoid temporary quick tunnel URL changes
- Keep fallback to managed STT enabled if Machine B/tunnel is unavailable
- Restrict access using shared key and rotate secrets periodically

#### Machine B current runtime status (2026-04-15)

- Docker services are running and healthy (`stt-api` + `cloudflared`)
- Local healthcheck OK: `http://localhost:8000/health`
- Named tunnel public URL (stable): `https://internship.pharmacountry.com`

#### Machine B operation checklist (when STT fails / returns 500)

Run these commands on **Machine B**:

1. Pull latest repo:
	- `git pull origin master`
2. Rebuild STT image:
	- `docker compose build stt-api`
3. Restart STT service:
	- `docker compose up -d stt-api`
4. Check logs:
	- `docker compose logs -f --tail=200 stt-api`
5. Verify health endpoint:
	- `curl https://internship.pharmacountry.com/health`

Expected result:

- Health returns `{"ok": true, ...}`
- No repeated `HTTP 500` from `/transcribe`
- If error persists, capture `stt-api` logs and check ffmpeg decode errors in container output

#### Connect from Vercel or another local machine to Machine B

Set these env vars in Machine A app (Vercel Project Settings or `.env.local`):

- `SELF_HOSTED_STT_URL=https://internship.pharmacountry.com`
- `SELF_HOSTED_STT_KEY=5TqMIlRu0aKnzWiXrO6JGmSjdchCfLwV`
- `SELF_HOSTED_STT_MODE=prefer`

Notes:

- `SELF_HOSTED_STT_MODE=prefer`: use Machine B first, then fallback to managed STT automatically
- `SELF_HOSTED_STT_MODE=only`: force only Machine B STT (no managed fallback)
- Health endpoint verification: `https://internship.pharmacountry.com/health`

#### Named tunnel migration steps (stable domain)

1. Create a Cloudflare named tunnel in Zero Trust dashboard and map hostname, for example `stt.yourdomain.com`.
2. Copy tunnel token from Cloudflare.
3. On Machine B, set env then restart services:
	- `CLOUDFLARED_COMMAND=tunnel --no-autoupdate run --token <your-token>`
	- `docker compose up -d`
4. Update Machine A env:
	- `SELF_HOSTED_STT_URL=https://stt.yourdomain.com`
5. Verify from anywhere:
	- `GET https://stt.yourdomain.com/health` should return `{ "ok": true, ... }`

---

## Services

| Service | Status | Notes |
|---------|--------|-------|
| Groq API | Active | whisper-large-v3-turbo + llama-3.3-70b |
| OpenAI API | Optional | Fallback provider |
| Self-host STT (Docker + faster-whisper) | Active | Running on Machine B, healthcheck passing |
| Cloudflare Tunnel | Active (Named) | Public URL live at internship.pharmacountry.com |
| Supabase | Active | Schema deployed, Phase 4 tables + RLS active |
| Cloudinary | Active | Cloud: dsstbuq9d |
| GitHub | Active | voviethung/USA-internship-project |
| Vercel | Deploying | Auto-deploy from master |

---

## Changelog

| Date | Changes |
|------|---------|
| 2026-04-10 | Phase 1: Full core - Recorder, STT, GPT, TTS, PWA, Cloudinary |
| 2026-04-10 | Phase 1: Schema deployed, pushed to GitHub |
| 2026-04-10 | Phase 2: Auth, Login, History, Profile, BottomNav |
| 2026-04-10 | Phase 3: Enhanced SW, audio compression, TTS API, toasts, skeletons |
| 2026-04-10 | Phase 3: CSS animations, build passed, pushed 2fc626d |
| 2026-04-10 | ALL 3 PHASES COMPLETE |
| 2026-04-10 | Phase 4: Roles, Dashboard, Students, Mentors, Lectures, Tasks, Notifications (commit 4804079) |
| 2026-04-10 | Phase 4: Error handling fixes for dashboard/students/mentors (commit be3bcfc) |
| 2026-04-10 | Phase 4: Login error handling fix (commit d089845) |
| 2026-04-10 | Phase 4: Disable auth temporarily for guest access (commit 30d07c9) |
| 2026-04-13 | Status update: Phase 4 at ~85%, documented remaining items |
| 2026-04-15 | Audio hardening: cumulative chunk upload, queue failure guard, STT fallback handling |
| 2026-04-15 | Added roadmap: self-host `faster-whisper` in Docker + Cloudflare Tunnel integration |
| 2026-04-15 | Deployment decision: Case 2 adopted (App and self-host STT on separate machines) |
| 2026-04-15 | Machine B deployed: Docker STT healthy + Cloudflare quick tunnel live; app routing/fallback and healthcheck cache completed |
| 2026-04-15 | Named tunnel public route completed: internship.pharmacountry.com/health verified; ready for Vercel/local integration |

---

## Deployment Verification Note

Checked `project_status.md`, no problems found.

Chuẩn rồi, đã thành công production route.

Ảnh bạn gửi xác nhận endpoint public hoạt động:

- `https://internship.pharmacountry.com/health` trả về `ok: true`

Mình đã cập nhật trạng thái dự án theo URL cố định mới tại `project_status.md`, gồm:

- Đánh dấu named tunnel là completed
- Đổi quick tunnel URL sang URL production
- Cập nhật phần env cho Vercel/máy local khác
- Cập nhật bảng Services và Changelog

Việc bạn cần làm tiếp ở Machine A/Vercel:

- `SELF_HOSTED_STT_URL=https://internship.pharmacountry.com`
- `SELF_HOSTED_STT_KEY=giống STT_SHARED_KEY trên Machine B`
- `SELF_HOSTED_STT_MODE=prefer`

Lưu ý bảo mật quan trọng:

- Token tunnel đã từng lộ trong chat trước đó, nên regenerate token trong Cloudflare rồi cập nhật lại file `.env` để an toàn production.
