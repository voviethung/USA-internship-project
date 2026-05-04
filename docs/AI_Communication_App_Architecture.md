# 🌍 AI Communication Assistant — FULL CODE-READY SPEC (FINAL)

---

# 🎯 Product Goal

Build a **real-time multilingual speech-to-speech app** that:

* Works **offline-first**
* Uses **English as pivot**
* Supports **travel / factory / conference**
* Has **low latency (~0.5–1s perceived)**
* Minimizes **cloud cost**

---

# 🧠 CORE PIPELINE

```text
Speech → STT → Translation → TTS → Speech
```

---

# 🧩 1. TECHNOLOGY STACK

## 📱 Mobile

* React Native (TypeScript)

## ⚙️ Native Layer

* C++ → Whisper (STT)
* Kotlin (Android)
* Swift (iOS)

## 🌐 Backend

* NestJS
* Prisma
* Redis

---

# 🏗️ 2. PROJECT STRUCTURE

```bash
repo/
├── mobile/
│   ├── src/
│   │   ├── features/
│   │   │   ├── stt/
│   │   │   ├── translate/
│   │   │   ├── tts/
│   │   │   └── conversation/
│   │   ├── services/
│   │   └── store/
│   ├── native/
│   │   ├── android/
│   │   └── ios/
│   ├── android/
│   └── ios/
│
├── backend/
│   ├── src/
│   ├── prisma/
│   └── docker/
```

---

# 🎤 3. STT (Whisper)

## Model

* Whisper tiny / base
* Multilingual (1 model for all languages)

---

## Modes

### Transcribe

```text
Audio → Text (same language)
```

### Translate

```text
Audio → English
```

---

## Recommendation

* Default: transcribe
* Use translate only when needed

---

# 🔊 4. TTS

## Offline

* Android TTS
* iOS TTS

## Online (optional)

* High quality voice (premium)

---

# 🌐 5. TRANSLATION STRATEGY

## Pivot English

```text
Any Language → EN → Any Language
```

---

# 🧱 6. MULTI-LAYER TRANSLATION

Priority:

```text
1. Phrasebook
2. Cache (memory)
3. Argos Translate (offline)
4. Dictionary
5. Cloud fallback
```

---

## 6.1 Phrasebook

* Predefined sentences
* Scenario-based

---

## 6.2 Cache

* key = hash(text + source + target)

---

## 6.3 Argos

* Offline translation
* EN ↔ X pairs

---

## 6.4 Dictionary

* Word fallback

---

# ⚙️ 7. TRANSLATION SERVICE (CODE)

```ts
async function translate(input, source, target) {

  const phrase = await phrasebook.find(input, source, target)
  if (phrase) return phrase

  const cached = await cache.get(input, source, target)
  if (cached) return cached

  let pivot = input
  if (source !== 'en') {
    pivot = await argos.translate(input, source, 'en')
  }

  let output = pivot
  if (target !== 'en') {
    output = await argos.translate(pivot, 'en', target)
  }

  cache.set(input, source, target, output)

  return output
}
```

---

# 🎧 8. AUDIO STREAMING (CRITICAL)

## ❌ WRONG (batch)

* Wait user finishes speaking

---

## ✅ CORRECT (streaming)

```text
Mic ON
→ every 300ms get audio chunk
→ send to STT
→ partial result
```

---

## Timeline example

```text
0–300ms → "Where"
300–600ms → "Where is"
600–1000ms → "Where is the"
1000ms+ → full sentence
```

---

## Silence detection

```text
If silence > 700ms → finalize sentence
```

---

## Pseudo code

```ts
while (recording) {

  const chunk = getAudioChunk(300ms)

  sendToWhisper(chunk)

  if (silence > 700ms) {
    finalizeSentence()
  }
}
```

---

# 📱 9. MOBILE FLOW

```ts
async function handleSpeech() {

  const audio = await record()

  const text = await stt.transcribe(audio)

  const translated = await translate(text, 'zh', 'vi')

  speak(translated)
}
```

---

# 🔗 10. NATIVE BRIDGE

## TypeScript

```ts
import { NativeModules } from 'react-native'

const { WhisperModule } = NativeModules

export function transcribe(audioPath) {
  return WhisperModule.transcribe(audioPath)
}
```

---

# 🗄️ 11. DATABASE (PRISMA)

```prisma
model Translation {
  id          String @id @default(uuid())
  sourceText  String
  sourceLang  String
  pivotText   String
  targetText  String
  targetLang  String
  hash        String @unique
  createdAt   DateTime @default(now())
}
```

---

# ⚡ 12. REDIS CACHE

```ts
hash = sha256(text + source + target)
key = `tr:${hash}`
```

---

# 📦 13. ARGOS DOCKER

```yaml
version: '3'
services:
  argos:
    image: argos-translate
    ports:
      - "5000:5000"
```

---

# 🧪 14. TESTING

## 14.1 Local test (NO STORE)

```bash
npx react-native run-android
npx react-native run-ios
```

---

## 14.2 MUST test on real device

---

## 14.3 Offline test

* airplane mode ON

---

## 14.4 Realtime test

```text
User A speaks → User B hears translation
```

---

## Metrics

* latency < 2s
* target: ~0.5–1s perceived

---

## 14.5 Stress test

* speak 5–10 min
* check CPU, RAM, crash

---

# 📦 15. BUILD

## Android

```bash
cd android
./gradlew assembleDebug
```

---

## iOS

* Xcode run
* TestFlight

---

# 🚀 16. DEPLOYMENT

| Env     | Purpose |
| ------- | ------- |
| dev     | local   |
| staging | test    |
| prod    | release |

---

# ⚙️ 17. RUNTIME LOGIC

```ts
if (!network) {
  useLocalAll()
} else if (premium) {
  useCloud()
} else {
  useLocal()
}
```

---

# 🎯 FINAL FLOW

```text
Speech
→ Whisper (STT)
→ Phrasebook / Cache
→ Argos (EN pivot)
→ TTS
→ Output
```

---

# 💡 GOLDEN RULES

* Offline-first
* Do not rely 100% on AI
* Cache aggressively
* Optimize latency > accuracy perfection

---

# ✅ READY

This spec is **code-ready**:

* Mobile dev can start RN + native
* Backend dev can start NestJS
* AI integration defined
* Streaming defined

---
