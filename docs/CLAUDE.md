# Nutraboom Equals MVP — Claude Code Engineering Instructions

## 1. Project Overview

Build Nutraboom Equals, a conversational nutrition assistant focused initially on users in Nigeria.

The MVP consists of:

1. A single public home page.
2. A prominent chatbot launcher.
3. A conversational AI interface opened from the launcher.
4. Text-based interaction.
5. A nutrition assistant capable of:
   - Food and fruit nutrition information.
   - Simple personalized meal planning.
   - Budget-aware meal planning.
   - Asking the user what ingredients they already have.
   - Generating shopping suggestions.
6. A foundation for future voice input/output.
7. Strong nutrition-safety boundaries, particularly for:
   - Children under 5.
   - Pregnancy.
   - Medical conditions.
   - Food allergies.
8. A Nigerian/local-food-first approach.

The MVP should be intentionally small.

Do NOT build:

- Authentication.
- Payments.
- Social features.
- Admin dashboards.
- Mobile apps.
- Complex recommendation algorithms.
- Full clinical nutrition functionality.
- Automatic medical diagnosis.
- Complex user profiles.
- Production-scale analytics.

Exceptions (approved 2026-10-04 and 2026-10-08): the platform expansion is approved and built in phases (ADR-059 to ADR-063). Phase A is done:

- user accounts and in-house sign-in on the main site;
- the separate admin app `n-equals/` with granular admin roles, which replaces `/em/chat/settings`;
- subscriptions with an entitlement service and admin-configurable limits and feature flags;
- Paystack and Flutterwave payments (test mode until verified);
- Claude as an AI provider.

Phase B (nutritionist onboarding, verification, directory, chat suggestions, session requests and portal; ADR-064) is done. Phase C (the standalone Meal Planner at `/planner`, ADR-066) and email through Resend (ADR-065) are done. Phase D (vendors, verified products and sponsored recommendations, ADR-067) is done. Phase E (hospitals, appointments and the accessibility agent, ADR-068; browser-only speech with N-ATLaS registered as unavailable, ADR-069) is done. The brand refresh and public pages (ADR-070) and Google sign-in (ADR-071) are done, as are the global assistant (ADR-072), the demo seed (ADR-074), the account dashboard (ADR-075), the accessibility baseline (ADR-076, `docs/accessibility.md`), the n-equals users, administrators, profile, pagination and analytics update (ADR-080), the demo video generator (ADR-081, `docs/DEMO_README.md`), and the chat redesign, visual explanations, branded email, WhatsApp (`docs/whatsapp.md`) and listing diagnostics (ADR-082 to ADR-087), the demo tour with the infant-rule fix (ADR-088), separate partner portals with hospital self-registration and pending staff (ADR-089), and WhatsApp voice notes, spoken replies, the sign-language video demo and commands, with saved website chats and plan limits (ADR-090). Sign language (Signapse) is research only until approved (ADR-073, `docs/signapse-integration.md`). Chat stays usable without an account.

The architecture must, however, leave clean extension points for these features.

## 2. Primary Product Goal

The user should be able to open the website and immediately understand:

> "I can ask this assistant about food, meals, and my food budget."

The primary interaction should be conversational.

Example:

> **User:** I have ₦2,000. What can I cook tonight?
>
> **Assistant:** Absolutely. Let's make the most of your ₦2,000. What ingredients do you already have at home?

The assistant should ask only the information it actually needs. Avoid unnecessarily long forms.

## 3. Core MVP User Journeys

### Journey A — Food Information

User opens the application. User clicks the chatbot.

> **User:** What are the nutritional benefits of oranges?

Assistant gives concise nutritional information. The response should include:

- Food name.
- Typical serving size.
- Calories where available.
- Major nutrients.
- Relevant vitamins/minerals.
- Simple explanation.
- Optional follow-up question.

Example:

> An orange is a good source of vitamin C and also provides fiber and water.
>
> For a typical medium orange, it provides approximately:
>
> - 60 kcal
> - 3 g fiber
> - 70 mg vitamin C
>
> Values vary by size and variety.
>
> Would you like me to compare an orange with a banana?

