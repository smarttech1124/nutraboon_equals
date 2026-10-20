/**
 * Records a product demo of Nutraboom Equals with Playwright (docs/DEMO_README.md).
 *
 *   npm run demo:record                     public tour of the live site
 *   DEMO_BASE_URL=http://localhost:3000 npm run demo:record
 *
 * Optional segments, each only when its settings are given:
 *   DEMO_EMAIL / DEMO_PASSWORD              sign in as a dedicated demo member, then
 *                                           message a hospital as that patient
 *   DEMO_HOSPITAL_EMAIL                     the hospital staff account that replies
 *                                           (default demo-hospital-ikeja@example.test)
 *   DEMO_ADMIN_URL / DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD   n-equals tour (read-only;
 *                                           the password defaults to DEMO_PASSWORD)
 *   DEMO_HEADED=1                           show the browser while recording
 *   DEMO_BROWSER=chrome|msedge              use an installed browser instead of
 *                                           Playwright's Chromium
 *
 * Output: demo-output/<timestamp>/ with raw.webm, captions.srt, chapters.ffmeta,
 * chapters.txt, narration.txt, report.json and screenshots of any failed step.
 * Exits with code 1 when a required step fails.
 *
 * The tour only reads pages, except: the chat sends two messages (an anonymous
 * conversation that expires like any other), signing in starts sessions, and
 * the hospital chapters send one patient message and one staff reply.
 * Use dedicated demo accounts, never a real person's.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import {
  shiftEvents,
  Timeline,
  toChapterList,
  toFfmetadata,
  toNarrationScript,
  toSrt,
} from "./timeline";

declare global {
  interface Window {
    /** Set by the recorder: the sentence the voice stand-in "hears" (voice-shim.js). */
    __demoVoice?: string;
    __demoSpoken?: { at: number; text: string; lang: string }[];
    __demo?: {
      chapter(title: string, subtitle: string, ms: number): Promise<void>;
      caption(text: string): void;
      clearCaption(): void;
      highlight(rect: { x: number; y: number; width: number; height: number }, label: string): void;
      clearHighlight(): void;
      cursorTo(x: number, y: number, ms: number): Promise<void>;
      ripple(): void;
    };
  }
}

const local = existsSync(".env.local") ? parse(readFileSync(".env.local")) : {};
// Only the demo settings are read from .env.local; process env wins.
const env = (name: string): string | undefined => process.env[name] ?? local[name] ?? undefined;

const WIDTH = 1920;
const HEIGHT = 1080;
const BASE_URL = (env("DEMO_BASE_URL") ?? "https://nutraboom-equals.vercel.app").replace(/\/$/, "");
const ADMIN_URL = env("DEMO_ADMIN_URL")?.replace(/\/$/, "");
/** Multiplies every pause: 0.5 for a quick check, 1.5 for a slower video. */
const PACE = Number(env("DEMO_PACE") ?? "1") || 1;

/** How long to wait for a reply: an AI answer plus, on a dev server, the first compile. */
const REPLY_TIMEOUT_MS = 120_000;
/** Times the chat's Retry is pressed after an error before a step fails. */
const MAX_RETRIES = 2;

const pause = (page: Page, ms: number) => page.waitForTimeout(Math.round(ms * PACE));

type StepResult = {
  name: string;
  required: boolean;
  ok: boolean;
  seconds: number;
  error?: string;
  screenshot?: string;
};

/** Waits for load, fonts, images and any finite animation (infinite ones are ignored). */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page
    .waitForFunction(
      () => {
        const images = [...document.images].every((img) => img.complete);
        const running = document
          .getAnimations()
          .filter((a) => a.playState === "running")
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
        return images && running.length === 0;
      },
      undefined,
      { timeout: 6_000 },
    )
    .catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
}

/** Something said aloud in the video, added as sound by demo:polish. */
export type AudioCue = { at: number; kind: "question" | "reply"; text: string };

class Demo {
  readonly results: StepResult[] = [];
  readonly cues: AudioCue[] = [];

  /** Notes words spoken at this moment (the spoken question in the voice chapter). */
  cue(kind: AudioCue["kind"], text: string): void {
    this.cues.push({ at: Date.now(), kind, text });
  }

  constructor(
    readonly page: Page,
    readonly timeline: Timeline,
    readonly outDir: string,
  ) {}

  async goto(urlPath: string, base = BASE_URL): Promise<void> {
    const response = await this.page.goto(`${base}${urlPath}`, { waitUntil: "domcontentloaded" });
    if (!response || response.status() >= 400) {
      throw new Error(`${urlPath} answered ${response?.status() ?? "nothing"}`);
    }
    await settle(this.page);
  }

