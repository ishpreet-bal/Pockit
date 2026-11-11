import 'server-only';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { withUser, withoutUser } from '@/lib/db/client';
import { bankConnections, users, workspaceMembers, workspaces } from '@/lib/db/schema';
import { openToken, removeItem } from '@/lib/bank/plaid';
import { audit } from './session';

/**
 * Delete a person and everything that is only theirs (App Store rule 5.1.1(v):
 * an app with sign-up must let people delete their account from inside the app).
 *
 * Deleting the user row cascades through every workspace they own, so first:
 *  - A shared space other people still use is handed to the longest-standing other
 *    member instead of being deleted out from under them.
 *  - Every bank login in a space about to be deleted is disconnected at Plaid, so
 *    nothing keeps a live link to their bank after they have gone.
 *
 * Reads run as the person and the handover runs as the new owner, so row-level
 * security allows each step on its own terms: this does not depend on the database
 * connection being allowed to bypass it. If a handover does not take, nothing is
 * deleted, because the alternative is wiping a space someone else still uses.
 */
export class HandoverFailed extends Error {}

export async function deleteAccount(userId: string): Promise<{ handedOver: number; banksDisconnected: number }> {
  const plan = await withUser(userId, async (tx) => {
    const owned = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerUserId, userId));
    const out: { id: string; heir: string | null }[] = [];
    for (const w of owned) {
      const others = await tx.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, w.id), ne(workspaceMembers.userId, userId)))
        .orderBy(asc(workspaceMembers.createdAt)).limit(1);
      out.push({ id: w.id, heir: others[0]?.userId ?? null });
    }
    return out;
  });

  let handedOver = 0;
  for (const w of plan.filter((p) => p.heir)) {
    const heir = w.heir!;
    const moved = await withUser(heir, async (tx) => {
      const r = await tx.update(workspaces).set({ ownerUserId: heir, updatedAt: new Date() })
        .where(eq(workspaces.id, w.id)).returning({ id: workspaces.id });
      await tx.update(workspaceMembers).set({ role: 'owner' })
        .where(and(eq(workspaceMembers.workspaceId, w.id), eq(workspaceMembers.userId, heir)));
      return r.length;
    });
    if (moved !== 1) throw new HandoverFailed(`Could not hand over shared space ${w.id}`);
    handedOver++;
  }

  const doomed = plan.filter((p) => !p.heir).map((p) => p.id);
  let banksDisconnected = 0;
  if (doomed.length) {
    const banks = await withUser(userId, (tx) => tx.select({ token: bankConnections.accessTokenEnc, workspaceId: bankConnections.workspaceId }).from(bankConnections)
      .where(inArray(bankConnections.workspaceId, doomed)));
    for (const b of banks) {
      // Best effort: a link Plaid already dropped must not stop the deletion.
      try { await removeItem(openToken(b.token, b.workspaceId)); banksDisconnected++; } catch { /* already gone */ }
    }
  }

  // The users table carries no row-level security; its cascades remove the rest.
  await withoutUser((tx) => tx.delete(users).where(eq(users.id, userId)));
  // Counted, not described: who it was goes with them.
  await audit({ action: 'account.delete', entity: 'user' });
  return { handedOver, banksDisconnected };
}
