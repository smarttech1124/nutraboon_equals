/**
 * npm run whatsapp:videos
 *
 * Copies the two WhatsApp sign-language demo videos (ADR-090,
 * lib/whatsapp/demo-videos.ts) from Wikimedia Commons into Cloudinary and
 * checks that the MP4 WhatsApp will fetch is really an MP4 under 16 MB.
 * Safe to run again: the same public IDs are replaced. Needs
 * CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (in
 * .env.local or the environment). Prints no secrets.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { cloudinaryConfig, uploadVideoFromUrl } from "../../lib/storage/cloudinary";
import { MP4_TRANSFORMATION, whatsappDemoVideos } from "../../lib/whatsapp/demo-videos";
import { MAX_MEDIA_BYTES } from "../../lib/whatsapp/media";

async function main() {
  const local = existsSync(".env.local") ? parse(readFileSync(".env.local")) : {};
  const env = { ...local, ...process.env };
  const config = cloudinaryConfig(env);
  if (!config) {
    throw new Error(
      "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET first.",
    );
  }
  const videos = whatsappDemoVideos(env);
  let failed = false;
  for (const v of videos) {
    // The WebM original: Cloudinary converts it to H.264/AAC MP4 itself.
    const source = v.video.sources.find((s) => s.type === "video/webm") ?? v.video.sources[0]!;
    process.stdout.write(`${v.video.title}\n  uploading to ${v.publicId} … `);
    // Downloaded here and sent as a file: Wikimedia rate-limits fetches from Cloudinary.
    const original = await fetch(source.src, {
      headers: { "User-Agent": "NutraboomEquals-setup/1.0 (WhatsApp sign-language demo)" },
      signal: AbortSignal.timeout(120_000),
    });
    if (!original.ok) throw new Error(`Could not download the original video (${original.status})`);
    const file = new Blob([await original.arrayBuffer()], { type: source.type });
    const uploaded = await uploadVideoFromUrl(config, {
      source: file,
      publicId: v.publicId,
      eager: `${MP4_TRANSFORMATION}/mp4`,
    });
    console.log(`done (${uploaded.format}, ${uploaded.bytes} bytes)`);

    // What Meta will fetch: it must be an MP4 within WhatsApp's 16 MB limit.
    const response = await fetch(v.url, { signal: AbortSignal.timeout(120_000) });
    const type = response.headers.get("content-type") ?? "";
    const bytes = response.ok ? (await response.arrayBuffer()).byteLength : 0;
    const ok = response.ok && type.startsWith("video/mp4") && bytes > 0 && bytes <= MAX_MEDIA_BYTES;
    console.log(
      `  ${ok ? "OK" : "PROBLEM"}: ${response.status} ${type || "no type"}, ${bytes} bytes\n  ${v.url}`,
    );
    if (!ok) failed = true;
  }
  if (failed) {
    process.exitCode = 1;
    console.log(
      "\nA video is not usable on WhatsApp yet. Check the Cloudinary account and try again.",
    );
  } else {
    console.log("\nBoth demo videos are ready. People can send VIDEO ON on WhatsApp.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Upload failed");
  process.exit(1);
});
