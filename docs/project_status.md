# Nutraboom Equals — Project Status

_Last updated: 8 October 2026 · branch `development`_

All seven MVP phases in [CLAUDE.md §32](CLAUDE.md) are **built and tested locally**. The app is **not yet deployed**, and a few launch tasks remain, mostly outside the code: hosting, API plan, professional review and licensing. See [What is left](#what-is-left).

Keep this file current: update it when a feature is finished, a gap is closed or scope changes ([CLAUDE.md §33](CLAUDE.md)).

## At a glance

| Item                                                                             | Status                                                                                                                                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MVP phases (1–7)                                                                 | 7 of 7 built                                                                                                                                                                         |
| MVP acceptance criteria ([project_requirements.md §15](project_requirements.md)) | 12 of 12 met locally                                                                                                                                                                 |
| Automated tests                                                                  | 664 passing across 57 test files, plus 10 PostgreSQL integration tests (`npm run test:db`), plus a live conversation evaluation (`npm run eval:conversations`)                       |
| Coverage (`lib/`, `components/`, `app/`)                                         | 93% of lines, 87% of branches                                                                                                                                                        |
| Architecture decisions                                                           | 66 decided + 1 proposed ([decisions.md](decisions.md), ADR-001 to ADR-067)                                                                                                           |
| Database migrations                                                              | 12: foods, price estimates, conversations, rate limits, AI provider settings, XEELAA, Claude provider, platform foundation, subscription check, nutritionists, meal planner, vendors |
| Verified food data                                                               | 48 foods (FAO/INFOODS WAFCT 2019 + USDA serving sizes)                                                                                                                               |
| Price estimates                                                                  | 17 items, NBS Selected Food Price Watch, May 2026, national + 6 zones                                                                                                                |
| Deployed                                                                         | No: Vercel config is ready (`vercel.json`), nothing is deployed yet                                                                                                                  |
| CI                                                                               | GitHub Actions workflow ready (`.github/workflows/ci.yml`); not yet run on GitHub                                                                                                    |

## MVP acceptance criteria

From [project_requirements.md §15](project_requirements.md). "Live" means checked against real Gemini and the real database during development, not only in automated tests.

| #   | A new user can…                                           | Status | Evidence                                                                          |
| --- | --------------------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| 1   | Open the home page                                        | ✅     | UI tests; browser checks at phone and desktop size                                |
| 2   | Understand what the product does                          | ✅     | Headline "Understand food. Plan meals. Eat within your budget." and feature cards |
| 3   | Open the chatbot                                          | ✅     | UI and accessibility tests (modal, focus, Escape)                                 |
| 4   | Ask about a food                                          | ✅     | Live: orange, garri                                                               |
| 5   | Receive nutrition information                             | ✅     | Live: figures from verified data only, with sources shown                         |
| 6   | Ask for a meal plan                                       | ✅     | Live: Journey B                                                                   |
| 7   | Answer follow-up questions                                | ✅     | One question at a time; known facts never re-asked (tests + live)                 |
| 8   | Receive a meal plan                                       | ✅     | Live: plan card with "needs vary" note                                            |
| 9   | Give a budget                                             | ✅     | Live: Journey C                                                                   |
| 10  | Say what ingredients they own                             | ✅     | Live: food at home used first                                                     |
| 11  | Receive a budget-aware plan                               | ✅     | Live: shopping list priced in code, total and remainder                           |
| 12  | Get safe behaviour for child, pregnancy and allergy cases | ✅     | Live: Journeys D and E, peanut allergy, 4-month-old, emergency                    |

## What is built

### Phase 1 — Home page, chat UI, chat API

- Single home page with launcher; chat dialog with suggested prompts, loading, error and retry states.
- `POST /api/chat`: input validation, size limit, safe error messages, structured logs without user content.
- AI behind an `AIProvider` interface: Gemini by default, plus a `mock` provider for running without a key (ADR-013, ADR-020).

### Phase 2 — Food database and nutrition answers

- PostgreSQL + Prisma; 48 foods generated from source files with provenance and checksums ([food-data.md](food-data.md), ADR-025, ADR-026).
- Food names, including local ones (garri/gari, pawpaw, ewa, epa), matched in code; per-serving values calculated in code and given to the model as verified data (ADR-027).
- Source links shown under replies.

### Phase 3 — Meal planning

- Known facts tracked across the conversation; the next question is chosen in code in the CLAUDE.md order (ADR-034).
- Structured meal plans, validated before display and shown as a card (ADR-035).

### Phase 4 — Budget planning

- NBS price estimates by zone; the user's state or city (e.g. Port Harcourt → South South) is detected in code ([price-data.md](price-data.md), ADR-036).
- The model proposes a shopping list; code prices it, totals it and works out what is left. Over-budget lists and invented ₦ amounts are rejected (ADR-037).

### Phase 5 — Safety layer

- Allergies detected, remembered and enforced on every suggestion, using a Nigerian allergen vocabulary (ADR-031, ADR-032).
- Pregnancy, breastfeeding, medical conditions, medication and emergency signs detected in code. Replies are blocked if they contain doses, advice to change medication, unsafe pregnancy foods, or food for babies under 6 months. The app writes urgent-care ("call 112") and referral notices (ADR-041).
- A failing reply is regenerated once with a correction, then replaced by a safe fallback.

### Phase 6 — Hardening

- PostgreSQL integration tests, coverage reports, Gemini provider tests.
- Accessibility: axe checks, `inert` background, focus management, WCAG AA contrast.
- 70-second client timeout, offline message, error and not-found pages; no secrets in the browser bundle (ADR-042).

### Phase 7 — Voice foundation

- Microphone input and read-aloud with the browser's Web Speech API. The transcript is reviewed before sending; replies to spoken questions are read with the urgent notice first (ADR-043).
- A **Listen** button on every reply reads it aloud on request and becomes Stop while playing (ADR-045).
- Longer, more reliable capture: listens through pauses, ends after 3.5 s of silence, restarts sessions the browser closes, keeps unconfirmed words, and shows Listening / Processing / Ready (ADR-049).

### Production readiness (beyond the phases)

- Vercel build that migrates and seeds on production deploys only (ADR-038).
- Conversations (2-hour expiry) and rate limits (hashed IPs) stored in PostgreSQL, so they work across instances (ADR-039, ADR-040).
- Gemini retries and an optional fallback model (ADR-030, ADR-044).

### Platform expansion, Phase A (8 October 2026)

- **Accounts (ADR-061):** sign-up, sign-in, sign-out, email confirmation and password reset on the main site. Sessions are database-backed with hashed tokens; attempts are rate-limited.
- **n-equals (ADR-060):** a separate admin app (`npm run dev:admin`). It has Overview, Users & roles, Plans, Subscriptions, AI providers, Settings and Audit log. Seven admin roles have permissions checked on the server. The first administrator comes from `npm run admin:create`.
- **Subscriptions (ADR-062):** plans with entitlements, the free tier and the grace period are set in n-equals; the EntitlementService and monthly usage limits are built. Manual grants are supported. Feature flags are all off.
- **Payments (ADR-063):** Paystack and Flutterwave checkout, verification, webhooks, renewal, failed renewal and cancellation. Tested with mocked provider responses only.
- **Claude (ADR-059):** an AI provider by environment variable or in n-equals. Tested with a fake client only.
- **Built since:** phases B to E (below). Not built: the N-ATLaS speech recognition server (ADR-069).

### Partner portals and hospital onboarding (16 October 2026)

- **Portals (ADR-089):** hospital, vendor and nutritionist portals have their own frame and login pages (`/hospital/sign-in`, `/vendor/sign-in`, `/nutritionist/sign-in`), with no public navigation, and work before their public directory is switched on.
- **Hospitals:** one-step registration at `/hospital/join`. Staff are added by email (an account is created if needed) and stay pending until the hospital is verified, then are activated and emailed.
- **Account:** Log out in the menu and header, a sticky account menu, and "Continue your hospital conversation" on the overview.
- **n-equals:** status counts on vendors, hospitals and subscriptions.
- **Database:** the `membership_activation` migration (applied to the configured database on 18 October 2026; Vercel production builds apply it too).

### Demo tour and infant-rule fix (15 October 2026)

- **Demo video (ADR-088):** a new tour covering the home page, five chat questions, Yorùbá and Igbo, the sign-language demo, voice (input simulated, labelled), and the products, nutritionists and hospitals pages; the spoken words are added as sound when polishing.
- **Safety fix (ADR-088):** breast milk and formula are no longer flagged by the under-6-months rule, and that rule no longer blocks a pregnant or breastfeeding user's questions about her own food.

### Chat redesign, visuals, email, WhatsApp and listings (14 October 2026)

- **Chat (ADR-083):** non-modal side panel on wider screens (the page stays usable), full screen on phones; New chat, expand, minimize to a bar.
- **Home (ADR-084):** "Learn, plan, and get help in your language." and an accessibility section, with the commitment on About.
- **Visual explanations (ADR-085):** reviewed, credited Wikimedia Commons pictures (breastfeeding latch and holds, hand washing, balanced plate, fridge storage, Nigerian dishes) when people ask to see something.
- **Email (ADR-086):** branded HTML templates with plain-text copies through Resend, with delivery logs.
- **WhatsApp (ADR-087):** Meta Cloud API webhook and replies through the chat pipeline, STOP/START, status tracking; `docs/whatsapp.md`. Needs the WhatsApp variables and Meta setup to go live.
- **Public listings (ADR-082):** n-equals explains why a verified partner is hidden (module off, no listing plan) and can grant listing. **On the live site the Hospitals, Vendors and Nutritionists modules are off**; switch them on in n-equals Settings.
- **README** moved to the repository root.

### n-equals update and demo video (13 October 2026)

- **n-equals (ADR-080):**
  - Platform users (search, suspend, delete) and Administrators (roles, add an administrator) as separate modules;
  - My profile (name, password, other sessions);
  - pagination on every table;
  - the Equals logo;
  - XEELAA added through "Add an API key";
  - an analytics overview: active AI, active and new users, chats, meal plans, subscriptions and revenue, review queues, 14-day charts.
- **Demo video (ADR-081):** `npm run demo:record` and `npm run demo:polish`; see `docs/DEMO_README.md`. The demo seed adds a demo member and a demo administrator.

### Sponsored product timing (9 October 2026)

- **ADR-078:** products appear in chat only when the person asks for products, turns to buying, or wraps up (including a finished meal plan), not on every food reply.

### Sign-language response simulation (9 October 2026)

- **Demo (ADR-077):** "Sign language response (demo)" in the assistant, Meal Planner and hospital messages shows a random sample video from 10 freely licensed Wikimedia Commons clips (Nigerian Sign Language first), always labelled as not translating the reply. Provider interface ready for a real service (`SIGN_LANGUAGE_PROVIDER`).

### Dashboard, demo data and accessibility (9 October 2026)

- **Assistant everywhere (ADR-072):** the floating "Ask Nutraboom Equals" button and chat panel are in the root layout, on every main-site page including 404 and error pages.
- **Sign-in state fix (ADR-072):** static pages (home, about, 404) check `/api/session`, so a signed-in visitor no longer sees "Log in" after a 404 page.
- **Account dashboard (ADR-075):** overview, meal plans, meet a nutritionist, change plan, manage profile (name, access needs, password).
- **Meal Planner:** public introduction with "Create my meal plan"; visitors sign up and return to the planner.
- **Demo data (ADR-074):** `npm run db:seed:demo`.
- **Hero animation and accessibility baseline (ADR-076):** reduced-motion aware; `docs/accessibility.md`.
- **Sign language (ADR-073):** Signapse research and plan only, `docs/signapse-integration.md`.

### Brand refresh, public site and Google sign-in (9 October 2026)

- **Design (ADR-070):** Nutraboom palette and type (DM Sans, Playfair Display), the Equals logo and app icon, pill buttons, shared header (mobile menu, skip link) and footer on every main-site page, dark mode.
- **Pages:** a sectioned home page, `/about`, `/for-nutritionists`, `/for-vendors`; directories show "coming soon" while their feature is off. Titles use "Page — Nutraboom Equals".
- **Google (ADR-071):** "Continue with Google" on log-in and sign-up, with PKCE, state and nonce, account linking and pre-hijacking protection. Tested with mocked Google responses; a real OAuth client is needed to try it live.

### Hospitals and accessibility, Phase E (9 October 2026)

- **Hospital portal (ADR-068):** `/hospital` with a dashboard, hospital details and map pin, departments and opening times, staff and roles, appointments, patient messages and plan.
- **Review:** n-equals Hospitals (`hospitals.verify`). Listing needs verification and the `hospital.listing` entitlement; hospital plans are held by the organisation.
- **Patients:** `/hospitals` (place search with OpenStreetMap, "use my location", radius, state, department and accessibility filters), hospital pages with step-by-step booking, and conversations at `/hospitals/messages/[id]`. The account page lists appointments and conversations.
- **Accessibility agent:** AI routing with code-decided emergencies and a medicine-free reply; staff alerted by role and department.
- **Cron:** `/api/cron/hospitals` daily (reminders, 90-day deletion), protected by `CRON_SECRET`.
- **Audio (ADR-069):** n-equals Audio; browser speech only.
- **Settings:** the default hospital search distance is in n-equals Settings.

### Vendors, Phase D (8 October 2026)

- **Vendor portal (ADR-067):** `/vendor` with business profile, products, plan and a dashboard of 30-day counts.
- **Review:** n-equals Vendors reviews businesses and products. Claims and breast-milk substitutes are blocked by code.
- **Recommendations:** sponsored, deterministic, in chat and Meal Planner plans. They respect allergies and child and pregnancy rules and are always labelled sponsored.
- **Pages:** `/products` and product pages, with counted shop links.
- **Checked in the browser:** onboarding, a claim being blocked, submission, both approvals, the directory, the product page and its view count. The live recommender was run against the database (recommended for yogurt, excluded for a milk allergy).

### Meal Planner, Phase C, and email (8 October 2026)

- **Meal Planner (ADR-066):** `/planner` with a conversational intake (one AI call per turn) and plans written a week at a time in parallel 2-day chunks.
  - Each plan has app-calculated nutrition, a costed shopping list (an entitlement), adjustments, meal replacement, print and delete.
  - Every limit is an entitlement.
  - Checked live with Gemini: intake, a 2-day plan, and a week rewritten from feedback.
- **Fixes from the live check:**
  - Every day must have the main meals.
  - Implausible weights are not counted.
  - Generation has a 60 s timeout per chunk.
  - After a failover, Gemini uses the fallback model directly for 60 s.
- **Email (ADR-065):** Resend, when `RESEND_API_KEY` and `EMAIL_FROM` are set.
- **Privacy notice:** updated for accounts, the planner, nutritionists, payments and email.

### Nutritionists, Phase B (8 October 2026)

- **Onboarding and portal (ADR-064):** `/nutritionist`. The profile, qualifications, Cloudinary documents and photo, weekly availability and plan are managed here; the profile is then submitted for review.
- **Review:** n-equals Nutritionists. Deterministic checks plus an advisory AI assessment (`generateJson` on Gemini, Claude, OpenAI and DeepSeek). Approve, request changes, reject, suspend or reinstate; each decision is notified and audited.
- **Directory, profile pages and chat suggestions:** deterministic matching. Contact details are shown to signed-in users; session requests are made in the app, and fees are paid directly to the nutritionist.
- **Tested** with unit, integration and UI tests. Cloudinary is tested with mocked responses only: no keys are configured locally.

### Admin: AI provider settings (added after the MVP, 4 October 2026; now in n-equals)

- Page now at n-equals `/ai` (originally `/em/chat/settings`): add a Gemini, Claude, OpenAI or DeepSeek key with a model; it is verified with the provider, then encrypted (AES-256-GCM) and saved (ADR-047).
- One active configuration at a time; activate, deactivate, re-check, change model, delete key; metadata-only audit log. With nothing active, chat uses the environment variables.
- The original shared-password sign-in (ADR-048) was replaced by administrator accounts and roles (ADR-061).

### Product review: steps 2 and 3 (7 October 2026)

- **Spoken confirmation (ADR-057):** an optional setting reads a voice message back and accepts a spoken "send" or "again". The transcript is still reviewed before sending, by ear, and screen readers now hear the transcript in the Ready status.
- **School planner (ADR-058):** school or lunchbox requests get the review's checklist one question at a time (ages first). Plans mark lunchbox food, which is labelled on the card and read aloud.
- **Start modes (ADR-058):** "What do I have?" and "What can I afford?" buttons, plus a school-lunchbox suggested prompt.

### Product review: step 1, conversation behaviour (6 October 2026)

The October 2026 review (`nutraboom_equals_review_feedback.docx`) asked for a "listening" nutrition professional, not a meal-plan form. Built:

- help first, then one relevant question;
- no performative empathy, short replies, voice-length replies;
- remembered constraints: what the family can't afford, time to cook, fridge, what they have now, leftovers;
- a "why" for every meal;
- medication literacy;
- checks on nutrient names and figures;
- a retry for badly shaped replies;
- a 12-scenario live evaluation (ADR-055, ADR-056; see [conversation-evaluation.md](conversation-evaluation.md)).

Still to do from the review:

1. ~~Hands-free voice~~: done as spoken confirmation (ADR-057).
2. ~~School and lunchbox planner and entry points~~: done (ADR-058).
3. **N-ATLaS speech recognition:** test it on real parents' voice notes and agree licence terms with Awarri (a 1,000-user cap without an agreement).
4. **Reviewed content library:** breastfeeding, feeding babies 6–24 months, pregnancy. This needs a nutrition professional and named sources.
5. **Later:** illustrations, captions, Nigerian Sign Language, Hausa and Pidgin.

The review document also has two cut-off sections ("audio-friendly meal plans" and "the 6-month-old scenario") and one empty one ("conversation state"). Ask the reviewer for them.

### User experience update (4 October 2026)

- **Outcome interface:** replies with a result lead with a structured card. Plans show a title, people and days, meals with costs, shopping list, nutrition focus and budget summary. Food questions show a per-serving facts card. All figures come from code (ADR-051).
- **User settings:** reply language (Nigerian, UK or US English; Yorùbá and Igbo in Beta), saved on the device and applied to replies and voice (ADR-050).
- **Message box** grows with the text.
- **XEELAA API:** key, Use XEELAA switch and status on the admin page. When on, chat tries XEELAA first and automatically falls back to the default provider (ADR-052).

## What is left

### 1. Before launch (blocking)

| Task                                | Owner                             | Notes                                                                                                                                                                                                                                                                        |
| ----------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push to GitHub and deploy to Vercel | Product owner                     | Set `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `RATE_LIMIT_SECRET` ([README](../README.md#deploying-to-vercel)). Migrations run on the first production deploy.                                                       |
| Hosted PostgreSQL                   | Product owner                     | e.g. Neon, Supabase or Vercel Postgres; use a pooled URL for the app and a direct one for migrations.                                                                                                                                                                        |
| Paid Gemini tier                    | Product owner                     | The free tier allows about 20 requests per model per day, and free-tier data may be used by Google.                                                                                                                                                                          |
| Professional review of safety rules | Nutrition or health professional  | The pregnancy food list, emergency signs, child-feeding rules, condition list and referral wording (`lib/safety/`).                                                                                                                                                          |
| Privacy notice: operator and review | Product owner + legal reviewer    | Built at `/privacy` (ADR-053). Set `PRIVACY_CONTROLLER_NAME` and `PRIVACY_CONTACT_EMAIL`, and have the wording reviewed against the NDPA 2023 (consent for health data, NDPC registration if required).                                                                      |
| FAO licence for WAFCT data          | Product owner                     | Required for commercial use ([food-data.md](food-data.md)).                                                                                                                                                                                                                  |
| n-equals deployment                 | Product owner                     | A second Vercel project, root directory `n-equals`, same environment variables, its own domain. Set `AI_CREDENTIALS_KEY` (`npm run admin:secrets`) and back it up: losing it makes saved keys unreadable. Create the first administrator with `npm run admin:create`.        |
| Resend                              | Product owner                     | Verify the sending domain in Resend and set `RESEND_API_KEY` and `EMAIL_FROM`; then test sign-up confirmation and a password reset.                                                                                                                                          |
| Paid AI tier for the planner        | Product owner                     | A plan uses about 4 AI calls per week; the free Gemini tier ran out of quota during testing.                                                                                                                                                                                 |
| Cloudinary: live test               | Product owner / developer         | Set the Cloudinary variables, upload a PDF and a photo as a nutritionist, and open the document as the owner and as a reviewer. Check that the private file's public URL is refused.                                                                                         |
| Nutritionist review policy          | Product owner + professional body | Decide which registrations reviewers must check, and how. The AI analysis cannot verify credentials.                                                                                                                                                                         |
| Payments: live test                 | Product owner / developer         | Create the plans at Paystack and Flutterwave, set test keys and webhook URLs, then run a checkout, a renewal and a failed renewal with each. Only then switch on Paid plans and use live keys.                                                                               |
| XEELAA chat format                  | Product owner / developer         | Confirm with a real key that `POST /api/v2/ai/chat` accepts `{ message }` and returns the reply in the expected field (until then every call falls back to the default provider). Run the safety prompts through it. The privacy notice already names XEELAA while it is on. |
| Yoruba and Igbo review              | Native speakers + health reviewer | Review translated replies and provide reviewed translations of the safety notices before removing the Beta label.                                                                                                                                                            |
| Live safety test per new provider   | Product owner / developer         | OpenAI, DeepSeek and Claude are covered by automated tests with fake responses only. Run the safety prompts live before activating either in production.                                                                                                                     |

### 2. Before launch (strongly recommended)

| Task                         | Notes                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI pipeline: first run       | Built (`.github/workflows/ci.yml`): typecheck, lint, format check, all tests with a PostgreSQL 16 service, build. Push to GitHub to run it the first time. |
| Performance on real networks | Lighthouse with mobile throttling against the deployed site; locally the first load is about 180 KB of compressed JS.                                      |
| Voice on real phones         | Recognition of Nigerian accents and food names can only be judged by people.                                                                               |
| Monitoring and alerts        | Logs go to stdout only. Add log drains or alerts for `ai_unavailable`, `store_unavailable`, `ai_fallback` and `degraded` events.                           |

### 3. Data gaps

- **Prices without a documented unit:** rice (local, imported), white beans, yellow garri, plantain, potatoes, maize, carrots, beef, goat, chicken, fish and crayfish ([price-data.md](price-data.md)). Rice matters most for budget meals.
- **More foods and dishes:** only 48 single foods have verified data. Common dishes (jollof rice, moi moi, egusi soup, akara) and ugu (fluted pumpkin) have none, so the assistant describes them without figures.
- **Dish allergens:** mixed dishes are not assumed to contain egg, crayfish or fish (e.g. moi moi), so the allergy check relies on the model listing ingredients.
- **Price detail:** zone averages only; NBS publishes no per-state averages in the workbook used. Prices are from May 2026 and need a monthly refresh process.

### 4. Known limitations

- Food lookup matches named foods only: no pronouns ("compare it with banana"), no misspellings, and at most 3 foods per message.
- A declared allergy cannot be withdrawn later in the same conversation.
- The model's own referral notices are passed through and can repeat; suppressing them could hide a new concern (ADR-041).
- Condition detection counts mentions, so a general question about diabetes also triggers the dietitian referral.
- Meal plans are composed by the AI and checked by code; there is no curated dish database yet (ADR-035).
- English only; voice needs Chrome, Edge or Safari, and in Chrome and Edge the audio goes to the browser vendor's speech service.
- Replies are not streamed, so users wait for the whole answer (usually a few seconds; longer when Gemini is busy).
- The outcome card's labels are in English for every reply language. The nutrition focus ranks foods within our own 48-food dataset, not against daily requirements.
- Admin page: one shared password (no named admins; audit actor is "admin"); no rotation of `AI_CREDENTIALS_KEY`; saved configurations have no fallback model; a switch reaches other server instances within 30 seconds (ADR-047, ADR-048).
- `GET /api/foods`, `POST /api/meal-plans` and `POST /api/budget-plans` were not built; everything goes through `POST /api/chat` (allowed by CLAUDE.md §18).

### 5. Out of MVP scope (future)

From [project_requirements.md §14](project_requirements.md) and [CLAUDE.md §1](CLAUDE.md): user accounts, saved plans, shopping-list history, notifications, WhatsApp, native apps, live market prices, dietitian marketplace, subscriptions, clinical nutrition and advanced analytics. Also candidates later: Yoruba, Hausa and Igbo, and server-side speech recognition (the `SpeechToText` interface allows it).

### 6. Planned: server-generated voice (ADR-046, proposed)

A consistent, higher-quality voice generated on the server, replacing device voices behind the existing `TextToSpeech` interface. Designed but **not built**. Before building:

1. Run a voice trial: compare browser voices with candidate server voices (e.g. Gemini TTS) on Nigerian English and food names, with real users.
2. Add server voice to the privacy notice (ADR-053) and move to a paid AI plan.
3. Then implement `POST /api/speech` (stored replies only, cached, rate-limited, browser-voice fallback) as described in [ADR-046](decisions.md).

## Where to find things

| Topic                               | Document                                                     |
| ----------------------------------- | ------------------------------------------------------------ |
| Engineering rules and LOOP process  | [CLAUDE.md](CLAUDE.md)                                       |
| What the product must do            | [project_requirements.md](project_requirements.md)           |
| How it is built                     | [architecture.md](architecture.md)                           |
| Why it is built that way            | [decisions.md](decisions.md)                                 |
| Setup, scripts, deployment, privacy | [README.md](../README.md)                                    |
| Food and price data pipelines       | [food-data.md](food-data.md), [price-data.md](price-data.md) |