Do not fabricate exact nutritional values. Nutrition data must come from the application's food database or an explicitly configured trusted source.

## 4. Journey B — Meal Planning

> **User:** Create a meal plan for my family.

Assistant should progressively collect relevant information. Possible conversation:

> **Assistant:** Sure. How many people are you planning for?
> **User:** Four.
> **Assistant:** What are their ages?
> **User:** Two adults, a 3-year-old and a 7-year-old.
> **Assistant:** Does anyone have food allergies or foods they need to avoid?
> **User:** My youngest is allergic to peanuts.
> **Assistant:** Thanks. What food do you already have at home?
> ...

The assistant then creates a meal plan. The system must not ask every possible question. Use progressive elicitation.

## 5. Journey C — Budget Planning

> **User:** I have ₦2,000. What can I eat today?

Assistant should NOT immediately spend the entire budget. It should first ask:

> What food do you already have at home?

Then:

> How many people are you feeding?

Then, where necessary:

> Are you planning for one meal or the whole day?

The assistant should use existing ingredients before recommending purchases. Output should include:

- Existing ingredients used.
- Recommended purchases.
- Estimated prices.
- Estimated total.
- Remaining budget.
- Meals that can be prepared.

Price information must be treated as estimates. Never represent an estimated price as a guaranteed current market price.

## 6. Journey D — Child Under 5

When the user asks:

> Create a meal plan for my 3-year-old.

The system must recognize this as a higher-sensitivity nutrition context. The assistant can provide general nutrition information and meal ideas, but:

- Avoid diagnosis.
- Avoid disease treatment.
- Avoid pretending to be a pediatrician.
- Avoid unsafe feeding recommendations.
- Avoid confidently asserting that a meal is medically appropriate for the individual child.
- Ask about allergies when relevant.
- Flag important medical circumstances for professional advice.

For concerning medical scenarios, recommend consulting an appropriately qualified healthcare professional.

## 7. Journey E — Pregnancy

When the user says:

> I'm pregnant. I'm in my first trimester. Make me a meal plan.

The assistant should:

1. Acknowledge pregnancy.
2. Ask relevant dietary questions.
3. Ask about allergies/restrictions.
4. Provide general nutrition information.
5. Avoid medical claims.
6. Identify when professional antenatal/dietitian advice is appropriate.

The system must not prescribe supplements or medication doses.

## 8. Conversation Design

The assistant should sound: warm, human, clear, non-judgmental, concise, practical, locally relevant.

Avoid:

- Robotic questionnaires.
- Excessive disclaimers.
- Unnecessary medical terminology.
- Long paragraphs.
- Repeating questions.
- Asking for information already provided.

Bad:

> Please provide age, gender, location, household size, budget, allergies, dietary restrictions, ingredients, food preferences, medical conditions...

Good:

> Absolutely. Who are we planning the meals for?

Then continue based on the answer.

## 9. LOOP Engineering Procedure

All implementation must follow the LOOP procedure.

### L — Locate

Before changing code:

1. Inspect the repository.
2. Identify the current framework.
3. Identify package manager.
4. Identify application entry points.
5. Identify existing components.
6. Identify existing tests.
7. Identify environment variables.
8. Identify database configuration.
9. Identify styling conventions.
10. Identify existing documentation.

Do not assume the repository is empty or follows a particular framework. If a decision is already established in the repository, preserve it unless there is a strong reason to change it.

### O — Outline

Before implementing a feature:

1. Define the smallest user-visible behavior.
2. Identify affected files.
3. Identify dependencies.
4. Identify data requirements.
5. Identify failure cases.
6. Identify safety implications.
7. Define acceptance criteria.
8. Define tests.

Write the plan before making broad changes. Do not implement unrelated improvements.

### O — Operate

Implement the smallest vertical slice. Preferred order:

1. UI.
2. Domain model.
3. Server/API boundary.
4. AI service.
5. Database/repository.
6. Validation.
7. Error handling.
8. Tests.

