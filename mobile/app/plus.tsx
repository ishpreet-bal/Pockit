import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { PockMark } from '@/components/Pock';
import { Button, FormError } from '@/components/form';
import { buy, loadPlanOptions, purchasesAvailable, restore, type PlanOption } from '@/lib/purchases';
import { useSession } from '@/lib/session';
import { font, radius, space, type, useColors, useIsDark } from '@/theme/tokens';

const PERKS = [
  ['Unlimited Ask Pock', 'Ask as much as you like about your money, any time.'],
  ['Everything you have now', 'Spending, bills, goals and investing stay free for everyone.'],
  ['Support an independent app', 'No ads, and your data is never sold.'],
];

/**
 * The Pockit Plus screen. Leads with the free trial, says plainly that it can be
 * cancelled any time, and never blocks the rest of the app.
 */
export default function Plus() {
  const c = useColors();
  const a = c.section.home;
  const onAccent = useIsDark() ? c.bg : '#fff';
  const insets = useSafeAreaInsets();
  const { me, refresh } = useSession();
  const [options, setOptions] = useState<PlanOption[] | null>(null);
  const [chosen, setChosen] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlanOptions()
      .then((o) => { setOptions(o); const y = o.findIndex((x) => x.yearly); if (y >= 0) setChosen(y); })
      .catch(() => setOptions([]));
  }, []);

  async function subscribe() {
    const option = options?.[chosen];
    if (!option) return;
    setBusy(true); setError(null);
    try {
      if (await buy(option)) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // The App Store tells RevenueCat, which tells our server; give it a moment.
        await new Promise((r) => setTimeout(r, 1500));
        await refresh();
        router.back();
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'The purchase didn’t go through.'); }
    finally { setBusy(false); }
  }

  const option = options?.[chosen];
  const cta = option?.trial ? `Start ${option.trial}` : 'Continue';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.md, paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.xl }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ alignSelf: 'flex-end' }} accessibilityLabel="Close">
          <Text style={[type.body, { color: a.accent }]}>Not now</Text>
        </Pressable>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: a.accent, alignItems: 'center', justifyContent: 'center' }}>
            <PockMark size={44} color={onAccent} />
          </View>
          <Text style={[type.largeTitle, { color: c.text, textAlign: 'center' }]}>Pockit Plus</Text>
          {me?.plus ? (
            <Text style={[type.body, { color: c.positive, textAlign: 'center' }]}>You’re a Plus member — thank you.</Text>
          ) : (
            <Text style={[type.body, { color: c.textMuted, textAlign: 'center', lineHeight: 23 }]}>Try it free. Cancel any time in your iPhone settings — you won’t be charged during the trial.</Text>
          )}
        </View>

        <View style={{ gap: space.lg }}>
          {PERKS.map(([title, body]) => (
            <View key={title} style={{ flexDirection: 'row', gap: space.md }}>
              <Text style={{ fontSize: 18, color: a.accent }}>✓</Text>
              <View style={{ flex: 1 }}>
                <Text style={[type.headline, { color: c.text }]}>{title}</Text>
                <Text style={[type.subhead, { color: c.textMuted, marginTop: 2 }]}>{body}</Text>
              </View>
            </View>
          ))}
        </View>

        {me?.plus ? null : options === null ? null : options.length === 0 ? (
          <View style={{ backgroundColor: c.surface2, borderRadius: radius.card, padding: space.lg }}>
            <Text style={[type.subhead, { color: c.textMuted, lineHeight: 21 }]}>
              {purchasesAvailable() ? 'Plans couldn’t be loaded right now. Try again in a moment.' : 'Subscriptions are available in the App Store version of Pockit.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {options.map((o, i) => (
              <Pressable key={o.pkg.identifier} onPress={() => { setChosen(i); void Haptics.selectionAsync(); }} accessibilityRole="radio" accessibilityState={{ selected: chosen === i }}
                style={{ padding: space.lg, borderRadius: radius.card, borderWidth: 2, borderColor: chosen === i ? a.accent : c.border, backgroundColor: chosen === i ? a.soft : c.surface }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[type.headline, { color: c.text }]}>{o.title}{o.yearly ? '  ·  best value' : ''}</Text>
                  <Text style={[type.bodyStrong, { color: c.text }]}>{o.price}</Text>
                </View>
                {o.trial ? <Text style={[type.footnote, { color: a.accent, marginTop: 4, fontFamily: font.medium }]}>{o.trial}, then {o.price}</Text> : null}
              </Pressable>
            ))}
          </View>
        )}
        <FormError message={error} />
      </ScrollView>

      {!me?.plus && options && options.length > 0 ? (
        <View style={{ paddingHorizontal: space.xl, paddingBottom: Math.max(insets.bottom, space.lg), gap: space.sm }}>
          <Button label={cta} loading={busy} onPress={subscribe} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.xl }}>
            <Pressable onPress={async () => { await restore(); await refresh(); }}><Text style={[type.footnote, { color: c.textMuted }]}>Restore purchases</Text></Pressable>
            <Pressable onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}><Text style={[type.footnote, { color: c.textMuted }]}>Terms</Text></Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