  async chapter(title: string, subtitle: string): Promise<void> {
    this.timeline.chapter(title);
    await this.page.evaluate(([t, s, ms]) => window.__demo?.chapter(t, s, ms), [
      title,
      subtitle,
      Math.round(1800 * PACE),
    ] as const);
  }

  async caption(text: string, readMs = 3200): Promise<void> {
    this.timeline.caption(text);
    await this.page.evaluate((t) => window.__demo?.caption(t), text);
    await pause(this.page, readMs);
  }

  async clearCaption(): Promise<void> {
    this.timeline.endCaption();
    await this.page.evaluate(() => window.__demo?.clearCaption());
  }

  /** Scrolls the element into view and draws the highlight box with a label. */
  async highlight(target: Locator, label: string, holdMs = 2600): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    await pause(this.page, 400);
    const box = await target.boundingBox();
    if (!box) throw new Error(`Nothing to highlight for "${label}"`);
    await this.page.evaluate(([b, l]) => window.__demo?.highlight(b, l), [box, label] as const);
    await pause(this.page, holdMs);
    await this.page.evaluate(() => window.__demo?.clearHighlight());
  }

  /** Moves the visible cursor (and the real mouse, for hover styles) to an element. */
  async pointAt(target: Locator): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("The element is not visible");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await Promise.all([
      this.page.evaluate(([cx, cy, ms]) => window.__demo?.cursorTo(cx, cy, ms), [
        x,
        y,
        Math.round(700 * PACE),
      ] as const),
      this.page.mouse.move(x, y, { steps: 20 }),
    ]);
  }

  async click(target: Locator): Promise<void> {
    await this.pointAt(target);
    await this.page.evaluate(() => window.__demo?.ripple());
    await target.click();
  }

  async typeInto(target: Locator, text: string): Promise<void> {
    await this.click(target);
    await target.pressSequentially(text, { delay: Math.round(45 * PACE) });
  }

  /** Smooth scroll by viewport fractions, so viewers can follow. */
  async scroll(screens: number): Promise<void> {
    const steps = Math.max(1, Math.round(screens * 6));
    for (let i = 0; i < steps; i++) {
      await this.page.mouse.wheel(0, HEIGHT / 6);
      await pause(this.page, 260);
    }
    await pause(this.page, 600);
  }

  async scrollToTop(): Promise<void> {
    await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await pause(this.page, 900);
  }

  /**
   * Runs one step. A failing required step stops the tour; an optional one is
   * recorded and skipped. Either way a screenshot is saved for the report.
   */
  async step(name: string, required: boolean, run: () => Promise<void>): Promise<boolean> {
    const started = Date.now();
    try {
      await run();
      this.results.push({ name, required, ok: true, seconds: (Date.now() - started) / 1000 });
      console.log(`  ✓ ${name}`);
      return true;
    } catch (error) {
      const file = `failed-${this.results.length + 1}.png`;
      await this.page.screenshot({ path: path.join(this.outDir, file) }).catch(() => {});
      const message = error instanceof Error ? error.message.split("\n")[0]! : String(error);
      this.results.push({
        name,
        required,
        ok: false,
        seconds: (Date.now() - started) / 1000,
        error: message,
        screenshot: file,
      });
      console.log(`  ${required ? "✗" : "!"} ${name}: ${message}`);
      await this.clearCaption().catch(() => {});
      await this.page.evaluate(() => window.__demo?.clearHighlight()).catch(() => {});
      if (required) throw new StopTour(name);
      return false;
    }
  }
}

class StopTour extends Error {}

/** Sends a chat message and waits for the reply; fails on the app's error message. */
async function askAssistant(demo: Demo, dialog: Locator, message: string): Promise<void> {
  const replies = dialog.getByText("Nutraboom Equals said:", { exact: true });
  const before = await replies.count();
  const input = dialog.getByLabel("Message Nutraboom Equals");
  await demo.typeInto(input, message);
  await pause(demo.page, 500);
  await demo.click(dialog.getByRole("button", { name: "Send" }));
  const alert = dialog
    .getByRole("alert")
    .filter({ hasText: /trouble|try again/i })
    .first();
  // The AI provider can be briefly overloaded: use the chat's own Retry, as a
  // person would, before giving up on the step.
  for (let attempt = 0; ; attempt++) {
    const outcome = await Promise.race([
      replies
        .nth(before)
        .waitFor({ state: "attached", timeout: REPLY_TIMEOUT_MS })
        .then(() => "reply" as const),
      alert.waitFor({ timeout: REPLY_TIMEOUT_MS }).then(() => "error" as const),
    ]);
    if (outcome === "reply") break;
    if (attempt >= MAX_RETRIES) throw new Error("The assistant showed its error message");
    console.log(`    retrying "${message.slice(0, 40)}" after the assistant's error`);
    await pause(demo.page, 2000);
    await demo.click(alert.getByRole("button", { name: "Retry" }));
    await alert.waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
  }
  await dialog
    .getByRole("log")
    .getByRole("status")
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => {});
  await pause(demo.page, 800);
}

