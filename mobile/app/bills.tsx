import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Card, EmptyCard, formatMoney, Loading, Row, Screen, SectionHeader } from '@/components/ui';
import { Button, Field, FormError, toMinor } from '@/components/form';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { space, type, useColors } from '@/theme/tokens';

interface Schedule { id: string; name: string; amountMinor: string; cadence: string; dayOfMonth: number | null; direction: 'outflow' | 'inflow'; startDate: string }

const PREVIEW_BILLS: Schedule[] = [
  { id: 'b1', name: 'Rent', amountMinor: '180000', cadence: 'monthly', dayOfMonth: 1, direction: 'outflow', startDate: '2026-10-01' },
  { id: 'b2', name: 'Phone', amountMinor: '6000', cadence: 'monthly', dayOfMonth: 3, direction: 'outflow', startDate: '2026-10-03' },
  { id: 'b3', name: 'Spotify', amountMinor: '1199', cadence: 'monthly', dayOfMonth: 5, direction: 'outflow', startDate: '2026-10-05' },
  { id: 'i1', name: 'Paycheque', amountMinor: '240000', cadence: 'biweekly', dayOfMonth: null, direction: 'inflow', startDate: '2026-10-01' },
];

const CADENCE: Record<string, string> = { weekly: 'Every week', biweekly: 'Every 2 weeks', semimonthly: 'Twice a month', monthly: 'Monthly', quarterly: 'Every 3 months', annual: 'Yearly', custom: 'Repeats' };
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

function nextOnDay(day: number) {
  const now = new Date();
  for (let add = 0; add < 2; add++) {
    const last = new Date(now.getFullYear(), now.getMonth() + add + 1, 0).getDate();
    const d = new Date(now.getFullYear(), now.getMonth() + add, Math.min(day, last));
    if (d >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) return d.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

/** Every regular bill and paycheque, with a quick way to add or remove one. */
export default function Bills() {
  const c = useColors();
  const { refresh: refreshSummary } = useSummary();
  const [list, setList] = useState<Schedule[] | null>(PREVIEW ? PREVIEW_BILLS : null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState('1');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (PREVIEW) return;
    try { setList((await api<{ schedules: Schedule[] }>('/api/schedules')).schedules); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load bills.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    setBusy(true); setError(null);
    try {
      const d = Math.max(1, Math.min(31, Number(day) || 1));
      if (!PREVIEW) {
        await api('/api/schedules', { body: { name: name.trim(), amount: String(toMinor(amount)! / 100), cadence: 'monthly', dayOfMonth: d, startDate: nextOnDay(d), direction: 'outflow' } });
        await Promise.all([load(), refreshSummary()]);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAdding(false); setName(''); setAmount(''); setDay('1');
    } catch (e) { setError(e instanceof Error ? e.message : 'That could not be saved.'); }
    finally { setBusy(false); }
  }

  function remove(s: Schedule) {
    const go = async () => {
      if (!PREVIEW) { await api(`/api/schedules/${s.id}`, { method: 'DELETE' }); await Promise.all([load(), refreshSummary()]); }
      else setList((l) => l?.filter((x) => x.id !== s.id) ?? null);
    };
    if (Platform.OS === 'web') { void go(); return; }
    Alert.alert(`Remove ${s.name}?`, 'It won’t be counted in what you can spend any more.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void go() },
    ]);
  }

  const bills = list?.filter((s) => s.direction === 'outflow') ?? [];
  const income = list?.filter((s) => s.direction === 'inflow') ?? [];
  const monthly = bills.filter((b) => b.cadence === 'monthly').reduce((sum, b) => sum + Number(b.amountMinor), 0);
  const detail = (s: Schedule) => (s.cadence === 'monthly' && s.dayOfMonth ? `Monthly on the ${ordinal(s.dayOfMonth)}` : CADENCE[s.cadence] ?? 'Repeats');

  return (
    <Screen section="home" title="Bills" back onRefresh={load}>
      {!list ? <Loading error={error} /> : (
        <>
          {bills.length ? <Text style={[type.subhead, { color: c.textMuted, marginBottom: space.lg }]}>{formatMoney(monthly, { cents: false })} a month in regular bills</Text> : null}

          {adding ? (
            <Card style={{ padding: space.lg, gap: space.md, marginBottom: space.lg }}>
              <Field label="Name" value={name} onChangeText={setName} placeholder="Gym" autoFocus />
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <View style={{ flex: 3 }}><Field label="Amount" prefix="$" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" /></View>
                <View style={{ flex: 2 }}><Field label="Due on the" value={day} onChangeText={(t) => setDay(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" /></View>
              </View>
              <FormError message={error} />
              <Button label="Add bill" loading={busy} disabled={!name.trim() || !toMinor(amount)} onPress={add} />
              <Button label="Cancel" variant="plain" onPress={() => setAdding(false)} />
            </Card>
          ) : (
            <View style={{ marginBottom: space.lg }}><Button label="+ Add a bill" variant="secondary" onPress={() => setAdding(true)} /></View>
          )}

          {bills.length ? (
            <Card>
              {bills.map((s, i) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Row icon="calendar" title={s.name} detail={detail(s)} value={formatMoney(Number(s.amountMinor), { cents: false })} last={i === bills.length - 1} />
                  </View>
                  <Pressable onPress={() => remove(s)} hitSlop={8} accessibilityLabel={`Remove ${s.name}`} style={{ paddingRight: space.lg }}>
                    <Text style={[type.caption, { color: c.textSubtle }]}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : !adding ? <EmptyCard title="No bills yet" body="Add rent, your phone and subscriptions so Pockit can hold that money back from what you can spend." /> : null}

          {income.length ? (
            <>
              <SectionHeader title="Money coming in" />
              <Card>
                {income.map((s, i) => (
                  <Row key={s.id} icon="building.columns" title={s.name} detail={detail(s)} value={formatMoney(Number(s.amountMinor), { cents: false, signed: true })} valueColor={c.positive} last={i === income.length - 1} />
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
