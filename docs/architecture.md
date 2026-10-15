# Nutraboom Equals MVP — Architecture

## 1. Architectural Goal

Use a simple architecture that allows the MVP to ship quickly while maintaining clear boundaries between: UI, conversation orchestration, AI, nutrition data, pricing, business logic, safety.

Avoid premature microservices. The MVP should be a modular monolith.

## 2. High-Level Architecture

```text
┌───────────────────────────────────────────────┐
│                  Browser                      │
│                                               │
│  Home Page                                    │
│       │                                       │
│       ▼                                       │
│  Chat Launcher                                │
│       │                                       │
│       ▼                                       │
│  Chat UI                                      │
└───────────────────┬───────────────────────────┘
                    │
                    │ HTTPS
                    ▼
┌───────────────────────────────────────────────┐
│              Application Server               │
│                                               │
│  Chat API                                     │
│       │                                       │
│       ▼                                       │
│  Conversation Orchestrator                    │
│       │                                       │
│  ┌────┼─────────────┬───────────────┐         │
│  │    │             │               │         │
│  ▼    ▼             ▼               ▼         │
│Intent Safety    Nutrition       Budget        │
│      Engine      Service        Service       │
│  │    │             │               │         │
│  └────┴─────────────┴───────────────┘         │
│                    │                          │
│                    ▼                          │
│               AI Provider                     │
│                                               │
│                    │                          │
│                    ▼                          │
│               Data Layer                      │
└────────────────────┬──────────────────────────┘
                     │
                     ▼
              PostgreSQL/DB
```

## 3. Frontend

The frontend contains:

```text
HomePage
ChatLauncher
ChatPanel
MessageList
MessageBubble
ChatInput
SuggestedPrompts
LoadingIndicator
ErrorMessage
```

Keep UI components presentational where possible. Business logic should not be duplicated in components.

## 4. Chat State

Client state:

```ts
type ChatState = {
  conversationId?: string;
  messages: Message[];
  isLoading: boolean;
  error?: string;
};
```

Server owns authoritative conversation interpretation.

## 5. Backend Layers

### API Layer

Responsible for: authentication if added later, input validation, rate limiting, request/response formatting.

### Conversation Layer

Responsible for: current intent, missing information, conversation state, routing, context construction.

### Domain Layer

Responsible for deterministic operations. Examples:

```text
BudgetService
NutritionService
MealPlanService
SafetyService
FoodService
```

### AI Layer

Responsible for: calling model provider, prompt construction, structured output parsing, retry behavior, provider abstraction.

```ts
interface AIProvider {
  generateResponse(request: AIRequest): Promise<AIResponse>;
}
```

This prevents the application from becoming tightly coupled to a single AI provider.

## 6. Nutrition Service

Responsibilities:

```text
findFood()
getNutrition()
searchFoods()
calculateNutrition()
```

The AI receives verified data from this service.

```text
User: "What is the nutrition in an orange?"
  ↓ Intent detection
  ↓ NutritionService
  ↓ Orange nutrition record
  ↓ AI explanation
  ↓ User
```

## 7. Budget Service

Responsibilities:

```text
validateBudget()
getEstimatedPrice()
calculateShoppingTotal()
calculateRemainingBudget()
```

```text
budget = ₦2,000
items:
  egg = ₦500
  vegetables = ₦300
total = ₦800
remaining = ₦1,200
```

The calculation is deterministic.

## 8. Safety Service

The safety service should run before final recommendations are presented.

```ts
validateMealPlan({ meals, allergies, restrictions, safetyContext });
```

Possible result:

```ts
{
  safe: false,
  reasons: ["Contains declared allergen: peanut"]
}
```

The AI should not be the only safety mechanism.

## 9. Prompt Pipeline

```text
User Message
  ↓ Intent Detection
  ↓ Context Extraction
  ↓ Relevant Data Retrieval
  ↓ Safety Context
  ↓ Prompt Builder
  ↓ AI Provider
  ↓ Structured Response
  ↓ Domain Validation
  ↓ Final Response
```

## 10. Context Assembly

Do not send the entire database to the model.

- **Food information:** user request + specific food record + conversation context.
- **Budget planning:** user request + budget + existing ingredients + household size + relevant food prices + meal constraints.
- **Child meal planning:** age + allergies + food preferences + available ingredients + relevant nutrition information + safety policy.

