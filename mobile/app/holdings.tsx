import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button, Chip, ChipRow, Field, FormError } from '@/components/form';
import { Card, EmptyCard, Loading, PreviewBadge, Screen, SectionHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { space, type, useColors } from '@/theme/tokens';

interface Holding { id?: string; name: string; symbol: string; quantity: string; currency: string; currentValue: string; costBasis: string }
const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CHF', 'MXN', 'INR', 'JPY', 'KRW'];
const empty = (currency: string): Holding => ({ name: '', symbol: '', quantity: '0', currency, currentValue: '', costBasis: '' });

/** Manual position records. No order execution and no cash movements. */
export default function Holdings() {
  const c = useColors();
  const { data, refresh } = useSummary();
  const [rows, setRows] = useState<Holding[] | null>(PREVIEW ? [] : null);
  const [draft, setDraft] = useState<Holding | null>(null);
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (!PREVIEW) setRows((await api<{ holdings: Holding[] }>('/api/investing/holdings')).holdings); }, []);
  useFocusEffect(useCallback(() => { let active = true; void load().catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Couldn’t load holdings.'); }); return () => { active = false; }; }, [load]));
  const edit = (holding: Holding) => { setDraft({ ...holding }); setError(null); setRemove(false); };

  async function save(deleting = false) {
    if (!draft || busy) return;
    setBusy(true); setError(null);
    try {
      if (PREVIEW) {
        setRows((cur) => deleting ? (cur ?? []).filter((h) => h.id !== draft.id) : [...(cur ?? []).filter((h) => h.id !== draft.id), { ...draft, id: draft.id ?? `demo-${Date.now()}` }]);
      } else {
        if (deleting) await api(`/api/investing/holdings?id=${draft.id}`, { method: 'DELETE' });
        else await api('/api/investing/holdings', { method: draft.id ? 'PATCH' : 'POST', body: draft });
        await load(); await refresh();
      }
      setDraft(null); setRemove(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t save this holding. Try again.'); }
    finally { setBusy(false); }
  }

  return <Screen section="invest" title="Your holdings" back>
    {PREVIEW ? <PreviewBadge /> : null}
    <Text style={[type.subhead, { color: c.textMuted, lineHeight: 22 }]}>Record what you own to track its value and cost. This does not buy investments, post trades or change account balances.</Text>
    {draft ? <View style={{ marginTop: space.xl, gap: space.lg }}>
      <Field label="Name" accessibilityLabel="Holding name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} maxLength={120} />
      <Field label="Ticker (optional)" accessibilityLabel="Holding ticker" value={draft.symbol} autoCapitalize="characters" autoCorrect={false} onChangeText={(symbol) => setDraft({ ...draft, symbol })} maxLength={12} />
      <Text style={[type.label, { color: c.textMuted }]}>Currency</Text>
      <ChipRow>{CURRENCIES.map((currency) => <Chip key={currency} label={currency} section="invest" selected={draft.currency === currency} onPress={() => setDraft({ ...draft, currency })} />)}</ChipRow>
      <Field label="Units" accessibilityLabel="Holding units" value={draft.quantity} keyboardType="decimal-pad" onChangeText={(quantity) => setDraft({ ...draft, quantity })} />
      <Field label={`Recorded total value (${draft.currency})`} accessibilityLabel="Holding value" value={draft.currentValue} keyboardType="decimal-pad" placeholder="e.g. 500.00" onChangeText={(currentValue) => setDraft({ ...draft, currentValue })} />
      <Field label={`Total cost basis (${draft.currency})`} accessibilityLabel="Holding cost basis" value={draft.costBasis} keyboardType="decimal-pad" placeholder="e.g. 450.00" onChangeText={(costBasis) => setDraft({ ...draft, costBasis })} />
      <Text style={[type.footnote, { color: c.textMuted }]}>Enter total amounts, not a price per share. Use zero units for a manually valued holding. Real matching quotes can value holdings with units; otherwise the recorded total is used.</Text>
      <FormError message={error} />
      <Button label="Save holding" onPress={() => void save()} loading={busy} disabled={!draft.name.trim() || !draft.currentValue.trim() || !draft.costBasis.trim()} accent={c.section.invest.accent} />
      <Button label="Cancel" onPress={() => { setDraft(null); setError(null); }} variant="plain" disabled={busy} />
      {draft.id && !remove ? <Button label="Remove holding" onPress={() => setRemove(true)} variant="plain" disabled={busy} /> : null}
      {remove ? <><Text style={[type.footnote, { color: c.textMuted }]}>Remove this holding and any purchase lots from tracking? Transactions and account balances stay as they are.</Text><Button label="Confirm removal" onPress={() => void save(true)} disabled={busy} /></> : null}
    </View> : <>
      <View style={{ marginTop: space.lg }}><Button label="Add holding" onPress={() => edit(empty(data?.currency ?? 'CAD'))} accent={c.section.invest.accent} /></View>
      <FormError message={error} />
      {error ? <Button label="Retry holdings" variant="plain" onPress={() => { setError(null); void load().catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t load holdings.')); }} /> : null}
      {rows === null ? <Loading error={error} /> : rows.length ? <><SectionHeader title="Recorded holdings" /><Card>{rows.map((holding) => <Card key={holding.id} onPress={() => edit(holding)} style={{ paddingVertical: space.md }}><Text style={[type.bodyStrong, { color: c.text }]}>{holding.name}</Text><Text style={[type.footnote, { color: c.textMuted }]}>{holding.symbol || 'Manually valued'} · {holding.currency} {holding.currentValue} · tap to edit</Text></Card>)}</Card></> : <EmptyCard title="No holdings recorded" body="Add a holding above. You can follow stocks in your watchlist without owning them." />}
    </>}
  </Screen>;
}
