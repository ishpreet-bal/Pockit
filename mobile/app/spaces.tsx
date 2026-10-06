import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button, FormError } from '@/components/form';
import { Card, Loading, Screen, SectionHeader, formatMoney } from '@/components/ui';
import { getActiveSpace } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { createSpace, inviteToSpace, joinSpace, leaveSpace, listSpaces, switchSpace, type Space, type Split } from '@/lib/spaces';
import { soft, useTint } from '@/theme/palette';
import { font, space, type, useColors, useIsDark } from '@/theme/tokens';

/**
 * Shared spaces: a household budget you run with a partner or roommates. Each
 * person sees the same bills, budget and purchases; Pockit splits the spending
 * evenly and shows who owes whom.
 */

const DEMO = {
  active: 'h1',
  spaces: [
    { id: 'p1', name: 'Personal', kind: 'personal', role: 'owner', members: [{ name: 'Alex', you: true }] },
    { id: 'h1', name: 'Apartment', kind: 'household', role: 'owner', members: [{ name: 'Alex', you: true }, { name: 'Sam', you: false }] },
  ] as Space[],
  split: { totalMinor: 64_000, shareMinor: 32_000, people: [{ id: 'a', name: 'You', paidMinor: 41_000, balanceMinor: 9_000 }, { id: 'b', name: 'Sam', paidMinor: 23_000, balanceMinor: -9_000 }], settle: [{ from: 'Sam', to: 'You', amountMinor: 9_000 }] } as Split,
};

