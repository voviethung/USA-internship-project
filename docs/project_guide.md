Dưới đây là file `.md` hoàn chỉnh, bạn có thể copy dùng trực tiếp để hướng dẫn AI build app 👇

---

```md
# Pharma Voice Assistant (PWA) — Hướng dẫn xây dựng

## 🎯 Mục tiêu
Xây dựng một ứng dụng PWA (Progressive Web App) dùng trên điện thoại để:

1. Ghi âm tiếng Anh từ thực tập sinh
2. Chuyển thành text (speech-to-text)
3. Dịch sang tiếng Việt
4. Gợi ý phản hồi (EN + VI)
5. Phát âm câu trả lời tiếng Anh (text-to-speech)

---

## 🧱 Kiến trúc tổng thể

```

[Next.js PWA]
↓
API Route (Next.js)
↓
OpenAI API:

* Whisper (Speech-to-text)
* GPT (Translate + Suggest reply)
* TTS (Text-to-speech)
  ↓
  Supabase:
* Auth
* Database (history)

```

---

## ⚙️ Tech Stack

### Frontend
- Next.js (App Router)
- PWA (service worker)
- Web Audio API

### Backend
- Next.js API Routes (KHÔNG cần NestJS)

### Database & Auth
- Supabase

### AI APIs
- OpenAI:
  - whisper-1
  - gpt-4o-mini (hoặc tương đương)
  - TTS

---

## 📁 Cấu trúc project

```

/app
/page.tsx
/api/process-audio/route.ts
/components
Recorder.tsx
ResultBox.tsx
/lib
openai.ts
supabase.ts
/public
manifest.json
sw.js

````

---

## 🔁 Flow xử lý

### 1. User bấm nút 🎤
- Ghi âm bằng Web Audio API

### 2. Gửi audio lên API
- POST `/api/process-audio`

### 3. Backend xử lý

#### Bước 1: Speech-to-text
- Whisper API → text tiếng Anh

#### Bước 2: GPT xử lý
- Dịch sang tiếng Việt
- Gợi ý phản hồi

#### Bước 3: Trả về JSON

```json
{
  "transcript": "...",
  "translated_vi": "...",
  "reply_vi": "...",
  "reply_en": "..."
}
````

---

## 🧠 Prompt GPT (QUAN TRỌNG)

```
You are a bilingual assistant specialized in pharmaceutical manufacturing (QA, QC, R&D, RA).

Tasks:
1. Translate English to Vietnamese.
2. Understand GMP, QA, QC, R&D context.
3. Suggest a professional reply in English and Vietnamese.
4. Keep responses concise and practical.

Return JSON:
{
  "translated_vi": "...",
  "reply_vi": "...",
  "reply_en": "..."
}
```

---

## 🔧 API Route (Next.js)

```ts
export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");

  // 1. Speech-to-text
  const transcript = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1"
  });

  // 2. GPT xử lý
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: transcript.text }
    ]
  });

  return Response.json({
    transcript: transcript.text,
    result: completion.choices[0].message.content
  });
}
```

---

## 🎤 Frontend Record Audio

```js
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

const mediaRecorder = new MediaRecorder(stream);
let chunks = [];

mediaRecorder.ondataavailable = e => chunks.push(e.data);

mediaRecorder.onstop = async () => {
  const blob = new Blob(chunks, { type: 'audio/webm' });

  const formData = new FormData();
  formData.append("file", blob);

  const res = await fetch("/api/process-audio", {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  console.log(data);
};
```

---

## 🗄 Supabase Schema

### Table: `conversations`

| column        | type      |
| ------------- | --------- |
| id            | uuid      |
| user_id       | uuid      |
| transcript    | text      |
| translated_vi | text      |
| reply_en      | text      |
| reply_vi      | text      |
| created_at    | timestamp |

---

## 🔐 Auth

* Dùng Supabase Auth
* Email login hoặc magic link

---

## 📱 PWA Setup

### manifest.json

```json
{
  "name": "Pharma Voice Assistant",
  "short_name": "Pharma AI",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000"
}
```

---

### Service Worker (sw.js)

* Cache:

  * UI
  * static assets
* fallback khi offline

---

## 🔄 Offline Mode (Fallback)

### Khi mất mạng:

* Không gọi API
* Hiển thị:

#### Quick replies:

* "Can you repeat that?"
* "Please explain more clearly."
* "Let me check and get back to you."

---

## ⚡ Rate Limit

* 1 user:

  * max 10 request / phút
* tránh spam API

---

## 🎨 UI (Mobile-first)

### 1 màn hình duy nhất:

* 🎤 Nút lớn: "Hold to speak"
* 📄 Transcript (EN)
* 🇻🇳 Translation (VI)
* 💬 Suggested reply
* 🔊 Play voice

---

## 🔊 Text-to-Speech

* Gọi API TTS
* hoặc dùng speechSynthesis:

```js
const utterance = new SpeechSynthesisUtterance(reply_en);
speechSynthesis.speak(utterance);
```

---

## ⚠️ Lưu ý quan trọng

### 1. API Key

* Không để ở frontend
* chỉ gọi từ API route

---

### 2. Noise môi trường

* dùng tai nghe có mic

---

### 3. Latency

* ~1–2 giây là bình thường

---

### 4. Bảo mật

* không gửi dữ liệu nhạy cảm

---

## 🚀 Roadmap

### Phase 1

* record audio
* gọi API
* hiển thị kết quả

### Phase 2

* auth + history
* UI đẹp

### Phase 3

* offline fallback
* tối ưu performance

---

## 🎯 Kết luận

* Dùng Next.js + Supabase là đủ
* Không cần NestJS giai đoạn đầu
* PWA chạy tốt cho 30 user nội bộ
* Có thể nâng cấp lên native sau

```

---

Nếu bạn muốn, mình có thể tạo luôn:
- repo GitHub hoàn chỉnh
- UI đẹp (mobile-first)
- code chạy được ngay

Chỉ cần nói: **“build repo cho tôi”** 👍
```
