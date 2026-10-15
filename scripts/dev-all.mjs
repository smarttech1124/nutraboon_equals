// Runs the public site (http://localhost:3000) and the n-equals admin portal
// (http://localhost:3001) together, with labelled output. Ctrl+C stops both;
// if either exits, the other is stopped too. No dependencies.
import { spawn } from "node:child_process";

const apps = [
  { name: "site ", color: 32, script: "dev" },
  { name: "admin", color: 35, script: "dev:admin" },
];

const children = apps.map(({ name, color, script }) => {
  const child = spawn("npm", ["run", script], {
    shell: process.platform === "win32",
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  const label = `\x1b[${color}m[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let partial = "";
    stream.on("data", (chunk) => {
      const lines = (partial + chunk).split(/\r?\n/);
      partial = lines.pop() ?? "";
      for (const line of lines)
        (stream === child.stderr ? process.stderr : process.stdout).write(label + line + "\n");
    });
  }
  child.on("exit", (code) => {
    process.stdout.write(`${label}exited with code ${code ?? 0}\n`);
    stop(code ?? 0);
  });
  return child;
});

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // On Windows npm runs through a shell: end the whole process tree.
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    else child.kill("SIGINT");
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
