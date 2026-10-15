# Nutraboom Equals MVP — Project Requirements

## 1. Product Definition

Nutraboom Equals is a conversational nutrition assistant. The MVP allows users to:

1. Ask about food nutrition.
2. Generate meal plans.
3. Plan meals around a budget.
4. Tell the assistant what food they already have.
5. Receive meal and shopping suggestions.
6. Interact naturally through a chat interface.

The MVP starts with text. The application architecture should support voice in a future iteration.

## 2. Target Users

Primary:

- Adults looking for everyday nutrition information.
- Parents planning family meals.
- People trying to eat within a fixed budget.
- Users interested in Nigerian/local foods.

Secondary:

- Pregnant users seeking general nutrition information.
- Caregivers planning meals for young children.

The product must not position itself as a clinical nutrition service.

## 3. MVP Scope

### In Scope

**Home Page**

- Single-page landing experience.
- Application branding.
- Product description.
- Chatbot CTA.
- Responsive design.

**Chatbot**

- Open/close.
- User input.
- Assistant responses.
- Conversation history during session.
- Loading state.
- Error state.
- Suggested prompts.

**Food Information**

Users can ask:

- What nutrients are in an orange?
- Is banana nutritious?
- What is the nutritional value of beans?
- What are good sources of iron?

**Meal Planning**

Users can request: daily meal plans, weekly meal plans, family meal plans, child meal ideas, pregnancy meal ideas. The assistant should ask relevant clarifying questions.

**Budget Planning**

Users can specify: budget, household size, existing ingredients, meal period.

The assistant produces: meal suggestions, shopping suggestions, estimated cost, remaining budget.

**Food Inventory**

Users can state "I have rice, beans and eggs." The assistant should use these ingredients in subsequent planning.

**Safety**

Support basic safety-aware behavior for: allergies, pregnancy, children under 5, medical conditions.

**Admin: AI Provider Settings** (added 2026-10-04; ADR-047; moved to n-equals `/ai` on 2026-10-08, ADR-060)

A page in the n-equals admin app, for administrators with the "AI providers" permission, where they can:

- Add an AI key for Google Gemini, Anthropic Claude, OpenAI or DeepSeek, with a model ID and an optional name. The key is checked with the provider before it is saved, and only verified keys are saved.
- See saved configurations with metadata only: provider, model, name, masked key, status, last checked, activated/deactivated and added dates.
- Activate one configuration (only one is active at a time), deactivate it, re-check it, change its model, or delete its key.
- See a metadata-only audit log of these actions.

Keys are encrypted at rest and are never shown, returned, logged or stored in the browser after submission. With no active configuration, chat uses the environment variables.

## 4. Non-Functional Requirements

### Performance

Initial page should feel fast on normal mobile networks. Chat responses should display a loading state immediately. Do not block the entire UI while waiting for AI responses.

### Responsive Design

The application must work on mobile, tablet and desktop. Mobile is the primary design consideration.

### Accessibility

Minimum requirements:

- Keyboard navigation.
- Visible focus state.
- Semantic HTML.
- Accessible buttons.
- Appropriate labels.
- Sufficient contrast.
- Screen-reader-friendly chat messages.

## 5. Conversation Requirements

The AI must avoid asking unnecessary questions. The conversation should be progressive.

```text
User: Make a meal plan.
AI: Who are we planning for?
User: My family.
AI: How many people?
User: Four.
AI: Any allergies?
...
```

The assistant should not ask all questions simultaneously.

## 6. Meal Plan Requirements

A meal plan should include: day, meal, food, optional portion guidance, relevant notes.

```text
Monday

Breakfast
Oats with banana

Lunch
Rice, beans and vegetables

Snack
Orange

Dinner
Chicken, plantain and vegetables
```

The application should make clear that nutritional needs vary between individuals.

## 7. Budget Requirements

Budget must support NGN.

```text
Budget: ₦2,000

Already available:
- Rice
- Beans
- Oil

Suggested purchases:
- Eggs — estimated ₦X
- Vegetables — estimated ₦X

Estimated total: ₦X
Estimated remaining: ₦X
```