/** The chat dialog, opened (or restored) from the floating launcher if needed. */
async function openChat(demo: Demo): Promise<Locator> {
  const page = demo.page;
  const dialog = page.getByRole("dialog", { name: "Nutraboom Equals" });
  if (await dialog.isVisible().catch(() => false)) return dialog;
  const restore = page.getByRole("button", { name: /^Open the chat/ });
  if (await restore.isVisible().catch(() => false)) await demo.click(restore);
  else await demo.click(page.getByRole("button", { name: "Ask Nutraboom Equals" }).last());
  await dialog.waitFor();
  await pause(page, 700);
  return dialog;
}

/** "New chat" in the chat header, confirming the browser's question. */
async function newChat(demo: Demo, dialog: Locator): Promise<void> {
  const button = dialog.getByRole("button", { name: "New chat" });
  if (!(await button.isVisible().catch(() => false))) return;
  demo.page.once("dialog", (d) => void d.accept());
  await demo.click(button);
  await dialog.getByRole("list", { name: "Suggested questions" }).waitFor();
  await pause(demo.page, 900);
}

/** Opens Settings in the chat, runs `change`, then goes back to the conversation. */
async function inSettings(demo: Demo, dialog: Locator, change: () => Promise<void>) {
  await demo.click(dialog.getByRole("button", { name: "Settings" }));
  await dialog.getByRole("heading", { name: "Settings" }).waitFor();
  await pause(demo.page, 600);
  await change();
  await pause(demo.page, 700);
  await demo.click(dialog.getByRole("button", { name: "Back to chat" }));
  await pause(demo.page, 500);
}

/**
 * Scrolls the conversation so the newest reply can be read: its start first,
 * then down through it at reading pace.
 */
async function showLatestReply(demo: Demo, dialog: Locator): Promise<string> {
  const page = demo.page;
  const reply = dialog
    .getByText("Nutraboom Equals said:", { exact: true })
    .last()
    .locator("xpath=ancestor::div[contains(@class,'flex')][1]");
  await reply.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "smooth" }));
  await pause(page, 900);
  const text = (await reply.innerText()).replace("Nutraboom Equals said:", "").trim();
  // About 18 characters a second, at least 4 s and at most 14 s on screen.
  const readMs = Math.min(14_000, Math.max(4_000, (text.length / 18) * 1000));
  const scroller = dialog.locator(".overflow-y-auto").first();
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    await pause(page, readMs / steps);
    await scroller.evaluate((el) =>
      el.scrollBy({ top: el.clientHeight * 0.45, behavior: "smooth" }),
    );
  }
  await pause(page, 600);
  return text;
}

/** Asks a question in the open chat and shows the reply. */
async function ask(demo: Demo, dialog: Locator, question: string): Promise<string> {
  await askAssistant(demo, dialog, question);
  return showLatestReply(demo, dialog);
}

const CHAT_QUESTIONS = [
  "Can I give my baby semo at 4 months?",
  "Can I eat pineapple during pregnancy?",
  "I heard pineapple is acidic and is not good for pregnant women.",
  "What food can I cook tonight?",
  "I have pains when breastfeeding my baby. Why is that?",
];

const YORUBA_QUESTION = "Ẹ káàsán. Kí ni mo lè sè fún oúnjẹ alẹ́ pẹ̀lú ìrẹsì àti ẹyin?";
const IGBO_QUESTION = "Ndewo. Gịnị ka m nwere ike isi maka nri abalị site na osikapa na akwa?";
const VOICE_QUESTION = "What food can I cook tonight with rice and eggs?";

