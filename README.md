# Nutraboom Equals

A conversational nutrition assistant for Nigeria. Ask about foods, plan meals, and eat within your budget.

**Status:** see [`project_status.md`](docs/project_status.md) for what is built and what is left.

Read [`CLAUDE.md`](docs/CLAUDE.md), [`project_requirements.md`](docs/project_requirements.md), [`architecture.md`](docs/architecture.md) and [`decisions.md`](docs/decisions.md) before making changes.

## Getting started

Requires Node.js 22+.

```bash
npm install
cp .env.example .env.local   # then edit it (see below)
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable                                                               | Required                 | Description                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `AI_PROVIDER`                                                          | no                       | `gemini` (default), `claude` or `mock` (no key needed, canned replies)                                                      |
| `CLAUDE_API_KEY`, `CLAUDE_MODEL`                                       | when using Claude        | Anthropic key (server-side only) and optional model (default `claude-opus-5-5`)                                             |
| `GEMINI_API_KEY`                                                       | when using Gemini        | Server-side only. Get one at https://aistudio.google.com/apikey                                                             |
| `GEMINI_MODEL`                                                         | no                       | Model override. Defaults to `gemini-3.8-flash`                                                                              |
| `GEMINI_FALLBACK_MODEL`                                                | no                       | Backup model when the main one is overloaded, out of quota or unavailable (e.g. `gemini-3.5-flash-lite`). Unset = no backup |
| `DATABASE_URL`                                                         | for food data            | PostgreSQL connection string                                                                                                |
| `DATABASE_URL_TEST`                                                    | no                       | Separate database (name must contain `test`) for DB tests                                                                   |
| `APP_URL`                                                              | in production            | Public address of the main site, for email links and payment return URLs                                                    |
| `AI_CREDENTIALS_KEY`                                                   | to save AI keys          | 32 random bytes, base64. Encrypts keys saved in n-equals. Never change it once keys are saved                               |
| `PRIVACY_CONTROLLER_NAME`, `PRIVACY_CONTACT_EMAIL`                     | before launch            | Operator name and privacy contact shown on `/privacy`                                                                       |
| `PAYSTACK_SECRET_KEY`                                                  | for Paystack             | Test-mode key outside production (ADR-063)                                                                                  |
| `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH`                   | for Flutterwave          | Test-mode key, and the webhook secret hash from the dashboard                                                               |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | for nutritionist uploads | Qualification documents (private) and photos (ADR-064)                                                                      |
| `RESEND_API_KEY`, `EMAIL_FROM`                                         | for email                | Resend key and a sender on a verified domain (ADR-065)                                                                      |

To add another AI provider, implement `AIProvider` (`lib/ai/types.ts`) in a new file and add a case to `getAIProvider` in `lib/ai/index.ts`. For the admin page as well, add it to `PROVIDERS`, `createProvider` and `verifyCredential` in `lib/ai/settings/providers.ts` and to the `AIProviderKind` enum in `prisma/schema.prisma`.

## Scripts

| Command                                          | What it does                                                                                                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                    | Dev server                                                                                                                                                                                    |
| `npm run typecheck`                              | Generate Next.js route types, then `tsc`                                                                                                                                                      |
| `npm run lint`                                   | ESLint                                                                                                                                                                                        |
| `npm run format`                                 | Prettier (write); `format:check` to verify                                                                                                                                                    |
| `npm test`                                       | Vitest: unit, integration, UI and safety tests                                                                                                                                                |
| `npm run test:db`                                | PostgreSQL integration tests on `<db>_test` (derived from `DATABASE_URL`)                                                                                                                     |
| `npm run test:coverage`                          | Tests with a coverage report in `coverage/`                                                                                                                                                   |
| `npm run build`                                  | Production build (CI: `.github/workflows/ci.yml` runs every check on push)                                                                                                                    |
| `npm run eval:conversations`                     | Live conversation-quality evaluation against the real AI ([conversation-evaluation.md](docs/conversation-evaluation.md))                                                                      |
| `npm run admin:secrets`                          | Prints new `AI_CREDENTIALS_KEY` and `RATE_LIMIT_SECRET` values                                                                                                                                |
| `npm run admin:create`                           | Creates an n-equals administrator (or gives an existing account an admin role)                                                                                                                |
| `npm run db:seed:demo`                           | Sample nutritionists, vendors, hospitals and plans, safe to re-run; `-- --enable-features` also switches the modules on; `DEMO_PASSWORD=…` lets the demo accounts sign in. Refuses production |
| `npm run dev:admin`                              | n-equals admin app on http://localhost:3001                                                                                                                                                   |
| `npm run dev:all`                                | Site and admin app together (3000 and 3001); Ctrl+C stops both                                                                                                                                |
| `npm run demo:record`                            | Records the product demo video with Playwright ([DEMO_README.md](docs/DEMO_README.md))                                                                                                        |
| `npm run demo:polish`                            | Turns the newest recording into a captioned MP4 with chapters (needs ffmpeg)                                                                                                                  |
| `npm run typecheck:admin`, `npm run build:admin` | Type-check and build n-equals                                                                                                                                                                 |

## Status

| Phase | Scope                                                                                          | Status |
| ----- | ---------------------------------------------------------------------------------------------- | ------ |
| 1     | Setup, home page, chat launcher/panel, `POST /api/chat`                                        | Done   |
| 2     | Food database (Postgres + Prisma), food lookup                                                 | Done   |
| 3     | Meal planning, conversational clarification                                                    | Done   |
| 4     | Budget planning, price estimates, shopping list                                                | Done   |
| 5     | Safety layer: allergies, child feeding, pregnancy, medical conditions, medication, emergencies | Done   |
| 6     | Hardening: DB tests, coverage, accessibility, error states, performance check                  | Done   |
| 7     | Voice foundation: speak a question, hear the reply (browser Web Speech API)                    | Done   |

Limitations: conversations and rate limits are stored in PostgreSQL when `DATABASE_URL` is set, otherwise in memory (single process). Verified nutrition data covers the 48 foods in `prisma/seed/foods.json`; for any other food the assistant is instructed not to quote figures. Price estimates cover 17 items from the NBS Selected Food Price Watch (May 2026), national or by zone; rice, plantain, meat and fish have no estimate yet because NBS does not state their units (see [price-data.md](docs/price-data.md)).

## Database

```bash
npm run db:deploy   # apply migrations to DATABASE_URL
npm run db:seed     # load foods and price estimates (safe to re-run)
```

Nutrition data comes from the FAO/INFOODS West African Food Composition Table (2019), with serving sizes from USDA FoodData Central. See [food-data.md](docs/food-data.md) for provenance and how to rebuild. **WAFCT allows non-commercial use with attribution; commercial use needs a licence request to FAO.**

## Deploying to Vercel

`vercel.json` sets the build command to `npm run vercel-build` (`scripts/vercel-build.mjs`), which runs:

| Deployment        | Database step                                                                       | Then         |
| ----------------- | ----------------------------------------------------------------------------------- | ------------ |
| Production        | `prisma migrate deploy`, then `prisma db seed`                                      | `next build` |
| Preview           | Skipped (set `RUN_DB_MIGRATIONS=true` only if previews have their **own** database) | `next build` |
| No `DATABASE_URL` | Skipped with a warning; the app runs without food and price data                    | `next build` |

A failed migration or seed fails the deployment, so code never ships against a schema it does not match. The seed is idempotent and keeps the food and price tables in line with `prisma/seed/*.json`; set `SEED_ON_DEPLOY=false` to skip it.

Set these in the Vercel project's environment variables:

| Variable                                                                    | Notes                                                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                                                            | Required for real replies (`AI_PROVIDER` defaults to `gemini`).                                    |
| `GEMINI_MODEL`                                                              | Optional.                                                                                          |
| `GEMINI_FALLBACK_MODEL`                                                     | Recommended, e.g. `gemini-3.5-flash-lite`: used when the main model is overloaded or out of quota. |
| `DATABASE_URL`                                                              | Hosted PostgreSQL (e.g. Neon, Supabase, Vercel Postgres). A pooled URL is fine.                    |
| `DIRECT_DATABASE_URL`                                                       | Recommended when `DATABASE_URL` is pooled; used for migrations and the seed.                       |
| `RATE_LIMIT_SECRET`                                                         | Recommended: any long random string, used to hash client addresses in the rate-limit table.        |
| `AI_CREDENTIALS_KEY`                                                        | Needed to save AI and XEELAA keys in n-equals.                                                     |
| `APP_URL`                                                                   | The public address, e.g. `https://nutraboom.example`.                                              |
| `PAYSTACK_SECRET_KEY`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH` | Optional: paid plans (ADR-063).                                                                    |
| `PRIVACY_CONTROLLER_NAME`, `PRIVACY_CONTACT_EMAIL`                          | Required before launch: shown on the privacy notice.                                               |

The chat route allows up to 60 seconds per request (`maxDuration` in `app/api/chat/route.ts`).

Conversations (ADR-039) and rate limits (ADR-040) are stored in PostgreSQL, so they hold across Vercel instances. Conversations expire after 2 hours; rate-limit rows after their one-minute window.

## Settings and outcome cards

- **User settings (⚙ in the chat):** reply language, saved in the browser (ADR-050). Yorùbá and Igbo are Beta.
- **Outcome cards:** a plan or food question leads with a structured result calculated by the app (ADR-051).

## Admin app: n-equals

`n-equals/` is the administration app (ADR-060, ADR-061). It shares the database and `lib/` with the main site and is deployed as its own Vercel project (root directory `n-equals`, same environment variables). Keep "Include files outside the Root Directory in the Build Step" on. Both projects install the whole repository from its root with `npm install --include=dev` (`vercel.json`; `n-equals/vercel.json` runs it from `..`, because npm run inside a workspace folder installs only that workspace and skips the root packages that `postinstall` needs): the build needs Prisma, TypeScript and Tailwind, which are dev dependencies, and npm skips those when `NODE_ENV=production` is set. Do not set `NODE_ENV` yourself in Vercel. `.vercelignore` keeps local builds and `.env` files out of CLI uploads. Sections: Overview, Users & roles, Plans, Subscriptions, AI providers, Settings and Audit log. Each administrator sees only what their roles allow.

1. Create the first administrator: `npm run admin:create` (asks for email, name, password and role; the default role is super administrator).
2. Run `npm run dev:admin` and sign in at http://localhost:3001.

### AI providers

Under **AI providers**, an administrator chooses which AI key and model chat uses: Google Gemini, Anthropic Claude, OpenAI or DeepSeek (ADR-047, ADR-059). Saving keys needs `DATABASE_URL` and `AI_CREDENTIALS_KEY`.

1. Add a key: choose the provider, enter the model ID and the key. The key is tested with one tiny request, then encrypted and saved. Tick "Use this configuration" or activate it later.

**XEELAA API** (ADR-052): paste a key in the form `xla_<key id>:<secret>`. It is checked with an authenticated XEELAA call, then encrypted. Use the **Use XEELAA API** switch to turn it on or off. While it is on, chat tries XEELAA first. If XEELAA fails, or its key stops working, chat answers with the default AI settings, and the page shows why. Messages go to XEELAA while it is on, so update the privacy notice first.

Only one configuration is active. With none active, chat uses `GEMINI_API_KEY` and the other environment variables. Other server instances pick up a switch within 30 seconds. Deleting a key removes it from the database only: also revoke it in the provider's dashboard. Before relying on a new provider, run the safety prompts (pregnancy, child under 5, allergy, medication) against it.

### Google sign-in (ADR-071)

1. In Google Cloud Console, create an OAuth client of type "Web application" (APIs & Services > Credentials), after setting up the OAuth consent screen with your app name, logo and privacy page (`<APP_URL>/privacy`).
2. Add the authorised redirect URI `<APP_URL>/api/auth/google/callback` (and `http://localhost:3000/api/auth/google/callback` for local testing).
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `APP_URL`. "Continue with Google" then appears on the log-in and sign-up pages.

### Public site (ADR-070)

Footer contact details come from `CONTACT_EMAIL` (or `PRIVACY_CONTACT_EMAIL`) and social links from `SOCIAL_LINKS`; unset ones are hidden. Logo files are in `public/brand`.

### Hospitals and accessibility (ADR-068, ADR-069)

1. Set `CRON_SECRET` in Vercel (the daily cron in `vercel.json` sends appointment reminders and deletes conversations 90 days after closing). Set `PRIVACY_CONTACT_EMAIL`: it goes in the User-Agent of OpenStreetMap place searches, as their usage policy requires.
2. Switch on **Hospitals** under Settings, and set the default search distance there.
3. A hospital administrator signs in, opens `/hospital/join`, adds the details, pins the hospital on the map, adds departments with opening times and staff (each needs their own account), and submits. Under **Hospitals** in n-equals, a reviewer checks and approves it.
4. Verified hospitals holding **Listed in the hospital directory** (a hospital plan, or the free tier) appear at `/hospitals`. Patients book appointments and message staff by text or voice; the assistant routes each message and alerts the right staff. Emergencies always get the 112 advice.

Speech uses the browser (n-equals **Audio** shows the providers; N-ATLaS is listed as not available). Sign language is not offered.

### Vendors (ADR-067)

Switch on **Vendors** under Settings. A business owner signs in, opens `/vendor/join`, completes the business profile and adds products (with ingredients, allergens, an optional label and where to buy), then submits them. Under **Vendors** in n-equals, a reviewer approves the business and each product; the app blocks treatment claims and breast-milk substitutes. Verified products of a business holding the **Products recommended to users** entitlement (a vendor plan, or the free tier) appear at `/products` and as clearly labelled sponsored suggestions in chat, meal plans and shopping lists, only for foods already suggested and never against an allergy or child or pregnancy rule.

### Meal Planner (ADR-066)

Switch on **Meal Planner** under Settings. Signed-in users open `/planner`: a short conversation, then a plan with recipes, portions, approximate nutrition and (when the plan includes it) a priced shopping list. Lengths, plans per month, adjustments, shopping lists and custom goals are entitlements: set the free tier under Settings and the rest on each plan. A plan uses about 4 AI calls per week, so use a paid AI tier in production.

### Nutritionists (ADR-064)

1. Switch on **Nutritionists** under Settings. Set the Cloudinary variables so nutritionists can upload documents.
2. A nutritionist signs in on the main site, opens `/nutritionist/join`, completes the profile, qualifications, documents and availability, and submits.
3. Under **Nutritionists** in n-equals, a reviewer with the nutritionist-review permission opens the profile. They read the advisory analysis, open each document and check registrations, then approve, request changes, reject or suspend.
4. A verified nutritionist is listed when they hold the **Listed in the nutritionist directory** entitlement: from a nutritionist plan, a grant, or the free tier if you turn it on under Settings.

Listed nutritionists appear at `/nutritionists` and, when chat refers someone to professional advice, under the reply. People request sessions from the profile page; fees are paid to the nutritionist directly.

### Plans, subscriptions and settings

- **Settings:** feature flags (all off by default), the free tier's limits and the billing grace period (ADR-062).
- **Plans:** price, interval and what each plan unlocks. Limits are never hard-coded; the app asks the entitlement service.
- **Subscriptions:** current subscribers, manual grants for a set number of days, and ending a subscription.

Payments (ADR-063): create each plan at Paystack and/or Flutterwave with the same price and interval, enter its plan code or id on the plan, set the provider keys and the webhook URLs (`<APP_URL>/api/webhooks/paystack`, `<APP_URL>/api/webhooks/flutterwave`), then switch on **Paid plans**. Paid plans have only been tested with mocked provider responses: run real test-mode checkouts, including a renewal and a failed renewal, before using live keys.

## Privacy and data

Users see these facts in plain language at `/privacy` (ADR-053), which also names the AI services currently in use. Set `PRIVACY_CONTROLLER_NAME` and `PRIVACY_CONTACT_EMAIL` so it shows who runs the service and where to send privacy questions.

| Data                                                                                                                  | Where                                                                                                                                           | How long                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Conversation messages and facts the user shares (household, ages, pregnancy, conditions, allergies, budget, location) | `Conversation` table                                                                                                                            | Deleted 2 hours after the last message (ADR-039)                                                            |
| Rate-limit counters                                                                                                   | `RateLimit` table, keyed by an HMAC of the client address (never the address)                                                                   | About one minute (ADR-040)                                                                                  |
| Request logs                                                                                                          | Server logs                                                                                                                                     | IDs, intent, timings, outcomes and counts only: never message text, health details, food names or addresses |
| Saved AI provider keys (admin page)                                                                                   | `AIProviderConfig` table, AES-256-GCM encrypted; only a masked hint is ever shown                                                               | Until an admin deletes the key; the audit log (metadata only) is kept                                       |
| Voice (optional)                                                                                                      | The browser's speech service: in Chrome and Edge, recognition audio goes to the browser vendor                                                  | Not stored by Nutraboom Equals; only the transcript the user sends is processed                             |
| WhatsApp contacts (when enabled)                                                                                      | `WhatsAppContact` (an HMAC of the phone number, consent, conversation ID) and `WhatsAppMessage` (message IDs and delivery statuses, never text) | Messages themselves live in `Conversation` and expire as above (ADR-087)                                    |

Messages are sent to Google Gemini to generate replies. Check Google's terms for your API tier (free-tier data may be used to improve Google's products) before real users arrive.

## Quality checks

- **Tests:** unit, integration (including real PostgreSQL via `npm run test:db`), UI and safety suites. Coverage is about 90% of lines in `lib/`, `components/` and `app/`.
- **Accessibility:** automated axe-core checks run in `tests/ui/a11y.test.tsx`. On wider screens the chat is a non-modal side panel, so the page stays usable; on phones it fills the screen and acts as a modal (focus trap, background `inert`). Escape closes it and focus returns to the launcher (ADR-083). Pictures in replies have alt text and captions (ADR-085). Colour contrast meets WCAG AA in light and dark mode.
- **Performance:** the home page is static. A first visit downloads about 4 KB of HTML and about 180 KB of compressed JavaScript (mostly React and Next.js), with no layout shift. No server code or secrets reach the browser (checked in the production bundle).

## Email and WhatsApp

- **Email:**
  - Account and notification emails go through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set.
  - Each one is branded HTML with a plain-text copy (`lib/email/templates.ts`, ADR-086).
  - Delivery is logged as `email_sent` or `email_failed` with the template and Resend's ID, never the address.
  - `APP_URL` must be the public site: the logo and links use it.
- **WhatsApp:** people can chat on WhatsApp through Meta's Cloud API (ADR-087). Set the `WHATSAPP_*` variables and register `<APP_URL>/api/whatsapp/webhook`. Full setup, consent and testing steps are in [docs/whatsapp.md](docs/whatsapp.md).

## Voice

In browsers that support speech recognition (Chrome, Edge, Safari), a microphone button appears next to Send. The spoken question is placed in the message box so the user can check it before sending. The reply to a spoken question is read aloud, with any urgent-care notice first, and "Stop reading" ends it. Any reply can be heard on request with its **Listen** button, which works in any browser that can speak, including when the question was typed. Firefox users type as usual. Voice uses the browser's Web Speech API (ADR-043); in Chrome and Edge the audio is processed by the browser vendor's speech service.