## 11. Directory Structure

As implemented (Next.js App Router, no `src/`):

```text
/
├── app/
│   ├── page.tsx                 # Home page
│   ├── layout.tsx
│   ├── globals.css
│   ├── (account)/               # Sign-up, sign-in, password reset, email confirmation, account + plan (ADR-061, ADR-063)
│   ├── nutritionist/            # Nutritionist portal and onboarding (ADR-064)
│   ├── nutritionists/           # Public directory, profiles, session requests (ADR-064)
│   ├── planner/                 # Meal Planner: conversation, plans, weeks (ADR-066)
│   ├── vendor/                  # Vendor portal and onboarding (ADR-067)
│   ├── products/                # Product directory, product pages, counted shop links (ADR-067)
│   ├── hospital/                # Hospital portal and onboarding (ADR-068)
│   ├── hospitals/               # Hospital directory, booking, patient conversations (ADR-068)
│   ├── about/, for-nutritionists/, for-vendors/ # Public landing pages (ADR-070)
│   ├── api/
│   │   ├── chat/route.ts        # POST /api/chat
│   │   ├── webhooks/[provider]/ # POST Paystack / Flutterwave webhooks (ADR-063)
│   │   ├── auth/google/         # Continue with Google: start and callback (ADR-071)
│   │   ├── access-conversations/[id]/ # GET new conversation messages, polled (ADR-068)
│   │   └── cron/hospitals/      # Daily reminders and 90-day deletion, CRON_SECRET (ADR-068)
│   └── privacy/                 # Privacy notice (ADR-053)
│
├── components/
│   ├── home/                    # HomePage sections
│   ├── chat/                    # ChatLauncher, ChatPanel, MessageList, ...
│   ├── account/                 # Account and billing forms, Google button
│   ├── site/                    # Header, footer, logo, icons, marketing sections (ADR-070)
│   └── ui/                      # Shared design-system primitives, used by both apps (ADR-060)
│
├── lib/
│   ├── ai/                      # AIProvider interface, Gemini, OpenAI-compatible and mock providers, prompts
│   │   └── settings/            # Saved AI configurations: encryption, verification, lifecycle, active resolver
│   ├── admin/                   # scrypt password hashing (used by lib/auth)
│   ├── auth/                    # Accounts, sessions, admin roles and permissions (ADR-061)
│   ├── billing/                 # Entitlement registry, EntitlementService, platform settings (ADR-062)
│   ├── payments/                # Paystack, Flutterwave, billing processor (ADR-063)
│   ├── nutritionists/           # Profiles, availability, matching, analysis, directory (ADR-064)
│   ├── storage/                 # Cloudinary storage and upload checks (ADR-064)
│   ├── planner/                 # Planner facts, intake, generation, nutrition, shopping (ADR-066)
│   ├── vendors/                 # Product rules, recommendation engine, directory, stats (ADR-067)
│   ├── hospitals/               # Accessibility vocabulary, slots, directory, routing agent, portal access (ADR-068)
│   ├── geo/                     # Distance and OpenStreetMap Nominatim lookup with cache (ADR-068)
│   ├── notifications.ts         # In-app notifications (+ email when configured)
│   ├── email/                   # Email sender (logs in development; none in production yet)
│   ├── audit.ts                 # Platform audit log
│   ├── i18n/                    # Reply languages (ADR-050)
│   ├── outcome/                 # Outcome card builder: titles, meal costs, nutrition focus (ADR-051)
│   ├── xeelaa/                  # XEELAA client, integration service (ADR-052)
│   ├── conversation/            # Types, in-memory store, orchestrator
│   ├── validation/              # Zod request/response schemas
│   ├── http/                    # Rate limiting, request IDs
│   ├── nutrition/               # Alias matching, nutrient maths, repositories, NutritionService
│   ├── budget/                  # Regions, price repository, costing, money checks, budget summary
│   ├── meals/                   # Meal plan schema (structured AI output) and helpers
│   └── safety/                  # Allergen vocabulary, allergy detection and reply validation
│
├── prisma/                      # schema.prisma, migrations/, seed.ts, seed/foods.json (generated)
├── scripts/food-data/           # Builds foods.json from FAO WAFCT 2019 + USDA SR Legacy
├── scripts/price-data/          # Builds prices.json from the NBS Selected Food Price Watch
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── ui/
│   └── safety/
│
├── public/
├── CLAUDE.md                    # imports docs/CLAUDE.md (must stay at the root)
├── README.md                    # project entry point: setup, scripts, deployment
└── docs/
    ├── CLAUDE.md
    ├── project_status.md
    ├── project_requirements.md
    ├── architecture.md
    ├── decisions.md
    ├── food-data.md
    └── price-data.md
```

