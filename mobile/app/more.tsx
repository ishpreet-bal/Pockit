import { Card, Row, Screen, SectionHeader } from '@/components/ui';
import { Linking, Text } from 'react-native';
import { API_URL } from '@/lib/api';
import { useTour } from '@/lib/tour';
import { router } from 'expo-router';
import { Card as Box } from '@/components/ui';
import { useSession } from '@/lib/session';
import { space, type, useColors } from '@/theme/tokens';
import { GuestBanner } from '@/components/GuestBanner';

const ITEMS = [
  { icon: 'repeat', title: 'Bills', detail: 'Rent, phone, subscriptions' },
  { icon: 'building.columns', title: 'Accounts', detail: 'Chequing, savings, credit' },
  { icon: 'square.and.arrow.down', title: 'Import', detail: 'Bring in a bank statement (on the website)' },
  { icon: 'gearshape', title: 'Settings', detail: 'Face ID and bill reminders' },
];

export default function More() {
  return (
    <Screen section="more" title="You" back>
      <GuestBanner />
      <Body />
    </Screen>
  );
}

function Body() {
  const c = useColors();
  const tour = useTour();
  const go = (title: string) => {
    if (title === 'Bills') return router.push('/bills');
    if (title === 'Accounts') return router.push('/accounts');
    if (title === 'Settings') return router.push('/settings');
    // Statements are read on the website, where there's room to review every line.
    void Linking.openURL(`${API_URL}/import`);
  };
  return (
    <>
      <Card>
        <Row icon="chart.bar" title="Budget" detail="A monthly plan for each category" value="›" valueColor={c.textSubtle} onPress={() => router.push('/budget')} />
        <Row icon="car" title="Plan a trip" detail="Gas cost for a drive or your commute" value="›" valueColor={c.textSubtle} onPress={() => router.push('/trip')} />
        <Row icon="bubble.left" title="Send feedback" detail="Something broken, confusing, or great" value="›" valueColor={c.textSubtle} onPress={() => router.push('/feedback')} />
        <Row icon="person.2" title="Split with friends" detail="Who owes who, both ways, like Splitwise" value="›" valueColor={c.textSubtle} onPress={() => router.push('/friends')} />
        <Row icon="arrow.uturn.left" title="Owed to you" detail="Split bills and money you’re getting back" value="›" valueColor={c.textSubtle} onPress={() => router.push('/owed')} />
        <Row icon="person.crop.circle" title="Shared spaces" detail="Budget with a partner or roommates" value="›" valueColor={c.textSubtle} onPress={() => router.push('/spaces')} />
        <Row icon="star" title="Take the tour" detail="A 30-second look around Pockit" value="›" valueColor={c.textSubtle} last onPress={() => { router.navigate('/'); setTimeout(() => tour.start(), 350); }} />
      </Card>
      <PlusRow />
      <SectionHeader title="Manage" />
      <Card>
        {ITEMS.map((it, i) => (
          <Row key={it.title} icon={it.icon} title={it.title} detail={it.detail} value="›" valueColor={c.textSubtle} last={i === ITEMS.length - 1} onPress={() => go(it.title)} />
        ))}
      </Card>
      <DevRow />
      <SignOut />
    </>
  );
}

function SignOut() {
  const c = useColors();
  const { signOut, me, demo, exitDemo } = useSession();
  return (
    <>
      <Box style={{ marginTop: space.xxl, paddingVertical: space.lg, alignItems: 'center' }} onPress={async () => { if (demo) exitDemo(); else await signOut(); router.replace('/welcome'); }}>
        <Text style={[type.bodyStrong, { color: c.negative }]}>{demo ? 'Exit demo' : me?.guest ? 'Stop looking around' : 'Sign out'}</Text>
      </Box>
      {me?.email && !demo ? <Text style={[type.caption, { color: c.textSubtle, textAlign: 'center', marginTop: space.sm }]}>Signed in as {me.email}</Text> : null}
    </>
  );
}

/** Hidden until Pockit Plus launches (the server's PLUS_ENABLED switch). */
function PlusRow() {
  const c = useColors();
  const { me } = useSession();
  if (!me?.plusEnabled) return null;
  return (
    <Box style={{ marginTop: space.md }}>
      <Row icon="star" title={me.plus ? 'Pockit Plus — active' : 'Try Pockit Plus free'} detail={me.plus ? 'Thanks for supporting Pockit' : 'Unlimited Ask Pock'} value="›" valueColor={c.textSubtle} last onPress={() => router.push('/plus')} />
    </Box>
  );
}

/** Only for admins (ADMIN_EMAILS on the server). */
function DevRow() {
  const c = useColors();
  const { me } = useSession();
  if (!me?.admin) return null;
  return (
    <Box style={{ marginTop: space.xxl }}>
      <Row icon="gearshape" title="Developer" detail="Admin tools — only you can see this" value="›" valueColor={c.textSubtle} last onPress={() => router.push('/dev')} />
    </Box>
  );
}
