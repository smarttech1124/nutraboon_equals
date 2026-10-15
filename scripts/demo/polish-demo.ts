/**
 * Turns a raw demo recording into a polished MP4 (docs/DEMO_README.md).
 *
 *   npm run demo:polish                         newest run in demo-output/
 *   npm run demo:polish -- demo-output/<run>    a given run
 *
 * Options (after --):
 *   --soft-captions        add captions as a selectable track instead of burning them in
 *   --no-captions          no captions at all
 *   --narration <file>     mix a voice-over (mp3/wav/m4a) under the video
 *   --music <file>         add background music at low volume (with or without narration)
 *
 * Produces demo.mp4 (H.264, 1920×1080, 30 fps, fade in and out, chapter
 * markers from the recording). Needs a full ffmpeg build: set FFMPEG_PATH or
 * put ffmpeg on PATH. Playwright's bundled ffmpeg only writes WebM and cannot
 * do this.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function ffmpegPath(): string {
  const candidates = [process.env.FFMPEG_PATH, "ffmpeg"].filter(Boolean) as string[];
  for (const bin of candidates) {
    const probe = spawnSync(bin, ["-hide_banner", "-version"], { encoding: "utf8" });
    if (probe.status === 0) {
      if (!/--enable-libx264/.test(probe.stdout)) {
        fail(`${bin} has no H.264 encoder (libx264). Install a full ffmpeg build.`);
      }
      return bin;
    }
  }
  return fail(
    "ffmpeg was not found. Install it (Windows: winget install Gyan.FFmpeg; macOS: brew install ffmpeg; Linux: apt install ffmpeg) or set FFMPEG_PATH.",
  );
}

function latestRun(): string {
  const root = path.resolve("demo-output");
  if (!existsSync(root)) fail("No demo-output folder. Run npm run demo:record first.");
  const runs = readdirSync(root)
    .map((name) => path.join(root, name))
    .filter((dir) => existsSync(path.join(dir, "raw.webm")))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return runs[0] ?? fail("No recording with raw.webm in demo-output.");
}

function main(): void {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const value = args[i + 1];
    if (!value || value.startsWith("--")) fail(`${name} needs a file.`);
    args.splice(i, 2);
    return path.resolve(value);
  };
  const flag = (name: string) => {
    const i = args.indexOf(name);
    if (i >= 0) args.splice(i, 1);
    return i >= 0;
  };
  const narration = option("--narration");
  const music = option("--music");
  const soft = flag("--soft-captions");
  const noCaptions = flag("--no-captions");
  const runDir = args[0] ? path.resolve(args[0]) : latestRun();

  for (const file of [narration, music]) {
    if (file && !existsSync(file)) fail(`Not found: ${file}`);
  }
  const raw = path.join(runDir, "raw.webm");
  if (!existsSync(raw)) fail(`No raw.webm in ${runDir}`);
  const report = JSON.parse(readFileSync(path.join(runDir, "report.json"), "utf8")) as {
    durationSeconds: number;
    trimStartSeconds?: number;
  };
  const duration = report.durationSeconds;
  const ffmpeg = ffmpegPath();

  // Run inside the run folder so filter arguments use plain relative names
  // (Windows drive letters need awkward escaping in ffmpeg filters).
  // Skip the blank lead-in before the first chapter card; captions and
  // chapters are already timed for the trimmed video.
  const trim = (report.trimStartSeconds ?? 0).toFixed(3);
  const inputs = ["-ss", trim, "-i", "raw.webm", "-i", "chapters.ffmeta"];
  let audioIndex = 2;
  const narrationIndex = narration ? audioIndex++ : -1;
  const musicIndex = music ? audioIndex++ : -1;
  if (narration) inputs.push("-i", narration);
  if (music) inputs.push("-stream_loop", "-1", "-i", music);

  const fadeOut = Math.max(0, duration - 0.8).toFixed(2);
  const video = [
    "fps=30",
    "scale=1920:1080:flags=lanczos",
    "fade=t=in:st=0:d=0.6",
    `fade=t=out:st=${fadeOut}:d=0.8`,
    ...(!noCaptions && !soft
      ? [
          "subtitles=captions.srt:force_style='FontName=Segoe UI,FontSize=20,PrimaryColour=&H00E0FAFE,BackColour=&HB0534626,BorderStyle=4,Outline=0,Shadow=0,MarginV=36'",
        ]
      : []),
  ].join(",");

  const filters = [`[0:v]${video}[v]`];
  let audioOut: string | undefined;
  if (narration && music) {
    filters.push(
      `[${musicIndex}:a]volume=0.12[m]`,
      `[${narrationIndex}:a][m]amix=inputs=2:duration=first:dropout_transition=2[a]`,
    );
    audioOut = "[a]";
  } else if (narration) {
    audioOut = `${narrationIndex}:a`;
  } else if (music) {
    filters.push(`[${musicIndex}:a]volume=0.25,afade=t=out:st=${fadeOut}:d=0.8[a]`);
    audioOut = "[a]";
  }

  const softSubs = soft && !noCaptions;
  const command = [
    "-y",
    "-hide_banner",
    ...inputs,
    ...(softSubs ? ["-i", "captions.srt"] : []),
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[v]",
    ...(audioOut ? ["-map", audioOut, "-c:a", "aac", "-b:a", "192k"] : []),
    ...(softSubs
      ? ["-map", `${audioIndex}:s`, "-c:s", "mov_text", "-metadata:s:s:0", "language=eng"]
      : []),
    "-map_metadata",
    "1",
    "-map_chapters",
    "1",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-t",
    duration.toFixed(2),
    "-movflags",
    "+faststart",
    "demo.mp4",
  ];
  console.log(`Polishing ${path.relative(process.cwd(), runDir)} (${duration}s)…`);
  const result = spawnSync(ffmpeg, command, { cwd: runDir, stdio: "inherit" });
  if (result.status !== 0) fail("ffmpeg failed; see its output above.");
  console.log(`Done: ${path.relative(process.cwd(), path.join(runDir, "demo.mp4"))}`);
}

main();
