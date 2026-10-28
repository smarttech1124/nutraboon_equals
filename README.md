# Nutraboom Equals

Nutraboom Equals ("Equals") is a conversational nutrition assistant built first for people in Nigeria. People ask about food, plan meals for their household and cook within a budget, in plain language, on the website or on WhatsApp. Around the assistant sit a meal planner, directories of verified nutritionists, food vendors and hospitals, and the administration app **n-equals**.

> Equals gives general nutrition information. It is not medical advice and does not replace a doctor, dietitian or antenatal care.

## Contents

- [Project overview](#project-overview)
- [Problem statement](#problem-statement)
- [Goals and objectives](#goals-and-objectives)
- [Core features](#core-features)
- [Accessibility](#accessibility)
- [Target users and use cases](#target-users-and-use-cases)
- [Technology stack and architecture](#technology-stack-and-architecture)
- [Installation and setup](#installation-and-setup)
- [Configuration](#configuration)
- [Available scripts](#available-scripts)
- [Deployment](#deployment)
- [Security and administration](#security-and-administration)
- [Privacy and data](#privacy-and-data)
- [Roadmap and future improvements](#roadmap-and-future-improvements)
- [Repository contents](#repository-contents)

## Project overview

**What it is.** A web app (Next.js) whose centre is a chat assistant. You open the home page, press **Ask Nutraboom Equals** and start typing or speaking. There is no form to fill in first. The assistant asks only what it needs, one question at a time.

**Who it serves.**

- Households planning meals.
- People on a tight food budget.
- Parents of young children.
- Pregnant women.
- People with allergies or a diet-related condition who want general guidance.
- Deaf, hard-of-hearing, blind and low-vision people, through text, voice and sign-language features.

Nutritionists, food vendors and hospitals can also join and be listed.

**Core value.** "I can ask this assistant about food, meals and my food budget", with answers based on Nigerian foods and prices. The app itself supplies the nutrition figures, prices and arithmetic: they come from documented data and code, not from the AI's memory.

## Problem statement

Equals was built for these gaps:

- **Nutrition advice rarely fits Nigerian kitchens.** Most apps and food databases are built around foods, portions and prices from elsewhere. Garri, yam, beans, plantain and local market prices are missing, or are treated as exceptions.
- **Budgets are tight and prices change.** Families need to know what they can cook with ₦2,000 and the food already at home. A generic diet plan does not answer that.
- **Professional help is hard to reach.** Dietitians and nutritionists are few and expensive, and many people do not know who is qualified. Going to a hospital means finding one, booking, and being able to communicate with staff.
- **AI chatbots invent things.** A general chatbot can make up calorie counts and prices. It can also give unsafe advice about pregnancy, infant feeding, allergies or medication.
- **Access barriers.** Literacy, language, disability, cost and the need to install an app all shut people out. WhatsApp is already on most phones.

## Goals and objectives

- Make reliable, practical nutrition information easy to get, in conversation, on the web and on WhatsApp.
- Help households plan meals and shopping within a stated budget, using what they already have first.
- Be safe by design:
  - recognise pregnancy, children under 5, allergies, medical conditions and medication questions;
  - stay general in those cases;
  - refer people to a qualified professional when needed.
- Never present an estimate as a fact. Nutrition values come from a documented food table, and prices are labelled estimates with their source and date.
- Connect people with verified nutritionists, vendors and hospitals.
- Be usable by disabled people from the start, rather than adding accessibility later.

## Core features

Everything below is implemented in this repository. Some modules are switched off by default and must be turned on in n-equals under **Settings** (marked "feature flag").

### Assistant (website)

- **Chat panel:**
  - opens from the home page or from any page through the global assistant button;
  - shows loading and error states, with a Retry button;
  - offers suggested prompts and submits with Enter.
- **Food information:** serving size, energy and main nutrients for foods in the seed table. Figures come from the FAO/INFOODS West African Food Composition Table (2019), with serving sizes from USDA FoodData Central. For other foods, the assistant describes them without quoting figures.
- **Meal planning:** asks progressively (who, ages, allergies, what is at home) and then gives a meal plan. The app checks the plan before showing it.
- **Budget planning:**
  - asks what food is at home before spending;
  - produces a shopping list priced from NBS Selected Food Price Watch estimates (May 2026);
  - shows the estimated total and the money left;
  - all arithmetic is done by code.
- **Safety layer:**
  - **Allergies:** stored for the conversation, excluded from suggestions and mentioned when an item is left out.
  - **Sensitive contexts:** child-under-5, infant and pregnancy rules; condition and medication handling. The assistant may repeat a dose the user stated but never suggests or changes one.
  - **Emergencies:** the urgent-care notice gives 112.
- **Outcome cards:** structured results (plan, budget, food facts) calculated by the app.
- **Visual explanations:** pictures with alt text and captions.
- **Reply language:** English, plus Yorùbá and Igbo (Beta).
- **Voice:**
  - speak a question in browsers with speech recognition (Chrome, Edge, Safari);
  - the words appear as text to check before sending;
  - replies are read aloud for spoken questions, or with **Listen** on any reply.
- **Saved chats:** signed-in users can save, list, reopen and delete chats. The free tier keeps 3, deleted after 30 days without a new message. Plans can change both limits.
- **Sign-language demo:** sample sign-language videos, clearly labelled as a demonstration that does not translate the reply.

### WhatsApp

When the `WHATSAPP_*` variables are set, the same assistant answers on WhatsApp through Meta's Cloud API:

- text messages;
- voice notes and videos, which are transcribed;
- optional spoken replies;
- commands: HELP, RESET, SIGN ON / SIGN OFF, VOICE ON / OFF and VIDEO ON / OFF;
- a welcome message with a link to the privacy notice on first contact.

### Accounts and plans

- Sign-up with email and password (with email confirmation), or Google sign-in.
- Password reset by email.
- An account dashboard with profile, password change, plan, appointments and conversations.
- Subscriptions through Paystack and Flutterwave (test mode until verified). What each plan unlocks is set in n-equals and checked by an entitlement service, not hard-coded.

### Meal Planner (feature flag)

`/planner`, for signed-in users:

- a short conversation, then a multi-week plan;
- recipes, portions and approximate nutrition;
- a priced shopping list when the plan includes one;
- plan lengths, adjustments and custom goals are plan entitlements.

### Nutritionists (feature flag)

- Nutritionists apply at `/nutritionist/join` with a profile, qualifications, documents (stored privately in Cloudinary) and availability.
- Reviewers in n-equals approve, request changes, reject or suspend. An advisory AI assessment helps, but it cannot verify credentials.
- Verified nutritionists are listed at `/nutritionists`, and are suggested under chat replies that refer to professional advice.
- People request sessions from the profile page.

### Vendors (feature flag)

- Businesses submit products at `/vendor/join`, with ingredients, allergens and where to buy.
- Reviewers approve each business and product. The app blocks treatment claims and breast-milk substitutes.
- Approved products appear at `/products`. They can also appear as clearly labelled sponsored suggestions, but only for foods already suggested, and never against an allergy or a child or pregnancy rule.

### Hospitals (feature flag)

- Hospitals register at `/hospital/join`, with details, a map pin, departments, opening times and staff.
- Patients search at `/hospitals` (OpenStreetMap place search, "use my location", radius, department and accessibility filters).
- Patients book appointments and message staff by text or voice. Each patient can state communication needs (for example "I prefer to communicate by text").
- An assistant routes each message and alerts the right staff. Emergencies always get the 112 advice.
- Staff work in a separate hospital portal.

### Administration (n-equals)

The separate admin app. See [Security and administration](#security-and-administration).

## Accessibility

Accessibility is a product requirement. The **target is WCAG 2.2 Level AA**. This is the target the code is built and checked against; no formal conformance audit has been done.

Implemented in the code:

- **Keyboard:**
  - every control works from the keyboard;
  - on phones the assistant is a modal dialog: it traps focus, makes the page behind inert, closes with Escape and returns focus to the button that opened it;
  - on wider screens it is a non-modal side panel, so the page stays usable;
  - menus close with Escape, and nothing is available on hover only.
- **Screen readers:**
  - one `h1` per page, headings in order, labelled landmarks and a "Skip to content" link on main-site pages;
  - every control and icon-only button has an accessible name;
  - chat and hospital conversations are `aria-live` lists, loading states use `role="status"` and urgent notices `role="alert"`;
  - form errors are linked to their fields (`aria-describedby`, `aria-invalid`) and results are announced.
- **Visual:**
  - a 3 px focus ring in its own colour, with at least 3:1 contrast;
  - text colours meet AA contrast in light and dark mode (checked by hand when the palette was chosen);
  - state is never shown by colour alone;
  - layouts are built to reflow at 320 px width and 200% text size;
  - animations respect `prefers-reduced-motion`.
- **Readable content:** short replies in plain words, a structured result card, and pictures with alt text and captions.
- **Inclusive interaction:**
  - text and voice input, with spoken words shown as text before sending;
  - replies read aloud only on request, never autoplayed;
  - every spoken reply is also shown as text;
  - WhatsApp access without installing anything;
  - hospital communication preferences.
- **Sign language:** demonstration only. Real sign-language translation is a research item and is not offered.

Automated axe-core checks run in the UI test suite (kept out of this repository; see [Repository contents](#repository-contents)). Colour contrast is not part of those checks, because jsdom cannot render colour. Screen-reader, zoom and device testing with disabled users is a manual step before each release.

## Target users and use cases

| User                     | Typical use                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Household cook or parent | "I have ₦2,000. What can I cook tonight?" Plan meals for a family of four with a peanut allergy.            |
| Parent of a young child  | Meal ideas for a 3-year-old, with general guidance and a prompt to see a health worker for concerns.        |
| Pregnant woman           | General first-trimester food guidance, foods to be careful with, and when to ask antenatal care.            |
| Anyone curious           | "What's the nutrition in an orange?" "What can I make with rice and beans?"                                 |
| Person with a condition  | General food information, with a referral to a dietitian or doctor, and listed nutritionists.               |
| WhatsApp user            | The same help by text or voice note, without opening a website.                                             |
| Deaf or blind user       | Text-first chat, voice input and reading aloud, hospital communication preferences, the sign-language demo. |
| Nutritionist             | Get verified, be listed and receive session requests.                                                       |
| Food vendor              | List verified products that can be suggested where relevant.                                                |
| Hospital                 | List departments, take bookings and answer patient messages in an accessible portal.                        |
| Administrator            | Verify partners, manage plans, AI providers and settings, monitor usage and manage administrator accounts.  |

## Technology stack and architecture

| Layer      | Technology                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, server actions), React 19, TypeScript                                                                                                       |
| Styling    | Tailwind CSS 4                                                                                                                                                      |
| Database   | PostgreSQL with Prisma 7 (`@prisma/adapter-pg`); migrations in `prisma/migrations`, seed data in `prisma/seed`                                                      |
| Validation | Zod                                                                                                                                                                 |
| AI         | Google Gemini (`@google/genai`, default) and Anthropic Claude (`@anthropic-ai/sdk`); OpenAI and DeepSeek can be configured in n-equals; a `mock` provider for tests |
| Speech     | Browser Web Speech API on the website; Gemini and OpenAI transcription and OpenAI text to speech for WhatsApp                                                       |
| Services   | Resend (email), Cloudinary (documents, photos, videos), Paystack and Flutterwave (payments), Meta WhatsApp Cloud API, OpenStreetMap Nominatim, Google sign-in       |
| Hosting    | Vercel (two projects: the site and n-equals), with daily cron jobs in `vercel.json`                                                                                 |
| Tooling    | ESLint, Prettier, Vitest, GitHub Actions (`.github/workflows/ci.yml`)                                                                                               |

```text
Browser / WhatsApp
      │
      ▼
Next.js app (app/)                      n-equals admin app (n-equals/)
  pages, server actions, /api/*            pages and server actions, role checks
      │                                          │
      └──────────────┬───────────────────────────┘
                     ▼
              Shared domain code (lib/)
  conversation · safety · nutrition · budget · billing · auth · hospitals …
        │                      │                         │
        ▼                      ▼                         ▼
   AI providers         PostgreSQL (Prisma)       External services
   (server only)                                  (email, payments, media)
```

Architecture notes:

- **Server-side AI only.** The browser talks to the app's API, never to an AI provider. Keys stay on the server, and keys saved in n-equals are encrypted (AES-256-GCM).
- **Deterministic facts.** The AI handles intent, questions and wording. Code and data handle nutrition values, prices, totals, allergy filtering and safety rules. The AI returns structured JSON, which is validated before use.
- **Layered prompts.** Policy, safety rules, conversation state and only the relevant database facts are added for each request.
- **Folders:**
  - `app/`: main-site routes and API;
  - `components/`: UI;
  - `lib/`: domain logic shared by both apps;
  - `n-equals/`: the admin app, an npm workspace;
  - `prisma/`: schema, migrations and seed;
  - `scripts/`: deployment and administration scripts.

## Installation and setup

Requirements:

- Node.js 22 or later, with npm.
- PostgreSQL 16 (optional for a first look: without it the app runs with no food or price data).

```bash
npm install                  # also runs `prisma generate`
cp .env.example .env.local   # then fill in what you need (see Configuration)
npm run db:deploy            # apply migrations to DATABASE_URL
npm run db:seed              # load foods and price estimates (safe to re-run)
npm run dev                  # http://localhost:3000
```

To try the chat without an AI key, set `AI_PROVIDER=mock`. Replies are then canned.

To run the admin app:

```bash
npm run admin:secrets   # prints AI_CREDENTIALS_KEY and RATE_LIMIT_SECRET for .env.local
npm run admin:create    # creates the first administrator (super administrator by default)
npm run dev:admin       # http://localhost:3001
```

## Configuration

All variables are listed with comments in `.env.example`. Copy it to `.env.local`, which git ignores. Never commit real values. Only server code reads these variables; none reach the browser.

| Variables                                                                                                                                                             | Needed for                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_PROVIDER`                                                                                                                                                         | `gemini` (default), `claude` or `mock`                                                                                                 |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`                                                                                                             | Gemini replies; the fallback model is used when the main one is busy or out of quota                                                   |
| `CLAUDE_API_KEY`, `CLAUDE_MODEL`                                                                                                                                      | Claude replies                                                                                                                         |
| `DATABASE_URL`, `DIRECT_DATABASE_URL`                                                                                                                                 | PostgreSQL; the direct URL is used for migrations when the main one is pooled                                                          |
| `DATABASE_URL_TEST`                                                                                                                                                   | A separate test database (its name must contain `test`)                                                                                |
| `APP_URL`                                                                                                                                                             | The public site address, for email links, payment returns and Google sign-in                                                           |
| `RATE_LIMIT_SECRET`                                                                                                                                                   | Hashing client addresses in the rate-limit table                                                                                       |
| `AI_CREDENTIALS_KEY`                                                                                                                                                  | Encrypting AI keys saved in n-equals. Back it up and never change it once keys are saved                                               |
| `RESEND_API_KEY`, `EMAIL_FROM`                                                                                                                                        | Email (confirmation, password reset, notifications). Without them, development logs emails and production reports email as unavailable |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                                                                                            | Google sign-in (redirect URI `<APP_URL>/api/auth/google/callback`)                                                                     |
| `PAYSTACK_SECRET_KEY`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH`                                                                                           | Paid plans                                                                                                                             |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`                                                                                                | Nutritionist documents and photos, and the WhatsApp demo videos                                                                        |
| `CRON_SECRET`                                                                                                                                                         | Protecting the daily cron routes                                                                                                       |
| `NOMINATIM_URL`                                                                                                                                                       | An alternative OpenStreetMap place-search server (optional)                                                                            |
| `PRIVACY_CONTROLLER_NAME`, `PRIVACY_CONTACT_EMAIL`                                                                                                                    | The operator and contact shown on `/privacy` (required before launch)                                                                  |
| `CONTACT_EMAIL`, `SOCIAL_LINKS`                                                                                                                                       | Footer contact and social links                                                                                                        |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_HASH_SECRET`, `WHATSAPP_API_VERSION`                   | WhatsApp (webhook `<APP_URL>/api/whatsapp/webhook`)                                                                                    |
| `SPEECH_TO_TEXT_PROVIDERS`, `TEXT_TO_SPEECH_PROVIDER`, `OPENAI_API_KEY`, `GEMINI_TRANSCRIBE_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` | WhatsApp voice notes and spoken replies                                                                                                |
| `SIGN_LANGUAGE_PROVIDER`                                                                                                                                              | The sign-language demo source                                                                                                          |

Most product settings are not environment variables:

- feature flags, free-tier limits and the billing grace period are set in n-equals under **Settings**;
- what each plan unlocks is set under **Plans**;
- the active AI provider is set under **AI providers**.

## Available scripts

| Command                                                   | Purpose                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`                                             | Main site in development (port 3000)                                       |
| `npm run dev:admin`                                       | n-equals in development (port 3001)                                        |
| `npm run build` / `npm start`                             | Production build and server for the main site                              |
| `npm run build:admin`                                     | Production build of n-equals                                               |
| `npm run typecheck` / `npm run typecheck:admin`           | Generate route types, then TypeScript checks                               |
| `npm run lint`                                            | ESLint                                                                     |
| `npm run format` / `npm run format:check`                 | Prettier: write, or check only                                             |
| `npm test`, `npm run test:watch`, `npm run test:coverage` | Vitest (needs the local `tests/` folder)                                   |
| `npm run db:migrate`                                      | Create a migration in development                                          |
| `npm run db:deploy`                                       | Apply migrations                                                           |
| `npm run db:seed`                                         | Load foods and price estimates from `prisma/seed/*.json` (idempotent)      |
| `npm run vercel-build`                                    | The Vercel build: migrations and seed (production only), then `next build` |
| `npm run admin:secrets`                                   | Print new `AI_CREDENTIALS_KEY` and `RATE_LIMIT_SECRET` values              |
| `npm run admin:create`                                    | Create an administrator, or give an existing account an admin role         |
| `npm run whatsapp:setup`                                  | Set the WhatsApp command menu, ice breakers and business profile           |
| `npm run whatsapp:videos`                                 | Copy the two sign-language demo videos into Cloudinary and check them      |

These scripts are for maintainers only: their files are kept out of this repository (see [Repository contents](#repository-contents)), so they work only in a working copy that has them:

- `npm run dev:all`;
- `npm run test:db`;
- `npm run db:seed:demo`;
- `npm run eval:conversations`;
- `npm run demo:record` and `npm run demo:polish`.

`scripts/food-data/` and `scripts/price-data/` hold the Python builders and catalogues that produce `prisma/seed/foods.json` and `prisma/seed/prices.json`. Regenerate the seed files with them; never edit the files by hand.

## Deployment

The project deploys to Vercel as **two projects** from the same repository.

### Main site

`vercel.json` sets the build command to `npm run vercel-build` (`scripts/vercel-build.mjs`):

| Deployment        | Database step                                                                 | Then         |
| ----------------- | ----------------------------------------------------------------------------- | ------------ |
| Production        | `prisma migrate deploy`, then `prisma db seed` (`SEED_ON_DEPLOY=false` skips) | `next build` |
| Preview           | Skipped, unless `RUN_DB_MIGRATIONS=true` (only with a separate database)      | `next build` |
| No `DATABASE_URL` | Skipped with a warning                                                        | `next build` |

A failed migration or seed fails the deployment. The daily cron jobs in `vercel.json` do three things:

- delete expired conversations;
- send appointment reminders;
- clean up closed hospital conversations.

The cron routes need `CRON_SECRET`.

### n-equals

- A second Vercel project with root directory `n-equals`, its own domain and the same environment variables. Keep "Include files outside the Root Directory in the Build Step" on.
- Both projects install from the repository root with `npm install --include=dev`, because the build needs Prisma, TypeScript and Tailwind. Do not set `NODE_ENV` yourself in Vercel.
- `.vercelignore` keeps local builds and `.env` files out of CLI uploads.

### Before going live

- Use a paid AI tier.
- Verify the sending domain in Resend.
- Run real test-mode payments before using live keys.
- Have the safety rules and the privacy notice reviewed.
- Obtain the FAO licence for commercial use of the WAFCT data.

## Security and administration

### Authentication

- Accounts sign in with email and password (scrypt hashes) or Google.
- Sessions are stored in the database, and only a SHA-256 hash of each cookie token is kept.
- Main-site sessions last 30 days and renew as they are used. n-equals sessions end 8 hours after sign-in, and their cookie is `SameSite=Strict`.
- Email confirmation and password-reset links are one-time tokens; only their hash is stored, and a reset link expires after 1 hour.
- Changing or resetting a password ends every session of the account.
- Sign-in, sign-up and reset attempts are rate-limited per client address.

### Authorisation

- n-equals uses granular roles:
  - super administrator;
  - platform administrator;
  - nutritionist administrator;
  - vendor administrator;
  - hospital administrator;
  - support administrator;
  - finance administrator.
- Each role maps to permissions in `lib/auth/permissions.ts`.
- Every page and server action checks the permission on the server. The menu only hides what a role cannot use.
- The last super administrator cannot lose that role.
- Partner portals (nutritionist, vendor, hospital) check membership of their own organisation.

### n-equals sections

- **Overview:** platform figures (counts only).
- **Platform users:** search, suspend (ends all sessions) and delete accounts.
- **User activity** (`users.activity`: super, platform and support administrators):
  - one row per account: status, plan, joined, last active, and counts of saved chats, meal plans, bookings and hospital message threads;
  - summary figures for 24 hours, 7 days and 30 days;
  - search by name or email; filter by account type, status and activity window; sort by last active, joined, chats, plans or name;
  - shows counts and dates only, never what anyone wrote.
- **Administrators:**
  - grant and remove roles;
  - add administrators;
  - **reset another administrator's password** (`roles.manage`, super administrators only).
- **Partner review:** Nutritionists, Vendors and Hospitals.
- **Billing:** Plans and Subscriptions.
- **Configuration:** AI providers, Audio and Settings.
- **Audit log**, and **My profile** (name and own password change).

### Administrator password reset

1. The acting administrator chooses another administrator and confirms with their own password.
2. The target's password stops working at once, and the target is signed out of every session (main site and n-equals).
3. A one-time reset link, valid for 1 hour, is emailed to the target's own address.
4. The target chooses a new password through the main site's reset page. The usual password policy applies: at least 10 characters.

Nobody else sees or sets the new password. The link and token are never shown in n-equals. The action is rate-limited and recorded in the audit log, with IDs only.

The action is refused in four cases:

- email is not configured;
- the target is the actor's own account (use My profile instead);
- the target is not an administrator;
- the target is suspended.

### Other safeguards

- Input validation with Zod.
- Request size limits and rate limits on chat.
- Parameterised queries through Prisma.
- Safe error messages: no stack traces, provider errors or prompts are shown.
- Signed payment and WhatsApp webhooks.
- Request logs hold IDs, intent, timings and outcomes, never message text or health details.

## Privacy and data

`/privacy` explains to users, in plain language, what is stored and which AI services are in use.

- **Chats:** unsaved chats are deleted 2 hours after the last message. Saved chats are kept until the user deletes them, or until the plan's retention period passes.
- **WhatsApp:** contacts are stored as an HMAC of the phone number. Voice notes are never stored.
- **Admin activity monitoring:** reads counts and dates only.
- **Provider terms:** messages are sent to the active AI provider. Check that provider's data terms for your API tier before real users arrive.

## Roadmap and future improvements

**Confirmed before launch** (planned and needed):

- Deploy both apps, with hosted PostgreSQL and a paid AI tier.
- Professional review of the safety rules (pregnancy, child feeding, emergency signs, referrals).
- Legal review of the privacy notice against the NDPA 2023.
- FAO licence for commercial use of the food composition data.
- Live tests of Resend, Cloudinary, Paystack and Flutterwave in test mode, and of the newer AI providers against the safety prompts.
- Native-speaker review of Yorùbá and Igbo replies before removing the Beta label.
- WhatsApp: a permanent access token and live testing of voice replies (`OPENAI_API_KEY`).
- Monitoring and alerts on the logged error events.

**Known gaps:**

- Only 48 single foods have verified nutrition data. Common dishes (jollof rice, moi moi, egusi soup) have none.
- Several staples have no price estimate, because the source does not state their units (including rice, plantain, meat and fish).
- Prices are zone averages from May 2026 and need a regular refresh.
- Replies are not streamed.
- Food lookup matches named foods only: no pronouns, no misspellings, and at most 3 foods per message.
- Paid plans have only been tested with mocked provider responses.
- Sign language is a demonstration, not a translation.

**Possible future work** (not committed):

- Real sign-language translation (research stage).
- Server-generated voice.
- More Nigerian languages, such as Hausa.
- A curated dish database.
- Live market prices.
- Native apps.
- Richer usage analytics, such as trends per feature or an export of the User activity page.

## Repository contents

To keep the shared repository focused on the product, internal development resources are kept out of version control (see `.gitignore`):

- `docs/`: internal design notes, decision records and runbooks;
- `tests/`: the Vitest suites;
- `CLAUDE.md`, `.claude/` and `.playwright-mcp/`: assistant and browser-tool files;
- development-only scripts: the demo recorder, conversation evaluation, test database runner, combined dev runner and demo data seed.

These files exist only in maintainers' working copies. The GitHub Actions workflow skips the test step when `tests/` is absent; type checking, linting, formatting and the production build still run.
