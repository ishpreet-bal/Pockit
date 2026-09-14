import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { eq, and, gt, isNull, sql as dsql } from 'drizzle-orm';
import { withoutUser } from '@/lib/db/client';
import { sessions, users, userProfiles, workspaces, workspaceMembers } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { generateToken, hashToken, sign, unsign } from './password';

const COOKIE = 'pockit_session';
const WORKSPACE_COOKIE = 'pockit_workspace';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  baseCurrency: string;
  timezone: string;
  locale: string;
  theme: 'system' | 'light' | 'dark';
  onboardingCompletedAt: Date | null;
  fileRetention: 'delete_after_extract' | 'keep' | 'ask';
  aiEnabled: boolean;
  dashboardWidgets: string[] | null;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  kind: 'personal' | 'business';
  baseCurrency: string;
  isDemo: boolean;
  role: string;
}

export async function createSession(userId: string, ip: string | null, userAgent: string | null): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000);

  await withoutUser(async (tx) => {
    await tx.insert(sessions).values({
      userId, tokenHash: hashToken(token), expiresAt, ip, userAgent,
    });
  });

  const jar = await cookies();
  jar.set(COOKIE, sign(token, env.AUTH_SECRET), {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) {
    const token = unsign(raw, env.AUTH_SECRET);
    if (token) {
      await withoutUser(async (tx) => {
        await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, hashToken(token)));
      });
    }
  }
  jar.delete(COOKIE);
  jar.delete(WORKSPACE_COOKIE);
}

/**
 * Resolve the current user. Cached per request so a page that checks auth in several
 * places still issues exactly one query.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;

  const token = unsign(raw, env.AUTH_SECRET);
  if (!token) return null; // tampered — rejected without touching the database

  const rows = await withoutUser(async (tx) =>
    tx
      .select({
        id: users.id,
        email: users.email,
        displayName: userProfiles.displayName,
        baseCurrency: userProfiles.baseCurrency,
        timezone: userProfiles.timezone,
        locale: userProfiles.locale,
        theme: userProfiles.theme,
        onboardingCompletedAt: userProfiles.onboardingCompletedAt,
        fileRetention: userProfiles.fileRetention,
        aiEnabled: userProfiles.aiEnabled,
        dashboardWidgets: userProfiles.dashboardWidgets,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          gt(sessions.expiresAt, new Date()),
          isNull(sessions.revokedAt),
          isNull(users.deletedAt),
        ),
      )
      .limit(1),
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    baseCurrency: row.baseCurrency ?? 'CAD',
    timezone: row.timezone ?? 'America/Toronto',
    locale: row.locale ?? 'en-CA',
    theme: row.theme ?? 'system',
    onboardingCompletedAt: row.onboardingCompletedAt,
    fileRetention: row.fileRetention ?? 'ask',
    aiEnabled: row.aiEnabled ?? true,
    dashboardWidgets: row.dashboardWidgets ?? null,
  };
});

export const getUserWorkspaces = cache(async (userId: string): Promise<WorkspaceSummary[]> => {
  const rows = await withoutUser(async (tx) =>
    tx
      .select({
        id: workspaces.id,
        name: workspaces.name,
        kind: workspaces.kind,
        baseCurrency: workspaces.baseCurrency,
        isDemo: workspaces.isDemo,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.userId, userId), isNull(workspaces.archivedAt)))
      .orderBy(workspaces.kind, workspaces.createdAt),
  );
  return rows;
});

/**
 * The active workspace, validated against the user's actual memberships.
 * A forged cookie can never select a workspace the user is not a member of.
 */
export async function getActiveWorkspace(
  userId: string,
  available: WorkspaceSummary[],
): Promise<WorkspaceSummary | null> {
  if (available.length === 0) return null;
  const jar = await cookies();
  const requested = jar.get(WORKSPACE_COOKIE)?.value;
  const match = requested ? available.find((w) => w.id === requested) : undefined;
  return match ?? available[0]!;
}

export async function setActiveWorkspace(workspaceId: string): Promise<void> {
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  return {
    ip: forwarded ? (forwarded.split(',')[0]?.trim() ?? null) : h.get('x-real-ip'),
    userAgent: h.get('user-agent'),
  };
}

/** Best-effort audit trail; a logging failure must never break the user's action. */
export async function audit(entry: {
  actorUserId?: string | null;
  workspaceId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { ip, userAgent } = await requestContext();
    await withoutUser(async (tx) => {
      await tx.execute(dsql`
        INSERT INTO pockit.audit_logs (actor_user_id, workspace_id, action, entity, entity_id, metadata, ip, user_agent)
        VALUES (${entry.actorUserId ?? null}, ${entry.workspaceId ?? null}, ${entry.action},
                ${entry.entity ?? null}, ${entry.entityId ?? null},
                ${entry.metadata ? JSON.stringify(entry.metadata) : null}::jsonb, ${ip}, ${userAgent})
      `);
    });
  } catch {
    // Intentionally swallowed.
  }
}
