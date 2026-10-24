import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Card, formatMoney, friendlyDate, Loading, Row, Screen, SectionHeader } from '@/components/ui';
import { Button, Chip, ChipRow, FormError } from '@/components/form';
import { SplitEditor, emptySplit, splitBody, type SplitChoice } from '@/components/SplitEditor';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { previewTransactions } from '@/data/preview';
import { space, type, useColors } from '@/theme/tokens';

export interface Share {
  id: string; transactionId: string; kind: 'split' | 'covered'; people: number | null; even: boolean; expectBack: boolean;
  withWhom: string | null; label: string; totalMinor: number; mineMinor: number; othersMinor: number; eachMinor: number | null;
  repaidMinor: number; owedMinor: number; settled: boolean; purchase: { name: string; date: string };
  repayments: { id: string; amountMinor: number; receivedOn: string; transactionId: string | null }[];
}

interface Detail {
  id: string; name: string; date: string; type: string; amountMinor: number;
  category: { id: string; name: string } | null; account: string | null; notes: string | null;
  fromBank: boolean; canSplit: boolean; share: Share | null;
  categories: { id: string; name: string }[];
}

function previewDetail(id: string): Detail | null {
  const t = previewTransactions.transactions.find((x) => x.id === id);
  if (!t) return null;
  const cats = previewTransactions.categories.filter((c) => c.kind === (t.amountMinor > 0 ? 'income' : 'expense'));
  return {
    id: t.id, name: t.name, date: t.date, type: t.amountMinor > 0 ? 'income' : 'expense', amountMinor: t.amountMinor,
    category: cats.find((c) => c.name === t.category) ?? null, account: 'Chequing', notes: null, fromBank: false,
    canSplit: t.amountMinor < 0, share: null, categories: cats,
  };
}

const toChoice = (s: Share): SplitChoice => ({
  kind: s.kind, people: s.people ?? 2, mine: s.even || s.kind === 'covered' ? '' : (s.mineMinor / 100).toFixed(2),
  expectBack: s.expectBack, withWhom: s.withWhom ?? '',
});

/**
 * One transaction: what it was, its category, and Split expense, which turns a
 * purchase into your share plus what's owed back to you.
 */