async function featureTour(demo: Demo): Promise<void> {
  const page = demo.page;

  // 1. Home page
  await demo.step("Home page", true, async () => {
    await demo.goto("/");
    await demo.chapter("Nutraboom Equals", "Learn, plan, and get help in your language");
    const heading = page.getByRole("heading", { level: 1 });
    await heading.waitFor();
    await demo.caption(
      "Ask about food, plan meals and budgets, and find trusted help, by text or voice.",
    );
    await demo.highlight(heading, "The promise");
    await demo.highlight(
      page.getByRole("button", { name: /Ask Nutraboom Equals/ }).first(),
      "Chat with no account",
    );
    await demo.caption("Built for screen readers, keyboards, listening and speaking.");
    await demo.highlight(
      page.getByRole("heading", { name: /blind, deaf, or hard of hearing/ }),
      "Accessible to everyone",
    );
    await demo.caption(
      "Products, the Meal Planner, nutritionists and accessible hospitals in one place.",
    );
    await demo.scroll(2.5);
    await demo.clearCaption();
    await demo.scrollToTop();
  });

  // 2. Chat and AI assistant: five questions in one new conversation
  await demo.step("Chat and AI assistant", true, async () => {
    await demo.chapter(
      "Chat with the assistant",
      "Careful answers for babies, pregnancy and breastfeeding",
    );
    const dialog = await openChat(demo);
    await demo.click(dialog.getByRole("button", { name: "Expand the chat" }));
    await newChat(demo, dialog);
    await demo.caption(
      "A new conversation. Every reply passes the app's safety checks first.",
      2600,
    );
    await demo.clearCaption();
    for (const question of CHAT_QUESTIONS) await ask(demo, dialog, question);
  });

  // 3. Multilingual: Yorùbá, then Igbo, each in a new conversation
  await demo.step("Yorùbá conversation", false, async () => {
    await demo.chapter("Your language", "Yorùbá and Igbo replies (beta)");
    const dialog = await openChat(demo);
    await demo.caption("Choose the reply language in Settings.");
    await inSettings(demo, dialog, async () => {
      await demo.highlight(
        dialog.getByRole("group", { name: "Response language" }),
        "Response language",
        1800,
      );
      await demo.click(dialog.getByRole("radio", { name: /Yorùbá/ }));
      await dialog.getByText(/translated by AI and not yet checked by native speakers/).waitFor();
      await demo.caption(
        "Yorùbá and Igbo are in beta: translated by AI, with safety notes kept in English.",
        3400,
      );
    });
    await demo.clearCaption();
    await newChat(demo, dialog);
    const reply = await ask(demo, dialog, YORUBA_QUESTION);
    // Yorùbá is written with dotted letters such as ẹ, ọ and ṣ.
    if (!/[ẹọṣẸỌṢ]/.test(reply)) throw new Error("The reply does not look like Yorùbá");
  });

  await demo.step("Igbo conversation", false, async () => {
    const dialog = await openChat(demo);
    await demo.caption("Switch to Igbo and start a new conversation.");
    await inSettings(demo, dialog, async () => {
      await demo.click(dialog.getByRole("radio", { name: /Igbo/ }));
    });
    await demo.clearCaption();
    await newChat(demo, dialog);
    const reply = await ask(demo, dialog, IGBO_QUESTION);
    // Igbo is written with dotted letters such as ị, ọ and ụ.
    if (!/[ịọụỊỌỤṅ]/.test(reply)) throw new Error("The reply does not look like Igbo");
    // Back to Nigerian English for the rest of the tour.
    await inSettings(demo, dialog, async () => {
      await demo.click(dialog.getByRole("radio", { name: /Nigerian English/ }));
    });
  });

  // 4. Sign language (demo mode)
  await demo.step("Sign language demo", false, async () => {
    await demo.chapter("Sign language (demo)", "A preview of sign-language responses");
    const dialog = await openChat(demo);
    await newChat(demo, dialog);
    await demo.caption("Turn on sign-language responses in Settings.");
    await inSettings(demo, dialog, async () => {
      const toggle = dialog.getByRole("checkbox", { name: /Sign language response/ });
      await demo.highlight(toggle.locator("xpath=ancestor::label[1]"), "Demo mode", 1800);
      await demo.click(toggle);
    });
    await demo.clearCaption();
    await askAssistant(demo, dialog, "What are good foods for a one-year-old?");
    const player = dialog.getByRole("region", { name: /Sign language response/ }).last();
    await player.getByRole("button", { name: "Replay" }).waitFor({ timeout: 45_000 });
    await player.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
    await pause(page, 800);
    await demo.caption(
      "Demo mode shows a sample sign-language video, clearly labelled: it does not translate the reply yet.",
      4200,
    );
    await demo.highlight(player, "Sign language response (demo)", 4000);
    await demo.caption("Replay it, or see another sample video.", 2200);
    await demo.click(player.getByRole("button", { name: "Show another demo video" }));
    await player.getByRole("button", { name: "Replay" }).waitFor({ timeout: 45_000 });
    await pause(page, 3500);
    await demo.caption(
      "Sign-language responses stay on for the rest of this demo, including hospital messages.",
      2800,
    );
    await demo.clearCaption();
  });

  // 5. Voice: speak a question, hear the reply
  await demo.step("Voice interaction", false, async () => {
    await demo.chapter("Speak and listen", "Voice questions and spoken replies");
    const dialog = await openChat(demo);
    await newChat(demo, dialog);
    await demo.caption(
      "Voice input is simulated for this recording: automated browsers cannot use a microphone. The app's own voice flow does the rest.",
      4200,
    );
    await page.evaluate((s) => (window.__demoVoice = s), VOICE_QUESTION);
    demo.cue("question", VOICE_QUESTION);
    await demo.click(dialog.getByRole("button", { name: "Speak your message" }));
    await dialog
      .getByText(/Listening/)
      .first()
      .waitFor();
    await demo.caption(`🎤 "${VOICE_QUESTION}"`, 1500);
    const input = dialog.getByLabel("Message Nutraboom Equals");
    await page.waitForFunction(
      (q) => (document.getElementById("chat-input") as HTMLTextAreaElement | null)?.value === q,
      VOICE_QUESTION,
      { timeout: 20_000 },
    );
    await demo.caption("The words appear in the box to check before sending.", 2400);
    await demo.highlight(input, "What was heard", 1800);
    await demo.clearCaption();
    const replies = dialog.getByText("Nutraboom Equals said:", { exact: true });
    const before = await replies.count();
    await demo.click(dialog.getByRole("button", { name: "Send" }));
    await replies.nth(before).waitFor({ state: "attached", timeout: REPLY_TIMEOUT_MS });
    const stop = dialog.getByRole("button", { name: "Stop reading this reply" });
    await stop.waitFor({ timeout: 10_000 });
    await demo.caption(
      "🔊 A spoken question gets a spoken reply: it is read aloud as it appears.",
      1000,
    );
    await demo.highlight(stop, "Reading aloud", 1500);
    await showLatestReply(demo, dialog);
    // Let the reading finish (or stop it after a while) before moving on.
    await stop.waitFor({ state: "detached", timeout: 45_000 }).catch(async () => {
      await demo.click(stop);
    });
    await demo.clearCaption();
    // Note what was read aloud now: leaving the page clears the browser's log.
    const spoken = await page.evaluate(() => window.__demoSpoken ?? []);
    for (const said of spoken) demo.cues.push({ at: said.at, kind: "reply", text: said.text });
    await page.evaluate(() => (window.__demoSpoken = []));
    await demo.click(dialog.getByRole("button", { name: "Close chat" }));
  });

  // 6. Products, nutritionists, hospitals
  const directory = (
    name: string,
    urlPath: string,
    title: string,
    subtitle: string,
    caption: string,
    firstCard: () => Locator,
    label: string,
  ) =>
    demo.step(name, false, async () => {
      await demo.goto(urlPath);
      await demo.chapter(title, subtitle);
      const heading = page.getByRole("heading", { level: 1 }).first();
      await heading.waitFor({ timeout: 10_000 });
      if (
        await page
          .getByText("Coming soon", { exact: false })
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        throw new Error(
          `${urlPath} shows "Coming soon": switch the module on in n-equals Settings`,
        );
      }
      await demo.caption(caption);
      await demo.highlight(firstCard(), label, 3000);
      await demo.scroll(1.5);
      await demo.clearCaption();
    });

  await directory(
    "Products",
    "/products",
    "Verified products",
    "Food from reviewed Nigerian businesses",
    "Every product lists its ingredients and allergens, and is reviewed before it appears.",
    () => page.locator("main a[href^='/products/']").first(),
    "A verified product",
  );
  await directory(
    "Nutritionists",
    "/nutritionists",
    "Nutritionists",
    "Professionals whose qualifications are checked",
    "Find a verified nutritionist by specialty and state, online or in person.",
    () => page.locator("main a[href^='/nutritionists/']").first(),
    "A verified nutritionist",
  );
  await directory(
    "Hospitals",
    "/hospitals",
    "Accessible hospitals",
    "Book ahead and message by text or voice",
    "Search near you and filter by department and access services, such as sign-language interpreters.",
    () => page.locator("main a[href^='/hospitals/']").first(),
    "An accessible hospital",
  );
}

