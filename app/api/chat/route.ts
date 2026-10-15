import { chatDeps } from "@/lib/http/chat-deps";
import { createChatHandler } from "@/lib/http/chat-handler";

/**
 * Seconds a chat request may run on Vercel. Covers a Gemini call with
 * retries plus one regeneration after a failed safety check (ADR-030, ADR-038).
 */
export const maxDuration = 60;

export const POST = createChatHandler(chatDeps);