export default function Transaction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const accent = c.section.spending;
  const { refresh } = useSummary();
  const [d, setD] = useState<Detail | null>(PREVIEW ? previewDetail(String(id)) : null);
  const [error, setError] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const [choice, setChoice] = useState<SplitChoice>(emptySplit);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    if (PREVIEW) return;
    try {
      const next = await api<Detail>(`/api/mobile/transactions/${id}`);
      setD(next);
      setOn(Boolean(next.share));
      if (next.share) setChoice(toChoice(next.share));
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'That transaction couldn’t be loaded.'); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (!d) return <Screen section="spending" title="Transaction" back><Loading error={error} /></Screen>;

  const dirty = d.share ? !on || JSON.stringify(splitBody(choice)) !== JSON.stringify(splitBody(toChoice(d.share))) : on;

  async function saveSplit() {
    setBusy(true); setError(null); setSaved(null);
    try {
      if (!PREVIEW) {
        if (on) {
          const r = await api<{ share: Share }>(`/api/mobile/transactions/${d!.id}/share`, { method: 'PUT', body: splitBody(choice) });
          setD({ ...d!, share: r.share });
        } else {
          await api(`/api/mobile/transactions/${d!.id}/share`, { method: 'DELETE' });
          setD({ ...d!, share: null });
        }
        await refresh();
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(on ? 'Saved. Only your share counts in your budget now.' : 'Not split any more.');
    } catch (e) { setError(e instanceof Error ? e.message : 'That couldn’t be saved.'); }
    finally { setBusy(false); }
  }

  async function setCategory(categoryId: string) {
    const prev = d!.category;
    const next = d!.categories.find((x) => x.id === categoryId) ?? null;
    setD({ ...d!, category: next });
    void Haptics.selectionAsync();
    if (PREVIEW) return;
    try {
      await api(`/api/transactions/${d!.id}`, { method: 'PATCH', body: { categoryId, rememberCategory: true } });
      await refresh();
    } catch (e) { setD({ ...d!, category: prev }); setError(e instanceof Error ? e.message : 'That category couldn’t be saved.'); }
  }

  async function remove() {
    const go = async () => {
      try {
        if (!PREVIEW) { await api(`/api/transactions/${d!.id}`, { method: 'DELETE' }); await refresh(); }
        router.back();
      } catch (e) { setError(e instanceof Error ? e.message : 'That couldn’t be deleted.'); }
    };
    if (Platform.OS === 'web') { if (globalThis.confirm?.('Delete this transaction?')) await go(); return; }
    Alert.alert('Delete this transaction?', 'It comes out of your spending and balances.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void go() },
    ]);
  }

  const incoming = d.amountMinor > 0;
  return (
    <Screen section="spending" title="Transaction" back>
      <Text style={[type.largeTitle, { color: incoming ? c.positive : c.text }]}>{formatMoney(d.amountMinor, { signed: incoming })}</Text>
      <Text style={[type.headline, { color: c.text, marginTop: 4 }]}>{d.name}</Text>
      <Text style={[type.footnote, { color: c.textMuted, marginTop: 2 }]}>
        {friendlyDate(d.date, new Date().toISOString().slice(0, 10))}{d.account ? ` · ${d.account}` : ''}{d.fromBank ? ' · from your bank' : ''}
      </Text>
      {d.share ? (
        <Text style={[type.subhead, { color: accent.accent, marginTop: space.sm }]}>
          {d.share.label} · yours {formatMoney(d.share.mineMinor)}{d.share.owedMinor ? ` · ${formatMoney(d.share.owedMinor)} owed to you` : ''}
        </Text>
      ) : null}

      {d.categories.length ? (
        <>
          <SectionHeader title="Category" />
          {/* Just the current one until you want to change it: a long list of chips buries the split. */}
          <Card>
            <Row icon="" title={d.category?.name ?? 'Uncategorised'} value={picking ? 'Done' : 'Change'} valueColor={accent.accent} last onPress={() => setPicking(!picking)} />
          </Card>
          {picking ? (
            <View style={{ marginTop: space.md }}>
              <ChipRow>
                {d.categories.map((cat) => (
                  <Chip key={cat.id} section="spending" label={cat.name} selected={d.category?.id === cat.id} onPress={() => { void setCategory(cat.id); setPicking(false); }} />
                ))}
              </ChipRow>
            </View>
          ) : null}
        </>
      ) : null}

      {d.canSplit ? (
        <>
          <SectionHeader title="Split" />
          <Card>
            <SplitEditor totalMinor={d.amountMinor} on={on} onToggle={(v) => { setOn(v); setSaved(null); }} value={choice} onChange={(v) => { setChoice(v); setSaved(null); }} accent={accent} />
          </Card>
          {saved ? <Text style={[type.footnote, { color: c.positive, marginTop: space.sm }]}>{saved}</Text> : null}
          <FormError message={error} />
          {dirty ? <View style={{ marginTop: space.md }}><Button label={on ? 'Save split' : 'Remove split'} accent={accent.accent} loading={busy} onPress={saveSplit} /></View> : null}
        </>
      ) : <FormError message={error} />}

      {d.share && d.share.expectBack ? (
        <>
          <SectionHeader title="Paid back" action={d.share.owedMinor ? 'Record' : undefined} onAction={() => router.push('/owed')} />
          <Card>
            {d.share.repayments.length ? d.share.repayments.map((r, i) => (
              <Row key={r.id} icon="" title={r.transactionId ? 'Deposit' : 'Paid back'} detail={friendlyDate(r.receivedOn, new Date().toISOString().slice(0, 10))}
                value={formatMoney(r.amountMinor)} valueColor={c.positive} last={i === d.share!.repayments.length - 1 && !d.share!.owedMinor} />
            )) : null}
            {d.share.owedMinor ? (
              <Row icon="" title="Still owed to you" value={formatMoney(d.share.owedMinor)} valueColor={accent.accent} last onPress={() => router.push('/owed')} />
            ) : null}
          </Card>
        </>
      ) : null}

      <Pressable onPress={() => void remove()} accessibilityRole="button" style={{ marginTop: space.xxl, alignSelf: 'center' }} hitSlop={8}>
        <Text style={[type.subhead, { color: c.negative }]}>Delete transaction</Text>
      </Pressable>
    </Screen>
  );
}