async function memberTour(demo: Demo, email: string, password: string): Promise<void> {
  const page = demo.page;
  await demo.step("Member account", false, async () => {
    await demo.goto("/sign-in");
    await demo.chapter("Your account", "Meal plans, nutritionists and your plan in one place");
    await demo.typeInto(page.getByLabel("Email"), email);
    // The password is typed without the visible cursor animation and never logged.
    await page.getByLabel("Password", { exact: true }).fill(password);
    await demo.click(page.getByRole("button", { name: /^(Log in|Sign in)$/ }));
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
      timeout: REPLY_TIMEOUT_MS,
    });
    await demo.goto("/account");
    const heading = page.getByRole("heading", { level: 1 }).first();
    await heading.waitFor();
    await demo.caption(
      "The dashboard brings saved meal plans, sessions and the subscription together.",
    );
    await demo.highlight(heading, "Account dashboard");
    await demo.scroll(1);
    await demo.clearCaption();
  });
}

const PATIENT_MESSAGE =
  "Hello. I'm 20 weeks pregnant and often feel tired. Can I speak to someone about what to eat?";
const STAFF_REPLY =
  "Good afternoon, this is the antenatal nutrition clinic. We can see you on Thursday at 10am. Please bring your antenatal card. Until then, keep eating beans, leafy greens such as ugu, and eggs.";

