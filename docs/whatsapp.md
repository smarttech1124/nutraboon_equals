# WhatsApp integration

People can chat with Nutraboom Equals on WhatsApp. Their messages get the same answers, data and safety checks as the website chat. It uses Meta's **WhatsApp Cloud API** (ADR-087).

- Code: `lib/whatsapp/` (config, signature check, Cloud API client, webhook parsing, reply formatting, service, Prisma repository) and the webhook route `app/api/whatsapp/webhook/route.ts`.
- Tests: `tests/unit/whatsapp.test.ts` and `tests/integration/whatsapp-webhook.test.ts`.

## How it works

```text
WhatsApp user ──▶ Meta ──POST (signed)──▶ /api/whatsapp/webhook
                                           │ 1. check X-Hub-Signature-256 with the app secret (401 if wrong)
                                           │ 2. answer 200 at once
                                           ▼ 3. after the response (next/server after()):
                                     skip duplicates (message ID) · STOP / START · rate limit
                                           │
                                     handleChat()  ← the same pipeline, prompts and safety checks as the website
                                           │
                                     reply as text (meal plan and shopping list written out),
                                     then reviewed pictures as image messages
                                           ▼
Meta ◀── POST /<version>/<phone number ID>/messages ── Cloud API client
Meta ──status webhooks (sent, delivered, read, failed)──▶ stored per message ID
```

- **Only replies:** people write first, so every reply falls inside WhatsApp's 24-hour customer-service window and needs no message template. The app never starts a conversation, sends marketing, or messages anyone who has not written.
- **Consent:**
  - The first reply to a new person introduces the service, says it is not medical advice, links the privacy notice and explains STOP.
  - STOP (also "unsubscribe", "opt out" or "cancel") stops all messages.
  - START resumes them. While someone has opted out, nothing is sent to them.
- **Privacy:**
  - The phone number is never stored, only an HMAC of it (`WhatsAppContact.waIdHash`).
  - Message tracking keeps Meta's message IDs and statuses, never text.
  - The conversation itself lives in the normal conversation store and expires like a website chat.
  - Logs carry event names, statuses and error codes, never numbers or content.
- **Text only:** voice notes, images and other message types get a polite request to type the question.
- **Limits:**
  - Each person shares the chat rate limit (keyed by their contact ID).
  - Replies longer than WhatsApp's 4,096 characters are shortened.
- **Failures:**
  - If the AI fails, the person gets the standard "trouble connecting" message.
  - A failed send is logged with Meta's error code.
  - A failed picture does not stop the text.
  - Meta retries webhooks for up to 7 days; duplicates are skipped by message ID.

## Environment variables

| Variable                   | Required | What it is                                                                                     |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `WHATSAPP_ACCESS_TOKEN`    | Yes      | A permanent **system user** access token with `whatsapp_business_messaging` permission         |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes      | The phone number ID from WhatsApp Manager (API Setup), not the phone number                    |
| `WHATSAPP_APP_SECRET`      | Yes      | Meta app → App settings → Basic → App secret. Used to check every webhook signature            |
| `WHATSAPP_VERIFY_TOKEN`    | Yes      | A long random string you choose; enter the same value when registering the webhook             |
| `WHATSAPP_API_VERSION`     | No       | Graph API version, default `v25.0` (available until July 2028). Format `vNN.N`                 |
| `WHATSAPP_HASH_SECRET`     | No       | Secret for hashing phone numbers; defaults to `RATE_LIMIT_SECRET`. Never change it once in use |

The module stays off (the webhook answers 404) until the four required variables are set. Like every secret, they belong in the hosting environment (Vercel) or `.env.local`, never in code.

## Setup

1. **Meta Business and app:**
   - In Meta Business Settings, create or choose a business, then create an app of type **Business** at https://developers.facebook.com and add the **WhatsApp** product.
   - In WhatsApp Manager, add and verify the business phone number. You get a test number for development.
2. **Access token:** in Business Settings → Users → System users, create a system user and give it the app and the WhatsApp account. Generate a token with `whatsapp_business_messaging` and `whatsapp_business_management`. Set `WHATSAPP_ACCESS_TOKEN`.
3. **IDs and secrets:**
   - Copy the phone number ID into `WHATSAPP_PHONE_NUMBER_ID`.
   - Copy the app secret into `WHATSAPP_APP_SECRET`.
   - Choose a `WHATSAPP_VERIFY_TOKEN`, e.g. `openssl rand -hex 24`.
4. **Deploy** with those variables, and run the database migration (`npm run db:deploy`; Vercel production builds do this automatically).
5. **Webhook:**
   - In the app → WhatsApp → Configuration, set the callback URL to `<APP_URL>/api/whatsapp/webhook` and the verify token to `WHATSAPP_VERIFY_TOKEN`. Meta calls the URL once; the app answers the challenge.
   - Then subscribe to the **messages** field. That field carries both incoming messages and delivery statuses.
6. **Test on staging first:**
   - Use Meta's test number and add your own number as a test recipient.
   - Send "Hello": you should get the welcome, then an answer.
   - Try "STOP", another message (no reply), then "START".
   - Ask "Can I see a picture of a good latch?" to check the pictures arrive.
   - In the logs, look for `whatsapp_replied`, `whatsapp_send_failed` and `whatsapp_bad_signature`.
7. **Go live:** complete Meta's business verification and display-name review, then switch to the production number. Keep the privacy notice (`/privacy`) up to date, because it names WhatsApp.

## Local development

Meta must reach the webhook over HTTPS. Expose the dev server with a tunnel (for example `ngrok http 3000`) and register `https://<tunnel>/api/whatsapp/webhook`. The tests do not need Meta: they sign payloads with a test secret and fake the API.

## Policy notes

- Follow the WhatsApp Business Messaging Policy and Commerce Policy:
  - health information here is general nutrition help, never diagnosis or prescriptions (the same safety layer as the website);
  - emergencies get the "call 112" notice.
- Do not send business-initiated messages (reminders, marketing) without approved templates and recorded opt-in. These are not built; adding them needs a template flow and a consent record.
- Data processed by Meta is covered in the privacy notice. Record Meta as a processor in your NDPA records before launch.
