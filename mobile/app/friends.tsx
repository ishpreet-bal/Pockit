import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Card, EmptyCard, formatMoney, friendlyDate, Loading, Screen, SectionHeader } from '@/components/ui';
import { Button, Chip, ChipRow, Field, FormError, toMinor } from '@/components/form';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { radius, space, type, useColors } from '@/theme/tokens';

interface Item { kind: 'owes-you' | 'you-owe'; id: string; transactionId: string; what: string; date: string; amountMinor: number }
interface Friend { key: string; name: string; owesYouMinor: number; youOweMinor: number; netMinor: number; items: Item[] }
interface Money { id: string; name: string; date: string; amountMinor: number }
interface Data {
  people: Friend[]; owesYouMinor: number; youOweMinor: number;
  deposits: Money[]; payments: Money[]; categories: { id: string; name: string }[];
}

const PREVIEW_DATA: Data = {
  people: [
    { key: 'sam', name: 'Sam', owesYouMinor: 3202, youOweMinor: 0, netMinor: 3202, items: [{ kind: 'owes-you', id: 's1', transactionId: 't6', what: 'Dinner at Pai', date: '2026-10-04', amountMinor: 3202 }] },
    { key: 'priya', name: 'Priya', owesYouMinor: 3202, youOweMinor: 1800, netMinor: 1402, items: [
      { kind: 'owes-you', id: 's1', transactionId: 't6', what: 'Dinner at Pai', date: '2026-10-04', amountMinor: 3202 },
      { kind: 'you-owe', id: 'i1', transactionId: 't9', what: 'Concert tickets', date: '2026-10-02', amountMinor: 1800 },
    ] },
  ],
  owesYouMinor: 6404, youOweMinor: 1800, deposits: [], payments: [],
  categories: [{ id: 'c1', name: 'Events' }, { id: 'c2', name: 'Restaurants' }],
};
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Split with friends: one line per person, both ways. "Sam owes you $32",
 * "You owe Priya $18". Splits you paid for come from Split expense on a purchase;
 * "I owe someone" is for when a friend paid.
 */
export default function Friends() {
  const c = useColors();
  const accent = c.section.spending;
  const { refresh } = useSummary();
  const [d, setD] = useState<Data | null>(PREVIEW ? PREVIEW_DATA : null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (PREVIEW) return;
    setRefreshing(true);
    try { setD(await api<Data>('/api/mobile/friends')); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t load your friends.'); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function done() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Promise.all([load(), refresh()]);
  }

  const net = d ? d.owesYouMinor - d.youOweMinor : 0;
  return (
    <Screen section="spending" title="Split with friends" back onRefresh={load} refreshing={refreshing}>
      {!d ? <Loading error={error} /> : (
        <>
          <Text style={[type.hero, { color: net > 0 ? accent.accent : net < 0 ? c.negative : c.text }]}>{formatMoney(Math.abs(net))}</Text>
          <Text style={[type.subhead, { color: c.textMuted, marginTop: 4 }]}>
            {net > 0 ? 'coming back to you overall' : net < 0 ? 'you owe overall' : d.people.length ? 'all even' : 'nobody owes anybody'}
          </Text>
          {d.people.length ? (
            <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
              <Total label="Owed to you" value={d.owesYouMinor} color={accent.accent} />
              <Total label="You owe" value={d.youOweMinor} color={d.youOweMinor ? c.negative : c.textMuted} />
            </View>
          ) : null}

          <View style={{ marginTop: space.lg }}>
            {adding ? (
              <AddIou categories={d.categories} onCancel={() => setAdding(false)} onSaved={async () => { setAdding(false); await done(); }} />
            ) : (
              <Button label="I owe someone" variant="secondary" onPress={() => setAdding(true)} />
            )}
          </View>

          {d.people.length === 0 ? (
            <View style={{ marginTop: space.xl }}>
              <EmptyCard title="No one yet" body="Paid for something you're sharing? Open it in Spending and tap Split expense. Someone paid for you? Tap I owe someone." />
            </View>
          ) : (
            <>
              <SectionHeader title="People" />
              <View style={{ gap: space.md }}>
                {d.people.map((f) => (
                  <Person key={f.key} f={f} expanded={open === f.key} onToggle={() => setOpen(open === f.key ? null : f.key)}
                    deposits={d.deposits} payments={d.payments} onChanged={done} />
                ))}
              </View>
            </>
          )}
          <Text style={[type.footnote, { color: c.textMuted, marginTop: space.lg, lineHeight: 20 }]}>
            Only your part ever counts in your budget. Money coming back isn’t income, and paying a friend back isn’t new spending.
          </Text>
        </>
      )}
    </Screen>
  );
}

function Total({ label, value, color }: { label: string; value: number; color: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, padding: space.md, borderRadius: radius.tile, backgroundColor: c.surface }}>
      <Text style={[type.footnote, { color: c.textMuted }]}>{label}</Text>
      <Text style={[type.title2, { color, marginTop: 2, fontVariant: ['tabular-nums'] }]}>{formatMoney(value)}</Text>
    </View>
  );
}

