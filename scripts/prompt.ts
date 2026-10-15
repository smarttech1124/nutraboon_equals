import { createInterface } from "node:readline";
import { Writable } from "node:stream";

/**
 * Line-by-line prompts for the admin scripts. One interface for every
 * question, so piped input is not lost between them; hidden answers (passwords)
 * are never echoed.
 */
let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
// The iterator buffers lines, so a line that arrives early still answers its question.
const lines = rl[Symbol.asyncIterator]();

export async function ask(question: string, { hidden = false } = {}): Promise<string> {
  process.stdout.write(question);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write("\n");
  return done ? "" : String(value).trim();
}

export function closePrompts(): void {
  rl.close();
}
