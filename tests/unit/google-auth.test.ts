import { describe, expect, it, vi } from "vitest";
import {
  authorizationUrl,
  codeChallenge,
  exchangeCode,
  googleConfig,
  newAttempt,
  profileFromIdToken,
  type GoogleConfig,
} from "@/lib/auth/google";
import { readAttempt, safeNext } from "@/lib/auth/google-cookie";
import { InMemoryAuthRepository } from "@/lib/auth/repository";
import { AuthService, NO_PASSWORD, type OAuthProfile } from "@/lib/auth/service";
import { signInError } from "@/lib/auth/sign-in-errors";

/** "Continue with Google" (ADR-071). */

const CONFIG: GoogleConfig = {
  clientId: "test-client.apps.googleusercontent.com",
  clientSecret: "test-secret",
  redirectUri: "http://localhost:3000/api/auth/google/callback",
};
const NOW = new Date("2026-10-09T10:00:00Z");

function idToken(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "RS256" })}.${enc(claims)}.signature`;
}

const GOOD = {
  iss: "https://accounts.google.com",
  aud: CONFIG.clientId,
  exp: NOW.getTime() / 1000 + 600,
  nonce: "n-1",
  sub: "google-123",
  email: "ada@example.test",
  email_verified: true,
  name: "Ada Obi",
};

describe("Google configuration and request", () => {
  it("is off without both keys, and builds the redirect URI from APP_URL", () => {
    expect(googleConfig({})).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: "x" })).toBeNull();
    expect(
      googleConfig({ GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y", APP_URL: "https://ne.ng/" }),
    ).toEqual({
      clientId: "x",
      clientSecret: "y",
      redirectUri: "https://ne.ng/api/auth/google/callback",
    });
  });

  it("asks for openid email profile with state, nonce and an S256 PKCE challenge", () => {
    const attempt = newAttempt("/planner");
    const url = new URL(authorizationUrl(CONFIG, attempt));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe(attempt.state);
    expect(url.searchParams.get("nonce")).toBe(attempt.nonce);
    expect(url.searchParams.get("code_challenge")).toBe(codeChallenge(attempt.verifier));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe(attempt.verifier);
    expect(newAttempt("/").state).not.toBe(attempt.state);
  });

  it("only continues to same-site paths and reads the attempt cookie safely", () => {
    expect(safeNext("/planner")).toBe("/planner");
    expect(safeNext("//evil.example")).toBe("/account");
    expect(safeNext("/\\evil.example")).toBe("/account");
    expect(safeNext("https://evil.example")).toBe("/account");
    expect(readAttempt("not json")).toBeNull();
    expect(readAttempt(JSON.stringify({ state: "s" }))).toBeNull();
    expect(readAttempt(JSON.stringify(newAttempt("/")))).not.toBeNull();
  });

  it("maps error codes to messages and ignores unknown ones", () => {
    expect(signInError("google_cancelled")).toMatch(/cancelled/);
    expect(signInError("<script>")).toBeNull();
    expect(signInError(undefined)).toBeNull();
  });
});

describe("ID token checks", () => {
  it("accepts a valid token", () => {
    expect(profileFromIdToken(idToken(GOOD), CONFIG, "n-1", NOW)).toEqual({
      provider: "google",
      accountId: "google-123",
      email: "ada@example.test",
      emailVerified: true,
      name: "Ada Obi",
    });
  });

  it.each([
    ["another issuer", { iss: "https://evil.example" }],
    ["another audience", { aud: "someone-else" }],
    ["an expired token", { exp: NOW.getTime() / 1000 - 1 }],
    ["a different nonce", { nonce: "replayed" }],
    ["no subject", { sub: "" }],
  ])("rejects %s", (_label, change) => {
    expect(profileFromIdToken(idToken({ ...GOOD, ...change }), CONFIG, "n-1", NOW)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(profileFromIdToken("nonsense", CONFIG, "n-1", NOW)).toBeNull();
    expect(profileFromIdToken("a.%%%.c", CONFIG, "n-1", NOW)).toBeNull();
  });
});

describe("code exchange", () => {
  const attempt = { state: "s", verifier: "v", nonce: "n-1", next: "/" };

  it("posts the code with the PKCE verifier and returns the profile", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ id_token: idToken({ ...GOOD, exp: Date.now() / 1000 + 600 }) }),
        ),
    );
    const result = await exchangeCode(
      "code-1",
      attempt,
      CONFIG,
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok && result.profile.accountId).toBe("google-123");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init.body as URLSearchParams);
    expect(body.get("code")).toBe("code-1");
    expect(body.get("code_verifier")).toBe("v");
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("fails safely when Google refuses, is unreachable or returns no token", async () => {
    const refuse = vi.fn(async () => new Response("{}", { status: 400 }));
    expect(await exchangeCode("c", attempt, CONFIG, refuse as unknown as typeof fetch)).toEqual({
      ok: false,
      error: "exchange_failed",
    });
    const offline = vi.fn(async () => {
      throw new Error("offline");
    });
    expect((await exchangeCode("c", attempt, CONFIG, offline as unknown as typeof fetch)).ok).toBe(
      false,
    );
    const empty = vi.fn(async () => new Response("{}"));
    expect(await exchangeCode("c", attempt, CONFIG, empty as unknown as typeof fetch)).toEqual({
      ok: false,
      error: "invalid_token",
    });
  });
});

describe("signing in with a Google profile", () => {
  const profile: OAuthProfile = {
    provider: "google",
    accountId: "google-123",
    email: "Ada@Example.test",
    emailVerified: true,
    name: "Ada Obi",
  };

  function setup() {
    const repo = new InMemoryAuthRepository();
    return { repo, auth: new AuthService(repo, () => NOW) };
  }

  it("creates a confirmed account with no usable password, then signs in through the link", async () => {
    const { repo, auth } = setup();
    const first = await auth.signInWithOAuth(profile);
    expect(first.ok && first.created).toBe(true);
    const user = await repo.findUserByEmail("ada@example.test");
    expect(user?.name).toBe("Ada Obi");
    expect(user?.passwordHash).toBe(NO_PASSWORD);
    expect(user?.emailVerifiedAt).toEqual(NOW);
    // Password sign-in is impossible until a password is set by email.
    const pw = await auth.signIn({ email: "ada@example.test", password: NO_PASSWORD, app: "web" });
    expect(pw.ok).toBe(false);
    // A changed Google email still finds the same account by its Google id.
    const again = await auth.signInWithOAuth({ ...profile, email: "new@example.test" });
    expect(again.ok && !again.created && again.user.id).toBe(user!.id);
  });

  it("links an existing confirmed account and keeps its password", async () => {
    const { repo, auth } = setup();
    await auth.signUp({ email: "ada@example.test", name: "Ada", password: "a-long-password" });
    const existing = (await repo.findUserByEmail("ada@example.test"))!;
    await repo.setEmailVerified(existing.id, NOW);
    const result = await auth.signInWithOAuth(profile);
    expect(result.ok && !result.created && result.user.id).toBe(existing.id);
    expect(
      (await auth.signIn({ email: "ada@example.test", password: "a-long-password", app: "web" }))
        .ok,
    ).toBe(true);
  });

  it("removes the password and sessions of an unconfirmed account it takes over (pre-hijacking)", async () => {
    const { repo, auth } = setup();
    await auth.signUp({ email: "ada@example.test", name: "Squatter", password: "squatter-pass" });
    const squat = await auth.signIn({
      email: "ada@example.test",
      password: "squatter-pass",
      app: "web",
    });
    expect(squat.ok).toBe(true);
    const result = await auth.signInWithOAuth(profile);
    expect(result.ok).toBe(true);
    const user = (await repo.findUserByEmail("ada@example.test"))!;
    expect(user.passwordHash).toBe(NO_PASSWORD);
    expect(user.emailVerifiedAt).toEqual(NOW);
    expect(squat.ok && (await auth.getSession(squat.token, "web"))).toBeNull();
  });

  it("refuses an unverified Google email and suspended accounts", async () => {
    const { repo, auth } = setup();
    expect((await auth.signInWithOAuth({ ...profile, emailVerified: false })).ok).toBe(false);
    expect(repo.users.size).toBe(0);
    const made = await auth.signInWithOAuth(profile);
    const id = made.ok ? made.user.id : "";
    repo.users.set(id, { ...repo.users.get(id)!, status: "suspended" });
    const blocked = await auth.signInWithOAuth(profile);
    expect(!blocked.ok && blocked.error).toMatch(/suspended/);
  });
});
