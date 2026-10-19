# WhatsApp integration

People can chat with Nutraboom Equals on WhatsApp, by text or voice note. Their messages get the same answers, data and safety checks as the website chat. It uses Meta's **WhatsApp Cloud API** (ADR-087; voice, video and commands ADR-090).

- Code: `lib/whatsapp/` and the webhook route `app/api/whatsapp/webhook/route.ts`:
  - config, signature check, Cloud API client (text, image, audio and video messages, media download and upload);
  - webhook parsing, commands, media rules, reply formatting, the sign-language demo videos;
  - the service and the Prisma repository.
- Server speech (voice notes in, spoken replies out): `lib/speech/`.
- Tests: `tests/unit/whatsapp.test.ts`, `tests/unit/speech.test.ts`, `tests/integration/whatsapp-webhook.test.ts` and `tests/integration/chat-history-db.test.ts` (RESET against PostgreSQL).

## How it works

```text
WhatsApp user ──▶ Meta ──POST (signed)──▶ /api/whatsapp/webhook
                                           │ 1. check X-Hub-Signature-256 with the app secret (401 if wrong)
                                           │ 2. answer 200 at once
                                           ▼ 3. after the response (next/server after()):
                                     skip duplicates (message ID) · commands · consent · rate limit
                                           │
                                     voice note or video? download it (Graph API, 16 MB max),
                                     transcribe it (Gemini, then OpenAI), reply "I heard: …"
                                           │
                                     handleChat()  ← the same pipeline, prompts and safety checks as the website
                                           │
                                     reply as text (meal plan and shopping list written out),
                                     then reviewed pictures, a voice reply (if wanted) and the
                                     sign-language demo video (if VIDEO ON)
                                           ▼
Meta ◀── POST /<version>/<phone number ID>/messages ── Cloud API client
Meta ──status webhooks (sent, delivered, read, failed)──▶ stored per message ID
```

- **Only replies:** people write first, so every reply falls inside WhatsApp's 24-hour customer-service window and needs no message template. The app never starts a conversation, sends marketing, or messages anyone who has not written.
- **Privacy:**
  - The phone number is never stored, only an HMAC of it (`WhatsAppContact.waIdHash`).
  - Message tracking keeps Meta's message IDs and statuses, never text.
  - The conversation itself lives in the normal conversation store and expires like a website chat (2 hours).
  - Voice notes and videos are downloaded into memory, transcribed and dropped. They are never stored or logged. Spoken replies are uploaded to WhatsApp's media store (Meta keeps uploads up to 30 days) and not kept by the app.
  - Logs carry event names, statuses, providers and error codes, never numbers, words or audio.
- **Limits:**
  - Each person shares the chat rate limit (keyed by their contact ID). Voice notes count like messages.
  - Replies longer than WhatsApp's 4,096 characters are shortened.
- **Failures:**
  - If the AI fails, the person gets the standard "trouble connecting" message.
  - A failed send is logged with Meta's error code. A failed picture, voice reply or video does not stop the text.
  - Meta retries webhooks for up to 7 days; duplicates are skipped by message ID.

## Commands

People type these in any case, with or without a leading `/`. A message counts as a command only when it is exactly the command, so "stop giving me rice" is a question. Each command is confirmed with a reply.

