import path from "node:path";
import { chromium } from "playwright";
(async () => {
  const wav = path.resolve("demo-output/voice-test/question.wav");
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}%noloop`, "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  const page = await ctx.newPage();
  page.on("console", (m) => console.log("console:", m.text().slice(0, 200)));
  await page.goto("http://localhost:3000/");
  console.log("SR supported:", await page.evaluate(() => "webkitSpeechRecognition" in window || "SpeechRecognition" in window));
  console.log("voices:", await page.evaluate(() => new Promise((r) => { const v = speechSynthesis.getVoices(); if (v.length) r(v.length); else speechSynthesis.onvoiceschanged = () => r(speechSynthesis.getVoices().length); setTimeout(() => r(-1), 3000); })));
  await page.getByRole("button", { name: /Ask Nutraboom Equals/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Speak your message" }).click();
  await page.waitForTimeout(14000);
  console.log("input:", await dialog.getByLabel("Message Nutraboom Equals").inputValue());
  console.log("status:", (await dialog.innerText()).slice(-400));
  await browser.close();
})();
