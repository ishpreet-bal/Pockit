import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PockMark } from '@/components/Pock';
import { Button } from '@/components/form';
import { useSession } from '@/lib/session';
import { space, type, useColors } from '@/theme/tokens';

/** The first screen anyone sees. One sentence about what Pockit does, and two ways in. */
export default function Welcome() {
  const c = useColors();
  const a = c.section.home;
  const insets = useSafeAreaInsets();
  const { enterDemo } = useSession();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, space.lg), paddingHorizontal: space.xl }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Animated.View entering={FadeInDown.duration(600)} style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
          <PockMark size={46} color={a.accent} />
        </Animated.View>
        <Animated.Text entering={FadeInDown.delay(150).duration(600)} style={[type.largeTitle, { color: c.text, fontSize: 38, lineHeight: 44, marginTop: space.xxl }]}>
          Know what you{'\n'}can spend.
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(300).duration(600)} style={[type.body, { color: c.textMuted, marginTop: space.md, lineHeight: 23 }]}>
          Pockit keeps track of your bills, goals and investments, so you always know where you stand.
        </Animated.Text>
      </View>
      <Animated.View entering={FadeInDown.delay(450).duration(600)} style={{ gap: space.sm }}>
        <Button label="Get started" onPress={() => router.push('/sign-up')} />
        <Button label="Look around first" variant="secondary" onPress={() => { enterDemo(); router.replace('/'); }} />
        <Button label="I already have an account" variant="plain" onPress={() => router.push('/sign-in')} />
        <Text style={[type.caption, { color: c.textSubtle, textAlign: 'center', marginTop: space.xs }]}>Free · the demo needs no account</Text>
      </Animated.View>
    </View>
  );
}
