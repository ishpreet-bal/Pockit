import { createContext, useContext, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { radius, space, type, useColors, type Section } from '@/theme/tokens';
import { Icon } from './Icon';
import { useSession } from '@/lib/session';

const SectionContext = createContext<Section>('home');

/** The current section's accent pair, for anything inside a <Screen>. */
export function useAccent() {
  const c = useColors();
  return c.section[useContext(SectionContext)];
}

/**
 * A tab's page. Every tab uses this so they share one rhythm: a small eyebrow,
 * a large title, content below, clear of the notch and the tab bar.
 */
export function Screen({
  section, eyebrow, title, right, children, onRefresh, refreshing = false, back,
}: { section: Section; eyebrow?: string; title: string; right?: ReactNode; children: ReactNode; onRefresh?: () => void; refreshing?: boolean; back?: boolean }) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  return (
    <SectionContext.Provider value={section}>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: 120, paddingHorizontal: space.xl }}
        contentInsetAdjustmentBehavior="never"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.section[section].accent} /> : undefined}
      >
        {back ? (
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: space.sm, alignSelf: 'flex-start' }}>
            <Icon name="chevron.left" size={20} color={c.section[section].accent} />
            <Text style={[type.bodyStrong, { color: c.section[section].accent }]}>Back</Text>
          </Pressable>
        ) : null}
        <View style={s.titleRow}>
          <View style={{ flex: 1 }}>
            {eyebrow ? <Text style={[type.subhead, { color: c.textMuted }]}>{eyebrow}</Text> : null}
            <Text style={[type.largeTitle, { color: c.text }]} accessibilityRole="header">{title}</Text>
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
    </SectionContext.Provider>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const c = useColors();
  const base = [s.card, { backgroundColor: c.surface, borderColor: c.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [base, pressed && { opacity: 0.8, transform: [{ scale: 0.985 }] }]}
    >
      {children}
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  const a = useAccent();
  return (
    <View style={s.sectionHeader}>
      <Text style={[type.title3, { color: c.text }]}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={[type.bodyStrong, { color: a.accent, fontSize: 15 }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** One line in a list: icon tile, title and detail, value on the right. */
export function Row({
  icon, emoji, title, detail, value, valueColor, last, onPress,
}: {
  icon: string; emoji?: string | null; title: string; detail?: string; value?: string; valueColor?: string; last?: boolean; onPress?: () => void;
}) {
  const c = useColors();
  const a = useAccent();
  return (
    <Pressable
      onPress={onPress ? () => { void Haptics.selectionAsync(); onPress(); } : undefined}
      style={({ pressed }) => [s.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }, pressed && onPress && { opacity: 0.6 }]}
    >
      <View style={[s.iconTile, { backgroundColor: a.soft }]}>
        {emoji ? <Text style={{ fontSize: 17 }}>{emoji}</Text> : <Icon name={icon} size={17} color={a.accent} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: c.text }]} numberOfLines={1}>{title}</Text>
        {detail ? <Text style={[type.footnote, { color: c.textMuted, marginTop: 1 }]}>{detail}</Text> : null}
      </View>
      {value ? <Text style={[type.bodyStrong, { color: valueColor ?? c.text, fontVariant: ['tabular-nums'] }]}>{value}</Text> : null}
    </Pressable>
  );
}

export function ProgressBar({ value, height = 6 }: { value: number; height?: number }) {
  const c = useColors();
  const a = useAccent();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', borderRadius: height, backgroundColor: a.accent }} />
    </View>
  );
}

/** Small pill switcher (1W / 1M / 3M …, This month / Last month). */
export function Segmented<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => { void Haptics.selectionAsync(); onChange(o); }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: on ? c.surface2 : 'transparent' }}
          >
            <Text style={[type.caption, { color: on ? c.text : c.textMuted }]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function useSegment<T extends string>(initial: T) {
  return useState<T>(initial);
}

/** Minor units in, a formatted amount out. Never a float on the way through. */
export function formatMoney(minor: number, opts: { signed?: boolean; cents?: boolean } = {}): string {
  const negative = minor < 0;
  // Whole-dollar display rounds to the nearest dollar ($11.99 reads as $12, not $11).
  const abs = opts.cents === false ? Math.round(Math.abs(minor) / 100) * 100 : Math.abs(Math.round(minor));
  const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = (abs % 100).toString().padStart(2, '0');
  const body = opts.cents === false ? `$${dollars}` : `$${dollars}.${cents}`;
  if (negative) return `−${body}`;
  return opts.signed ? `+${body}` : body;
}

/**
 * Says plainly that the figures are placeholders until the screens are wired to
 * the server; a made-up balance must never be mistaken for someone's money.
 */
export function PreviewBadge() {
  const c = useColors();
  const { demo, exitDemo } = useSession();
  if (demo) {
    return (
      <View style={[s.previewBadge, { backgroundColor: c.section.home.soft, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }]}>
        <Text style={[type.caption, { color: c.section.home.accent }]}>Demo · sample data</Text>
        <Pressable onPress={() => { exitDemo(); router.replace('/welcome'); }} hitSlop={8} accessibilityRole="button">
          <Text style={[type.caption, { color: c.text, textDecorationLine: 'underline' }]}>Exit demo</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={[s.previewBadge, { backgroundColor: c.surface2 }]}>
      <Text style={[type.caption, { color: c.textMuted }]}>Design preview · sample figures</Text>
    </View>
  );
}

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
  card: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.xxl, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 13, paddingHorizontal: space.lg },
  iconTile: { width: 36, height: 36, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  previewBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, marginBottom: space.md },
});

/** "Today", "Tomorrow", "Yesterday", or "Oct 3" — dates the way people say them. */
export function friendlyDate(iso: string, today: string): string {
  const d = new Date(`${iso}T12:00:00Z`), t = new Date(`${today}T12:00:00Z`);
  const days = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** A calm card for "nothing here yet", with one thing to do about it. */
export function EmptyCard({ title, body }: { title: string; body: string }) {
  const c = useColors();
  return (
    <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border, padding: space.xl, alignItems: 'center' }]}>
      <Text style={[type.headline, { color: c.text, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.footnote, { color: c.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 18 }]}>{body}</Text>
    </View>
  );
}

/** Shown above the content when a refresh failed but older numbers are still on screen. */
export function StaleNote({ message }: { message: string | null }) {
  const c = useColors();
  if (!message) return null;
  return (
    <View style={{ backgroundColor: c.surface2, borderRadius: 12, padding: 10, marginBottom: space.md }}>
      <Text style={[type.footnote, { color: c.textMuted }]}>{message}</Text>
    </View>
  );
}

/** First load: a spinner, or the error with how to retry. */
export function Loading({ error }: { error: string | null }) {
  const c = useColors();
  return (
    <View style={{ paddingVertical: 80, alignItems: 'center' }}>
      {error ? <Text style={[type.subhead, { color: c.textMuted, textAlign: 'center' }]}>{error}{'\n'}Pull down to try again.</Text> : <ActivityIndicator />}
    </View>
  );
}

