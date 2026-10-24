import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useTint } from '@/theme/palette';
import { router } from 'expo-router';
import { Card, EmptyCard, formatMoney, friendlyDate, Loading, Row, Screen, useAccent } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { previewTransactions } from '@/data/preview';
import { font, radius, space, type, useColors } from '@/theme/tokens';

export type TxnPage = typeof previewTransactions;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function shift(month: string, by: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Every transaction in a month, newest first, grouped by day, with search. */
export default function Transactions() {
  const [month, setMonth] = useState(PREVIEW ? previewTransactions.month : thisMonth());
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<TxnPage | null>(PREVIEW ? previewTransactions : null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (PREVIEW) return;
    setRefreshing(true);
    try {
      setPage(await api<TxnPage>(`/api/mobile/transactions?month=${month}`));
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load transactions.'); }
    finally { setRefreshing(false); }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Screen section="spending" title="Transactions" back onRefresh={load} refreshing={refreshing} right={<AddButton />}>
      <MonthSwitcher month={month} onChange={(m) => { setPage(null); setMonth(m); }} />
      <Search value={query} onChange={setQuery} />
      {page ? <List page={page} query={query} /> : <Loading error={error} />}
    </Screen>
  );
}

export function AddButton() {
  const a = useAccent();
  return (
    <Pressable onPress={() => router.push('/add')} accessibilityRole="button" accessibilityLabel="Add a purchase" hitSlop={8}
      style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: a.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="plus" size={20} color={a.accent} />
    </Pressable>
  );
}

function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const c = useColors();
  const a = useAccent();
  const atNow = month >= thisMonth();
  const [y, m] = month.split('-').map(Number) as [number, number];
  const label = `${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md }}>
      <Pressable onPress={() => onChange(shift(month, -1))} hitSlop={12} accessibilityLabel="Previous month"><Icon name="chevron.left" size={22} color={a.accent} /></Pressable>
      <Text style={[type.headline, { color: c.text }]}>{label}</Text>
      <Pressable onPress={() => !atNow && onChange(shift(month, 1))} hitSlop={12} accessibilityLabel="Next month" disabled={atNow}>
        <Icon name="chevron.right" size={22} color={atNow ? c.surface2 : a.accent} />
      </Pressable>
    </View>
  );
}

function Search({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: radius.control, backgroundColor: c.surface2, paddingHorizontal: 12, marginBottom: space.lg }}>
      <Icon name="magnifyingglass" size={17} color={c.textSubtle} />
      <TextInput value={value} onChangeText={onChange} placeholder="Search shops or categories" placeholderTextColor={c.textSubtle}
        style={{ flex: 1, fontFamily: font.regular, fontSize: 16, color: c.text, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }} autoCorrect={false} clearButtonMode="while-editing" />
    </View>
  );
}

function List({ page, query }: { page: TxnPage; query: string }) {
  const c = useColors();
  const tint = useTint();
  const q = query.trim().toLowerCase();
  const rows = q ? page.transactions.filter((t) => t.name.toLowerCase().includes(q) || (t.category ?? '').toLowerCase().includes(q)) : page.transactions;
  const today = todayIso();

  if (rows.length === 0) {
    return <EmptyCard title={q ? 'Nothing matches that' : 'Nothing this month'} body={q ? 'Try a shop name or a category.' : 'Tap + to add a purchase, or pick another month.'} />;
  }

  const days = new Map<string, typeof rows>();
  for (const t of rows) days.set(t.date, [...(days.get(t.date) ?? []), t]);

  return (
    <>
      {!q ? (
        <Text style={[type.footnote, { color: c.textMuted, marginBottom: space.md }]}>
          {formatMoney(page.totals.outMinor, { cents: false })} out · <Text style={{ color: c.positive }}>{formatMoney(page.totals.inMinor, { cents: false })} in</Text>
        </Text>
      ) : null}
      {[...days.entries()].map(([date, list]) => (
        <View key={date} style={{ marginBottom: space.lg }}>
          <Text style={[type.caption, { color: c.textMuted, marginBottom: 6, marginLeft: 4 }]}>{friendlyDate(date, today).toUpperCase()}</Text>
          <Card>
            {list.map((t, i) => (
              <Row key={t.id} icon="cart" color={tint(t.category)} title={t.name}
                detail={t.split ? `${t.category ?? 'Uncategorised'} · ${t.split.label} · yours ${formatMoney(t.split.mineMinor)}` : t.category ?? 'Uncategorised'}
                value={formatMoney(t.amountMinor, { signed: true })} valueColor={t.amountMinor > 0 ? c.positive : undefined} last={i === list.length - 1}
                onPress={() => router.push(`/txn/${t.id}`)} />
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}