Avoid speculative abstractions. Prefer simple functions and explicit types.

### P — Prove

After every meaningful implementation step:

1. Run formatting.
2. Run type checking.
3. Run unit tests.
4. Run integration tests where applicable.
5. Build the application.
6. Manually verify the primary user journey.
7. Check error states.
8. Check safety-sensitive prompts.
9. Update documentation.

Never declare a feature complete solely because the code compiles.

### LOOP Completion Rule

Every feature is complete only when:

```text
Locate → Outline → Operate → Prove → Document → Next LOOP
```

If a test fails:

```text
Failure → Locate root cause → Outline smallest correction → Operate correction → Prove again
```

Do not patch symptoms repeatedly.

## 10. Engineering Principles

### Principle 1 — Server-side AI calls

Never expose an AI API key to the browser. The browser communicates with the application's server.

```text
Browser → Application API → AI Provider
```

### Principle 2 — Structured AI output

Whenever possible, AI responses should be represented using structured application data. For example:

```ts
type AssistantResponse = {
  message: string;
  intent: "food_information" | "meal_plan" | "budget_plan" | "clarification" | "safety";
  questions?: string[];
  foods?: FoodReference[];
  meals?: MealSuggestion[];
  budget?: BudgetSummary;
  safetyNotice?: string;
};
```

Do not rely exclusively on parsing arbitrary natural-language AI output.

## 11. AI Responsibilities

The AI is responsible for: intent detection, conversational questioning, personalization, explanation, meal-plan composition, ingredient substitution suggestions, conversational tone.

The AI is NOT the source of truth for: nutrition database values, prices, mathematical calculations, application state, safety policies. Those should be handled by deterministic application code or trusted data sources.

## 12. Nutrition Calculation Rules

Never ask the LLM to perform important financial or nutritional arithmetic when deterministic code can do it. For example:

```ts
calculateBudget(items);
calculateRemainingBudget(budget, total);
calculateNutrition(ingredients, portions);
```

The AI may explain the result. The application calculates the result.

## 13. Food Database

MVP should include a seed dataset. Initial categories: fruits, vegetables, grains, legumes, eggs, meat, fish, dairy, tubers, common Nigerian foods.

Examples: orange, banana, apple, mango, pawpaw/papaya, watermelon, tomato, spinach, rice, beans, garri, yam, sweet potato, plantain, egg, chicken, sardine, milk.

Do not populate nutritional values from memory during implementation. Use a documented source and record provenance. Every nutrition record should ideally contain:

```text
source
source_url
source_version
retrieved_at
```

## 14. Price Data

MVP prices may use manually curated sample estimates. Price records should contain:

```text
food
unit
price
currency
location
source
effective_date
```

Currency defaults to NGN. Never claim that static seed prices represent current market prices. The UI should label estimates appropriately. Future versions may integrate live/local market pricing.

## 15. Chat Interface

The home page contains: brand/logo, short value proposition, minimal navigation, chatbot launcher. The launcher should be visually prominent.

```text
        Nutraboom Equals

 Understand food.
 Plan meals.
 Eat within your budget.

                    [ Ask Nutraboom Equals 💬 ]
```

Clicking the button opens the chatbot.

## 16. Chatbot UI Requirements

The chatbot should support: user messages, assistant messages, loading state, error state, retry, input field, send button, keyboard submit, suggested prompts, scroll-to-latest-message.

Suggested prompts:

- "What's the nutrition in an orange?"
- "Help me plan meals for my family."
- "I have ₦2,000. What can I cook?"
- "What can I make with rice and beans?"

## 17. Voice Architecture

Voice is a foundation feature, not the primary MVP requirement. Design the interface so a future microphone button can support:

```text
Microphone → Speech-to-text → Chat pipeline → Assistant response → Text-to-speech
```

Do not implement an expensive real-time voice infrastructure unless explicitly requested. The MVP should first establish the text conversation pipeline.

## 18. API Design

Suggested endpoints:

```text
POST /api/chat
GET  /api/foods
GET  /api/foods/:id
POST /api/meal-plans
POST /api/budget-plans
```

