import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme/tokens';

/**
 * The native tab bar. Three core tabs, then Invest, then More — the same structure
 * people approved on the web, now as a real iOS tab bar: translucent over the
 * content, a light haptic tick on every switch, SF Symbols.
 */
const TABS = [
  { name: 'index', title: 'Home', icon: 'house.fill' },
  { name: 'spending', title: 'Spending', icon: 'arrow.left.arrow.right' },
  { name: 'goals', title: 'Goals', icon: 'target' },
  { name: 'invest', title: 'Invest', icon: 'chart.line.uptrend.xyaxis' },
  { name: 'more', title: 'More', icon: 'ellipsis' },
] as const;

export default function TabLayout() {
  return (
    <Tabs
      screenListeners={{ tabPress: () => { void Haptics.selectionAsync(); } }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          position: 'absolute',
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.surface,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView tint="systemChromeMaterialDark" intensity={90} style={StyleSheet.absoluteFill} />
          ) : null,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => <Icon name={tab.icon} size={24} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}