| Command                  | Also accepted                               | What it does                                                                                                                                          |
| ------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HELP`                   | `MENU`, `COMMANDS`                          | Lists the commands                                                                                                                                    |
| `SIGN ON`                | `START`, `SUBSCRIBE`, `OPT IN`, `RESUME`    | Opts back in after SIGN OFF. Messages are processed again                                                                                             |
| `SIGN OFF`               | `STOP`, `UNSUBSCRIBE`, `OPT OUT`, `CANCEL`  | Opts out. Nothing is processed or sent until SIGN ON (Meta's opt-out rules); the choice is stored and checked on every message                        |
| `RESET`                  | `NEW CHAT`, `START OVER`                    | Deletes this person's conversation (messages and every fact, such as an allergy) and their message records, then starts fresh. Their preferences stay |
| `VOICE ON` / `VOICE OFF` |                                             | Voice replies to every message, or none. By default (neither), a voice note gets a voice reply and a typed message gets text                          |
| `VIDEO ON` / `VIDEO OFF` | `SIGN VIDEO ON/OFF`, `SIGN LANGUAGE ON/OFF` | After each reply, one of the two sample sign-language videos. It is a demo and does not translate the reply; the caption says so                      |

**Safeguards:** every command acts only on the contact the message came from. That contact is found from the sender's number in a webhook signed with the app secret, so nobody can reset or read another person's conversation. RESET deletes only that contact's own conversation row (never one saved to a website account) and keeps the record of the RESET message itself, so a retried webhook is still recognised.

SIGN ON / SIGN OFF are the opt-in controls; the sign-language video is VIDEO ON / VIDEO OFF so the two cannot be confused.

## Voice notes and videos

1. Meta sends an `audio` (voice note or audio file) or `video` message with a media ID.
2. The app asks the Graph API for the media URL (valid 5 minutes), checks the type and size, and downloads it with the access token, only from Meta's own media host.
3. A speech-to-text provider turns it into words. Providers are tried in the order of `SPEECH_TO_TEXT_PROVIDERS` (default `gemini,openai`) until one works. "No speech" is final; any other failure moves to the next provider.
4. The person sees **"I heard: …"** first, so a misheard food or medicine can be corrected, then the answer.
5. The chat runs with `inputMode: "voice"` (replies written to be heard, ADR-055).
6. If voice replies are wanted, the reply (with its notices) is turned into an MP3 by the text-to-speech provider (`TEXT_TO_SPEECH_PROVIDER`, default `openai`), uploaded to WhatsApp and sent as an audio message.

A video's caption is answered even when its sound can't be used. Images, stickers, locations and documents get a polite request to type.

| Problem                                   | What the person is told                        |
| ----------------------------------------- | ---------------------------------------------- |
| No speech provider has a key              | "I can't listen to recordings right now…"      |
| Over 16 MB                                | "That recording is too long…"                  |
| Not a WhatsApp audio or video type        | "…not this kind of message. Please type…"      |
| No words in the recording                 | "I couldn't hear any words…"                   |
| Every provider failed, or download failed | "Sorry, I couldn't understand that recording…" |

### Speech providers

| Provider         | Speech to text                                                | Spoken replies              | Key                                                    |
| ---------------- | ------------------------------------------------------------- | --------------------------- | ------------------------------------------------------ |
| Google Gemini    | Yes: audio and the sound of videos, sent inline (14 MB max)   | No                          | `GEMINI_API_KEY`, or the active Gemini key in n-equals |
| OpenAI           | Yes: `gpt-4o-mini-transcribe` (25 MB max)                     | Yes: MP3, `gpt-4o-mini-tts` | `OPENAI_API_KEY`, or the active OpenAI key in n-equals |
| Anthropic Claude | **No.** The Claude API reads text, images and PDFs, not audio | No                          | Listed so it can be switched on if that changes        |

To add a provider: implement `SpeechToText` and/or `TextToSpeech` (`lib/speech/types.ts`) in its own file, add it to `SPEECH_PROVIDERS` and the `create…` functions in `lib/speech/index.ts`, and add tests. n-equals → Audio shows which providers are in use and whether each has a key.

Speech quality for Yorùbá, Igbo, Hausa and Pidgin varies by provider: test with real voice notes before relying on it. N-ATLaS (ADR-069) can be added as a provider once a server for it exists.

## The sign-language demo (VIDEO ON)

WhatsApp plays only MP4 or 3GPP video with H.264 and AAC, up to 16 MB, and Android needs the Baseline or Main profile. The website's sample videos are WebM, so exactly **two** of them (Nigerian Sign Language: "Can you help me?" and "How much is it?", `lib/whatsapp/demo-videos.ts`) are copied into Cloudinary:

```bash
npm run whatsapp:videos
```

The script uploads both under fixed public IDs (`nutraboom/whatsapp/sign-demo-1` and `-2`), asks Cloudinary for a 480-pixel H.264 Baseline/AAC MP4, then downloads that MP4 the way Meta will and checks it is `video/mp4` and under 16 MB. Run it again at any time; it replaces the same two files. The app only needs `CLOUDINARY_CLOUD_NAME` to build the URLs. Each video's caption carries the demo notice and the licence credit (CC BY-SA 4.0).

## What WhatsApp itself supports, and what the app adds

WhatsApp has no per-chat description, pinned instructions or bot "about" text like Telegram, and no way for a business to delete a person's chat history on their phone. Checked against Meta's Cloud API documentation on 19 October 2026:

| Feature                                                 | Where it comes from                                                                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business profile: About, description, website, category | **WhatsApp (native)**, set with `npm run whatsapp:setup` (`POST /<phone number ID>/whatsapp_business_profile`). Shown on the business's profile       |
| Command menu (type `/` to see it)                       | **WhatsApp (native)**, set with `npm run whatsapp:setup` (`conversational_automation`, up to 30 commands). Choosing one sends its text, e.g. `/reset` |
| Ice breakers (suggested first questions)                | **WhatsApp (native)**, set with `npm run whatsapp:setup` (up to 4)                                                                                    |
| What each command does, HELP text                       | **The app** (`lib/whatsapp/commands.ts`, `service.ts`)                                                                                                |
| Opt-in and opt-out (SIGN ON / SIGN OFF)                 | **The app**, stored on `WhatsAppContact.consent`. Required by WhatsApp's policy; WhatsApp does not do it for you                                      |
| RESET                                                   | **The app**: forgets the conversation on the server. The messages stay on the person's phone; they can clear the chat in WhatsApp themselves          |
| Welcome message                                         | **The app**: sent with the first reply to a new contact                                                                                               |

```bash
npm run whatsapp:setup
```

## Environment variables

| Variable                                                                                     | Required | What it is                                                                                     |
| -------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `WHATSAPP_ACCESS_TOKEN`                                                                      | Yes      | A permanent **system user** access token with `whatsapp_business_messaging` permission         |
| `WHATSAPP_PHONE_NUMBER_ID`                                                                   | Yes      | The phone number ID from WhatsApp Manager (API Setup), not the phone number                    |
| `WHATSAPP_APP_SECRET`                                                                        | Yes      | Meta app → App settings → Basic → App secret. Used to check every webhook signature            |
| `WHATSAPP_VERIFY_TOKEN`                                                                      | Yes      | A long random string you choose; enter the same value when registering the webhook             |
| `WHATSAPP_API_VERSION`                                                                       | No       | Graph API version, default `v25.0` (available until July 2028). Format `vNN.N`                 |
| `WHATSAPP_HASH_SECRET`                                                                       | No       | Secret for hashing phone numbers; defaults to `RATE_LIMIT_SECRET`. Never change it once in use |
| `SPEECH_TO_TEXT_PROVIDERS`                                                                   | No       | Order to try for voice notes, default `gemini,openai`                                          |
| `TEXT_TO_SPEECH_PROVIDER`                                                                    | No       | `openai` (default) or `off`                                                                    |
| `OPENAI_API_KEY`                                                                             | No       | For OpenAI transcription and voice replies (or activate an OpenAI key in n-equals)             |
| `GEMINI_TRANSCRIBE_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` | No       | Model and voice overrides                                                                      |
| `CLOUDINARY_*`                                                                               | No       | For the sign-language demo videos (VIDEO ON)                                                   |

The module stays off (the webhook answers 404) until the four required variables are set. Without a speech key, voice notes get a "please type" reply; without Cloudinary, VIDEO ON says the demo is unavailable. Like every secret, these belong in the hosting environment (Vercel) or `.env.local`, never in code.

## Setup

1. **Meta Business and app:**
   - In Meta Business Settings, create or choose a business, then create an app of type **Business** at https://developers.facebook.com and add the **WhatsApp** product.
   - In WhatsApp Manager, add and verify the business phone number. You get a test number for development.
2. **Access token:** in Business Settings → Users → System users, create a system user and give it the app and the WhatsApp account. Generate a token with `whatsapp_business_messaging` and `whatsapp_business_management`. Set `WHATSAPP_ACCESS_TOKEN`. (The temporary token on the API Setup page expires within a day: error code 190.)
3. **IDs and secrets:**
   - Copy the phone number ID into `WHATSAPP_PHONE_NUMBER_ID`.
   - Copy the app secret into `WHATSAPP_APP_SECRET`.
   - Choose a `WHATSAPP_VERIFY_TOKEN`, e.g. `openssl rand -hex 24`.
4. **Deploy** with those variables, and run the database migrations (`npm run db:deploy`; Vercel production builds do this automatically).
5. **Webhook:**
   - In the app → WhatsApp → Configuration, set the callback URL to `<APP_URL>/api/whatsapp/webhook` and the verify token to `WHATSAPP_VERIFY_TOKEN`. Meta calls the URL once; the app answers the challenge.
   - Then subscribe to the **messages** field. That field carries incoming messages (text, audio, video) and delivery statuses.
6. **Optional extras:** `npm run whatsapp:setup` (command menu, ice breakers, business profile) and `npm run whatsapp:videos` (the sign-language demo).
7. **Test on staging first:**
   - Use Meta's test number and add your own number as a test recipient.
   - Send "Hello": you should get the welcome, then an answer.
   - Send HELP, then a voice note ("What's in an orange?"): "I heard: …", the answer, then a voice reply.
   - Try VOICE ON, VIDEO ON, RESET, then SIGN OFF, another message (no reply), and SIGN ON.
   - Ask "Can I see a picture of a good latch?" to check the pictures arrive.
   - In the logs, look for `whatsapp_replied`, `whatsapp_transcribed`, `whatsapp_send_failed`, `speech_provider_failed` and `whatsapp_bad_signature`.
8. **Go live:** complete Meta's business verification and display-name review, then switch to the production number. Keep the privacy notice (`/privacy`) up to date, because it names WhatsApp and the speech providers.

## Troubleshooting

| Log or symptom                                       | Likely cause and fix                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `whatsapp_bad_signature` with `reason: "mismatch"`   | `WHATSAPP_APP_SECRET` is not this Meta app's secret (or has a typo). Copy it again from App settings → Basic    |
| `whatsapp_bad_signature` with `reason: "missing"`    | The request is not from Meta, or a proxy dropped the header                                                     |
| `whatsapp_send_failed` with `code: 190`              | The access token expired or was revoked: use a permanent system-user token                                      |
| `code: 131030`                                       | The recipient is not on the test number's allowed list. Add them in API Setup                                   |
| `code: 100`                                          | A bad parameter, often a wrong `WHATSAPP_PHONE_NUMBER_ID`                                                       |
| `code: 131053` on a video or audio                   | Meta could not fetch or use the media: run `npm run whatsapp:videos` again and check it says OK for both videos |
| `speech_provider_failed` with `status: 401` or `403` | The speech provider's key is wrong or lacks access. Check it in n-equals → Audio                                |
| Voice notes answered with "I can't listen…"          | No speech-to-text provider has a key                                                                            |

## Local development

Meta must reach the webhook over HTTPS. Expose the dev server with a tunnel (for example `ngrok http 3000`) and register `https://<tunnel>/api/whatsapp/webhook`. The tests do not need Meta: they sign payloads with a test secret and fake the API and the speech providers.

## Policy notes

- Follow the WhatsApp Business Messaging Policy and Commerce Policy:
  - health information here is general nutrition help, never diagnosis or prescriptions (the same safety layer as the website);
  - emergencies get the "call 112" notice.
- Do not send business-initiated messages (reminders, marketing) without approved templates and recorded opt-in. These are not built; adding them needs a template flow and a consent record.
- Data processed by Meta, Google (Gemini) and OpenAI is covered in the privacy notice. Record them as processors in your NDPA records before launch.