The MVP may consolidate functionality behind `/api/chat` if that keeps the implementation simple. Do not create APIs merely for architectural appearance.

## 19. Chat API

Request:

```ts
{
  conversationId?: string;
  message: string;
}
```

Response:

```ts
{
  conversationId: string;
  message: string;
  intent: string;
  metadata?: {
    meals?: unknown[];
    foods?: unknown[];
    budget?: unknown;
  };
}
```

As implemented: `metadata` carries `mealPlan` (a validated plan: days → meals → foods) in place of `meals`, `budget` (a shopping list priced by the app from NBS estimates), `outcome` (the structured result card, ADR-051), plus `foods` (data sources), `urgentNotice`, `safetyNotice` and `allergyNotice`. The request may also carry `language` (ADR-050). See `lib/conversation/types.ts`.

## 20. Conversation State

Conversation state should support:

```text
conversationId
messages
knownUserFacts
currentIntent
missingInformation
foodInventory
budget
safetyContext
```

Known facts must not be repeatedly requested. Example: if the user already says "I'm feeding my 3-year-old.", do not ask "What age is the child?" again in the same conversation.

## 21. Intent Model

```ts
type Intent =
  | "food_information"
  | "meal_planning"
  | "budget_planning"
  | "shopping_list"
  | "food_substitution"
  | "general_nutrition"
  | "safety_sensitive"
  | "unknown";
```

## 22. Safety Policy

The assistant must not:

- Diagnose illness.
- Prescribe medication.
- Recommend medication dosages.
- Claim to replace medical professionals.
- Guarantee medical outcomes.
- Make unsafe claims about pregnancy.
- Give unsafe infant-feeding instructions.
- Ignore declared allergies.

Medication literacy is allowed (ADR-055): the assistant may explain instructions the user has already received and repeat a dose exactly as the user stated it, but never suggest, change or judge a dose or medicine.

The assistant should recognize high-risk contexts:

```text
pregnancy
child_under_5
infant
severe allergy
diabetes
kidney disease
eating disorder
malnutrition
medication interaction
```

## 23. Allergy Rule

If the user declares an allergy:

1. Store it in conversation state.
2. Never recommend that ingredient.
3. Check substitutions against the allergy list.
4. Make the exclusion visible where useful.

Example: "I left peanuts out because you mentioned a peanut allergy."

Do not assume that an ingredient is safe merely because the AI believes it is uncommon.

## 24. Prompt Architecture

Do not create one enormous prompt containing all application logic. Use layers:

```text
SYSTEM POLICY
+ NUTRITION SAFETY POLICY
+ CONVERSATION RULES
+ CURRENT USER CONTEXT
+ RELEVANT DATABASE FACTS
+ CURRENT USER MESSAGE
```

The application should inject only relevant context.

## 25. Recommended System Prompt Behavior

The assistant should:

1. Understand the user's goal.
2. Identify missing high-value information.
3. Ask one useful question at a time.
4. Use available data.
5. Never fabricate nutrition values.
6. Never fabricate prices.
7. Distinguish estimates from verified values.
8. Respect allergies.
9. Handle sensitive contexts conservatively.
10. Be conversational.
11. Keep answers practical.
12. Suggest professional advice where appropriate.

## 26. Database Rules

Use migrations. Never modify production-like schema manually. Every schema change must be reproducible. Seed data must be deterministic. Tests should be able to create an isolated database.

## 27. Error Handling

If the AI provider fails:

> I'm having trouble connecting right now. Please try again in a moment.

Do not expose: API keys, stack traces, internal prompts, provider errors, database credentials.

## 28. Observability

At MVP level, log: request ID, conversation ID, intent, AI latency, success/failure, error category.

Do not log unnecessary personal or sensitive user information. Do not store raw conversations indefinitely without a defined privacy requirement.

## 29. Security

Required: server-side secrets, input validation, request size limits, rate limiting, safe error responses, SQL injection protection through ORM/parameterized queries, output escaping, no API secrets in frontend code.

## 30. Testing Strategy