function Person({ f, expanded, onToggle, deposits, payments, onChanged }: {
  f: Friend; expanded: boolean; onToggle: () => void; deposits: Money[]; payments: Money[]; onChanged: () => Promise<void>;
}) {
  const c = useColors();
  const accent = c.section.spending;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const line = f.netMinor > 0 ? `owes you ${formatMoney(f.netMinor)}` : f.netMinor < 0 ? `you owe ${formatMoney(-f.netMinor)}` : 'even';

  async function run(key: string, go: () => Promise<unknown>) {
    setBusy(key); setError(null);
    try { if (!PREVIEW) await go(); await onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'That couldn’t be saved.'); }
    finally { setBusy(null); }
  }
  function remove(item: Item) {
    const go = () => void run(`del-${item.id}`, () => api(`/api/mobile/friends/${item.id}`, { method: 'DELETE' }));
    if (Platform.OS === 'web') { if (globalThis.confirm?.(`Remove "${item.what}"? Your part comes out of your spending too.`)) go(); return; }
    Alert.alert(`Remove "${item.what}"?`, 'Your part comes out of your spending too.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  }

  return (
    <Card>
      <Pressable onPress={onToggle} accessibilityRole="button" style={{ paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accent.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[type.bodyStrong, { color: accent.accent }]}>{f.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { color: c.text }]} numberOfLines={1}>{f.name}</Text>
          <Text style={[type.footnote, { color: c.textMuted, marginTop: 1 }]}>{f.items.length} open · {line}</Text>
        </View>
        <Text style={[type.bodyStrong, { color: f.netMinor >= 0 ? accent.accent : c.negative, fontVariant: ['tabular-nums'] }]}>
          {f.netMinor >= 0 ? '+' : '−'}{formatMoney(Math.abs(f.netMinor))}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={{ gap: space.md, paddingBottom: space.lg }}>
          {f.items.map((it) => {
            const near = (list: Money[]) => [...list].filter((x) => x.date >= it.date)
              .sort((a, b) => Math.abs(a.amountMinor - it.amountMinor) - Math.abs(b.amountMinor - it.amountMinor)).slice(0, 2);
            const likely = it.kind === 'owes-you' ? near(deposits) : near(payments);
            return (
              <View key={`${it.kind}-${it.id}`} style={{ gap: 8, padding: space.md, borderRadius: radius.tile, backgroundColor: c.surface2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.subhead, { color: c.text }]} numberOfLines={1}>{it.what}</Text>
                    <Text style={[type.footnote, { color: c.textMuted }]}>{friendlyDate(it.date, today())} · {it.kind === 'owes-you' ? `${f.name} owes you` : `you owe ${f.name}`}</Text>
                  </View>
                  <Text style={[type.subhead, { color: it.kind === 'owes-you' ? accent.accent : c.negative, fontVariant: ['tabular-nums'] }]}>{formatMoney(it.amountMinor)}</Text>
                </View>
                <Pill label={busy === it.id ? 'Saving…' : it.kind === 'owes-you' ? `${f.name} paid me back` : `I paid ${f.name} back`} color={accent.accent} disabled={busy !== null}
                  onPress={() => void run(it.id, () => it.kind === 'owes-you'
                    ? api(`/api/mobile/owed/${it.id}`, { body: { amount: it.amountMinor / 100, person: f.name } })
                    : api(`/api/mobile/friends/${it.id}`, { body: {} }))} />
                {likely.length ? (
                  <View style={{ gap: 6 }}>
                    <Text style={[type.footnote, { color: c.textMuted }]}>
                      {it.kind === 'owes-you' ? 'Came in as a deposit? Pick it so it isn’t counted as income.' : 'Paid from your bank? Pick it so it isn’t counted as spending twice.'}
                    </Text>
                    {likely.map((x) => (
                      <Pressable key={x.id} accessibilityRole="button"
                        onPress={() => void run(x.id, () => it.kind === 'owes-you'
                          ? api(`/api/mobile/owed/${it.id}`, { body: { transactionId: x.id, amount: Math.min(x.amountMinor, it.amountMinor) / 100, person: f.name } })
                          : api(`/api/mobile/friends/${it.id}`, { body: { transactionId: x.id } }))}
                        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.tile, backgroundColor: c.surface, opacity: pressed || busy === x.id ? 0.6 : 1 })}>
                        <Icon name="arrow.uturn.left" size={15} color={accent.accent} />
                        <Text style={[type.subhead, { color: c.text, flex: 1 }]} numberOfLines={1}>{x.name} · {friendlyDate(x.date, today())}</Text>
                        <Text style={[type.subhead, { color: it.kind === 'owes-you' ? c.positive : c.text, fontVariant: ['tabular-nums'] }]}>{formatMoney(x.amountMinor)}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: space.lg }}>
                  <Pressable onPress={() => router.push(`/txn/${it.transactionId}`)} accessibilityRole="button" hitSlop={6}>
                    <Text style={[type.footnote, { color: accent.accent }]}>{it.kind === 'owes-you' ? 'Change the split →' : 'Open →'}</Text>
                  </Pressable>
                  {it.kind === 'you-owe' ? (
                    <Pressable onPress={() => remove(it)} accessibilityRole="button" hitSlop={6}>
                      <Text style={[type.footnote, { color: c.negative }]}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
          <FormError message={error} />
        </View>
      ) : null}
    </Card>
  );
}

function AddIou({ categories, onCancel, onSaved }: { categories: Data['categories']; onCancel: () => void; onSaved: () => Promise<void> }) {
  const c = useColors();
  const accent = c.section.spending;
  const [person, setPerson] = useState('');
  const [what, setWhat] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minor = toMinor(amount);
  const ready = person.trim() && what.trim() && minor !== null && minor > 0;

  async function save() {
    setBusy(true); setError(null);
    try {
      if (!PREVIEW) await api('/api/mobile/friends', { body: { person: person.trim(), description: what.trim(), amount: minor! / 100, categoryId } });
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'That couldn’t be saved.'); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <View style={{ gap: space.md, paddingVertical: space.md }}>
        <Text style={[type.headline, { color: c.text }]}>Someone paid for you</Text>
        <Field label="Who paid" section="spending" value={person} onChangeText={setPerson} placeholder="Priya" autoCapitalize="words" />
        <Field label="What for" section="spending" value={what} onChangeText={setWhat} placeholder="Concert tickets" />
        <Field label="Your part" section="spending" prefix="$" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="18.00" />
        {categories.length ? (
          <View style={{ gap: 6 }}>
            <Text style={[type.footnote, { color: c.textMuted }]}>Category (optional)</Text>
            <ChipRow>
              {categories.slice(0, 18).map((cat) => (
                <Chip key={cat.id} section="spending" label={cat.name} selected={categoryId === cat.id} onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)} />
              ))}
            </ChipRow>
          </View>
        ) : null}
        <Text style={[type.footnote, { color: c.textMuted, lineHeight: 20 }]}>Your part counts in your spending today. When you pay them back, link the payment so it isn’t counted twice.</Text>
        <FormError message={error} />
        <Button label="Save" accent={accent.accent} loading={busy} disabled={!ready} onPress={() => void save()} />
        <Button label="Cancel" variant="plain" onPress={onCancel} />
      </View>
    </Card>
  );
}

/** A small, quiet action inside a list item: one big button per row turns a list into a wall. */
function Pill({ label, color, onPress, disabled }: { label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Press onPress={onPress} disabled={disabled} accessibilityRole="button" depth={0.95}
      style={{ alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: color, opacity: disabled ? 0.6 : 1 }}>
      <Text style={[type.footnote, { color: '#ffffff', fontWeight: '600' }]}>{label}</Text>
    </Press>
  );
}
