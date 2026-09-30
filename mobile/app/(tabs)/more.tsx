import { Card, Row, Screen, SectionHeader } from '@/components/ui';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { Card as Box } from '@/components/ui';
import { useSession } from '@/lib/session';
import { space, type, useColors } from '@/theme/tokens';

const ITEMS = [
  { icon: 'repeat', title: 'Bills', detail: 'Rent, phone, subscriptions' },
  { icon: 'building.columns', title: 'Accounts', detail: 'Chequing, savings, credit' },
  { icon: 'square.and.arrow.down', title: 'Import', detail: 'Bring in a bank statement' },
  { icon: 'gearshape', title: 'Settings', detail: 'Face ID, notifications, appearance' },
];

export default function More() {
  return (
    <Screen section="more" title="More">
      <Body />
    </Screen>
  );
}

function Body() {
  const c = useColors();
  return (
    <>
      <Card>
        <Row icon="bubble.left" title="Ask Pock" detail="Questions about your money" value="›" valueColor={c.textSubtle} last onPress={() => router.push('/pock')} />
      </Card>
      <SectionHeader title="Manage" />
      <Card>
        {ITEMS.map((it, i) => (
          <Row key={it.title} icon={it.icon} title={it.title} detail={it.detail} value="›" valueColor={c.textSubtle} last={i === ITEMS.length - 1} onPress={it.title === 'Bills' ? () => router.push('/bills') : () => {}} />
        ))}
      </Card>
      <SignOut />
    </>
  );
}

function SignOut() {
  const c = useColors();
  const { signOut, me } = useSession();
  return (
    <>
      <Box style={{ marginTop: space.xxl, padding: space.lg, alignItems: 'center' }} onPress={async () => { await signOut(); router.replace('/welcome'); }}>
        <Text style={[type.bodyStrong, { color: c.negative }]}>Sign out</Text>
      </Box>
      {me?.email ? <Text style={[type.caption, { color: c.textSubtle, textAlign: 'center', marginTop: space.sm }]}>Signed in as {me.email}</Text> : null}
    </>
  );
}