/** Signs out of the main site (both portals share its session cookie) without leaving the page. */
async function signOut(demo: Demo): Promise<void> {
  await demo.page.context().clearCookies({ name: "nbe_session" });
}

/** Signs in on a login page (personal or portal) and waits to leave it. */
async function signInOn(demo: Demo, urlPath: string, email: string, password: string) {
  await demo.goto(urlPath);
  await demo.typeInto(demo.page.getByLabel("Email"), email);
  // The password is typed without the visible cursor animation and never logged.
  await demo.page.getByLabel("Password", { exact: true }).fill(password);
  await demo.click(demo.page.getByRole("button", { name: /^(Log in|Sign in)$/ }));
  await demo.page.waitForURL((url) => !url.pathname.endsWith("/sign-in"), {
    timeout: REPLY_TIMEOUT_MS,
  });
}

/**
 * A patient messages a hospital and its staff reply (ADR-068), with the
 * patient's sign-language responses on: the staff reply arrives with the
 * demo sign-language video. Needs the demo seed's member and hospital owner.
 */
async function hospitalConversationTour(
  demo: Demo,
  patientEmail: string,
  staffEmail: string,
  password: string,
): Promise<void> {
  const page = demo.page;
  let conversationUrl = "";

  await demo.step("Patient messages a hospital", false, async () => {
    await demo.goto("/hospitals");
    await demo.chapter("Message a hospital", "A patient and hospital staff, by text or voice");
    const hospital = page
      .locator("main a[href^='/hospitals/']")
      .filter({ hasText: "Harmony Specialist Hospital" })
      .first();
    await demo.caption("Amaka, a patient, opens a hospital that offers text and audio access.");
    await demo.click(hospital);
    await page.waitForURL(/\/hospitals\/[^/]+$/, { timeout: REPLY_TIMEOUT_MS });
    await settle(page);
    // The booking form has its own note field, so the message box is found by its ID.
    const box = page.locator("#first-message");
    await box.waitFor({ timeout: REPLY_TIMEOUT_MS });
    await box.scrollIntoViewIfNeeded();
    await demo.caption("She types her question. The assistant passes it to the right clinic.");
    await demo.typeInto(box, PATIENT_MESSAGE);
    await pause(page, 600);
    await demo.click(page.getByRole("button", { name: "Send to the hospital" }));
    await page.waitForURL(/\/hospitals\/messages\//, { timeout: REPLY_TIMEOUT_MS });
    await settle(page);
    conversationUrl = new URL(page.url()).pathname;
    // Her sign-language responses must be on, so staff replies come with a video.
    const toggle = page.getByRole("checkbox", { name: /Sign language response/ });
    if (!(await toggle.isChecked())) await demo.click(toggle);
    await demo.caption("Sign-language responses (demo) are on for her replies.", 2400);
    await demo.highlight(toggle.locator("xpath=ancestor::label[1]"), "Sign language: on", 1800);
    await demo.highlight(
      page.getByRole("list", { name: "Conversation" }),
      "Her conversation",
      2400,
    );
    await demo.clearCaption();
  });
  if (!conversationUrl) return;

  await demo.step("Hospital staff reply", false, async () => {
    await demo.chapter("Hospital staff", "The hospital portal's inbox");
    await demo.caption("Now the hospital's side: a staff member logs in to the hospital portal.");
    await signOut(demo);
    await signInOn(demo, "/hospital/sign-in", staffEmail, password);
    await demo.goto("/hospital/inbox");
    const thread = page
      .locator("main a[href^='/hospital/inbox/']")
      .filter({ hasText: "Amaka" })
      .first();
    await demo.caption("New messages wait in the inbox, sorted and labelled by the assistant.");
    await demo.highlight(thread, "Amaka's message", 2400);
    await demo.click(thread);
    await page.waitForURL(/\/hospital\/inbox\/[^/]+$/, { timeout: REPLY_TIMEOUT_MS });
    await settle(page);
    const claim = page.getByRole("button", { name: "I'll handle this" });
    if (await claim.isVisible().catch(() => false)) {
      await demo.click(claim);
      await page.getByText(/Handled by you/).waitFor();
    }
    const reply = page.getByLabel("Your reply to the patient");
    await demo.caption("The staff member replies in plain words.");
    await demo.typeInto(reply, STAFF_REPLY);
    await demo.click(page.getByRole("button", { name: "Send", exact: true }));
    await page
      .getByRole("list", { name: "Conversation" })
      .getByText(STAFF_REPLY.slice(0, 40))
      .waitFor({ timeout: 20_000 });
    await pause(page, 1200);
    await demo.clearCaption();
  });

  await demo.step("Patient sees the reply with sign language", false, async () => {
    await demo.chapter("The reply", "Text, read aloud, and a sign-language video (demo)");
    await signOut(demo);
    await signInOn(demo, "/sign-in", patientEmail, password);
    await demo.goto(conversationUrl);
    const staffMessage = page
      .getByRole("list", { name: "Conversation" })
      .getByRole("listitem")
      .filter({ hasText: STAFF_REPLY.slice(0, 40) })
      .last();
    await staffMessage.waitFor({ timeout: 20_000 });
    const player = staffMessage.getByRole("region", { name: /Sign language response/ });
    await player.getByRole("button", { name: "Replay" }).waitFor({ timeout: 45_000 });
    await staffMessage.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
    await demo.caption(
      "Amaka sees the staff reply with a sample sign-language video. Demo mode: it does not translate the reply.",
      4200,
    );
    await demo.highlight(player, "Sign language response (demo)", 4000);
    await demo.caption("She can also have it read aloud, or reply by speaking.", 2600);
    await demo.clearCaption();
  });
}

async function adminTour(demo: Demo, base: string, email: string, password: string): Promise<void> {
  const page = demo.page;
  await demo.step("n-equals overview", false, async () => {
    await demo.goto("/sign-in", base);
    await demo.chapter("n-equals", "The administration portal");
    await demo.typeInto(page.getByLabel("Email"), email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await demo.click(page.getByRole("button", { name: /^(Log in|Sign in)$/ }));
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
    await settle(page);
    await demo.caption(
      "Live analytics: the AI in use, active users, chats, revenue and review queues.",
    );
    // The nearest rounded card around each title.
    const card = "xpath=ancestor::*[contains(@class, 'rounded-2xl')][1]";
    await demo.highlight(
      page.getByText("Active AI", { exact: true }).first().locator(card),
      "Active AI",
    );
    await demo.highlight(
      page.getByText("Active users today").first().locator(card),
      "Active users",
    );
    await demo.scroll(1.5);
    await demo.clearCaption();
  });
  await demo.step("n-equals users and AI", false, async () => {
    await demo.goto("/users", base);
    await demo.caption(
      "Platform users and administrators are managed separately, with paged tables.",
    );
    await demo.highlight(page.getByRole("navigation", { name: "Pages" }), "Pagination");
    await demo.goto("/ai", base);
    await demo.caption(
      "AI providers, XEELAA included, are added with one form and checked before use.",
    );
    await demo.highlight(page.getByRole("heading", { name: "Add an API key" }), "Add an API key");
    await demo.clearCaption();
  });
}

/**
 * Writes the spoken words as WAV files with their times in the trimmed video
 * (audio/cues.json), for demo:polish. Windows' built-in voices are used, the
 * same voices the browser speaks with on Windows. Elsewhere only the cue list
 * is written.
 */
function writeAudioCues(outDir: string, cues: AudioCue[], startedAt: number, trimStart: number) {
  if (cues.length === 0) return;
  const dir = path.join(outDir, "audio");
  mkdirSync(dir, { recursive: true });
  const list = cues
    .sort((x, y) => x.at - y.at)
    .map((c, i) => ({
      file: `${String(i + 1).padStart(2, "0")}-${c.kind}.wav`,
      kind: c.kind,
      startSeconds: Math.max(0, Math.round(((c.at - startedAt) / 1000 - trimStart) * 1000) / 1000),
      text: c.text,
    }));
  writeFileSync(path.join(dir, "cues.json"), JSON.stringify(list, null, 2));
  if (process.platform !== "win32") return;
  for (const cue of list) {
    const textFile = path.join(dir, cue.file.replace(".wav", ".txt"));
    writeFileSync(textFile, cue.text, "utf8");
    // The question in a different voice from the reply, as two people would sound.
    const voice = cue.kind === "question" ? "Microsoft Zira Desktop" : "Microsoft David Desktop";
    const quote = (p: string) => p.split("'").join("''");
    const script = [
      "Add-Type -AssemblyName System.Speech",
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      `try { $s.SelectVoice('${voice}') } catch {}`,
      `$s.SetOutputToWaveFile('${quote(path.join(dir, cue.file))}')`,
      `$s.Speak([IO.File]::ReadAllText('${quote(textFile)}'))`,
      "$s.Dispose()",
    ].join("; ");
    const result = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8",
    });
    if (result.status !== 0) console.warn(`Could not synthesise ${cue.file}`);
  }
}

