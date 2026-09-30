import { Redirect, Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Icon } from '@/components/Icon';
import { useColors, useIsDark, type Section } from '@/theme/tokens';
import { useSession } from '@/lib/session';

/**
 * The native tab bar. Each tab lights up in its own section colour, so the bar
 * itself tells you where you are: lilac Home, rose Spending, teal Goals, blue Invest.
 */
const TABS: { name: string; title: string; icon: string; section: Section }[] = [
  { name: 'index', title: 'Home', icon: 'house.fill', section: 'home' },
  { name: 'spending', title: 'Spending', icon: 'arrow.left.arrow.right', section: 'spending' },
  { name: 'goals', title: 'Goals', icon: 'target', section: 'goals' },
  { name: 'invest', title: 'Invest', icon: 'chart.line.uptrend.xyaxis', section: 'invest' },
  { name: 'more', title: 'More', icon: 'ellipsis', section: 'more' },
];

export default function TabLayout() {
  const c = useColors();
  const dark = useIsDark();
  const { status, me } = useSession();

  // The tabs are only for someone signed in who has been through setup.
  if (status === 'loading') return null;
  if (status === 'signed-out') return <Redirect href="/welcome" />;
  if (me && !me.setupDone) return <Redirect href="/setup" />;

  return (
    <Tabs
      screenListeners={{ tabPress: () => { void Haptics.selectionAsync(); } }}
      screenOptions={{
        headerShown: false,
        tabBarInactiveTintColor: c.textSubtle,
        tabBarStyle: {
          position: 'absolute',
          borderTopColor: c.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : c.bg,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView tint={dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} intensity={90} style={StyleSheet.absoluteFill} />
          ) : null,
        tabBarLabelStyle: { fontSize: 10, fontFamily: 'BricolageGrotesque_500Medium' },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarActiveTintColor: c.section[tab.section].accent,
            tabBarIcon: ({ color }) => <Icon name={tab.icon} size={24} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}
