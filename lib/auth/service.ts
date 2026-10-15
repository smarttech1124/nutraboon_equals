import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/admin/password";
import type { AdminRole } from "./permissions";

/**
 * Accounts and sessions (ADR-061): email and password (scrypt) or Google (ADR-071), database
 * sessions, one-time email tokens. Cookie tokens and email tokens are random
 * 256-bit values; only their SHA-256 is stored, so a database leak does not
 * hand out sessions or reset links.
 */

export type SessionApp = "web" | "admin";

export type OAuthProvider = "google";

/** A verified identity from a sign-in provider, after the app checked its token. */
export type OAuthProfile = {
  provider: OAuthProvider;
  accountId: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

/**
 * Stored as the password hash of accounts created through a provider: it is
 * not a valid scrypt hash, so password sign-in always fails until the person
 * sets a password with "Forgot your password?".
 */
export const NO_PASSWORD = "!no-password";

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: "active" | "suspended";
  emailVerifiedAt: Date | null;
  createdAt: Date;
};

/** What the rest of the app sees about the signed-in user. Never the hash. */
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  adminRoles: AdminRole[];
};

export type SessionRecord = { id: string; userId: string; app: SessionApp; expiresAt: Date };

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  createUser(data: { email: string; name: string; passwordHash: string }): Promise<UserRecord>;
  /** The user linked to this provider account, if any (ADR-071). */
  findUserByOAuth(provider: OAuthProvider, accountId: string): Promise<UserRecord | null>;
  linkOAuth(userId: string, provider: OAuthProvider, accountId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  setEmailVerified(userId: string, at: Date): Promise<void>;
  adminRoles(userId: string): Promise<AdminRole[]>;
  createSession(session: SessionRecord): Promise<void>;
  findSession(id: string): Promise<SessionRecord | null>;
  extendSession(id: string, expiresAt: Date, lastSeenAt: Date): Promise<void>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  createToken(token: {
    id: string;
    userId: string;
    purpose: "verify_email" | "reset_password";
    expiresAt: Date;
  }): Promise<void>;
  /** Marks the token used and returns it, only if it was unused and unexpired. */
  consumeToken(
    id: string,
    purpose: "verify_email" | "reset_password",
    now: Date,
  ): Promise<{ userId: string } | null>;
}

export const SESSION_TTL_MS: Record<SessionApp, number> = {
  /** Web sessions slide: each visit in the second half of the period renews them. */
  web: 30 * 24 * 60 * 60 * 1000,
  /** Admin sessions end 8 hours after sign-in, however active. */
  admin: 8 * 60 * 60 * 1000,
};
const TOKEN_TTL_MS = { verify_email: 48 * 60 * 60 * 1000, reset_password: 60 * 60 * 1000 };

export const PASSWORD_MIN = 10;
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(200, "That password is too long.");
const nameSchema = z.string().trim().min(1, "Enter your name.").max(100, "That name is too long.");

/** Hash of an unknown password, so an unknown email takes as long as a wrong password. */
let dummyHash: Promise<string> | undefined;

