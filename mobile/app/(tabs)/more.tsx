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
  { icon: 'gearshape', title: 'Settings', detail: 'Face ID and bill reminders' },
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
        <Row icon="bubble.left" title="Ask Pock" detail="Questions about your money" value="›" valueColor={c.textSubtle} onPress={() => router.push('/pock')} />
        <Row icon="star" title="Take the tour" detail="A one-minute look around Pockit" value="›" valueColor={c.textSubtle} last onPress={() => router.push('/tour')} />
      </Card>
      <PlusRow />
      <SectionHeader title="Manage" />
      <Card>
        {ITEMS.map((it, i) => (
          <Row key={it.title} icon={it.icon} title={it.title} detail={it.detail} value="›" valueColor={c.textSubtle} last={i === ITEMS.length - 1} onPress={it.title === 'Bills' ? () => router.push('/bills') : it.title === 'Settings' ? () => router.push('/settings') : () => {}} />
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
      <Box style={{ marginTop: space.xxl, padding: space.lg, alignItems: 'center' }} onPress={async () => { if (demo) exitDemo(); else await signOut(); router.replace('/welcome'); }}>
        <Text style={[type.bodyStrong, { color: c.negative }]}>{demo ? 'Exit demo' : 'Sign out'}</Text>
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
