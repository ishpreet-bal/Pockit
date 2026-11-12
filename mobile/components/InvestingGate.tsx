import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Press } from '@/components/Press';
import { Screen, useAccent } from '@/components/ui';
import { useSession } from '@/lib/session';
import { space, type, useColors } from '@/theme/tokens';

/**
 * Investing is still being finished, so only the people who run Pockit
 * (ADMIN_EMAILS) can open it. Every screen in the section goes through this, so
 * a stray link (setup's next steps, a shared URL) shows "Coming soon" instead.
 */
export function InvestingGate({ children }: { children: ReactNode }) {
  const { me } = useSession();
  if (!me?.admin) return <ComingSoon />;
  return <>{children}</>;
}

/** The way out of the investing section, from any depth inside it. */
export function HomeButton() {
  const c = useColors();
  return (
    <Press onPress={() => router.navigate('/')} accessibilityRole="button" accessibilityLabel="Back to Home" hitSlop={8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: c.surface }}>
      <Icon name="house" size={14} color={c.text} />
      <Text style={[type.footnote, { color: c.text, fontWeight: '600' }]}>Home</Text>
    </Press>
  );
}

export function ComingSoon() {
  const c = useColors();
  const a = useAccent();
  return (
    <Screen section="invest" title="Investing" back right={<HomeButton />}>
      <View style={{ alignItems: 'center', paddingTop: space.xxl, gap: space.md }}>
        <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chart.line.uptrend.xyaxis" size={30} color={a.accent} />
        </View>
        <Text style={[type.title2, { color: c.text, textAlign: 'center' }]}>Coming soon</Text>
        <Text style={[type.subhead, { color: c.textMuted, textAlign: 'center', lineHeight: 22, maxWidth: 300 }]}>
          A gentle way to learn investing and follow your stocks and funds. We’re finishing it now and it’ll appear here when it’s ready.
        </Text>
      </View>
    </Screen>
  );
}