async function launch(): Promise<Browser> {
  const headless = env("DEMO_HEADED") !== "1";
  const channel = env("DEMO_BROWSER");
  if (channel) return chromium.launch({ headless, channel });
  try {
    return await chromium.launch({ headless });
  } catch (error) {
    // Playwright's own Chromium is not installed: use an installed browser.
    for (const fallback of ["chrome", "msedge"]) {
      try {
        const browser = await chromium.launch({ headless, channel: fallback });
        console.log(
          `Using the installed ${fallback} (run "npx playwright install chromium" to use Playwright's).`,
        );
        return browser;
      } catch {
        // try the next one
      }
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.resolve("demo-output", stamp);
  mkdirSync(outDir, { recursive: true });
  console.log(`Recording ${BASE_URL} into ${path.relative(process.cwd(), outDir)}`);

  const browser = await launch();
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    recordVideo: { dir: outDir, size: { width: WIDTH, height: HEIGHT } },
    locale: "en-NG",
    timezoneId: "Africa/Lagos",
    colorScheme: "light",
  });
  await context.addInitScript({ path: path.join(__dirname, "overlay.js") });
  // Voice stand-in and speech log, for the voice chapter (see voice-shim.js).
  await context.addInitScript({ path: path.join(__dirname, "voice-shim.js") });
  const page = await context.newPage();
  const timeline = new Timeline(Date.now());
  page.setDefaultTimeout(15_000);
  // A dev server compiles each page on first visit; production is much faster.
  page.setDefaultNavigationTimeout(60_000);
  const demo = new Demo(page, timeline, outDir);

  let stopped: string | undefined;
  try {
    await featureTour(demo);
    const email = env("DEMO_EMAIL");
    const password = env("DEMO_PASSWORD");
    if (email && password) {
      await memberTour(demo, email, password);
      const staffEmail = env("DEMO_HOSPITAL_EMAIL") ?? "demo-hospital-ikeja@example.test";
      await hospitalConversationTour(demo, email, staffEmail, password);
    }
    const adminEmail = env("DEMO_ADMIN_EMAIL");
    // The demo seed gives every demo account DEMO_PASSWORD, the administrator included.
    const adminPassword = env("DEMO_ADMIN_PASSWORD") ?? password;
    if (ADMIN_URL && adminEmail && adminPassword) {
      await adminTour(demo, ADMIN_URL, adminEmail, adminPassword);
    }
    await demo.step("Closing card", false, async () => {
      await demo.goto("/");
      await demo.chapter("Nutraboom Equals", new URL(BASE_URL).host);
    });
  } catch (error) {
    if (!(error instanceof StopTour)) throw error;
    stopped = error.message;
  } finally {
    // The video starts on a blank page while the first page loads; the
    // captions and chapters are written for the video trimmed to the first
    // chapter card, which is what demo:polish produces.
    const recorded = timeline.finish();
    const trimStart = Math.max(0, (recorded.find((e) => e.kind === "chapter")?.start ?? 0) - 0.3);
    const events = shiftEvents(recorded, trimStart);
    // What the app read aloud, with when, for the sound track.
    const spoken = await page.evaluate(() => window.__demoSpoken ?? []).catch(() => []);
    for (const said of spoken) demo.cues.push({ at: said.at, kind: "reply", text: said.text });
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) renameSync(await video.path(), path.join(outDir, "raw.webm"));

    writeAudioCues(outDir, demo.cues, timeline.startedAt, trimStart);
    const title = "Nutraboom Equals product demo";
    writeFileSync(path.join(outDir, "captions.srt"), toSrt(events));
    writeFileSync(path.join(outDir, "chapters.ffmeta"), toFfmetadata(events, title));
    writeFileSync(path.join(outDir, "chapters.txt"), toChapterList(events));
    writeFileSync(path.join(outDir, "narration.txt"), toNarrationScript(events));
    const failed = demo.results.filter((r) => !r.ok);
    writeFileSync(
      path.join(outDir, "report.json"),
      JSON.stringify(
        {
          baseUrl: BASE_URL,
          recordedAt: new Date().toISOString(),
          viewport: `${WIDTH}x${HEIGHT}`,
          trimStartSeconds: Math.round(trimStart * 1000) / 1000,
          durationSeconds: Math.round(Math.max(0, ...events.map((e) => e.end)) * 10) / 10,
          stoppedAt: stopped ?? null,
          steps: demo.results,
          timeline: events,
        },
        null,
        2,
      ),
    );
    console.log(
      `\n${demo.results.length - failed.length}/${demo.results.length} steps passed. Files in ${path.relative(process.cwd(), outDir)}`,
    );
    if (stopped) {
      console.error(`Stopped: required step "${stopped}" failed.`);
      process.exitCode = 1;
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
