import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Icon } from './Icon';
import { formatMoney } from './ui';
import { font, radius, space, type, useColors } from '@/theme/tokens';

/**
 * What the person chose. Mirrors the server's cost share; amounts are worked out
 * here only to show them as you go, and the server works them out again.
 */
export interface SplitChoice {
  kind: 'split' | 'covered';
  people: number;
  /** Your part in dollars for an uneven split, as typed. Empty means even. */
  mine: string;
  expectBack: boolean;
  withWhom: string;
}

export const emptySplit: SplitChoice = { kind: 'split', people: 2, mine: '', expectBack: true, withWhom: '' };

/** Same rule as the server: others' parts round down, the leftover cents are yours. */
export function splitPreview(totalMinor: number, s: SplitChoice) {
  const total = Math.abs(totalMinor);
  if (s.kind === 'covered') return { mine: s.expectBack ? 0 : total, others: total, each: null as number | null };
  const typed = s.mine.trim() ? Math.round(Number(s.mine.replace(/[^0-9.]/g, '')) * 100) : null;
  if (typed !== null && Number.isFinite(typed)) {
    const mine = Math.max(0, Math.min(total, typed));
    return { mine, others: total - mine, each: null };
  }
  const people = Math.max(2, s.people);
  const each = Math.floor(total / people);
  return { mine: total - each * (people - 1), others: each * (people - 1), each };
}

/** The body the server takes. */
export function splitBody(s: SplitChoice) {
  const mine = s.kind === 'split' && s.mine.trim() ? Number(s.mine.replace(/[^0-9.]/g, '')) : null;
  return {
    kind: s.kind,
    people: s.kind === 'split' ? s.people : null,
    mine: mine !== null && Number.isFinite(mine) ? mine : null,
    expectBack: s.expectBack,
    withWhom: s.withWhom.trim() || null,
  };
}

/**
 * Split expense: a check mark to switch it on, then the choices. Two kinds:
 * split the bill between a number of people, or you paid for someone else.
 */