export default function Spaces() {
  const c = useColors();
  const dark = useIsDark();
  const tint = useTint();
  const { refresh } = useSummary();
  const [data, setData] = useState<{ active: string; spaces: Space[]; split: Split | null } | null>(PREVIEW ? DEMO : null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (PREVIEW) return;
    try {
      const first = await listSpaces();
      const active = first.spaces.find((s) => s.id === first.active);
      setData(active?.kind === 'household' ? await listSpaces(active.id) : first);
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t load your spaces.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'That didn’t work. Try again.'); }
    finally { setBusy(false); }
  }
  const use = (s: Space) => run(async () => {
    if (PREVIEW) { setData((d) => d && { ...d, active: s.id }); return; }
    await switchSpace(s.kind === 'personal' && data?.spaces[0]?.id === s.id ? null : s.id);
    void Haptics.selectionAsync();
    await refresh(); await load();
  });

  if (!data) return <Screen section="more" title="Shared spaces" back><Loading error={error} /></Screen>;
  const active = data.spaces.find((s) => s.id === (getActiveSpace() ?? data.active)) ?? data.spaces.find((s) => s.id === data.active);
  const split = active?.kind === 'household' ? data.split : null;

  return (
    <Screen section="more" title="Shared spaces" back>
      <Text style={[type.body, { color: c.textMuted, lineHeight: 23 }]}>
        Run a budget together. Everyone in a shared space sees the same bills, budget and purchases, and Pockit splits the spending evenly.
      </Text>

      <SectionHeader title="Your spaces" />
      <Card>
        {data.spaces.map((s, i) => {
          const on = s.id === active?.id;
          return (
            <Pressable key={s.id} onPress={() => void use(s)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: i < data.spaces.length - 1 ? 0.5 : 0, borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: soft(tint(s.name), dark), alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type.headline, { color: tint(s.name) }]}>{s.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.text }]}>{s.name}</Text>
                <Text style={[type.footnote, { color: c.textMuted }]}>{s.members.length > 1 ? s.members.map((m) => (m.you ? 'You' : m.name)).join(', ') : 'Just you'}</Text>
              </View>
              <Text style={[type.label, { color: on ? c.section.home.accent : c.textSubtle }]}>{on ? 'Using' : 'Switch'}</Text>
            </Pressable>
          );
        })}
      </Card>

      {split ? (
        <>
          <SectionHeader title="This month, split evenly" />
          <Text style={[type.hero, { color: c.text }]}>{formatMoney(split.totalMinor, { cents: false })}</Text>
          <Text style={[type.subhead, { color: c.textMuted }]}>shared spending · {formatMoney(split.shareMinor, { cents: false })} each</Text>
          <View style={{ gap: 8, marginTop: space.lg }}>
            {split.settle.length ? split.settle.map((x) => (
              <View key={`${x.from}-${x.to}`} style={{ padding: 14, borderRadius: 12, backgroundColor: soft(c.section.home.accent, dark) }}>
                <Text style={[type.bodyStrong, { color: c.text }]}>{x.from === 'You' ? `You owe ${x.to}` : `${x.from} owes ${x.to === 'You' ? 'you' : x.to}`} {formatMoney(x.amountMinor)}</Text>
              </View>
            )) : <Text style={[type.subhead, { color: c.positive }]}>All square — nobody owes anything.</Text>}
          </View>
          <Card style={{ marginTop: space.lg }}>
            {split.people.map((p, i) => (
              <View key={p.id} style={{ flexDirection: 'row', paddingVertical: 12, borderBottomWidth: i < split.people.length - 1 ? 0.5 : 0, borderBottomColor: c.border }}>
                <Text style={[type.body, { color: c.text, flex: 1 }]}>{p.name}</Text>
                <Text style={[type.subhead, { color: c.textMuted }]}>paid {formatMoney(p.paidMinor, { cents: false })}</Text>
              </View>
            ))}
          </Card>
          <Text style={[type.footnote, { color: c.textSubtle, marginTop: space.sm }]}>Whoever adds a purchase counts as the one who paid.</Text>

          <View style={{ marginTop: space.xl, gap: space.sm }}>
            {invite ? (
              <View style={{ alignItems: 'center', padding: space.lg, borderRadius: 12, borderWidth: 1, borderColor: c.border }}>
                <Text style={[type.label, { color: c.textMuted }]}>Invite code · works once, for 7 days</Text>
                <Text selectable style={{ fontFamily: font.bold, fontSize: 32, letterSpacing: 6, color: c.text, marginTop: 6 }}>{invite}</Text>
                <Pressable onPress={() => void Share.share({ message: `Join my "${active!.name}" budget on Pockit — open the app, go to Shared spaces → Join, and enter ${invite}` })} hitSlop={8} style={{ marginTop: 10 }}>
                  <Text style={[type.label, { color: c.section.home.accent }]}>Share code</Text>
                </Pressable>
              </View>
            ) : (
              <Button label="Invite someone" loading={busy} onPress={() => void run(async () => setInvite(PREVIEW ? 'GB9VNEJH' : (await inviteToSpace(active!.id)).code))} />
            )}
            {active!.role !== 'owner' ? (
              <Button label="Leave this space" variant="secondary" onPress={() => void run(async () => { if (!PREVIEW) { await leaveSpace(active!.id); await switchSpace(null); await refresh(); } router.back(); })} />
            ) : null}
          </View>
        </>
      ) : null}

      <SectionHeader title="Start a shared space" />
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <TextInput value={newName} onChangeText={setNewName} placeholder="e.g. Apartment, Family" placeholderTextColor={c.textSubtle} maxLength={40} accessibilityLabel="Shared space name"
          style={{ flex: 1, height: 46, borderBottomWidth: 1.5, borderBottomColor: c.border, fontFamily: font.regular, fontSize: 16, color: c.text }} />
        <Pressable disabled={!newName.trim() || busy} onPress={() => void run(async () => {
          if (PREVIEW) return;
          const { id } = await createSpace(newName.trim()); setNewName('');
          await switchSpace(id); await refresh(); await load();
        })} hitSlop={8}><Text style={[type.label, { color: newName.trim() ? c.section.home.accent : c.textSubtle }]}>Create</Text></Pressable>
      </View>

      <SectionHeader title="Join with a code" />
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <TextInput value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="8-letter code" placeholderTextColor={c.textSubtle} autoCapitalize="characters" maxLength={12} accessibilityLabel="Invite code"
          style={{ flex: 1, height: 46, borderBottomWidth: 1.5, borderBottomColor: c.border, fontFamily: font.medium, fontSize: 18, letterSpacing: 3, color: c.text }} />
        <Pressable disabled={code.length < 6 || busy} onPress={() => void run(async () => {
          if (PREVIEW) return;
          const { id } = await joinSpace(code); setCode('');
          await switchSpace(id); await refresh(); await load();
        })} hitSlop={8}><Text style={[type.label, { color: code.length >= 6 ? c.section.home.accent : c.textSubtle }]}>Join</Text></Pressable>
      </View>
      <FormError message={error} />
    </Screen>
  );
}