export function newToken(): { token: string; id: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, id: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type AuthResult<T> = ({ ok: true } & T) | { ok: false; error: string };

const SIGN_IN_FAILED = "Incorrect email or password.";

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async signUp(input: {
    email: string;
    name: string;
    password: string;
  }): Promise<AuthResult<{ user: AuthUser }>> {
    const parsed = z
      .object({ email: emailSchema, name: nameSchema, password: passwordSchema })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
    const { email, name, password } = parsed.data;
    if (await this.repo.findUserByEmail(email)) {
      // Same wording as sign-in hints, without confirming the account exists.
      return { ok: false, error: "That email can't be used. Sign in, or reset your password." };
    }
    const user = await this.repo.createUser({
      email,
      name,
      passwordHash: await hashPassword(password),
    });
    return { ok: true, user: toAuthUser(user, []) };
  }

  async signIn(input: {
    email: string;
    password: string;
    app: SessionApp;
  }): Promise<AuthResult<{ token: string; expiresAt: Date; user: AuthUser }>> {
    const email = emailSchema.safeParse(input.email);
    const user = email.success ? await this.repo.findUserByEmail(email.data) : null;
    if (!user) {
      dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
      await verifyPassword(input.password, await dummyHash);
      return { ok: false, error: SIGN_IN_FAILED };
    }
    if (!(await verifyPassword(input.password, user.passwordHash))) {
      return { ok: false, error: SIGN_IN_FAILED };
    }
    if (user.status !== "active") {
      return { ok: false, error: "This account is suspended. Contact support." };
    }
    const roles = await this.repo.adminRoles(user.id);
    if (input.app === "admin" && roles.length === 0) {
      // Same message: the admin portal does not reveal which accounts exist.
      return { ok: false, error: SIGN_IN_FAILED };
    }
    const { token, id } = newToken();
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS[input.app]);
    await this.repo.createSession({ id, userId: user.id, app: input.app, expiresAt });
    return { ok: true, token, expiresAt, user: toAuthUser(user, roles) };
  }

  /**
   * Sign-in or sign-up with a provider such as Google (ADR-071), for the
   * main site only. A known provider account signs in its user. Otherwise
   * the provider's verified email finds an existing account (which is then
   * linked) or creates a new one, already confirmed.
   */
  async signInWithOAuth(
    profile: OAuthProfile,
  ): Promise<AuthResult<{ token: string; expiresAt: Date; user: AuthUser; created: boolean }>> {
    let user = await this.repo.findUserByOAuth(profile.provider, profile.accountId);
    let created = false;
    if (!user) {
      const email = emailSchema.safeParse(profile.email);
      if (!email.success || !profile.emailVerified) {
        return { ok: false, error: "Your Google account's email address isn't verified." };
      }
      user = await this.repo.findUserByEmail(email.data);
      if (!user) {
        const name = nameSchema.safeParse(profile.name);
        user = await this.repo.createUser({
          email: email.data,
          name: name.success ? name.data : email.data.split("@")[0]!.slice(0, 100),
          passwordHash: NO_PASSWORD,
        });
        created = true;
      }
      await this.repo.linkOAuth(user.id, profile.provider, profile.accountId);
      if (!user.emailVerifiedAt) {
        // The provider has confirmed the address. Whoever set the password
        // never proved they own it, so that password and its sessions go
        // (account pre-hijacking); the owner can set a new one by email.
        if (!created) {
          await this.repo.updatePassword(user.id, NO_PASSWORD);
          await this.repo.deleteUserSessions(user.id);
        }
        await this.repo.setEmailVerified(user.id, this.now());
        user = { ...user, emailVerifiedAt: this.now() };
      }
    }
    if (user.status !== "active") {
      return { ok: false, error: "This account is suspended. Contact support." };
    }
    const { token, id } = newToken();
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS.web);
    await this.repo.createSession({ id, userId: user.id, app: "web", expiresAt });
    const roles = await this.repo.adminRoles(user.id);
    return { ok: true, token, expiresAt, user: toAuthUser(user, roles), created };
  }

  /** The user behind a session cookie, or null. Renews web sessions as they are used. */
  async getSession(
    token: string | undefined,
    app: SessionApp,
  ): Promise<{ user: AuthUser; renewedUntil?: Date } | null> {
    if (!token) return null;
    const id = hashToken(token);
    const session = await this.repo.findSession(id);
    const now = this.now();
    if (!session || session.app !== app || session.expiresAt <= now) return null;
    const user = await this.repo.findUserById(session.userId);
    if (!user || user.status !== "active") return null;
    const roles = await this.repo.adminRoles(user.id);
    if (app === "admin" && roles.length === 0) return null;

    let renewedUntil: Date | undefined;
    const ttl = SESSION_TTL_MS[app];
    if (app === "web" && session.expiresAt.getTime() - now.getTime() < ttl / 2) {
      renewedUntil = new Date(now.getTime() + ttl);
      await this.repo.extendSession(id, renewedUntil, now);
    }
    return { user: toAuthUser(user, roles), ...(renewedUntil ? { renewedUntil } : {}) };
  }

  async signOut(token: string | undefined): Promise<void> {
    if (token) await this.repo.deleteSession(hashToken(token));
  }

  /**
   * Starts a password reset. Returns the one-time token to email, or null when
   * there is no such active account; callers show the same message either way.
   */
  async requestPasswordReset(rawEmail: string): Promise<string | null> {
    const email = emailSchema.safeParse(rawEmail);
    if (!email.success) return null;
    const user = await this.repo.findUserByEmail(email.data);
    if (!user || user.status !== "active") return null;
    return this.issueToken(user.id, "reset_password");
  }

  async resetPassword(token: string, password: string): Promise<AuthResult<object>> {
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
    const used = await this.repo.consumeToken(hashToken(token), "reset_password", this.now());
    if (!used) return { ok: false, error: "This reset link has expired or was already used." };
    await this.repo.updatePassword(used.userId, await hashPassword(parsed.data));
    // Anyone signed in with the old password is signed out.
    await this.repo.deleteUserSessions(used.userId);
    return { ok: true };
  }

  /**
   * Changes the password of a signed-in person (ADR-075): the current
   * password is required, and every session of the account is ended so a
   * stolen session cannot outlive the change. Accounts made with Google have
   * no password yet; they set one through the emailed reset link.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthResult<object>> {
    const user = await this.repo.findUserById(userId);
    if (!user || user.status !== "active") return { ok: false, error: "Please sign in again." };
    if (user.passwordHash === NO_PASSWORD) {
      return {
        ok: false,
        error: "Your account has no password yet. Use “Forgot your password?” to set one by email.",
      };
    }
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return { ok: false, error: "Your current password is not correct." };
    }
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
    if (newPassword === currentPassword) {
      return { ok: false, error: "Choose a password different from your current one." };
    }
    await this.repo.updatePassword(userId, await hashPassword(parsed.data));
    await this.repo.deleteUserSessions(userId);
    return { ok: true };
  }

  issueEmailVerification(userId: string): Promise<string> {
    return this.issueToken(userId, "verify_email");
  }

  async verifyEmail(token: string): Promise<boolean> {
    const used = await this.repo.consumeToken(hashToken(token), "verify_email", this.now());
    if (!used) return false;
    await this.repo.setEmailVerified(used.userId, this.now());
    return true;
  }

  private async issueToken(
    userId: string,
    purpose: "verify_email" | "reset_password",
  ): Promise<string> {
    const { token, id } = newToken();
    await this.repo.createToken({
      id,
      userId,
      purpose,
      expiresAt: new Date(this.now().getTime() + TOKEN_TTL_MS[purpose]),
    });
    return token;
  }
}

function toAuthUser(user: UserRecord, roles: AdminRole[]): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerifiedAt !== null,
    adminRoles: roles,
  };
}
