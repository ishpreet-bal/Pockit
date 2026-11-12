import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Card, EmptyCard, formatMoney, Loading, Screen, SectionHeader, Shortcuts } from '@/components/ui';
import { Press } from '@/components/Press';
import { GuestBanner } from '@/components/GuestBanner';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { listSpaces, type Space } from '@/lib/spaces';
import { TourTarget } from '@/lib/tour';
import { useToolTint } from '@/theme/palette';
import { radius, space, type, useColors } from '@/theme/tokens';

interface Person { key: string; name: string; netMinor: number; owesYouMinor: number; youOweMinor: number; items: unknown[] }
interface Friends { people: Person[]; owesYouMinor: number; youOweMinor: number }

const PREVIEW_FRIENDS: Friends = {
  people: [
    { key: 'sam', name: 'Sam', netMinor: 3200, owesYouMinor: 3200, youOweMinor: 0, items: [1] },
    { key: 'priya', name: 'Priya', netMinor: -1300, owesYouMinor: 3200, youOweMinor: 4500, items: [1, 2] },
  ],
  owesYouMinor: 6400, youOweMinor: 4500,
};
const PREVIEW_SPACES: Space[] = [
  { id: 'p1', name: 'Personal', kind: 'personal', role: 'owner', members: [{ name: 'You', you: true }] },
  { id: 'h1', name: 'Apartment', kind: 'household', role: 'owner', members: [{ name: 'You', you: true }, { name: 'Sam', you: false }] },
];

/**
 * Together: the money you share with people, in one place. Friends you split with
 * (both ways), and shared spaces you budget in with a partner or roommates.
 */
