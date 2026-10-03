import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { font, useColors } from '@/theme/tokens';
import { useSession } from '@/lib/session';

/** Words, not icons: small spaced capitals, the current one in the accent. */
const TABS: { name: string; title: string }[] = [
  { name: 'index', title: 'RUNWAY' },
  { name: 'spending', title: 'SPEND' },
  { name: 'goals', title: 'GOALS' },
  { name: 'invest', title: 'INVEST' },
  { name: 'more', title: 'MORE' },
];

export default function TabLayout() {
  const c = useColors();
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
        tabBarStyle: { position: 'absolute', backgroundColor: c.bg, borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth, elevation: 0 },
        tabBarIconStyle: { display: 'none' },
        tabBarItemStyle: { justifyContent: 'center' },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: tab.title.toLowerCase(),
            tabBarIcon: () => null,
            tabBarLabel: ({ focused }) => (
              <Text style={{ fontFamily: font.regular, fontSize: 12, letterSpacing: 1.6, color: focused ? c.section.home.accent : c.textSubtle }}>{tab.title}</Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
