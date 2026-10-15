# Sign language with Signapse: research and integration plan

Status: **research only, not implemented** (ADR-073). A demonstration of the user experience with sample videos now exists behind a provider interface (ADR-077): the real provider plugs into `lib/sign/production-provider.ts`. Nothing in the codebase calls Signapse, loads its scripts or stores its keys. Implementation waits for product-owner approval and the decisions listed in "Before building".

Source: the official documentation at https://docs.signapse.com/ (pages last updated 6 October 2026), read on 9 October 2026.

## 1. What Signapse offers

| Product              | What it does                                                                                                                                      | How it is used                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SignStream API**   | Turns text into AI-generated sign language video (a digital signer). Real time or on demand.                                                      | REST `POST /v2/generate`, WebSocket V3 (`wss://ai.api.production.signapsesolutions.com/ws`), live sessions                                                      |
| **Live Translation** | Transcribes the audio of a live stream (RTMP/SRT push or HLS pull) and adds a signer, about 10 s glass-to-glass.                                  | `/v2/live/*` sessions                                                                                                                                           |
| **SignStudio**       | Post-production: upload video, audio, subtitles or documents and receive a signed video. AI, AI with human quality control, or human translation. | REST API set up with Signapse's sales and product team                                                                                                          |
| **Website Plugin**   | A script tag that adds a draggable signing widget translating each paragraph of a web page. AI, AI with quality control, or human translations.   | `<script src="https://translations.signapsesolutions.com/" app-id=… id="signapse" version="v2">`; `signapseMount()` / `signapseUnmount()` for custom activation |
| Transport API        | Pre-built signed train announcements.                                                                                                             | Not relevant to Nutraboom Equals                                                                                                                                |

### Languages and signers

- **British Sign Language (BSL)**: digital signer RAE (the default).
- **American Sign Language (ASL)**: digital signers JAY and MAX.
- No other sign language is listed. **Nigerian Sign Language (NSL) is not supported.** NSL has historical roots in ASL, but the two are not interchangeable, and Deaf Nigerians use a range of signing (NSL, ASL-influenced signing, local sign languages). This is the main limitation for our users (see section 5).

### Authentication

- SignStream: OAuth 2.0 client credentials. Create a key in the SignStream portal (publishable key `pk_live_…` as `client_id`, secret `sk_live_…` as `client_secret`), exchange it at `https://token.api.production.signapsesolutions.com/token` (multipart/form-data only), and send the JWT as `Authorization: Bearer`. Tokens last **15 minutes**. The old `X-API-KEY` header is deprecated.
- The secret gives full account access and every successful call spends credits. Signapse says it must never reach client-side code; browsers also cannot set headers on a WebSocket upgrade, so **sockets must be opened by our server**.
- Website Plugin: an `app-id` in a public script tag, issued by Signapse during onboarding. No secret in the browser.

### Generate request (SignStream)

- Input: **text only** (`content.type: "text"`, `content.data`), optional target `duration`.
- Output: `hls` (200 with HLS and DASH manifest URLs) or `mp4`/`mov` (303 redirect to a presigned URL); delivery `stream`, `download`, `display` or `push`.
- Options include signer, language (must match the signer), quality, resolution, codec, background (including transparent), signer size, burnt-in subtitles, logo and low-latency HLS.
- `context.application` (required) and optional `context.sessionId` identify the calling app for routing and analytics.
- Errors share one JSON envelope (`error`, `details`); live sessions use a nested `error.code`. 401 for missing or expired tokens.

### Commercial and access terms (as documented)

- SignStream is for organisations; credentials come from Signapse ("Contact us for credentials"). The public demo (ai.signapse.com) is limited to 20 words per message and 400 a month and is not for production.
- Plugin and SignStudio start with Signapse's team: they issue the script tag, agree the translation approach (AI, AI with QC, human) and, for QC and human options, scrape the pages to translate.
- Pricing is not published; usage is billed in credits.

## 2. Where sign language would help in Nutraboom Equals

| Area                                                                | Content                                                                           | Fit                                                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Assistant replies (`components/chat`)                               | Short, changing answers                                                           | SignStream REST (`mp4` per reply) or WebSocket V3 `translate` mode; one signer video per reply       |
| Hospital conversations (`components/hospitals/conversation.tsx`)    | Staff replies and the agent's routing message, including the 112 emergency notice | SignStream per message; the fixed emergency and routing messages can be pre-generated once           |
| Static pages (home, about, for-nutritionists, for-vendors, privacy) | Fixed marketing and legal text                                                    | Website Plugin (human or QC translations for the privacy notice), or pre-generated SignStream videos |
| Meal plans (`/planner`)                                             | Long, structured documents                                                        | Sign the summary and each day's headline only; full plans are too long for useful signed video       |
| Product, nutritionist, hospital pages                               | Mostly data (names, addresses, ingredients)                                       | Low value; signed summaries at most                                                                  |

