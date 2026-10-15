import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { AdminRole } from "./permissions";
import type { AuthRepository, OAuthProvider, SessionRecord, UserRecord } from "./service";

/** PostgreSQL storage for accounts and sessions (ADR-061). */
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createUser(data: { email: string; name: string; passwordHash: string }): Promise<UserRecord> {
    return this.prisma.user.create({ data });
  }

  async findUserByOAuth(provider: OAuthProvider, accountId: string): Promise<UserRecord | null> {
    const link = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: accountId } },
      include: { user: true },
    });
    return link?.user ?? null;
  }

  async linkOAuth(userId: string, provider: OAuthProvider, accountId: string): Promise<void> {
    // Idempotent: two sign-ins racing on a new account do not fail.
    await this.prisma.oAuthAccount.upsert({
      where: { provider_providerAccountId: { provider, providerAccountId: accountId } },
      create: { userId, provider, providerAccountId: accountId },
      update: {},
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async setEmailVerified(userId: string, at: Date): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: at } });
  }

  async adminRoles(userId: string): Promise<AdminRole[]> {
    const rows = await this.prisma.adminRoleAssignment.findMany({ where: { userId } });
    return rows.map((r) => r.role);
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.prisma.session.create({ data: session });
  }

  findSession(id: string): Promise<SessionRecord | null> {
    return this.prisma.session.findUnique({
      where: { id },
      select: { id: true, userId: true, app: true, expiresAt: true },
    });
  }

  async extendSession(id: string, expiresAt: Date, lastSeenAt: Date): Promise<void> {
    await this.prisma.session.update({ where: { id }, data: { expiresAt, lastSeenAt } });
  }

  async deleteSession(id: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id } });
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async createToken(token: {
    id: string;
    userId: string;
    purpose: "verify_email" | "reset_password";
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.authToken.create({ data: token });
  }

  async consumeToken(
    id: string,
    purpose: "verify_email" | "reset_password",
    now: Date,
  ): Promise<{ userId: string } | null> {
    // One atomic update: a token can be used once, even by two requests at the same time.
    const { count } = await this.prisma.authToken.updateMany({
      where: { id, purpose, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count === 0) return null;
    const token = await this.prisma.authToken.findUnique({
      where: { id },
      select: { userId: true },
    });
    return token;
  }
}

/** Process-local storage for tests. */
export class InMemoryAuthRepository implements AuthRepository {
  users = new Map<string, UserRecord>();
  roles = new Map<string, AdminRole[]>();
  sessions = new Map<string, SessionRecord>();
  tokens = new Map<
    string,
    { userId: string; purpose: string; expiresAt: Date; usedAt: Date | null }
  >();
  private nextId = 1;

  async findUserByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async findUserById(id: string) {
    return this.users.get(id) ?? null;
  }
  async createUser(data: { email: string; name: string; passwordHash: string }) {
    const user: UserRecord = {
      id: `u${this.nextId++}`,
      ...data,
      status: "active",
      emailVerifiedAt: null,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }
  oauth = new Map<string, string>();
  async findUserByOAuth(provider: string, accountId: string) {
    const id = this.oauth.get(`${provider}:${accountId}`);
    return id ? (this.users.get(id) ?? null) : null;
  }
  async linkOAuth(userId: string, provider: string, accountId: string) {
    this.oauth.set(`${provider}:${accountId}`, userId);
  }
  async updatePassword(userId: string, passwordHash: string) {
    this.users.set(userId, { ...this.users.get(userId)!, passwordHash });
  }
  async setEmailVerified(userId: string, at: Date) {
    this.users.set(userId, { ...this.users.get(userId)!, emailVerifiedAt: at });
  }
  async adminRoles(userId: string) {
    return this.roles.get(userId) ?? [];
  }
  async createSession(session: SessionRecord) {
    this.sessions.set(session.id, session);
  }
  async findSession(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async extendSession(id: string, expiresAt: Date) {
    this.sessions.set(id, { ...this.sessions.get(id)!, expiresAt });
  }
  async deleteSession(id: string) {
    this.sessions.delete(id);
  }
  async deleteUserSessions(userId: string) {
    for (const [id, s] of this.sessions) if (s.userId === userId) this.sessions.delete(id);
  }
  async createToken(token: { id: string; userId: string; purpose: string; expiresAt: Date }) {
    this.tokens.set(token.id, { ...token, usedAt: null });
  }
  async consumeToken(id: string, purpose: string, now: Date) {
    const t = this.tokens.get(id);
    if (!t || t.purpose !== purpose || t.usedAt || t.expiresAt <= now) return null;
    t.usedAt = now;
    return { userId: t.userId };
  }
}
