/**
 * Prints new random server secrets (ADR-047, ADR-061). Run: npm run admin:secrets
 *
 *   AI_CREDENTIALS_KEY  encrypts AI and XEELAA keys saved in n-equals
 *   RATE_LIMIT_SECRET   hashes client addresses in the rate-limit table
 *
 * Keep AI_CREDENTIALS_KEY unchanged once keys are saved: a new value makes
 * every stored key unreadable, and they must be added again.
 * Administrators are created with: npm run admin:create
 */
import { randomBytes } from "node:crypto";

console.log("Add these to .env.local (and to the Vercel settings of both apps):\n");
console.log(`AI_CREDENTIALS_KEY=${randomBytes(32).toString("base64")}`);
console.log(`RATE_LIMIT_SECRET=${randomBytes(32).toString("base64url")}`);
