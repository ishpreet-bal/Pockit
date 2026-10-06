import { Text, View } from 'react-native';
import { Card, EmptyCard, Loading, formatMoney, PreviewBadge, ProgressBar, Screen, StaleNote, useAccent } from '@/components/ui';
import { PREVIEW } from '@/lib/session';
import { useTint } from '@/theme/palette';
import { router } from 'expo-router';
import { TourTarget } from '@/lib/tour';
import { Pressable } from 'react-native';
import { Icon } from '@/components/Icon';
import { useSummary, type Summary } from '@/lib/summary';
import { space, type, useColors } from '@/theme/tokens';

/** Goals: total saved, then each goal with progress, pace and a plain status. */
export default function Goals() {
  const { data, error, refreshing, refresh } = useSummary();
  return (
    <Screen section="goals" title="Goals" onRefresh={refresh} refreshing={refreshing} right={<NewGoalButton />}>
      {PREVIEW ? <PreviewBadge /> : null}
      <StaleNote message={data ? error : null} />
      <TourTarget id="goals">{data ? <Body d={data} /> : <Loading error={error} />}</TourTarget>
    </Screen>
  );
}

const STATUS = {
  on_track: 'On track',
  behind: 'A little behind',
  open: 'No date set',
  done: 'Done 🎉',
} as const;

function byDate(iso: string | null) {
  return iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : null;
}

function Body({ d }: { d: Summary }) {
  const c = useColors();
  const tint = useTint();
  const a = useAccent();
  if (d.goals.length === 0) {
    return (
      <>
        <EmptyCard title="No goals yet" body="An emergency fund, a trip, a car — add one and Pockit tells you how much to put aside each month." />
        <Card style={{ paddingVertical: space.lg, marginTop: 12, alignItems: 'center' }} onPress={() => router.push('/new-goal')}>
          <Text style={[type.bodyStrong, { color: a.accent }]}>+ Add a goal</Text>
        </Card>
      </>
    );
  }
  const saved = d.goals.reduce((s, g) => s + g.currentMinor, 0);
  const behind = d.goals.filter((g) => g.status === 'behind').length;
  return (
    <>
      <Text style={[type.subhead, { color: c.textMuted }]}>Saved so far</Text>
      <Text style={[type.hero, { color: c.text, marginTop: 2 }]}>{formatMoney(saved, { cents: false })}</Text>
      <Text style={[type.footnote, { color: c.textMuted, marginTop: 4, marginBottom: space.xl }]}>
        across {d.goals.length} {d.goals.length === 1 ? 'goal' : 'goals'} · {behind === 0 ? 'everything’s on pace' : `${behind} could use a boost`}
      </Text>

      <View style={{ gap: 12 }}>
        {d.goals.map((g) => {
          const date = byDate(g.targetDate);
          const tone = g.status === 'behind' ? c.warning : g.status === 'open' ? c.textMuted : a.accent;
          return (
            <Card key={g.id} style={{ paddingVertical: space.lg }} onPress={() => router.push({ pathname: '/goal/[id]', params: { id: g.id } })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.headline, { color: c.text }]}>{g.name}</Text>
                  {date ? <Text style={[type.footnote, { color: c.textMuted }]}>By {date}</Text> : null}
                </View>
                <Text style={[type.caption, { color: tone }]}>{STATUS[g.status]}</Text>
              </View>
              <View style={{ marginTop: 14 }}><ProgressBar color={tint(g.name)} value={g.currentMinor / Math.max(1, g.targetMinor)} height={8} /></View>
              <Text style={[type.footnote, { color: c.textMuted, marginTop: 8 }]}>
                {g.targetMinor === 0 ? 'Add an amount to start tracking' : `${formatMoney(g.currentMinor, { cents: false })} of ${formatMoney(g.targetMinor, { cents: false })}`}
                {g.monthlyMinor && !g.achieved ? ` · ${formatMoney(g.monthlyMinor, { cents: false })}/month` : ''}
              </Text>
            </Card>
          );
        })}
      </View>
    </>
  );
}

function NewGoalButton() {
  const a = useAccent();
  return (
    <Pressable onPress={() => router.push('/new-goal')} accessibilityRole="button" accessibilityLabel="New goal" hitSlop={8}
      style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: a.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="plus" size={20} color={a.accent} />
    </Pressable>
  );
}
