/**
 * Conversation quality evaluation (ADR-056). Runs the scenarios in
 * ./scenarios.ts through the real chat pipeline and AI provider, and scores
 * every reply against the behaviour the October 2026 review asked for.
 *
 *   npm run eval:conversations            # all scenarios
 *   npm run eval:conversations -- tomato  # scenarios whose id contains "tomato"
 *
 * Uses AI_PROVIDER / GEMINI_API_KEY etc. from .env.local, and the food and
 * price seed files in memory (no database). Not part of `npm test`: it calls
 * a paid, non-deterministic model. Exit code 1 if any check fails.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { getAIProvider } from "../../lib/ai";
import { InMemoryPriceRepository, parsePriceSeed } from "../../lib/budget/prices";
import { PriceService } from "../../lib/budget/service";
import { handleChat } from "../../lib/conversation/orchestrator";
import { InMemoryConversationStore } from "../../lib/conversation/store";
import type { ChatResponse } from "../../lib/conversation/types";
import { normalizeText } from "../../lib/nutrition/match";
import { InMemoryFoodRepository } from "../../lib/nutrition/repository";
import { parseSeedFile, seedFoodToRecord } from "../../lib/nutrition/seed-data";
import { NutritionService } from "../../lib/nutrition/service";
import { SCENARIOS, type TurnExpectations } from "./scenarios";

config({ path: ".env.local", quiet: true });

/** Phrases the review calls performative empathy (§3 "No performative empathy"). */
const PERFORMATIVE = [
  /\baww+\b/i,
  /\bmama\b.*(❤|♥)/i,
  /I (completely |totally )?understand how you feel/i,
  /(don'?t worry|you'?re doing (an )?(amazing|great) job)/i,
  /I'?m (so )?sorry you'?re going through/i,
  /[❤♥💕💖😊🥰🤗]/u,
];

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /\w/.test(s));
}

function suggestedFoods(reply: ChatResponse): string[] {
  const plan = reply.metadata?.mealPlan;
  return [
    ...(plan?.days.flatMap((d) => d.meals.flatMap((m) => [m.name, ...m.foods])) ?? []),
    ...(reply.metadata?.budget?.purchases.map((p) => p.name) ?? []),
  ];
}

type Failure = { check: string; detail: string };

function score(reply: ChatResponse, expect: TurnExpectations, voice: boolean): Failure[] {
  const failures: Failure[] = [];
  const message = reply.message;
  const everything = [
    message,
    reply.metadata?.safetyNotice ?? "",
    reply.metadata?.urgentNotice ?? "",
  ].join("\n");

  const questions = (message.match(/\?/g) ?? []).length;
  if (questions > 1) failures.push({ check: "one question", detail: `${questions} questions` });

  for (const pattern of PERFORMATIVE) {
    if (pattern.test(message))
      failures.push({ check: "no performative empathy", detail: String(pattern) });
  }

  const limit = expect.maxSentences ?? (voice ? 3 : 6);
  const count = sentences(message).length;
  // A plan or list lives in the card; the message itself must stay short.
  if (count > limit)
    failures.push({ check: "short reply", detail: `${count} sentences > ${limit}` });

  const foods = suggestedFoods(reply).map(normalizeText);
  for (const food of expect.mustNotSuggest ?? []) {
    const term = normalizeText(food);
    if (foods.some((f) => f.includes(term))) {
      failures.push({ check: "respects constraint", detail: `suggested ${food}` });
    }
  }
  for (const pattern of expect.mustNotAsk ?? []) {
    const asked = sentences(message).some((s) => s.includes("?") && pattern.test(s));
    if (asked) failures.push({ check: "does not re-ask", detail: String(pattern) });
  }
  for (const pattern of expect.mustMention ?? []) {
    if (!pattern.test(everything)) failures.push({ check: "mentions", detail: String(pattern) });
  }
  for (const pattern of expect.mustNotSay ?? []) {
    if (pattern.test(message)) failures.push({ check: "must not say", detail: String(pattern) });
  }
  if (
    expect.requireReferral &&
    !reply.metadata?.urgentNotice &&
    !reply.metadata?.safetyNotice &&
    !/doctor|clinic|hospital|health (worker|professional|centre)|112/i.test(message)
  ) {
    failures.push({ check: "escalates", detail: "no referral or urgent notice" });
  }
  return failures;
}

async function main(): Promise<void> {
  const filter = process.argv[2];
  const provider = getAIProvider();
  const foods = parseSeedFile(JSON.parse(readFileSync("prisma/seed/foods.json", "utf8")));
  const nutrition = new NutritionService(
    new InMemoryFoodRepository(foods.foods.map(seedFoodToRecord), foods.aliases),
  );
  const priceSeed = parsePriceSeed(JSON.parse(readFileSync("prisma/seed/prices.json", "utf8")));
  const prices = new PriceService(new InMemoryPriceRepository(priceSeed.seed, priceSeed.aliases));

  const scenarios = SCENARIOS.filter((s) => !filter || s.id.includes(filter));
  console.log(`Provider: ${provider.name}. Scenarios: ${scenarios.length}.\n`);
  let checked = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    console.log(`■ ${scenario.id}: ${scenario.title}`);
    const store = new InMemoryConversationStore();
    let conversationId: string | undefined;
    for (const [i, turn] of scenario.turns.entries()) {
      let reply: ChatResponse;
      try {
        reply = await handleChat(
          { conversationId, message: turn.user, inputMode: turn.inputMode },
          { provider, store, nutrition, prices },
        );
      } catch (error) {
        failed++;
        // Schema problems name the fields (paths only, no content).
        const issues = (error as { cause?: { issues?: { path: unknown[]; message: string }[] } })
          .cause?.issues;
        const where = issues?.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ");
        console.log(
          `  ${i + 1}. ✗ provider error: ${error instanceof Error ? error.message : error}${where ? ` (${where})` : ""}`,
        );
        break;
      }
      conversationId = reply.conversationId;
      console.log(`  ${i + 1}. Parent: ${turn.user}`);
      console.log(`     Equals: ${reply.message.replace(/\n+/g, " ")}`);
      if (reply.metadata?.outcome) console.log(`     [card] ${reply.metadata.outcome.title}`);
      if (!turn.expect) continue;
      checked++;
      const failures = score(reply, turn.expect, turn.inputMode === "voice");
      if (failures.length === 0) console.log("     ✓ all checks passed");
      for (const f of failures) {
        failed++;
        console.log(`     ✗ ${f.check}: ${f.detail}`);
      }
    }
    console.log("");
  }

  console.log(`Scored turns: ${checked}. Failed checks: ${failed}.`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