**Unit:** budget calculation, remaining budget, nutrition aggregation, allergy filtering, intent parsing, meal-plan validation.

**Integration:** chat API, food lookup, meal-plan flow, budget flow.

**UI:** home page loads, chat launcher opens, message can be submitted, assistant response appears, error state works.

**Safety:** test prompts involving pregnancy, child under 5, allergies, medical conditions, medication, infant feeding.

## 31. Definition of Done

A feature is not done until:

- Type checking passes.
- Lint passes.
- Tests pass.
- Production build passes.
- Primary user journey works.
- Error states work.
- Accessibility basics are satisfied.
- Safety behavior has been tested.
- Documentation is updated.

## 32. Implementation Order

- **Phase 1:** project setup, home page, chat launcher, chat modal/panel, basic chat API.
- **Phase 2:** food database, food lookup, nutrition responses.
- **Phase 3:** meal planning, conversational clarification, meal-plan output.
- **Phase 4:** budget planning, existing-home-inventory flow, price estimates, shopping list.
- **Phase 5:** safety layer, child/pregnancy handling, allergy filtering.
- **Phase 6:** testing, error handling, accessibility, performance, documentation.
- **Phase 7:** voice foundation.

Do not begin Phase 7 until the text experience is stable.

## 33. Claude Operating Rules

When working on this repository:

- Read `docs/CLAUDE.md` first (the root `CLAUDE.md` only imports it).
- Read `docs/project_status.md` to see what is built and what is left.
- Read `docs/project_requirements.md`.
- Read `docs/architecture.md`.
- Read `docs/decisions.md`.
- Inspect the repository before editing.
- Follow LOOP.
- Make small changes.
- Test every meaningful change.
- Do not rewrite working code unnecessarily.
- Do not introduce dependencies without justification.
- Update `docs/decisions.md` when an architectural decision changes.
- Update `docs/project_status.md` when a feature is finished or scope changes.
- Update requirements when scope changes.
- Keep implementation aligned with MVP scope.

If a requirement conflicts with an existing decision, stop and resolve the conflict explicitly rather than silently choosing.

## 34. Commands

```bash
npm run dev          # start dev server (http://localhost:3000)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier --write
npm test             # vitest (unit, integration, UI, safety)
npm run test:db      # PostgreSQL integration tests on <db>_test
npm run test:coverage # tests with a coverage report
npm run build        # production build
npm run db:deploy    # apply Prisma migrations
npm run db:seed      # load foods and prices from prisma/seed/*.json
npm run db:seed:demo # sample nutritionists, vendors, hospitals and plans (ADR-074; not for production)
npm run vercel-build # Vercel build: migrate + seed (production only), then next build
npm run admin:secrets # AI_CREDENTIALS_KEY and RATE_LIMIT_SECRET
npm run admin:create # create an administrator account for n-equals
npm run dev:admin    # n-equals admin app (http://localhost:3001)
npm run dev:all      # both together, with labelled output (Ctrl+C stops both)
npm run typecheck:admin && npm run build:admin # check and build n-equals
npm run eval:conversations # live conversation-quality evaluation (docs/conversation-evaluation.md)
npm run demo:record  # Playwright product demo video (docs/DEMO_README.md)
npm run demo:polish  # captioned, chaptered MP4 from the latest recording (needs ffmpeg)
npm run whatsapp:setup  # WhatsApp command menu, ice breakers and business profile (ADR-090)
npm run whatsapp:videos # copy the two WhatsApp sign-language demo videos into Cloudinary
```

Environment variables are documented in `.env.example`. Copy it to `.env.local`.

Never edit `prisma/seed/foods.json` or `prisma/seed/prices.json` by hand; see `docs/food-data.md` and `docs/price-data.md`.

All documentation lives in `docs/`, except `README.md`, the project's entry point, which is at the root. Keep the root `CLAUDE.md` as it is: Claude Code loads it from the root, and `next dev` maintains its agent-rules block (removing the root file would make `next dev` recreate `AGENTS.md` and `CLAUDE.md`).