## 12. Data Flow — Food Question

```text
User → Chat UI → POST /api/chat → Conversation Orchestrator → Intent = food_information
  → FoodService → Nutrition record → Prompt Builder → AI → Response validation → Chat UI
```

## 13. Data Flow — Budget Question

```text
User: "I have ₦2,000"
  → Conversation Orchestrator → Intent = budget_planning → Ask for existing ingredients
  → User provides ingredients → BudgetService → Price data → MealPlanService
  → Candidate meals → Safety validation → AI explanation → User
```

## 14. Data Flow — Voice Future

Voice should use the existing chat API.

```text
Microphone → Speech-to-text → Text → POST /api/chat → Normal chat pipeline
  → Text response → Text-to-speech → Audio
```

No separate nutrition engine should be created for voice.

## 15. Deployment Architecture

```text
CDN / Hosting
      │
      ▼
Web Application
      ├──── AI Provider
      └──── Database
```

No Kubernetes or microservices are required for MVP.

## 16. Scaling Path

If usage grows:

```text
Modular Monolith
  → Queue background jobs
  → Cache nutrition data
  → Cache common food queries
  → Separate AI service if necessary
  → Separate recommendation service if necessary
```

Do not implement this before it is needed.

## 17. Phase 1 Implementation Notes

- **AI provider selection:** `lib/ai/index.ts` returns a provider based on `AI_PROVIDER` (`gemini` | `mock`). Adding a provider means one new file implementing `AIProvider` plus one `case` in the factory. No other code changes.
- **Structured output:** the Gemini provider requests JSON constrained by a JSON schema. The result is validated with Zod (`lib/validation/assistant.ts`) before use. Invalid output is treated as a provider failure.
- **Conversation state:** originally in memory; now stored in PostgreSQL (`lib/conversation/prisma-store.ts`, ADR-039) with a 2-hour expiry and a message cap. The in-memory store remains for tests and local runs without a database.
- **Rate limiting:** in-memory fixed window per client IP. It has the same single-instance limitation.

## 18. Phase 2 Implementation Notes

- **Food lookup flow:** `NutritionService.findFoodsInMessage` loads aliases (cached for 10 minutes), matches up to 3 foods in the user message (`lib/nutrition/match.ts`), then loads their records through a `FoodRepository` (`PrismaFoodRepository` in the app, `InMemoryFoodRepository` in tests).
- **Context assembly:** for each matched food, `formatFoodFacts` writes one VERIFIED DATA line with per-serving values (calculated in code) and per-100 g values. Only matched foods are sent to the model (§10).
- **Response:** `metadata.foods` lists the foods used, with their nutrient and serving sources. The chat UI shows these as source links under the reply.
- **Database access:** `lib/db.ts` creates the Prisma client lazily with the `@prisma/adapter-pg` driver adapter (Prisma 7). The generated client lives in `lib/generated/prisma` (git-ignored, created by `postinstall`).

## 19. Allergy Enforcement (brought forward from Phase 5)

```text
User message
  ↓ detectDeclaredAllergies → merged into Conversation.allergies (persists for the conversation)
  ↓ findConflictingMentions (e.g. "we have groundnut oil")
  ↓ Prompt: CURRENT USER CONTEXT layer lists exclusions and conflicts
  ↓ AI reply (message + recommendedFoods)
  ↓ validateReply ── violation ──► regenerate once with CORRECTION ── still failing ──► fixed safe fallback
  ↓ allergyNotice written by the app
  ↓ Response (metadata.allergyNotice)
```

The allergy check depends only on `lib/safety/allergens.ts`, never on the database or the model.