Never use fake precision. If price data is approximate, label it: Estimated price.

## 8. Food Information Requirements

A food information response may contain: serving size, calories, protein, carbohydrates, fat, fiber, selected vitamins/minerals, simple benefits, important caveats.

Do not overwhelm users with a nutrition table unless requested.

## 9. Data Requirements

Food:

```text
id
name
aliases
category
serving_size
calories
protein
carbohydrates
fat
fiber
vitamin_a
vitamin_c
calcium
iron
sodium
source
source_url
source_version
```

Price:

```text
id
food_id
location
unit
price
currency
source
effective_date
```

Meal:

```text
id
name
meal_type
ingredients
instructions
tags
```

## 10. User Context

MVP does not require permanent accounts. Session-level context may include:

```text
age
household_size
pregnancy_status
trimester
allergies
dietary_restrictions
food_preferences
available_ingredients
budget
location
```

The system should only collect information relevant to the user's request.

## 11. Safety Requirements

The application must distinguish:

- **General nutrition information** — allowed.
- **Personalized meal suggestions** — allowed with appropriate caution.
- **Medical advice** — must be handled conservatively.

The AI must not:

- Diagnose.
- Prescribe medication.
- Prescribe supplement doses.
- Promise health outcomes.
- Override professional medical advice.

## 12. Allergy Requirements

Declared allergies are hard exclusions.

```text
allergies = ["peanut"]
```

A meal containing peanut must be rejected before presentation. Do not rely solely on the LLM to enforce this. Application-level validation should exist.

## 13. Voice Requirements

Voice is not required for MVP launch. Architecture must allow:

```text
audio input → speech-to-text → existing chat pipeline → text response → text-to-speech → audio output
```

The voice feature should not require rewriting the chat system.

As built (ADR-049): voice input listens through short pauses, ends after about 3.5 seconds of silence (or when the user taps stop, or at 2 minutes), keeps every word, and shows Listening / Processing / Ready states. The transcript is always reviewed before sending.

## 13a. User Settings (added 2026-10-04, ADR-050)

A Settings screen in the chat lets the user choose the reply language: Nigerian English (default), UK English, US English, Yorùbá (Beta), Igbo (Beta). The choice is saved on the device (no accounts) and applied to replies, voice input and read-aloud. Yoruba and Igbo are Beta: AI-translated, with safety notices kept in English.

## 13b. Outcome Interface (added 2026-10-04, ADR-051)

Product principle: **don't just answer the user — produce a useful outcome.** When a reply contains a result, it leads with a structured card:

- **Meal or budget plan:** title (e.g. "Your ₦2,000 meal plan"), people and days, meals with estimated costs, shopping list, nutrition focus and budget summary.
- **Food question:** a per-serving facts card.

All figures in the card are calculated by the app. The conversational text follows for context and follow-up questions.

## 13b-2. Conversation Behaviour (added 2026-10-06, ADR-055, ADR-056)

From the October 2026 product review: Equals behaves like a nutrition professional who listens.

- Help first, then ask one relevant question. Ask children's ages first. Ask about the problem when the parent describes one.
- No performative empathy; short replies by default, and shorter for spoken questions.
- Remember what the family cannot afford, foods a child refuses, time to cook, and whether there is a fridge. "What I have now" replaces the kitchen list, and leftovers are used first.
- Every meal comes with a plain reason ("the rice gives energy, the egg adds protein").
- Medication literacy: explain instructions already received, never change them.
- Nutrients outside our data may be named in general terms with standard names only, and never with invented figures.
- Conversation quality is tested with `npm run eval:conversations`.

## 13b-3. Voice Confirmation, School Planner, Start Modes (added 2026-10-07, ADR-057, ADR-058)

- An optional setting reads a voice message back ("I heard: …") and accepts a spoken "send" or "again". Nothing is sent without the user's say-so. English reply languages only for now.
- School meal planning: the next unknown of ages, school days, breakfast at home, lunchbox and timing, likes and refusals, and budget scope, one at a time. Lunchbox food is marked in the plan.
- Two start modes: "What do I have?" and "What can I afford?", each opening with the question it is about.

