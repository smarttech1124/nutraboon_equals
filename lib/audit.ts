import { getPrisma } from "@/lib/db";

/**
 * Platform audit trail (ADR-061): who did what to which record. Metadata
 * only: never secrets, passwords, tokens or message text. A failure to write
 * the audit entry is logged but does not undo the action already taken.
 */
export type AuditEntry = {
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await getPrisma().auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ?? {},
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "audit_write_failed",
        action: entry.action,
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
}
