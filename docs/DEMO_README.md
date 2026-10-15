# Product demo video generator

An automated, repeatable product demo of Nutraboom Equals. A Playwright script opens the site at 1920×1080, walks through the main features at a steady pace, and records the session. It shows chapter title cards, captions, highlight boxes and a visible cursor, and checks that each important interaction worked. A second script turns the recording into a polished MP4.

- Recorder: `scripts/demo/record-demo.ts`. Overlay: `scripts/demo/overlay.js`. Captions and chapters: `scripts/demo/timeline.ts`. Polishing: `scripts/demo/polish-demo.ts`.
- Decision record: ADR-081 in [decisions.md](decisions.md).

## Quick start

```bash
npm install
npx playwright install chromium
npm run demo:record
```

The last command records the public tour of the live site (https://nutraboom-equals.vercel.app). It takes about three minutes and saves everything to a new folder, `demo-output/<date-time>/`.

If `npx playwright install chromium` cannot download (for example behind a firewall), the recorder uses an installed Google Chrome or Microsoft Edge instead. To choose one, set `DEMO_BROWSER=chrome` or `DEMO_BROWSER=msedge`.

To make the polished MP4 (this needs ffmpeg, see below):

```bash
npm run demo:polish
```

## The demo journey

| #   | Chapter           | What happens                                                                                                                         | Checked                                                                        | Required |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------- |
| 1   | Nutraboom Equals  | Home page: the promise, the "Ask Nutraboom Equals" button, a scroll through the sections                                             | Page answers, main heading and chat button visible                             | Yes      |
| 2   | Ask the assistant | Opens the chat, highlights the suggested questions, asks "What's the nutrition in an orange?"                                        | A reply appears within 60 s, and the app's error message does not              | Yes      |
| 3   | Budget planning   | "I have ₦2,000 to cook dinner for 3 people…", then answers the follow-up question; highlights the budget estimate when one is shown  | Both replies appear                                                            | No       |
| 4–8 | Feature pages     | Meal Planner, Verified products, Nutritionists, Accessible hospitals, About                                                          | Each page answers below 400 and shows its heading                              | No       |
| 9   | Your account      | Only with `DEMO_EMAIL` and `DEMO_PASSWORD`: logs in as the demo member and shows the account dashboard                               | Login leaves the login page; the dashboard heading shows                       | No       |
| 10  | n-equals          | Only with the `DEMO_ADMIN_*` settings: logs in to the admin portal, shows the analytics, platform users and AI providers (read-only) | Login succeeds; the analytics cards, pagination and "Add an API key" are found | No       |
| 11  | Closing card      | Back to the home page with a closing title                                                                                           | Page answers                                                                   | No       |

A failed **required** step stops the tour. A failed optional step is skipped and the tour continues. Either way, a screenshot (`failed-<n>.png`) and the error go into `report.json`, and the command exits with code 1 when a required step failed.

Every step waits for the page to load, for the network to go quiet, for fonts and images, and for animations with an end (the hero animation repeats forever, so it is not waited for). Pauses scale with `DEMO_PACE`.

## Settings

Set these as environment variables, or in `.env.local`. Environment variables win.

| Variable              | Default                               | Purpose                                                                                    |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `DEMO_BASE_URL`       | `https://nutraboom-equals.vercel.app` | Site to record, e.g. `http://localhost:3000`                                               |
| `DEMO_PACE`           | `1`                                   | Multiplies every pause: `0.6` for a quick check, `1.3` for a slower video                  |
| `DEMO_CHAT`           | `on`                                  | `off` skips the chat (for example when the site has no AI key)                             |
| `DEMO_EMAIL`          | (none)                                | Dedicated demo member account; turns on chapter 9                                          |
| `DEMO_PASSWORD`       | (none)                                | That account's password. Locally it is also the password the demo seed gives demo accounts |
| `DEMO_ADMIN_URL`      | (none)                                | n-equals address, e.g. `http://localhost:3001`; with the next two, turns on chapter 10     |
| `DEMO_ADMIN_EMAIL`    | (none)                                | Dedicated demo administrator                                                               |
| `DEMO_ADMIN_PASSWORD` | `DEMO_PASSWORD`                       | That administrator's password                                                              |
| `DEMO_HEADED`         | (off)                                 | `1` shows the browser while recording                                                      |
| `DEMO_BROWSER`        | (Playwright's Chromium)               | `chrome` or `msedge` to use an installed browser                                           |

Passwords are typed straight into the password field. They are never shown on screen (the field masks them), logged, or written to the output.

### Demo data and accounts: never production data

- **Public tour (the default):** it only reads pages, apart from the chat. The chat sends three messages, which create an anonymous conversation that expires like any other. Use `DEMO_CHAT=off` to send nothing.
- **Signed-in and admin chapters:** use dedicated demo accounts, never a real person's. The simplest way is a local copy with the demo seed, which creates realistic but fictional people and businesses under `@example.test`:

  ```bash
  npm run db:seed:demo -- --enable-features
  npm run dev:all
  DEMO_BASE_URL=http://localhost:3000 DEMO_EMAIL=demo-user@example.test DEMO_ADMIN_URL=http://localhost:3001 DEMO_ADMIN_EMAIL=demo-admin@example.test npm run demo:record
  ```

  Set `DEMO_PASSWORD` in `.env.local` first: the seed gives it to every demo account, `demo-user@example.test` (member) and `demo-admin@example.test` (super administrator) included. The seed refuses to run against production.

- The admin chapter only opens pages. It never presses Suspend, Delete, Add, Activate or any other action.
- Against the live site, create demo accounts with `@example.test`-style addresses for this purpose only, and do not use the admin chapter with a real administrator's account.

## Output files

Each run creates `demo-output/<date-time>/` (git-ignored, and excluded from Vercel uploads):

| File              | What it is                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `raw.webm`        | The raw recording, 1920×1080, VP8. It starts with a few seconds of blank page while the first page loads   |
| `captions.srt`    | Captions and chapter titles, timed for the polished video (the blank start trimmed)                        |
| `chapters.ffmeta` | Chapter markers in ffmpeg metadata format, used by `demo:polish`                                           |
| `chapters.txt`    | A chapter list (`0:00 Nutraboom Equals` …) to paste into a YouTube or Vimeo description                    |
| `narration.txt`   | The captions as a timed voice-over script                                                                  |
| `report.json`     | Steps passed or failed (with timings and errors), the blank lead-in to trim, the duration and the timeline |
| `failed-<n>.png`  | A screenshot for each failed step                                                                          |
| `demo.mp4`        | Made by `npm run demo:polish`                                                                              |

## Polishing into an MP4

`npm run demo:polish` takes the newest run, or the folder you name (`npm run demo:polish -- demo-output/<run>`), and writes `demo.mp4`:

- trimmed to start on the first chapter card;
- H.264, 1920×1080, 30 fps, high quality (CRF 18), web-optimised (`+faststart`);
- fade in from black and fade out at the end; the chapter cards in the recording act as transitions between sections;
- captions burnt in at the bottom, in the brand colours;
- chapter markers, which most players show as a chapter menu.

Options (after `--`):

| Option               | Effect                                                                         |
| -------------------- | ------------------------------------------------------------------------------ |
| `--soft-captions`    | Captions as a track that viewers can turn on and off, instead of burnt in      |
| `--no-captions`      | No captions                                                                    |
| `--narration <file>` | Adds a voice-over (MP3, WAV or M4A)                                            |
| `--music <file>`     | Adds background music, quiet under the narration or a little louder without it |

**ffmpeg is required.** Install a full build: on Windows `winget install Gyan.FFmpeg`, on macOS `brew install ffmpeg`, on Linux `apt install ffmpeg`. Alternatively, set `FFMPEG_PATH`. Playwright's own ffmpeg can only write WebM, so it cannot make the MP4.

### Adding narration

1. Open `narration.txt`. It lists each chapter and caption with its time.
2. Record a voice-over that follows it, or produce one with a text-to-speech service. Keep each line within its time slot.
3. Run `npm run demo:polish -- --narration voice.mp3`, adding `--music bed.mp3` if you have licensed music.

For more editing (title animations, zooms, music cues), import `raw.webm`, `captions.srt` and `chapters.txt` into an editor such as DaVinci Resolve, Shotcut or Kapwing. The captions and chapters are timed from the first chapter card, so trim the blank start first: `report.json` gives its length as `trimStartSeconds`.

## Changing the tour

- Each chapter is a `demo.step(name, required, async () => { … })` in `record-demo.ts`.
- Use `demo.chapter(title, subtitle)` for a title card and `demo.caption(text)` for a caption.
- Use `demo.highlight(locator, label)` for a highlight box, `demo.click` and `demo.typeInto` for actions with the visible cursor, and `demo.scroll(screens)` to scroll.
- Find elements by role and accessible name (`page.getByRole("button", { name: "…" })`), the same way assistive technology does. That keeps the script stable when styling changes.
- Run `npm test -- demo-timeline` after changing `timeline.ts`.

## Troubleshooting

| Problem                                 | What to do                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "Executable doesn't exist" / no browser | `npx playwright install chromium`, or set `DEMO_BROWSER=chrome` or `msedge`                       |
| "Ask the assistant" fails               | The site's AI is not answering: check the AI provider in n-equals, or record with `DEMO_CHAT=off` |
| Timeouts on a local dev server          | The first visit to each page compiles it. Run the tour twice, or use `npm run build && npm start` |
| The video is too fast or too slow       | `DEMO_PACE=1.3` (slower) or `0.8` (faster)                                                        |
| `demo:polish` says ffmpeg was not found | Install ffmpeg (above) or set `FFMPEG_PATH`                                                       |
