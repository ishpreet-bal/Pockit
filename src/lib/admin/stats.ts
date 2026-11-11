import 'server-only';
import { sql } from 'drizzle-orm';
import { withoutUser } from '@/lib/db/client';

/**
 * How Pockit is doing, for the people who run it: counts only. Nothing here names
 * or describes a person, and none of it is anyone's money.
 */
export interface Stats {
  people: number;
  newToday: number; new7d: number; new30d: number;
  active7d: number; active30d: number;
  guestsNow: number; guestsStarted30d: number;
  banksConnected: number; peopleWithBank: number;
  plus: number;
  deleted30d: number; deletedAllTime: number;
  signupsByDay: { day: string; count: number }[];
}

const num = (v: unknown) => Number(v ?? 0);

export async function getStats(): Promise<Stats> {
  return withoutUser(async (tx) => {
    const one = async (q: ReturnType<typeof sql>) => {
      const rows = (await tx.execute(q)) as unknown as Record<string, unknown>[];
      return rows[0] ?? {};
    };
    const users = await one(sql`
      SELECT
        count(*) FILTER (WHERE NOT is_guest) AS people,
        count(*) FILTER (WHERE NOT is_guest AND u.created_at >= date_trunc('day', now())) AS today,
        count(*) FILTER (WHERE NOT is_guest AND u.created_at >= now() - interval '7 days') AS d7,
        count(*) FILTER (WHERE NOT is_guest AND u.created_at >= now() - interval '30 days') AS d30,
        count(*) FILTER (WHERE is_guest) AS guests,
        count(*) FILTER (WHERE NOT is_guest AND p.plus_until > now()) AS plus
      FROM pockit.users u LEFT JOIN pockit.user_profiles p ON p.user_id = u.id`);
    const active = await one(sql`
      SELECT
        count(DISTINCT s.user_id) FILTER (WHERE s.last_seen_at >= now() - interval '7 days') AS a7,
        count(DISTINCT s.user_id) FILTER (WHERE s.last_seen_at >= now() - interval '30 days') AS a30
      FROM pockit.sessions s JOIN pockit.users u ON u.id = s.user_id WHERE NOT u.is_guest`);
    const banks = await one(sql`
      SELECT count(*) AS banks, count(DISTINCT w.owner_user_id) AS owners
      FROM pockit.bank_connections b JOIN pockit.workspaces w ON w.id = b.workspace_id`);
    const audits = await one(sql`
      SELECT
        count(*) FILTER (WHERE action = 'account.delete' AND created_at >= now() - interval '30 days') AS del30,
        count(*) FILTER (WHERE action = 'account.delete') AS del,
        count(*) FILTER (WHERE action = 'guest.start' AND created_at >= now() - interval '30 days') AS guests30
      FROM pockit.audit_logs`);
    const days = (await tx.execute(sql`
      SELECT to_char(d, 'YYYY-MM-DD') AS day, count(u.id) AS count
      FROM generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
      LEFT JOIN pockit.users u ON NOT u.is_guest AND u.created_at >= d AND u.created_at < d + interval '1 day'
      GROUP BY d ORDER BY d`)) as unknown as { day: string; count: unknown }[];
    return {
      people: num(users.people), newToday: num(users.today), new7d: num(users.d7), new30d: num(users.d30),
      active7d: num(active.a7), active30d: num(active.a30),
      guestsNow: num(users.guests), guestsStarted30d: num(audits.guests30),
      banksConnected: num(banks.banks), peopleWithBank: num(banks.owners),
      plus: num(users.plus),
      deleted30d: num(audits.del30), deletedAllTime: num(audits.del),
      signupsByDay: days.map((d) => ({ day: d.day, count: num(d.count) })),
    };
  });
}
