import { forwardRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { font, radius, space, type, useColors, useIsDark, type Section } from '@/theme/tokens';

/**
 * A full-screen step: optional back link and progress at the top, the question in
 * large type, content in the middle, and the main button pinned above the keyboard.
 * Every screen before the tabs uses this, so they all move and read the same way.
 */
export function StepScreen({
  top, title, subtitle, children, footer,
}: { top?: ReactNode; title: string; subtitle?: string; children?: ReactNode; footer: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + space.md, paddingHorizontal: space.xl, paddingBottom: space.xl }}
      >
        {top ? <View style={{ minHeight: 32, marginBottom: space.xl }}>{top}</View> : null}
        <Text style={[type.largeTitle, { color: c.text }]} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={[type.body, { color: c.textMuted, marginTop: space.sm, lineHeight: 22 }]}>{subtitle}</Text> : null}
        <View style={{ marginTop: space.xxl, gap: space.lg }}>{children}</View>
      </ScrollView>
      <View style={{ paddingHorizontal: space.xl, paddingBottom: Math.max(insets.bottom, space.lg), paddingTop: space.sm, gap: space.sm }}>
        {footer}
      </View>
    </KeyboardAvoidingView>
  );
}

export function Button({
  label, onPress, variant = 'primary', loading, disabled, accent,
}: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'plain'; loading?: boolean; disabled?: boolean; accent?: string }) {
  const c = useColors();
  const dark = useIsDark();
  const tint = accent ?? c.section.home.accent;
  const off = disabled || loading;
  const bg = variant === 'primary' ? tint : 'transparent';
  void dark;
  const fg = variant === 'primary' ? '#ffffff' : variant === 'secondary' ? c.text : tint;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={({ pressed }) => ({
        height: 54, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center',
        backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0, borderColor: c.border,
      })}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ fontFamily: font.regular, fontSize: 14, letterSpacing: 1.6, color: fg }}>{label.toUpperCase()}</Text>}
    </Pressable>
  );
}

export const Field = forwardRef<TextInput, TextInputProps & { label: string; error?: string; prefix?: string; section?: Section }>(
  function Field({ label, error, prefix, style, section = 'home', ...rest }, ref) {
    const c = useColors();
    const [focused, setFocused] = useState(false);
    return (
      <View>
        <Text style={[type.label, { color: c.textMuted, marginBottom: 2 }]}>{label}</Text>
        <View style={{
          flexDirection: 'row', alignItems: 'center', height: 54, paddingHorizontal: 2,
          borderBottomWidth: 1.5,
          borderColor: error ? c.negative : focused ? c.section[section].accent : c.border,
        }}>
          {prefix ? <Text style={{ fontFamily: font.medium, fontSize: 18, color: c.textMuted, marginRight: 4 }}>{prefix}</Text> : null}
          <TextInput
            ref={ref}
            placeholderTextColor={c.textSubtle}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            // The field's own border shows focus; the browser outline (web previews only) would double it.
            style={[{ flex: 1, fontFamily: font.regular, fontSize: 18, color: c.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object), style]}
            {...rest}
          />
        </View>
        {error ? <Text style={[type.footnote, { color: c.negative, marginTop: 6 }]}>{error}</Text> : null}
      </View>
    );
  },
);

export function Chip({ label, selected, onPress, section = 'home' }: { label: string; selected: boolean; onPress: () => void; section?: Section }) {
  const c = useColors();
  const a = c.section[section];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      style={{
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.control,
        backgroundColor: selected ? a.soft : 'transparent',
        borderWidth: 1, borderColor: selected ? a.accent : c.border,
      }}
    >
      <Text style={{ fontFamily: font.regular, fontSize: 16, color: selected ? a.accent : c.text }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

/** A plain sentence in red, for a failure that is not about one field. */
export function FormError({ message }: { message?: string | null }) {
  const c = useColors();
  if (!message) return null;
  return <Text style={[type.subhead, { color: c.negative }]}>{message}</Text>;
}

/** Dollars typed by a person → minor units. "1,800.50" → 180050. Null if not a number. */
export function toMinor(text: string): number | null {
  const clean = text.replace(/[^0-9.]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