## 20. Meal Planning (Phase 3)

```text
User message
  ↓ Conversation.profile (known facts) + allergies + safety context (infant / under 5 / pregnant)
  ↓ Prompt: known facts ("never ask again"), what is still missing (computed in code), safety context
  ↓ AI reply: message + profileUpdate + optional mealPlan
  ↓ checkReply: allergies, foods to avoid, child-feeding rules, plan shape
  ↓   (fail → regenerate once with CORRECTION → fail → safe fallback)
  ↓ profile merged and stored; mealPlan returned in metadata and rendered by MealPlanCard
```

## 21. Budget Planning (Phase 4)

```text
User message
  ↓ detectBudget / detectState (code) → profile.budgetNaira, profile.state → zone
  ↓ PriceService.priceBook(zone) → VERIFIED DATA price lines (estimates, month, region)
  ↓ Prompt: budget guidance (food at home → people → meal period), price facts
  ↓ AI reply: message + shoppingList (item, quantity) + fromHome
  ↓ checks: allergies on shopping items, unverified ₦ amounts, shown total ≤ budget
  ↓   (fail → regenerate once → fail → safe fallback)
  ↓ buildBudgetSummary (code): lines, unpriced, total, remaining → metadata.budget → BudgetCard
```

## 22. Safety Layer (Phase 5)

```text
User message
  ↓ detect (code): allergies, pregnancy/trimester, breastfeeding, conditions, medication, red flags
  ↓ profile + safety context → prompt (CURRENT USER CONTEXT; URGENT line when red flags)
  ↓ AI reply
  ↓ checkReply (allergies, avoid foods, child rules) + checkMedicalRules (doses, medication changes,
  ↓   pregnancy foods, under-6-months) + budget checks → regenerate once → safe fallback
  ↓ notices (code): urgentNotice for red flags; first-time referral per sensitive situation
```

Every rule here runs without the model and without the database.

## 23. Voice Foundation (Phase 7)

```text
🎤 button → SpeechToText (BrowserSpeechToText: Web Speech API, en-NG)
  → transcript placed in the message box (user reviews and edits)
  → Send → sendMessage(text) → POST /api/chat (unchanged pipeline, all safety checks)
  → reply → speechForReply (urgent notice first, ₦ → "naira")
  → TextToSpeech (BrowserTextToSpeech: speechSynthesis)
```

Replace `BrowserSpeechToText` with a server-backed implementation of `SpeechToText` to change recognition without touching the chat.

Every reply also has a **Listen** button (ADR-045): `MessageBubble` → `onListen(message)` → `useVoice.speak(speechForReply(message), message.id)`. Server-generated voice is proposed as a `ServerTextToSpeech` behind the same `TextToSpeech` interface, backed by `POST /api/speech` (ADR-046, not built).

## 24. AI Provider Settings (ADR-047, ADR-060)

```text
Administrator → n-equals /ai (server component; requires the "ai.manage" permission)
  → server actions (each calls asAdmin("ai.manage")) → AISettingsService
       add: format check → verifyCredential (one tiny request) → AES-256-GCM encrypt → store + audit
       activate / deactivate / revoke / re-check / change model → transaction + audit
       → onActiveChanged → resolver cache cleared on this instance

POST /api/chat → getChatProvider()
  → ActiveProviderResolver (30 s cache per instance)
       active config? decrypt key → createProvider(gemini | claude | openai | deepseek)
       none, or lookup failed → getAIProvider() from environment variables (unchanged)
  → handleChat (same prompts, parsing and safety checks for every provider)
```

Tables: `AIProviderConfig` (encrypted key, masked hint, fingerprint, status, dates), `AIActiveConfig` (single row, `CHECK (id = 1)`), `AIConfigAuditEvent` (metadata only). The browser only ever receives masked hints and fixed status messages.

## 25. Outcome, Language and XEELAA (ADR-049 to ADR-052)

