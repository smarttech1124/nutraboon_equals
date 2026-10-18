# Product demo video generator

An automated, repeatable product demo of Nutraboom Equals. A Playwright script opens the site at 1920×1080, walks through the main features at a steady pace, and records the session. It shows chapter title cards, captions, highlight boxes and a visible cursor, and checks that each important interaction worked. A second script turns the recording into a polished MP4.

- Recorder: `scripts/demo/record-demo.ts`. Overlay: `scripts/demo/overlay.js`. Voice stand-in: `scripts/demo/voice-shim.js`. Captions and chapters: `scripts/demo/timeline.ts`. Polishing: `scripts/demo/polish-demo.ts`.
- Decision records: ADR-081 and ADR-088 in [decisions.md](decisions.md).

## Quick start

```bash
npm install
npx playwright install chromium
npm run demo:record
```

The last command records the tour of the live site (https://nutraboom-equals.vercel.app). It takes about ten minutes, mostly waiting for the assistant's replies, and saves everything to a new folder, `demo-output/<date-time>/`.

To record a fresh local copy instead (recommended: it has the demo partners and every module on), build and start it first:

```bash
npm run db:seed:demo -- --enable-features
npm run build
npm start
DEMO_BASE_URL=http://localhost:3000 npm run demo:record
```

If `npx playwright install chromium` cannot download (for example behind a firewall), the recorder uses an installed Google Chrome or Microsoft Edge instead. To choose one, set `DEMO_BROWSER=chrome` or `DEMO_BROWSER=msedge`.

To make the polished MP4 (this needs ffmpeg, see below):

```bash
npm run demo:polish
```

## The demo journey

| #   | Chapter                            | What happens                                                                                                                                                                                                                                                                                                          | Checked                                                                                 | Required |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| 1   | Nutraboom Equals                   | Home page: the headline, the chat button, the accessibility section, a scroll through the rest                                                                                                                                                                                                                        | Page answers, heading, chat button and accessibility section visible                    | Yes      |
| 2   | Chat with the assistant            | Expands the chat, starts a new conversation and asks, one after another: "Can I give my baby semo at 4 months?", "Can I eat pineapple during pregnancy?", "I heard pineapple is acidic and is not good for pregnant women.", "What food can I cook tonight?", "I have pains when breastfeeding my baby. Why is that?" | Each reply appears within 60 s, with no error message; each is scrolled through to read | Yes      |
| 3   | Your language                      | Settings → Response language → Yorùbá, a new conversation in Yorùbá; then Igbo and a new conversation in Igbo; back to Nigerian English                                                                                                                                                                               | The Beta note appears; the replies contain Yorùbá and Igbo letters (ẹ ọ ṣ, ị ọ ụ)       | No       |
| 4   | Sign language (demo)               | Settings → Sign language response (demo); a question; the sample video with its demo notice; Show another demo video; switched off again                                                                                                                                                                              | The video loads (Replay appears) both times                                             | No       |
| 5   | Speak and listen                   | The microphone button; the spoken question appears word by word in the box; Send; the reply is read aloud (Stop reading shown)                                                                                                                                                                                        | Listening state, the transcript in the box, the reply, and reading aloud all happen     | No       |
| 6–8 | Products, Nutritionists, Hospitals | Each directory with its first listing highlighted                                                                                                                                                                                                                                                                     | The page answers, is not "Coming soon", and has a listing                               | No       |
| 9   | Your account                       | Only with `DEMO_EMAIL` and `DEMO_PASSWORD`: logs in as the demo member and shows the account dashboard                                                                                                                                                                                                                | Login leaves the login page; the dashboard heading shows                                | No       |
| 10  | n-equals                           | Only with the `DEMO_ADMIN_*` settings: the admin portal's analytics, platform users and AI providers (read-only)                                                                                                                                                                                                      | Login succeeds; the analytics cards, pagination and "Add an API key" are found          | No       |
| 11  | Closing card                       | Back to the home page with a closing title                                                                                                                                                                                                                                                                            | Page answers                                                                            | No       |

### Voice: what is real and what is simulated

Browsers return no speech-recognition results under automation, and a recording has no microphone. Both Chrome and Edge were tried with a recorded voice clip: they detected sound but returned no words. So for chapter 5, `voice-shim.js` (injected into the recording browser only, never into the app) replaces the browser's speech recognition with a stand-in that "hears" the prepared question word by word. The video says so on screen.

Everything after that is the app's real behaviour:

- the listening state;
- the transcript placed in the box for checking;
- sending as a voice message;
- the reply read aloud with the browser's real speech synthesis, and its Stop reading button.

A screen recording is silent. The recorder therefore notes when each sentence was spoken (`audio/cues.json`) and, on Windows, synthesises the same words with the built-in voices: Zira for the question, David for the reply, the same voices the browser uses on Windows. `demo:polish` places them at those moments, so the MP4 has the spoken question and the spoken reply.

A failed **required** step stops the tour. A failed optional step is skipped and the tour continues. Either way, a screenshot (`failed-<n>.png`) and the error go into `report.json`, and the command exits with code 1 when a required step failed.

Every step waits for the page to load, for the network to go quiet, for fonts and images, and for animations with an end (the hero animation repeats forever, so it is not waited for). Pauses scale with `DEMO_PACE`.

## Settings

Set these as environment variables, or in `.env.local`. Environment variables win.

| Variable              | Default                               | Purpose                                                                                    |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `DEMO_BASE_URL`       | `https://nutraboom-equals.vercel.app` | Site to record, e.g. `http://localhost:3000`                                               |
| `DEMO_PACE`           | `1`                                   | Multiplies every pause: `0.6` for a quick check, `1.3` for a slower video                  |
| `DEMO_EMAIL`          | (none)                                | Dedicated demo member account; turns on chapter 9                                          |
| `DEMO_PASSWORD`       | (none)                                | That account's password. Locally it is also the password the demo seed gives demo accounts |
| `DEMO_ADMIN_URL`      | (none)                                | n-equals address, e.g. `http://localhost:3001`; with the next two, turns on chapter 10     |
| `DEMO_ADMIN_EMAIL`    | (none)                                | Dedicated demo administrator                                                               |
| `DEMO_ADMIN_PASSWORD` | `DEMO_PASSWORD`                       | That administrator's password                                                              |
| `DEMO_HEADED`         | (off)                                 | `1` shows the browser while recording                                                      |
| `DEMO_BROWSER`        | (Playwright's Chromium)               | `chrome` or `msedge` to use an installed browser                                           |

Passwords are typed straight into the password field. They are never shown on screen (the field masks them), logged, or written to the output.

### Demo data and accounts: never production data

- **The tour:** it only reads pages, apart from the chat. The chat sends about ten messages, in anonymous conversations that expire like any other.
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
| `audio/`          | `cues.json` (what was said aloud and when) and, on Windows, a WAV file for each spoken sentence            |
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
| `--no-voice`         | Leaves out the spoken question and reply from `audio/` (included by default)   |

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