Sign language is **an addition, never a replacement**: text stays the primary channel (many Deaf readers prefer it), and the existing screen-reader, text and voice paths are unchanged.

## 3. Recommended architecture

```text
Browser (sign language preference on)                        Server (Next.js)
  reply text ──► POST /api/sign  { text, kind } ──────────────► rate limit + entitlement check
                                                               cache lookup: SignVideo(hash(text, language, signer))
                                                               ├─ hit  ──► { url }
                                                               └─ miss ──► SignapseClient
                                                                            token cache (15 min, refreshed at ~12 min)
                                                                            POST /v2/generate (mp4, download)
                                                                            store URL/asset ──► { url }
  <video> with controls, captions = the same text, no autoplay with sound (videos are silent)
```

- **`lib/sign/` provider interface**, mirroring `lib/voice` and the audio-provider setting (ADR-069): `SignLanguageProvider.generate({ text, language }) → { url, expiresAt }`, with `SignapseProvider` as the first implementation. Register Signapse in the audio/accessibility settings in n-equals as "not available" until credentials exist.
- **Secrets on the server only**: `SIGNAPSE_CLIENT_ID`, `SIGNAPSE_CLIENT_SECRET` (encrypted in n-equals like AI keys, or environment variables). The browser only ever sees video URLs.
- **Caching**: identical text is signed once (`SignVideo` table keyed by a hash of text, language and signer; presigned URLs expire, so either re-request or copy to our own storage such as Cloudinary). Pre-generate fixed messages (greeting, emergency notice, booking confirmations).
- **Cost control**: per-user and global rate limits (existing limiter), a monthly credit budget setting, and an entitlement such as `accessibility.signLanguage` so the feature can be free for Deaf users without exposing unlimited spend.
- **Safety**: send only the final, already-checked reply text (after `checkReply`), never the user's own message, so signed output never contains anything the text reply did not. Do not sign while a reply is still streaming.
- **Privacy**: reply text goes to Signapse (a UK company). Add it to the privacy notice and processors list, use no personal data in `context.sessionId`, and sign a data processing agreement.
- **UI**: a "Sign language" toggle in chat settings and the hospital conversation (stored like the reply-language preference); a signer panel beside each reply with play/pause, size and close controls; never autoplay; focus stays on the text; the video has an accessible name and the reply text is its caption. Respect reduced-motion by not autoplaying.
- **Website Plugin** for static pages only, loaded on demand (custom activation mode: load the script and call `signapseMount()` when the visitor turns sign language on), never on the chat or account pages. Check its accessibility (keyboard, focus, screen readers) and its Content Security Policy needs before adopting it.

## 4. Implementation steps (future phase)

1. Decide the sign language question with Deaf Nigerian users and organisations (section 5). Stop here if neither BSL nor ASL is acceptable.
2. Agree terms with Signapse: SignStream credentials, pricing and credits, data processing agreement, data location, plugin `app-id` if used.
3. Add `lib/sign` (interface, Signapse client with token cache and timeouts, error mapping), the `SignVideo` cache table (migration), and `/api/sign` with rate limits and entitlements.
4. Add the n-equals setting (provider, language, signer, monthly budget) and the privacy notice changes.
5. Build the reply signer panel for chat, then hospital conversations; pre-generate fixed messages.
6. Optionally add the Website Plugin to static pages with custom activation.
7. Test with Deaf users (comprehension, not just technical success), keyboard and screen readers, slow networks (Nigerian mobile data: offer low quality by default), and failure paths (Signapse down: text continues unaffected).

## 5. Risks and open questions

- **Language fit (blocking)**: only BSL and ASL exist. Offering ASL to Nigerian Deaf users needs their confirmation that it is understandable and acceptable; otherwise ask Signapse about NSL plans or consider human-interpreted video for fixed content.
- **Cost**: unpublished, credit-based; long or frequent replies could be expensive. Budget caps and caching are required.
- **Bandwidth**: video is heavy on mobile data; default to SD and never preload.
- **Latency**: generation adds seconds per reply; show the text immediately and the signer when ready.
- **Accuracy**: AI signing of health information can mistranslate. Prefer human or QC translations for safety-critical fixed messages (emergency advice, privacy notice).
- **Dependency**: a third-party script (plugin) on our pages affects performance, privacy and Content Security Policy.
- **Token handling**: 15-minute tokens need a server-side cache; WebSocket use needs a long-lived server, which Vercel serverless functions do not provide, so start with REST.

## 6. What the current build already prepares

- Text is always the primary channel; voice input is reviewed as text before sending; replies can be read aloud.
- Provider settings pattern (ADR-069) that a sign-language provider can join.
- Accessibility needs on hospital bookings, and staff told which communication a patient prefers.