## 13c. XEELAA API Integration (added 2026-10-04, ADR-052)

The admin settings page has a XEELAA API section:

- a key field, checked with XEELAA before it is saved;
- a **Use XEELAA API** switch that shows clearly whether the key is in use;
- re-check, usage figures and key deletion.

When the switch is on, chat uses XEELAA. When it is off, or XEELAA fails or its key is invalid, expired or revoked, chat automatically uses the existing AI settings. The admin page shows the reason.

The message box grows with its text (up to 40% of the screen height) instead of scrolling inside a fixed-height field.

## 13d. Platform Expansion, Phase A (added 2026-10-08, ADR-059 to ADR-063)

The platform expansion specification is approved and built in phases. Phase A, the foundation, is built:

- **Accounts (main site):** sign up, sign in, sign out, confirm email, reset password (`/sign-up`, `/sign-in`, `/account`). Chat stays usable without an account.
- **n-equals admin app:** a separate app with Overview, Users & roles, Plans, Subscriptions, AI providers, Settings and Audit log.
  - Roles: super, platform, nutritionist, vendor, hospital, support and finance administrator. Each sees and does only what the role allows.
- **Subscriptions:** plans with admin-set prices and entitlements. No limit is hard-coded; the free tier's limits are set in n-equals. Manual grants for a set number of days.
- **Feature flags:** Meal Planner, Paid plans, Nutritionists, Vendors and Hospitals, switched on in n-equals without a deploy. All are off by default.
- **Payments:** Paystack and Flutterwave hosted checkout with recurring billing. Every payment is verified with the provider, and webhooks are signature-checked and applied once. Subscribers can stop renewal.
- **AI:** Anthropic Claude is available as a provider.

## 13e. Nutritionists, Phase B (added 2026-10-08, ADR-064)

Built:

- **Onboarding:** profile, qualifications, documents (Cloudinary), weekly availability, session types, fee and contact details. Submit for verification; a profile is hidden until verified.
- **Qualification analysis:** deterministic checks plus an optional AI assessment, advisory only. Reviewers decide.
- **Review in n-equals:** approve, request changes, reject, suspend or reinstate, each with a notification and an audit entry.
- **Directory and cards:** `/nutritionists` with filters by state, need and session type, and profile pages. Each card shows photo, name, title, qualification summary, specialisations, location, experience, verification, session types, fee, availability and a booking link.
- **Matching:** deterministic rules. Chat suggests up to three nutritionists when it refers someone to professional advice, or when asked.
- **Session requests:** request, accept, decline, cancel, complete with a note for the client. Sessions are paid to the nutritionist directly, never through Equals.
- **Portal:** dashboard, profile, qualifications, availability, appointments, plan and notifications.

Not built: ratings and reviews, session payments or payouts, calendar sync, official register checks.

## 13f. Meal Planner, Phase C (added 2026-10-08, ADR-066)

Built:

- **Conversation:** the standalone Meal Planner at `/planner` for signed-in users. It asks only what is still needed (goal, people and ages, allergies, and a budget or weight direction when the goal needs it, then one open question), and refuses unsafe plans with its own wording.
- **Limits:** lengths from 1 day to 1 year, limited by entitlement, as are plans per month, adjustments per week, shopping lists and custom goals.
- **Each day:** breakfast, lunch and dinner (or the chosen meals), with portions, the reason for each meal, ingredients, method and swaps. Nutrition is calculated by the app.
- **Shopping:** a weekly list costed from price estimates where units allow.
- **Changes:** rewrite a week with feedback, replace a meal, write the next week, print, delete.
- **Checks:** every plan passes the chat's allergy, child, pregnancy and dose checks.

Not built: vendor and product recommendations (Phase D), plans for anonymous users.

## 13g. Vendors, Phase D (added 2026-10-08, ADR-067)

Built:

- **Onboarding:** vendor businesses (one per account) and products, each reviewed in n-equals.
- **Product details:** description, benefits, recommended use, ingredients, allergens (declared and detected), the vendor's own nutrition label, availability, places to buy and an image.
- **Blocked by code:** health and treatment claims, disease names and breast-milk substitutes.
- **Recommendations:** sponsored and deterministic, in chat, Meal Planner plans and shopping, for foods already suggested. They respect allergies, avoided foods and child and pregnancy rules, and are always labelled sponsored and separate from advice.
- **Pages:** a product directory and product pages; the shop links count clicks.
- **Vendor portal:** dashboard with 30-day counts, business profile, products, plan and notifications.
- **Limits:** vendor plans held by the business; the listing and maximum products are entitlements.

Not built: ratings, stock syncing, multiple members per business, NAFDAC checks.

## 13h. Hospitals and accessibility, Phase E (added 2026-10-09, ADR-068, ADR-069)

Built:

- **Onboarding:** hospitals with details, map location, departments with weekly opening times, accessibility services and staff (doctors, nurses, staff, administrators, optionally by department). Reviewed in n-equals.
- **Directory:** hospitals within an admin-set radius of a typed place (OpenStreetMap) or the device's location, widened on request; or by state. Filters for department and accessibility services.
- **Appointments:** slots computed by code from opening times, slot length and capacity; the patient's access needs and consent; reminders; cancellation by either side.
- **Accessibility agent:** routes each patient message to the right department and role, alerts staff, and answers only with what happens next. Emergencies are decided by code (call 112). No diagnosis, medicines or doses.
- **Conversations:** text or speech (reviewed before sending), replies read aloud; closed conversations are deleted after 90 days, or at any time by the patient.
- **Audio:** a speech-provider setting with the browser as the only available provider; N-ATLaS is registered as not available.

Not built: sign language, live calls, N-ATLaS, map tiles on our pages, push notifications.

## 13i. Public site and Google sign-in (added 2026-10-09, ADR-070, ADR-071)

Built:

- **Branding:** the Nutraboom family design language and the Equals logo across the main site and n-equals tokens; responsive and accessible (AA contrast, keyboard menu, skip link).
- **Navigation:** Home, Products, Hospitals, Nutritionists, Vendors, About us, Log in and Sign up.
- **Pages:** home (hero, about, products and solutions, hospital partnerships, nutritionists, vendors, features, call to action, footer), About us, a landing page for nutritionists and one for vendors.
- **Google:** sign-up and log-in with Google next to email and password.

Not built: photography and testimonials (none supplied), social links and contact details until configured.

## 13j. Dashboard, demo data and accessibility (added 2026-10-09, ADR-072 to ADR-076)

Built:

- The assistant on every page; the header always reflects the real sign-in state.
- Account dashboard: overview, meal plans, nutritionists, plan changes (real checkout only), profile with access needs and password change.
- Meal Planner public introduction; personal plans need an account and stay private.
- Repeatable demo data for development and demos.
- WCAG 2.2 AA as the target, with a documented checklist.

Not built: sign language (research only, pending approval and consultation with Deaf Nigerian users); email change and self-service account deletion.

## 13k. Sign-language response simulation (added 2026-10-09, ADR-077)

Built: a demonstration of sign-language video responses in every module that shows replies, using public sample videos that do not translate the reply, behind a provider interface for a future real service.

Not built: real sign-language translation (no provider agreed; ADR-073).

## 14. Future Requirements

Not MVP: user accounts, saved plans, shopping list history, notifications, WhatsApp integration, native mobile apps, live food prices, dietitian marketplace, subscription plans, clinical nutrition, advanced analytics.

## 15. Acceptance Criteria

The MVP is acceptable when a new user can:

1. Open the home page.
2. Understand what the product does.
3. Open the chatbot.
4. Ask about a food.
5. Receive nutrition information.
6. Ask for a meal plan.
7. Answer follow-up questions.
8. Receive a meal plan.
9. Give a budget.
10. Tell the AI what ingredients they own.
11. Receive a budget-aware plan.
12. Receive safe behavior for child/pregnancy/allergy scenarios.
