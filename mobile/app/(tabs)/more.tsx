import { Card, Row, Screen, SectionHeader } from '@/components/ui';
import { useColors } from '@/theme/tokens';

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
        <Row icon="bubble.left" title="Ask Pock" detail="Questions about your money" value="›" valueColor={c.textSubtle} last onPress={() => {}} />
      </Card>
      <SectionHeader title="Manage" />
      <Card>
        {ITEMS.map((it, i) => (
          <Row key={it.title} icon={it.icon} title={it.title} detail={it.detail} value="›" valueColor={c.textSubtle} last={i === ITEMS.length - 1} onPress={() => {}} />
        ))}
      </Card>
    </>
  );
}
