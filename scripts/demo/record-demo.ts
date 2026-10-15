/**
 * Records a product demo of Nutraboom Equals with Playwright (docs/DEMO_README.md).
 *
 *   npm run demo:record                     public tour of the live site
 *   DEMO_BASE_URL=http://localhost:3000 npm run demo:record
 *
 * Optional segments, each only when its settings are given:
 *   DEMO_EMAIL / DEMO_PASSWORD              sign in as a dedicated demo member
 *   DEMO_ADMIN_URL / DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD   n-equals tour (read-only;
 *                                           the password defaults to DEMO_PASSWORD)
 *   DEMO_CHAT=off                           skip the two chat messages
 *   DEMO_HEADED=1                           show the browser while recording
 *   DEMO_BROWSER=chrome|msedge              use an installed browser instead of
 *                                           Playwright's Chromium
 *
 * Output: demo-output/<timestamp>/ with raw.webm, captions.srt, chapters.ffmeta,
 * chapters.txt, narration.txt, report.json and screenshots of any failed step.
 * Exits with code 1 when a required step fails.
 *
 * The tour only reads pages, except: the chat sends two messages (an anonymous
 * conversation that expires like any other) and signing in starts sessions.
 * Use dedicated demo accounts, never a real person's.
 */
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
const CHAT = (env("DEMO_CHAT") ?? "on").toLowerCase() !== "off";

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

class Demo {
  readonly results: StepResult[] = [];

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
  const outcome = await Promise.race([
    replies
      .nth(before)
      .waitFor({ state: "attached", timeout: 60_000 })
      .then(() => "reply" as const),
    dialog
      .getByRole("alert")
      .filter({ hasText: /trouble|try again/i })
      .first()
      .waitFor({ timeout: 60_000 })
      .then(() => "error" as const),
  ]);
  if (outcome === "error") throw new Error("The assistant showed its error message");
  await dialog
    .getByRole("log")
    .getByRole("status")
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => {});
  await pause(demo.page, 800);
}

async function publicTour(demo: Demo): Promise<void> {
  const page = demo.page;

  await demo.step("Home page", true, async () => {
    await demo.goto("/");
    await demo.chapter("Nutraboom Equals", "AI-powered nutrition for Nigeria");
    const heading = page.getByRole("heading", { level: 1 });
    await heading.waitFor();
    await demo.caption("Learn, plan, and get help in your language, by text or voice.");
    await demo.highlight(heading, "The promise");
    await demo.highlight(
      page.getByRole("button", { name: /Ask Nutraboom Equals/ }).first(),
      "Chat with no account",
    );
    await demo.caption("Below the fold: products, the Meal Planner, nutritionists and hospitals.");
    await demo.scroll(2.5);
    await demo.clearCaption();
    await demo.scrollToTop();
  });

  if (CHAT) {
    await demo.step("Ask the assistant", true, async () => {
      await demo.chapter("Ask the assistant", "Real nutrition data, in plain words");
      await demo.click(page.getByRole("button", { name: /Ask Nutraboom Equals/ }).first());
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await pause(page, 900);
      await demo.caption("Suggested questions help people start.");
      await demo.highlight(dialog.getByRole("list", { name: "Suggested questions" }), "Start here");
      await demo.clearCaption();
      await askAssistant(demo, dialog, "What's the nutrition in an orange?");
      await demo.caption(
        "Values come from the app's food database, not from the AI's memory.",
        4200,
      );
      await demo.clearCaption();
    });

    await demo.step("Plan within a budget", false, async () => {
      await demo.chapter("Budget planning", "Use what is at home, then shop smart");
      const dialog = page.getByRole("dialog");
      await askAssistant(
        demo,
        dialog,
        "I have ₦2,000 to cook dinner for 3 people. I already have rice, palm oil and two eggs.",
      );
      await demo.caption("Equals asks only what it still needs to know.", 2600);
      await demo.clearCaption();
      await askAssistant(demo, dialog, "Two adults and a 7-year-old, just tonight's dinner.");
      await demo.caption(
        "The app prices the shopping list from public market data and does the sums.",
        4200,
      );
      const budget = dialog.getByRole("region", { name: "Budget estimate" });
      if (await budget.count()) await demo.highlight(budget.first(), "Estimated cost and change");
      await demo.clearCaption();
      await demo.click(dialog.getByRole("button", { name: "Close chat" }));
      await pause(page, 600);
    });
  }

  const tourPage = (
    name: string,
    urlPath: string,
    title: string,
    subtitle: string,
    caption: string,
    label: string,
  ) =>
    demo.step(name, false, async () => {
      await demo.goto(urlPath);
      await demo.chapter(title, subtitle);
      const heading = page.getByRole("heading", { level: 1 }).first();
      await heading.waitFor({ timeout: 10_000 });
      await demo.caption(caption);
      await demo.highlight(heading, label);
      await demo.scroll(1.5);
      await demo.clearCaption();
    });

  await tourPage(
    "Meal Planner",
    "/planner",
    "Meal Planner",
    "Weekly plans with recipes and a priced shopping list",
    "Plans are built from the family's ages, budget and the food they already have.",
    "Weekly plans",
  );
  await tourPage(
    "Products",
    "/products",
    "Verified products",
    "Food from reviewed Nigerian businesses",
    "Every product lists its ingredients and allergens, and is reviewed before it appears.",
    "Product directory",
  );
  await tourPage(
    "Nutritionists",
    "/nutritionists",
    "Nutritionists",
    "Professionals whose qualifications are checked",
    "When someone needs more than general advice, the assistant can suggest a verified nutritionist.",
    "Verified directory",
  );
  await tourPage(
    "Hospitals",
    "/hospitals",
    "Accessible hospitals",
    "Book ahead and message by text or voice",
    "Partner hospitals list departments and access services for deaf, blind and speech-impaired patients.",
    "Find care near you",
  );
  await tourPage(
    "About",
    "/about",
    "About Nutraboom Equals",
    "Good nutrition advice should be easy to get",
    "Nutrition facts come from the FAO food composition table for West Africa.",
    "Our mission",
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
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
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
  const page = await context.newPage();
  const timeline = new Timeline(Date.now());
  page.setDefaultTimeout(15_000);
  // A dev server compiles each page on first visit; production is much faster.
  page.setDefaultNavigationTimeout(60_000);
  const demo = new Demo(page, timeline, outDir);

  let stopped: string | undefined;
  try {
    await publicTour(demo);
    const email = env("DEMO_EMAIL");
    const password = env("DEMO_PASSWORD");
    if (email && password) await memberTour(demo, email, password);
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
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) renameSync(await video.path(), path.join(outDir, "raw.webm"));

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