```text
Settings (⚙, browser storage) → language → POST /api/chat { message, language }
  → prompt: + OUTCOME RULES + language layer (non-English: englishMessage required)
  → checks read message + englishMessage
  → buildOutcome (code): title/subtitle, mealCosts (shoppingList.forMeal), nutritionFocus
       (top-quarter foods in our data), foodFacts (per serving) → metadata.outcome
  → UI: OutcomeCard first, then the model's short text; Listen reads urgent notice,
       card summary (English only), text

getChatProvider(): base = active saved config or env (ADR-047)
  XEELAA on + verified key? → FallbackProvider(XeelaaProvider, base)
       XEELAA fails → log ai_primary_fallback → base answers; skip XEELAA 60 s
       401/403 → key marked invalid → admin page shows "Key not working"
```

## 26. Platform Foundation (ADR-059 to ADR-063)

```text
Main site (/)                         n-equals (separate Next.js app, own domain)
  /sign-up, /sign-in, /account          /sign-in → Users & roles, Plans, Subscriptions,
  cookie nbe_session (30 d, sliding)      AI providers, Settings, Audit log
        │                                cookie ne_admin_session (8 h, Strict)
        └──────────────┬───────────────────────┘
                       ▼
     lib/auth  AuthService → Session (token hash) → User, AdminRoleAssignment
               permissions.ts: role → permissions; requireAdmin(permission) in every page/action
     lib/billing  EntitlementService: free tier (defaults + PlatformSetting) ⊕ counting subscriptions
                  usage: UsageCounter, one atomic INSERT … ON CONFLICT … WHERE count < limit
     lib/payments  PaymentProvider (Paystack | Flutterwave) → BillingProcessor → Subscription
     lib/audit  AuditLog (metadata only)
```

Checkout and renewal:

```text
/account → startCheckoutAction → Subscription(pending, reference) → provider hosted page
  → /account/billing/return?reference|tx_ref → provider.verify(reference) → amount/currency check
  → activatePending (only while pending) → active for one interval

Provider → POST /api/webhooks/{provider}
  → signature check (HMAC-SHA512 | verif-hash) → PaymentEvent(body hash) once
  → payment.succeeded: our reference → confirm checkout; else renewal → verify → extend once per reference
  → subscription.created: store subscription code + email token (Paystack)
  → payment.failed → past_due + grace;  subscription.canceled → cancelAtPeriodEnd
  → failure: delete PaymentEvent, answer 500 (provider retries)
```

## 27. Nutritionists (ADR-064)

```text
Nutritionist → /nutritionist/join → profile, qualifications, documents (Cloudinary private), availability
  → submit → status submitted → runQualificationAnalysis
       deterministicChecks(profile)  +  provider.generateJson(schema) → Zod → QualificationAnalysis
  → n-equals /nutritionists/[id] (nutritionists.verify): documents via signed 5-min links (audited)
       approve | request changes | reject | suspend | reinstate → Notification + AuditLog

Listed = flag "nutritionists" ∧ user active ∧ status verified ∧ entitlement nutritionist.listing
Directory /nutritionists → findNutritionists(query) → rankCandidates (deterministic) → cards

Chat turn → new referral category (pregnancy, child, condition) or "dietitian/nutritionist", no emergency
  → deps.nutritionists({specializations, state}) → up to 3 cards in metadata.nutritionists

/nutritionists/[id] (signed in) → requestAppointmentAction: within availability (Lagos time), ≥2 h, ≤60 days
  → Appointment(requested) → nutritionist accepts/declines/completes → Notification to client
```

## 28. Meal Planner (ADR-066)

```text
/planner (signed in, flag "mealPlanner") → startSessionAction → PlannerSession
/planner/session/[id] → plannerTurnAction (one AI call)
  mergeFacts(app detection + AI reading) → planBlockers? → app text, status blocked
  missingTopics(facts) → [objective, members, allergies, budget|weightGoal, extras] → AI asks the first
  none missing → status ready → durations cut by mealPlanner.maxDays
createPlanAction → consume mealPlans → MealPlan → writeWeek(0) (refund on failure)
writeWeek → generateDays: 2-day chunks in parallel (staple rotation, 60 s each)
  → schema + required meals + checkReply/checkMedicalRules → retry once → refuse
  → dayNutrition (food DB, plausible grams only) + buildShoppingList (NBS estimates, convertible units)
/planner/[id] → next week | rewrite week (feedback) | replace meal  (mealPlanner.adjustmentsPerWeek)
```

## 29. Vendors and Sponsored Products (ADR-067)