export default function Together() {
  const c = useColors();
  const a = c.section.spending;
  const tool = useToolTint();
  const [friends, setFriends] = useState<Friends | null>(PREVIEW ? PREVIEW_FRIENDS : null);
  const [spaces, setSpaces] = useState<Space[] | null>(PREVIEW ? PREVIEW_SPACES : null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (PREVIEW) return;
    setRefreshing(true);
    try {
      const [f, s] = await Promise.all([api<Friends>('/api/mobile/friends'), listSpaces().catch(() => ({ spaces: [] as Space[] }))]);
      setFriends(f); setSpaces(s.spaces); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t load this.'); }
    finally { setRefreshing(false); }
  }, []);
  // Fresh every time the tab opens: a split made on another screen shows up here.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const shared = (spaces ?? []).filter((s) => s.kind === 'household');
  const net = friends ? friends.owesYouMinor - friends.youOweMinor : 0;

  return (
    <Screen section="spending" title="Together" eyebrow="Money you share with people" onRefresh={load} refreshing={refreshing}>
      <GuestBanner />
      {!friends ? <Loading error={error} /> : (
        <>
          <TourTarget id="together">
            <Press onPress={() => router.push('/friends')} accessibilityRole="button" accessibilityLabel="Who owes who" depth={0.985}>
              <Text style={[type.hero, { color: net > 0 ? a.accent : net < 0 ? c.negative : c.text }]}>{formatMoney(Math.abs(net), { cents: false })}</Text>
              <Text style={[type.subhead, { color: c.textMuted, marginTop: 4 }]}>
                {net > 0 ? 'coming back to you overall' : net < 0 ? 'you owe overall' : friends.people.length ? 'everyone’s even' : 'nobody owes anybody'}
              </Text>
              {friends.people.length ? (
                <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
                  <Pill label="Owed to you" value={friends.owesYouMinor} color={a.accent} />
                  <Pill label="You owe" value={friends.youOweMinor} color={friends.youOweMinor ? c.negative : c.textMuted} />
                </View>
              ) : null}
            </Press>
          </TourTarget>

          <Shortcuts items={[
            { icon: 'list.bullet', label: 'Split a bill', color: tool('purchases'), onPress: () => router.push('/transactions') },
            { icon: 'arrow.uturn.left', label: 'I owe someone', color: tool('add'), onPress: () => router.push({ pathname: '/friends', params: { add: '1' } }) },
            { icon: 'checkmark', label: 'Paid back', color: tool('friends'), onPress: () => router.push('/owed') },
            { icon: 'house', label: 'Shared space', color: tool('budget'), onPress: () => router.push('/spaces') },
          ]} />

          <SectionHeader title="People" action={friends.people.length ? 'See all' : undefined} onAction={() => router.push('/friends')} />
          {friends.people.length ? (
            <Card>
              {friends.people.slice(0, 4).map((p, i, list) => (
                <PersonRow key={p.key} p={p} last={i === list.length - 1} />
              ))}
            </Card>
          ) : (
            <EmptyCard title="No one yet" body="Split a purchase you paid for (open it and tap Split expense), or add something a friend paid for you." />
          )}

          <SectionHeader title="Shared spaces" action={shared.length ? 'Manage' : undefined} onAction={() => router.push('/spaces')} />
          {shared.length ? (
            <Card>
              {shared.map((s, i) => (
                <Press key={s.id} onPress={() => router.push('/spaces')} accessibilityRole="button" depth={0.985}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: i === shared.length - 1 ? 0 : 0.5, borderBottomColor: c.border }}>
                  <Faces names={s.members.map((m) => (m.you ? 'You' : m.name))} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { color: c.text }]} numberOfLines={1}>{s.name}</Text>
                    <Text style={[type.footnote, { color: c.textMuted }]} numberOfLines={1}>{s.members.length} {s.members.length === 1 ? 'person' : 'people'} · {s.members.map((m) => (m.you ? 'you' : m.name)).join(', ')}</Text>
                  </View>
                  <Text style={[type.footnote, { color: c.textSubtle }]}>›</Text>
                </Press>
              ))}
            </Card>
          ) : (
            <Press onPress={() => router.push('/spaces')} accessibilityRole="button" depth={0.985}>
              <Animated.View entering={FadeIn.duration(260)} style={{ padding: space.lg, borderRadius: radius.tile, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, gap: 4 }}>
                <Text style={[type.headline, { color: c.text }]}>Budget with someone</Text>
                <Text style={[type.footnote, { color: c.textMuted, lineHeight: 20 }]}>Make a shared space for a partner or roommates: the same bills and budget, and Pockit works out who owes whom. Your own money stays your own.</Text>
                <Text style={[type.footnote, { color: a.accent, fontWeight: '600', marginTop: 6 }]}>Make a shared space →</Text>
              </Animated.View>
            </Press>
          )}

          <Text style={[type.footnote, { color: c.textMuted, marginTop: space.xl, lineHeight: 20 }]}>
            Only your own part counts in your budget. Money coming back isn’t income, and paying a friend back isn’t new spending.
          </Text>
        </>
      )}
    </Screen>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: c.surface }}>
      <Text style={[type.footnote, { color: c.textMuted }]}>{label}</Text>
      <Text style={[type.footnote, { color, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{formatMoney(value, { cents: false })}</Text>
    </View>
  );
}

function PersonRow({ p, last }: { p: Person; last: boolean }) {
  const c = useColors();
  const a = c.section.spending;
  const owesYou = p.netMinor >= 0;
  return (
    <Press onPress={() => router.push('/friends')} accessibilityRole="button" depth={0.985}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: c.border }}>
      <Faces names={[p.name]} />
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: c.text }]} numberOfLines={1}>{p.name}</Text>
        <Text style={[type.footnote, { color: c.textMuted }]}>{p.netMinor === 0 ? 'even' : owesYou ? 'owes you' : 'you owe'}</Text>
      </View>
      <Text style={[type.bodyStrong, { color: p.netMinor === 0 ? c.textMuted : owesYou ? a.accent : c.negative, fontVariant: ['tabular-nums'] }]}>
        {p.netMinor === 0 ? '—' : formatMoney(Math.abs(p.netMinor))}
      </Text>
    </Press>
  );
}

/** Round initials, overlapping a little when there's more than one person. */
function Faces({ names }: { names: string[] }) {
  const c = useColors();
  const a = c.section.spending;
  const shown = names.slice(0, 3);
  return (
    <View style={{ flexDirection: 'row', width: 36 + (shown.length - 1) * 14 }}>
      {shown.map((n, i) => (
        <View key={`${n}-${i}`} style={{ width: 36, height: 36, borderRadius: 18, marginLeft: i ? -22 : 0, backgroundColor: a.soft, borderWidth: 2, borderColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[type.footnote, { color: a.accent, fontWeight: '700' }]}>{n.slice(0, 1).toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}