export function SplitEditor({ totalMinor, on, onToggle, value, onChange, accent }: {
  totalMinor: number;
  on: boolean;
  onToggle: (on: boolean) => void;
  value: SplitChoice;
  onChange: (v: SplitChoice) => void;
  accent: { accent: string; soft: string };
}) {
  const c = useColors();
  const set = (patch: Partial<SplitChoice>) => onChange({ ...value, ...patch });
  const p = splitPreview(totalMinor, value);
  const [uneven, setUneven] = useState(Boolean(value.mine));
  useEffect(() => { if (!uneven && value.mine) set({ mine: '' }); }, [uneven]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View>
      <Pressable
        onPress={() => { void Haptics.selectionAsync(); onToggle(!on); }}
        accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel="Split expense"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: on ? accent.accent : c.border, backgroundColor: on ? accent.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {on ? <Icon name="checkmark" size={15} color="#ffffff" /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyStrong, { color: c.text }]}>Split expense</Text>
          <Text style={[type.footnote, { color: c.textMuted, marginTop: 1 }]}>Shared it, or paid for someone else</Text>
        </View>
      </Pressable>

      {on ? (
        <View style={{ gap: space.lg, paddingBottom: space.md }}>
          <Toggle
            options={[['split', 'Split the bill'], ['covered', 'Paid for someone']]}
            value={value.kind}
            onChange={(k) => set({ kind: k as SplitChoice['kind'], expectBack: true })}
          />

          {value.kind === 'split' ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.subhead, { color: c.text }]}>How many people?</Text>
                  <Text style={[type.footnote, { color: c.textMuted }]}>Including you</Text>
                </View>
                <Stepper value={value.people} min={2} max={20} onChange={(n) => set({ people: n })} accent={accent.accent} disabled={uneven} />
              </View>

              <Pressable onPress={() => setUneven(!uneven)} accessibilityRole="button" hitSlop={6}>
                <Text style={[type.footnote, { color: accent.accent }]}>{uneven ? 'Split evenly instead' : 'Not even? Enter your part'}</Text>
              </Pressable>
              {uneven ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: accent.accent, height: 46 }}>
                  <Text style={{ fontFamily: font.medium, fontSize: 17, color: c.textMuted, marginRight: 4 }}>$</Text>
                  <TextInput value={value.mine} onChangeText={(t) => set({ mine: clean(t) })} placeholder="Your part" placeholderTextColor={c.textSubtle}
                    keyboardType="decimal-pad" inputMode="decimal" accessibilityLabel="Your part"
                    style={[{ flex: 1, fontFamily: font.regular, fontSize: 17, color: c.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
                </View>
              ) : null}

              <Toggle
                options={[['yes', 'They’ll pay me back'], ['no', 'Already squared up']]}
                value={value.expectBack ? 'yes' : 'no'}
                onChange={(v) => set({ expectBack: v === 'yes' })}
              />
            </>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={[type.subhead, { color: c.text }]}>Are you getting it back?</Text>
              <Choice selected={value.expectBack} onPress={() => set({ expectBack: true })} accent={accent}
                title="Yes, they’re paying me back" detail="Shows as owed to you, and stays out of your budget" />
              <Choice selected={!value.expectBack} onPress={() => set({ expectBack: false })} accent={accent}
                title="No, it’s my treat" detail="Marked as paid for someone, and counts in your budget" />
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border, height: 46, gap: 8 }}>
            <Icon name="person.2" size={17} color={c.textSubtle} />
            <TextInput value={value.withWhom} onChangeText={(t) => set({ withWhom: t })} maxLength={200}
              placeholder={value.kind === 'split' ? 'Who with? (optional) e.g. Sam, Priya' : 'Who for? (optional) e.g. Mom'} placeholderTextColor={c.textSubtle}
              accessibilityLabel="Who"
              style={[{ flex: 1, fontFamily: font.regular, fontSize: 16, color: c.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
          </View>

          <View style={{ borderRadius: radius.tile, backgroundColor: accent.soft, padding: space.md, gap: 4 }}>
            <Line label="Counts in your budget" value={formatMoney(p.mine)} strong color={c.text} />
            {value.kind === 'split' || value.expectBack ? (
              <Line label={value.expectBack ? 'Owed to you' : 'Their part (settled)'} value={formatMoney(p.others)} color={value.expectBack ? accent.accent : c.textMuted} />
            ) : null}
            {p.each !== null && value.people > 2 ? (
              <Text style={[type.footnote, { color: c.textMuted }]}>{formatMoney(p.each)} each from {value.people - 1} people</Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Line({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={[type.subhead, { color: c.textMuted }]}>{label}</Text>
      <Text style={[strong ? type.bodyStrong : type.subhead, { color, fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );
}

function Toggle({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surface2, borderRadius: radius.control, padding: 3 }}>
      {options.map(([k, label]) => (
        <Pressable key={k} onPress={() => { onChange(k); void Haptics.selectionAsync(); }} accessibilityRole="button" accessibilityState={{ selected: value === k }}
          style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: value === k ? c.surface : 'transparent' }}>
          <Text style={{ fontFamily: font.medium, fontSize: 14, color: value === k ? c.text : c.textMuted }} numberOfLines={1}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Choice({ selected, onPress, title, detail, accent }: { selected: boolean; onPress: () => void; title: string; detail: string; accent: { accent: string; soft: string } }) {
  const c = useColors();
  return (
    <Pressable onPress={() => { void Haptics.selectionAsync(); onPress(); }} accessibilityRole="radio" accessibilityState={{ checked: selected }}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: space.md, borderRadius: radius.tile, borderWidth: 1, borderColor: selected ? accent.accent : c.border, backgroundColor: selected ? accent.soft : 'transparent' }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? accent.accent : c.border, alignItems: 'center', justifyContent: 'center' }}>
        {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent.accent }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.subhead, { color: c.text }]}>{title}</Text>
        <Text style={[type.footnote, { color: c.textMuted, marginTop: 1 }]}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function Stepper({ value, min, max, onChange, accent, disabled }: { value: number; min: number; max: number; onChange: (n: number) => void; accent: string; disabled?: boolean }) {
  const c = useColors();
  const btn = (label: string, next: number, off: boolean) => (
    <Pressable onPress={() => { if (!off) { void Haptics.selectionAsync(); onChange(next); } }} disabled={off} accessibilityRole="button" accessibilityLabel={label === '−' ? 'Fewer people' : 'More people'} hitSlop={6}
      style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: off ? c.border : accent, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 18, color: off ? c.textSubtle : accent }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled ? 0.4 : 1 }}>
      {btn('−', value - 1, Boolean(disabled) || value <= min)}
      <Text style={[type.headline, { color: c.text, minWidth: 22, textAlign: 'center', fontVariant: ['tabular-nums'] }]}>{value}</Text>
      {btn('+', value + 1, Boolean(disabled) || value >= max)}
    </View>
  );
}

function clean(t: string): string {
  const digits = t.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = digits.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole!;
}
