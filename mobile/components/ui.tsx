import { createContext, useContext, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { radius, space, type, useColors, useIsDark, type Section } from '@/theme/tokens';
import { soft } from '@/theme/palette';
import { Icon } from './Icon';
import { useSession } from '@/lib/session';

const SectionContext = createContext<Section>('home');

/** The current section's accent pair, for anything inside a <Screen>. */
export function useAccent() {
  const c = useColors();
  return c.section[useContext(SectionContext)];
}

/**
 * A page. The title is a small line of spaced capitals across the top (the
 * page's big number is its real headline), content below, clear of the notch
 * and the tab bar.
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
        <View style={s.titleRow}>
          {back ? (
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ flexDirection: 'row', alignItems: 'center', marginRight: space.md }}>
              <Icon name="chevron.left" size={15} color={c.section[section].accent} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: c.textMuted }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
            {eyebrow ? <Text style={[type.footnote, { color: c.textSubtle, marginTop: 2 }]}>{eyebrow}</Text> : null}
          </View>
          {right}
        </View>
        {/* Every page eases in, so moving around feels like one continuous app. */}
        <Animated.View entering={FadeInDown.duration(320)}>{children}</Animated.View>
      </ScrollView>
    </SectionContext.Provider>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const c = useColors();
  const base = [s.card, { borderColor: c.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [base, pressed && { opacity: 0.6 }]}
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
      <Text style={[type.label, { color: c.textMuted }]}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text style={[type.label, { color: a.accent }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** One line in a list: title and detail on the left, the figure on the right. No icons. */
export function Row({
  icon, emoji, title, detail, value, valueColor, last, onPress, color,
}: {
  icon: string; emoji?: string | null; title: string; detail?: string; value?: string; valueColor?: string; last?: boolean; onPress?: () => void;
  /** A category colour: shows a small round badge with the first letter. */
  color?: string;
}) {
  const c = useColors();
  const dark = useIsDark();
  void icon; void emoji;
  return (
    <Pressable
      onPress={onPress ? () => { void Haptics.selectionAsync(); onPress(); } : undefined}
      style={({ pressed }) => [s.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }, pressed && onPress && { opacity: 0.6 }]}
    >
      {color ? (
        <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: soft(color, dark), alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[type.headline, { color, fontSize: 14 }]}>{title.trim().charAt(0).toUpperCase()}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: c.text }]} numberOfLines={1}>{title}</Text>
        {detail ? <Text style={[type.footnote, { color: c.textMuted, marginTop: 1 }]}>{detail}</Text> : null}
      </View>
      {value ? <Text style={[type.bodyStrong, { color: valueColor ?? c.text, fontVariant: ['tabular-nums'] }]}>{value}</Text> : null}
    </Pressable>
  );
}

export function ProgressBar({ value, height = 6, color }: { value: number; height?: number; color?: string }) {
  const c = useColors();
  const a = useAccent();
  return (
    <View style={{ height: Math.min(height, 6), borderRadius: 6, backgroundColor: c.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', borderRadius: 6, backgroundColor: value > 1 ? c.negative : color ?? a.accent }} />
    </View>
  );
}

/** Small pill switcher (1W / 1M / 3M …, This month / Last month). */
export function Segmented<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => { void Haptics.selectionAsync(); onChange(o); }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{ paddingVertical: 6, marginRight: 14, borderBottomWidth: 1.5, borderBottomColor: on ? c.section.home.accent : 'transparent' }}
          >
            <Text style={[type.label, { color: on ? c.text : c.textMuted }]}>{o}</Text>
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
      <View style={[s.previewBadge, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        <Text style={[type.label, { color: c.section.home.accent }]}>Demo · sample data</Text>
        <Pressable onPress={() => { exitDemo(); router.replace('/welcome'); }} hitSlop={8} accessibilityRole="button">
          <Text style={[type.label, { color: c.text, textDecorationLine: 'underline' }]}>Exit demo</Text>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 30, marginBottom: space.xl },
  // No boxes: a group is held together by a hairline above and below.
  card: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 36, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14 },
  iconTile: { width: 36, height: 36, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  previewBadge: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: space.md },
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
    <View style={[s.card, { borderColor: c.border, paddingVertical: space.xl }]}>
      <Text style={[type.headline, { color: c.text }]}>{title}</Text>
      <Text style={[type.footnote, { color: c.textMuted, marginTop: 6, lineHeight: 20 }]}>{body}</Text>
    </View>
  );
}

/** Shown above the content when a refresh failed but older numbers are still on screen. */
export function StaleNote({ message }: { message: string | null }) {
  const c = useColors();
  if (!message) return null;
  return (
    <View style={{ borderLeftWidth: 2, borderLeftColor: c.warning, paddingLeft: 10, paddingVertical: 4, marginBottom: space.md }}>
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


/**
 * A row of round shortcuts under a page's headline — the doors from one page
 * into the tools that belong with it (Instagram-style: explore from where you are).
 */
export function Shortcuts({ items }: { items: { icon: string; label: string; onPress: () => void; color?: string }[] }) {
  const c = useColors();
  const a = useAccent();
  const dark = useIsDark();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xl }}>
      {items.map((it) => (
        <Pressable key={it.label} accessibilityRole="button" accessibilityLabel={it.label}
          onPress={() => { void Haptics.selectionAsync(); it.onPress(); }}
          style={({ pressed }) => ({ alignItems: 'center', gap: 7, width: `${100 / items.length}%`, opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
          <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: it.color ? soft(it.color, dark) : c.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={it.icon} size={21} color={it.color ?? a.accent} />
          </View>
          <Text style={[type.footnote, { fontSize: 12, color: c.textMuted }]} numberOfLines={1}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
