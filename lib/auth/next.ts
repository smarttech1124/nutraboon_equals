import { cookies, headers } from "next/headers";
import { getPrisma } from "@/lib/db";
import { PostgresRateLimiter } from "@/lib/http/postgres-rate-limit";
import {
  clientKey,
  InMemoryRateLimiter,
  RateLimitUnavailableError,
  type RateLimiter,
} from "@/lib/http/rate-limit";
import { can, type Permission } from "./permissions";
import { PrismaAuthRepository } from "./repository";
import { AuthService, type AuthUser, type SessionApp } from "./service";

/**
 * Session cookies and checks for Next.js server components, server actions
 * and route handlers (ADR-061). Each app has its own cookie: the main site
 * and n-equals run on different origins and never share a session.
 */

export const SESSION_COOKIE: Record<SessionApp, string> = {
  web: "nbe_session",
  admin: "ne_admin_session",
};

const shared = globalThis as unknown as {
  authService?: AuthService;
  authLimiters?: Map<string, RateLimiter>;
};

export function getAuthService(): AuthService {
  shared.authService ??= new AuthService(new PrismaAuthRepository(getPrisma()));
  return shared.authService;
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Sign-in required");
    this.name = "AuthRequiredError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Not allowed");
    this.name = "ForbiddenError";
  }
}

/** The signed-in user for this request, or null. */
export async function currentUser(app: SessionApp): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE[app])?.value;
  if (!token) return null;
  const session = await getAuthService().getSession(token, app);
  if (!session) return null;
  if (session.renewedUntil) {
    try {
      setSessionCookie(jar, app, token, session.renewedUntil);
    } catch {
      // Server components cannot set cookies; the next action or route will.
    }
  }
  return session.user;
}

export async function requireUser(app: SessionApp): Promise<AuthUser> {
  const user = await currentUser(app);
  if (!user) throw new AuthRequiredError();
  return user;
}

/** For every n-equals page and action: a signed-in administrator with this permission. */
export async function requireAdmin(permission?: Permission): Promise<AuthUser> {
  const user = await requireUser("admin");
  if (permission && !can(user.adminRoles, permission)) throw new ForbiddenError();
  return user;
}

type CookieJar = Awaited<ReturnType<typeof cookies>>;

function setSessionCookie(jar: CookieJar, app: SessionApp, token: string, expires: Date) {
  jar.set(SESSION_COOKIE[app], token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Admin: never sent on cross-site requests. Web: sent when following a link in.
    sameSite: app === "admin" ? "strict" : "lax",
    path: "/",
    expires,
  });
}

export async function startSession(app: SessionApp, token: string, expiresAt: Date) {
  setSessionCookie(await cookies(), app, token, expiresAt);
}

export async function endSession(app: SessionApp) {
  const jar = await cookies();
  await getAuthService().signOut(jar.get(SESSION_COOKIE[app])?.value);
  jar.delete({ name: SESSION_COOKIE[app], path: "/" });
}

/** Attempt limits per client address (ADR-061), stored with the chat limits. */
const LIMITS = {
  signIn: { limit: 10, windowMs: 15 * 60 * 1000 },
  signUp: { limit: 5, windowMs: 60 * 60 * 1000 },
  reset: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** Appointment requests (ADR-064). */
  booking: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** File uploads to Cloudinary (ADR-064). */
  upload: { limit: 30, windowMs: 60 * 60 * 1000 },
  /** Sign-language responses (ADR-077). */
  signVideo: { limit: 120, windowMs: 60 * 60 * 1000 },
  /** Meal Planner conversation turns and plan generations (ADR-066). */
  planner: { limit: 60, windowMs: 60 * 60 * 1000 },
} as const;
export type AuthAttempt = keyof typeof LIMITS;

/**
 * True when this attempt is allowed. Fails closed: if the limiter's storage
 * is down, sign-in attempts are refused rather than left unguarded.
 */
export async function allowAttempt(kind: AuthAttempt, app: SessionApp): Promise<boolean> {
  shared.authLimiters ??= new Map();
  const id = `${app}:${kind}`;
  let limiter = shared.authLimiters.get(id);
  if (!limiter) {
    const { limit, windowMs } = LIMITS[kind];
    limiter = process.env.DATABASE_URL
      ? new PostgresRateLimiter(
          getPrisma(),
          limit,
          windowMs,
          process.env.RATE_LIMIT_SECRET || "nutraboom-equals-rate-limit",
        )
      : new InMemoryRateLimiter(limit, windowMs);
    shared.authLimiters.set(id, limiter);
  }
  try {
    const result = await limiter.check(`${id}:${clientKey(await headers())}`);
    return result.allowed;
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) return false;
    throw error;
  }
}
