import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, radius, space, type } from '@/theme/tokens';

/**
 * A tab's page: large title at the top, content below, padded clear of the notch
 * and the tab bar. Every tab uses this so they share one rhythm.
 */
export function Screen({
  title, right, children,
}: { title: string; right?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: 120, paddingHorizontal: space.lg }}
      contentInsetAdjustmentBehavior="never"
    >
      <View style={s.titleRow}>
        <Text style={[type.largeTitle, { color: colors.text }]} accessibilityRole="header">{title}</Text>
        {right}
      </View>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.card, style, pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] }]}
    >
      {children}
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={[type.title3, { color: colors.text }]}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={[type.subhead, { color: colors.accent }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Minor units in, a formatted amount out. Never a float on the way through. */
export function formatMoney(minor: number, opts: { signed?: boolean; cents?: boolean } = {}): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = (abs % 100).toString().padStart(2, '0');
  const body = opts.cents === false ? `$${dollars}` : `$${dollars}.${cents}`;
  if (negative) return `−${body}`;
  return opts.signed ? `+${body}` : body;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: space.lg }} />;
}

/**
 * Says plainly that the figures are placeholders. Step 1 is design review; real
 * numbers arrive when the screens are wired to the server in step 3, and a
 * made-up balance must never be mistaken for someone's actual money.
 */
export function PreviewBadge() {
  return (
    <View style={s.previewBadge}>
      <Text style={[type.caption, { color: colors.warning }]}>Design preview · sample figures</Text>
    </View>
  );
}

const s = StyleSheet.create({
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: space.lg, marginTop: space.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: space.xxl, marginBottom: space.md,
  },
  previewBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.warningSoft,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, marginBottom: space.md,
  },
});
