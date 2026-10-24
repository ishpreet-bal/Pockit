import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Card, EmptyCard, formatMoney, friendlyDate, Loading, Row, Screen, SectionHeader } from '@/components/ui';
import { Button, FormError } from '@/components/form';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { font, radius, space, type, useColors } from '@/theme/tokens';
import type { Share } from './txn/[id]';

interface Owed {
  owedMinor: number;
  open: Share[];
  settled: Share[];
  deposits: { id: string; name: string; date: string; amountMinor: number }[];
}

const PREVIEW_OWED: Owed = {
  owedMinor: 9_606,
  open: [{
    id: 's1', transactionId: 't6', kind: 'split', people: 4, even: true, expectBack: true, withWhom: 'Sam, Priya, Jo', label: 'Split with Sam, Priya, Jo',
    totalMinor: 12_811, mineMinor: 3_205, othersMinor: 9_606, eachMinor: 3_202, repaidMinor: 0, owedMinor: 9_606, settled: false,
    purchase: { name: 'Dinner at Pai', date: '2026-10-04' }, repayments: [],
  }],
  settled: [],
  deposits: [{ id: 'd1', name: 'e-Transfer from Sam', date: '2026-10-06', amountMinor: 3_202 }],
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Owed to you: split expenses still waiting on money, each with a way to say it
 * came back, as cash or as a deposit Pockit can see (so it isn't counted as income).
 */
export default function OwedToYou() {
  const c = useColors();
  const accent = c.section.spending;
  const { refresh } = useSummary();
  const [d, setD] = useState<Owed | null>(PREVIEW ? PREVIEW_OWED : null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (PREVIEW) return;
    setRefreshing(true);
    try { setD(await api<Owed>('/api/mobile/owed')); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t load what’s owed.'); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function payback(shareId: string, body: { amount?: number; transactionId?: string }) {
    if (PREVIEW) {
      setD((x) => x && { ...x, open: x.open.filter((s) => s.id !== shareId), owedMinor: 0 });
      setOpen(null);
      return;
    }
    await api(`/api/mobile/owed/${shareId}`, { body });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setOpen(null);
    await Promise.all([load(), refresh()]);
  }

  return (
    <Screen section="spending" title="Owed to you" back onRefresh={load} refreshing={refreshing}>
      {!d ? <Loading error={error} /> : (
        <>
          <Text style={[type.hero, { color: d.owedMinor ? accent.accent : c.text }]}>{formatMoney(d.owedMinor)}</Text>
          <Text style={[type.subhead, { color: c.textMuted, marginTop: 4 }]}>
            {d.open.length ? `coming back to you from ${d.open.length} split${d.open.length === 1 ? '' : 's'}` : 'nobody owes you anything right now'}
          </Text>

          {d.open.length === 0 ? (
            <View style={{ marginTop: space.xl }}>
              <EmptyCard title="All squared up" body="Open a purchase in Transactions and tap Split expense when you share a bill or pay for someone." />
            </View>
          ) : (
            <>
              <SectionHeader title="Waiting on" />
              <View style={{ gap: space.md }}>
                {d.open.map((s) => (
                  <OpenShare key={s.id} share={s} expanded={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)}
                    deposits={d.deposits} onPayback={(body) => payback(s.id, body)} />
                ))}
              </View>
            </>
          )}

          {d.settled.length ? (
            <>
              <SectionHeader title="Squared up" />
              <Card>
                {d.settled.map((s, i) => (
                  <Row key={s.id} icon="" title={s.purchase.name} detail={`${s.label} · ${friendlyDate(s.purchase.date, today())}`}
                    value={formatMoney(s.mineMinor)} last={i === d.settled.length - 1} onPress={() => router.push(`/txn/${s.transactionId}`)} />
                ))}
              </Card>
              <Text style={[type.footnote, { color: c.textMuted, marginTop: space.sm }]}>The amount shown is your share, the part that counts in your budget.</Text>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function OpenShare({ share, expanded, onToggle, deposits, onPayback }: {
  share: Share; expanded: boolean; onToggle: () => void;
  deposits: Owed['deposits'];
  onPayback: (body: { amount?: number; transactionId?: string }) => Promise<void>;
}) {
  const c = useColors();
  const accent = c.section.spending;
  const [part, setPart] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Deposits close to what's owed (or one person's part) first: that's usually the e-Transfer.
  const near = (amt: number) => Math.min(Math.abs(amt - share.owedMinor), share.eachMinor ? Math.abs(amt - share.eachMinor) : Infinity);
  const likely = [...deposits].filter((x) => x.date >= share.purchase.date).sort((a, b) => near(a.amountMinor) - near(b.amountMinor)).slice(0, 3);

  async function run(key: string, body: { amount?: number; transactionId?: string }) {
    setBusy(key); setError(null);
    try { await onPayback(body); }
    catch (e) { setError(e instanceof Error ? e.message : 'That couldn’t be saved.'); }
    finally { setBusy(null); }
  }

  return (
    <Card>
      <Pressable onPress={onToggle} accessibilityRole="button" style={{ paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { color: c.text }]} numberOfLines={1}>{share.purchase.name}</Text>
          <Text style={[type.footnote, { color: c.textMuted, marginTop: 1 }]}>
            {share.label} · {friendlyDate(share.purchase.date, today())}{share.repaidMinor ? ` · ${formatMoney(share.repaidMinor)} back so far` : ''}
          </Text>
        </View>
        <Text style={[type.bodyStrong, { color: accent.accent, fontVariant: ['tabular-nums'] }]}>{formatMoney(share.owedMinor)}</Text>
      </Pressable>

      {expanded ? (
        <View style={{ gap: space.md, paddingBottom: space.lg }}>
          <Button label={`Paid back in full · ${formatMoney(share.owedMinor)}`} accent={accent.accent} loading={busy === 'all'} onPress={() => void run('all', {})} />

          {share.eachMinor && share.owedMinor > share.eachMinor ? (
            <Button variant="secondary" label={`One person paid · ${formatMoney(share.eachMinor)}`} loading={busy === 'one'} onPress={() => void run('one', { amount: share.eachMinor! / 100 })} />
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: radius.control, backgroundColor: c.surface2, paddingHorizontal: 12 }}>
              <Text style={{ fontFamily: font.medium, fontSize: 16, color: c.textMuted, marginRight: 4 }}>$</Text>
              <TextInput value={part} onChangeText={(t) => setPart(t.replace(/[^0-9.]/g, ''))} placeholder="Some of it" placeholderTextColor={c.textSubtle}
                keyboardType="decimal-pad" inputMode="decimal" accessibilityLabel="Amount paid back"
                style={[{ flex: 1, fontFamily: font.regular, fontSize: 16, color: c.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
            </View>
            <Pressable disabled={!Number(part)} onPress={() => void run('part', { amount: Number(part) })} accessibilityRole="button" hitSlop={8}>
              <Text style={[type.label, { color: Number(part) ? accent.accent : c.textSubtle }]}>{busy === 'part' ? 'Saving…' : 'Record'}</Text>
            </Pressable>
          </View>

          {likely.length ? (
            <View style={{ gap: 6 }}>
              <Text style={[type.footnote, { color: c.textMuted }]}>Came in as a deposit? Pick it so it isn’t counted as income.</Text>
              {likely.map((x) => (
                <Pressable key={x.id} onPress={() => void run(x.id, { transactionId: x.id })} accessibilityRole="button"
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.tile, backgroundColor: c.surface2, opacity: pressed || busy === x.id ? 0.6 : 1 })}>
                  <Icon name="arrow.uturn.left" size={15} color={accent.accent} />
                  <Text style={[type.subhead, { color: c.text, flex: 1 }]} numberOfLines={1}>{x.name} · {friendlyDate(x.date, today())}</Text>
                  <Text style={[type.subhead, { color: c.positive, fontVariant: ['tabular-nums'] }]}>{formatMoney(x.amountMinor)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <FormError message={error} />
          <Pressable onPress={() => router.push(`/txn/${share.transactionId}`)} accessibilityRole="button" hitSlop={6}>
            <Text style={[type.footnote, { color: accent.accent }]}>Change the split →</Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}
