import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Icon } from '@/components/Icon';
import { PockMark } from '@/components/Pock';
import { useColors } from '@/theme/tokens';
import { useSession } from '@/lib/session';

/**
 * Symbols, not words — the way every big app does it — with Pock in the middle,
 * one tap from anywhere. Switching tabs slides gently instead of snapping.
 */
const TABS: { name: string; title: string; icon: string }[] = [
  { name: 'index', title: 'Home', icon: 'house' },
  { name: 'spending', title: 'Spending', icon: 'creditcard' },
  { name: 'ask', title: 'Ask Pock', icon: '' },
  { name: 'goals', title: 'Goals', icon: 'target' },
  { name: 'together', title: 'Together', icon: 'person.2' },
];

export default function TabLayout() {
  const c = useColors();
  const a = c.section.home.accent;
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
        animation: 'shift',
        tabBarShowLabel: false,
        tabBarActiveTintColor: a,
        tabBarInactiveTintColor: c.textSubtle,
        tabBarStyle: { position: 'absolute', backgroundColor: c.bg, borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth, elevation: 0, height: 78, paddingTop: 10 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: tab.title,
            tabBarIcon: ({ color, focused }) => tab.name === 'ask' ? (
              <View style={{ width: 46, height: 46, borderRadius: 23, marginTop: -4, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? a : 'transparent', borderWidth: 1.5, borderColor: a }}>
                <PockMark size={22} color={focused ? '#fff' : a} />
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Icon name={tab.icon} size={23} color={color as string} />
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: focused ? a : 'transparent' }} />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
