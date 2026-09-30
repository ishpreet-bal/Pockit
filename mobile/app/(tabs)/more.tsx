import { Text, View } from 'react-native';
import { Card, Screen } from '@/components/ui';
import { Otter } from '@/components/Otter';
import { colors, space, type } from '@/theme/tokens';

/** Designed and built in a later step. Kept honest rather than filled with mock UI. */
export default function ScreenMore() {
  return (
    <Screen title="More">
      <Card style={{ padding: space.xl, alignItems: 'center' }}>
        <Otter size={64} mood="thinking" />
        <Text style={[type.headline, { color: colors.text, marginTop: space.md }]}>Coming in the next step</Text>
        <Text style={[type.footnote, { color: colors.textMuted, marginTop: space.xs, textAlign: 'center' }]}>
          This tab is designed after Home is signed off.
        </Text>
      </Card>
      <View />
    </Screen>
  );
}