```text
/vendor/join → Organization(kind vendor) + Membership(owner) + VendorProfile(draft)
/vendor/products → Product(draft) → productProblems (claims, breast-milk substitutes, missing) → submitted
n-equals /vendors/[id] (vendors.verify) → approve | changes | reject | suspend → Notification + AuditLog

Listed = flag "vendors" ∧ product verified ∧ VendorProfile verified ∧ org entitlement vendor.listing
recommend(candidates, {terms, allergies, avoidFoods, infant, childUnder5, pregnant, state})
  → term match → allergen + checkReply filters → in stock → state > online > anywhere → one per food
Chat turn (reply foods, shopping, plan) → metadata.products (≤2, never in an emergency)
Meal Planner week (ingredients) → ≤3 products under the shopping list
/products, /products/[id] (view counted) → /products/[id]/go/[i] (click counted, https only) → shop
ProductStat(productId, day): impressions, views, clicks only
```

## 30. Hospitals and the Accessibility Agent (ADR-068, ADR-069)

```text
/hospital/join → Organization(kind hospital) + Membership(owner) + HospitalProfile(draft)
/hospital/profile → details + accessibility; location = geocode(address) | device position (inside Nigeria)
/hospital/departments → HospitalDepartment(availability, slotMinutes, capacity)
/hospital/staff → Membership(role admin|doctor|nurse|staff, departmentIds)   (hospital.maxStaff)
n-equals /hospitals/[id] (hospitals.verify) → approve | changes | reject | suspend → Notification + AuditLog

Listed = flag "hospitals" ∧ HospitalProfile verified ∧ org entitlement hospital.listing
/hospitals?place|latitude,longitude&radius → geocode (GeocodeCache, 1 req/s) → haversine ≤ radius → by distance
/hospitals/[id]?department&date → openDates → slotsForDay(windows, slot, capacity, booked, now)
  → bookAppointmentAction (consent, needs) → Serializable recheck → HospitalAppointment → notify patient + staff

Patient message → routeMessage(text, departments, provider)
  detectRedFlags → urgent (112 reply, all roles)          [code decides]
  generateJson → category, departmentId ∈ list, needsDoctor, summary, reply
  reply mentions medicine/dose → fixed reply; no provider/failure → rules only
  → AccessConversation + AccessMessage → notifyStaff(role, department)
Both sides poll GET /api/access-conversations/[id]?after= every 5 s
Close → deleteAfter = closedAt + 90 days; daily cron deletes; patient can delete now
Speech: browser STT (reviewed before sending) and TTS; audio.providers setting (N-ATLaS unavailable)
```

## 31. Public Site and Google Sign-in (ADR-070, ADR-071)

```text
SiteFrame (sync: static pages) / SiteShell (async: reads session) → SiteHeader + <main id="main"> + SiteFooter
Directories with their feature off → ComingSoon (not 404)
/api/auth/google?next → state, verifier, nonce in cookie nbe_google (10 min, httpOnly, Lax, path /api/auth/google)
  → accounts.google.com (code, S256 challenge) → /api/auth/google/callback?code&state
  → state check → token endpoint (code_verifier, client secret) → ID token claims (iss, aud, exp, nonce)
  → AuthService.signInWithOAuth: OAuthAccount(sub) → user | verified email → link (unconfirmed: drop password + sessions) | create
  → session cookie → next
```

## 32. Global Assistant, Session State and Dashboard (ADR-072, ADR-075)

```text
app/layout.tsx → GlobalAssistant (ChatProvider + ChatPanel + floating launcher) → every page
SiteHeader(signedIn?) → server answer (SiteShell session) | useSessionStatus → GET /api/session (mount, focus, pageshow)
  unknown → empty slot; signedIn → "Your account"; signedOut → "Log in" + "Sign up"
app/(account)/(auth)/… sign-in, sign-up, password pages (narrow)
app/(account)/account/layout.tsx (session check) → Overview | meal-plans | nutritionists | plan | profile
PlannerHome (shared by /planner and /account/meal-plans) → MealPlan/PlannerSession where userId = session user
/planner → intro for everyone; CTA → /sign-up?next=/planner when signed out
scripts/seed-demo.ts → lib/demo/seed.ts (upserts demo-* ids; plans create-only by code)
```
