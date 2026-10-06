import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Icon } from '@/components/Icon';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button, Chip, ChipRow, FormError } from '@/components/form';
import { formatMoney } from '@/components/ui';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { previewTransactions } from '@/data/preview';
import { font, radius, space, type, useColors } from '@/theme/tokens';
import type { TxnPage } from './transactions';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

interface Suggestion { description: string; categoryId: string | null }

/**
 * Add a purchase (or money in) in a few taps: the amount first and large, then what
 * it was — which suggests past entries and fills in the category — then when.
 */
export default function Add() {
  const c = useColors();
  const accent = c.section.spending;
  const { refresh } = useSummary();

  const [meta, setMeta] = useState<Pick<TxnPage, 'categories' | 'accounts'> | null>(PREVIEW ? previewTransactions : null);
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [what, setWhat] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(daysAgo(0));
  const [accountId, setAccountId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = useRef(false);

  useEffect(() => {
    if (PREVIEW) return;
    api<TxnPage>('/api/mobile/transactions').then(setMeta).catch((e) => setError(e instanceof Error ? e.message : 'Could not load categories.'));
  }, []);

  // The everyday account is the sensible default; savings rarely pays for coffee.
  useEffect(() => {
    if (meta && !accountId) {
      const everyday = meta.accounts.find((a) => a.type === 'chequing' || a.type === 'checking') ?? meta.accounts[0];
      if (everyday) setAccountId(everyday.id);
    }
  }, [meta, accountId]);

  // Past entries matching what's typed, each carrying its usual category.
  useEffect(() => {
    if (PREVIEW || picked.current || what.trim().length < 2) { setSuggestions([]); return; }
    const t = setTimeout(() => {
      api<{ suggestions: Suggestion[] }>(`/api/transactions/suggest?q=${encodeURIComponent(what.trim())}`)
        .then((r) => setSuggestions(r.suggestions.slice(0, 3))).catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [what]);

  const categories = (meta?.categories ?? []).filter((x) => x.kind === kind && x.parentId === null);
  const amountNumber = Number(amount.replace(/[^0-9.]/g, ''));
  const ready = amountNumber > 0 && what.trim().length > 0 && Boolean(accountId);

  const [scanning, setScanning] = useState(false);
  async function scan() {
    setError(null);
    const pick = Platform.OS === 'web'
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.6 })
      : await (async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          return perm.granted
            ? ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.6 })
            : ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.6 });
        })();
    const asset = pick.canceled ? null : pick.assets[0];
    if (!asset?.base64) return;
    setScanning(true);
    try {
      const r = PREVIEW
        ? { merchant: 'No Frills', amount: 64.32, date: daysAgo(0), category: 'Groceries' }
        : await api<{ merchant: string; amount: number; date: string | null; category: string | null }>('/api/mobile/receipt', {
            body: { image: asset.base64, mediaType: asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg', categories: categories.map((x) => x.name) },
          });
      setAmount(r.amount.toFixed(2)); picked.current = true; setWhat(r.merchant);
      if (r.date) setDate(r.date);
      const cat = categories.find((x) => x.name === r.category);
      if (cat) setCategoryId(cat.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t read that receipt.'); }
    finally { setScanning(false); }
  }

  async function addCategory() {
    const name = newName.trim();
    if (!name) return;
    try {
      const made = PREVIEW
        ? { id: `custom-${Date.now()}`, name, kind, parentId: null, icon: null }
        : (await api<{ category: TxnPage['categories'][number] }>('/api/mobile/categories', { body: { name, kind } })).category;
      setMeta((m) => m && !m.categories.some((x) => x.id === made.id) ? { ...m, categories: [...m.categories, made as TxnPage['categories'][number]] } : m);
      setCategoryId(made.id); setNaming(false); setNewName('');
      void Haptics.selectionAsync();
    } catch (e) { setError(e instanceof Error ? e.message : 'That category couldn’t be added.'); }
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      if (!PREVIEW) {
        await api('/api/transactions', {
          body: { amount: amount.replace(/[^0-9.]/g, ''), description: what.trim(), accountId, categoryId, postedDate: date, type: kind },
        });
        await refresh();
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be saved.');
    } finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.xl, paddingBottom: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button"><Text style={[type.body, { color: accent.accent }]}>Cancel</Text></Pressable>
        <Text style={[type.headline, { color: c.text }]}>{kind === 'expense' ? 'Add a purchase' : 'Add money in'}</Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl, gap: space.xl }}>
        <View style={{ flexDirection: 'row', backgroundColor: c.surface2, borderRadius: radius.control, padding: 3 }}>
          {(['expense', 'income'] as const).map((k) => (
            <Pressable key={k} onPress={() => { setKind(k); setCategoryId(null); void Haptics.selectionAsync(); }}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: kind === k ? c.surface : 'transparent' }}>
              <Text style={{ fontFamily: font.medium, fontSize: 15, color: kind === k ? c.text : c.textMuted }}>{k === 'expense' ? 'Spent' : 'Received'}</Text>
            </Pressable>
          ))}
        </View>

        {kind === 'expense' ? (
          <Pressable onPress={() => void scan()} disabled={scanning} accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: c.surface2, opacity: pressed || scanning ? 0.6 : 1 })}>
            <Icon name="doc.text" size={16} color={accent.accent} />
            <Text style={[type.footnote, { color: c.text }]}>{scanning ? 'Reading your receipt…' : 'Scan a receipt'}</Text>
          </Pressable>
        ) : null}

        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontFamily: font.serifBold, fontSize: 46, color: amount ? c.text : c.textSubtle }}>$</Text>
            <TextInput value={amount} onChangeText={(t) => setAmount(cleanAmount(t))} placeholder="0" placeholderTextColor={c.textSubtle} keyboardType="decimal-pad" inputMode="decimal" autoFocus
              accessibilityLabel="Amount" maxLength={10}
              // Sized to its digits so the $ stays beside the number; no box, no browser outline.
              style={[{ fontFamily: font.serifBold, fontSize: 56, color: c.text, width: Math.max(1, amount.length || 1) * 32 + 12, textAlign: 'left', borderWidth: 0, padding: 0, backgroundColor: 'transparent' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
          </View>
        </View>

        <View>
          <Text style={[type.footnote, { color: c.textMuted, marginBottom: 6 }]}>{kind === 'expense' ? 'Where or what?' : 'From?'}</Text>
          <TextInput value={what} onChangeText={(t) => { picked.current = false; setWhat(t); }} placeholder={kind === 'expense' ? 'Loblaws, rent, coffee…' : 'Paycheque, refund…'}
            placeholderTextColor={c.textSubtle} accessibilityLabel="Where or what"
            style={{ height: 52, borderRadius: 6, paddingHorizontal: space.lg, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border, fontFamily: font.regular, fontSize: 17, color: c.text }} />
          {suggestions.length ? (
            <View style={{ marginTop: 8, gap: 6 }}>
              {suggestions.map((s) => (
                <Pressable key={s.description} onPress={() => { picked.current = true; setWhat(s.description); if (s.categoryId) setCategoryId(s.categoryId); setSuggestions([]); }}
                  style={{ padding: 10, borderRadius: 10, backgroundColor: c.surface2 }}>
                  <Text style={[type.subhead, { color: c.text }]}>{s.description}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {categories.length ? (
          <View>
            <Text style={[type.footnote, { color: c.textMuted, marginBottom: 8 }]}>Category</Text>
            <ChipRow>
              {categories.map((cat) => (
                <Chip section="spending" key={cat.id} label={cat.name} selected={categoryId === cat.id} onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)} />
              ))}
              {!naming ? <Chip section="spending" label="+ New" selected={false} onPress={() => setNaming(true)} /> : null}
            </ChipRow>
            {naming ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <TextInput value={newName} onChangeText={setNewName} placeholder="Name it — e.g. Gym, Pets, Gifts" placeholderTextColor={c.textSubtle} autoFocus maxLength={40}
                  accessibilityLabel="New category name" onSubmitEditing={() => void addCategory()}
                  style={[{ flex: 1, height: 44, borderBottomWidth: 1.5, borderBottomColor: c.section.spending.accent, fontFamily: font.regular, fontSize: 16, color: c.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
                <Pressable onPress={() => void addCategory()} hitSlop={8} accessibilityRole="button"><Text style={[type.label, { color: c.section.spending.accent }]}>Add</Text></Pressable>
                <Pressable onPress={() => { setNaming(false); setNewName(''); }} hitSlop={8} accessibilityRole="button"><Text style={[type.label, { color: c.textMuted }]}>Cancel</Text></Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        <View>
          <Text style={[type.footnote, { color: c.textMuted, marginBottom: 8 }]}>When</Text>
          <ChipRow>
            {[['Today', 0], ['Yesterday', 1], ['2 days ago', 2]].map(([label, n]) => (
              <Chip section="spending" key={label} label={String(label)} selected={date === daysAgo(Number(n))} onPress={() => setDate(daysAgo(Number(n)))} />
            ))}
          </ChipRow>
        </View>

        {meta && meta.accounts.length > 1 ? (
          <View>
            <Text style={[type.footnote, { color: c.textMuted, marginBottom: 8 }]}>From account</Text>
            <ChipRow>
              {meta.accounts.map((a) => <Chip section="spending" key={a.id} label={a.name} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />)}
            </ChipRow>
            {naming ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <TextInput value={newName} onChangeText={setNewName} placeholder="Name it — e.g. Gym, Pets, Gifts" placeholderTextColor={c.textSubtle} autoFocus maxLength={40}
                  accessibilityLabel="New category name" onSubmitEditing={() => void addCategory()}
                  style={[{ flex: 1, height: 44, borderBottomWidth: 1.5, borderBottomColor: c.section.spending.accent, fontFamily: font.regular, fontSize: 16, color: c.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
                <Pressable onPress={() => void addCategory()} hitSlop={8} accessibilityRole="button"><Text style={[type.label, { color: c.section.spending.accent }]}>Add</Text></Pressable>
                <Pressable onPress={() => { setNaming(false); setNewName(''); }} hitSlop={8} accessibilityRole="button"><Text style={[type.label, { color: c.textMuted }]}>Cancel</Text></Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {meta && meta.accounts.length === 0 ? (
          <Text style={[type.footnote, { color: c.warning }]}>Add an account first (More → Accounts) so Pockit knows where this money came from.</Text>
        ) : null}
        <FormError message={error} />
        <Button
          label={ready && amountNumber > 0 ? `Save ${formatMoney(Math.round(amountNumber * 100))}` : 'Save'}
          accent={accent.accent} loading={busy} disabled={!ready} onPress={save}
        />
      </ScrollView>
    </View>
  );
}

/** Digits and one decimal point, at most two decimals — letters never get in. */
function cleanAmount(t: string): string {
  const digits = t.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = digits.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole!;
}
