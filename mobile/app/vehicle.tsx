import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Icon } from '@/components/Icon';
import { getVehicle, saveSettings, vehicleMenu } from '@/lib/trip';
import { font, radius, space, type, useColors } from '@/theme/tokens';

/**
 * Pick your car: year → make → model → version, with a search box at every step.
 * Every car the EPA has rated since 1984 is here.
 */
type Step = 'year' | 'make' | 'model' | 'version';
const TITLES: Record<Step, string> = { year: 'What year is it?', make: 'What make?', model: 'Which model?', version: 'Which version?' };

export default function VehiclePicker() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const a = c.section.spending;
  const [step, setStep] = useState<Step>('year');
  const [pick, setPick] = useState<{ year?: string; make?: string; model?: string }>({});
  const [items, setItems] = useState<{ key: string; label: string; id?: number }[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(null); setQ(''); setError(null);
    vehicleMenu(pick.year, pick.make, pick.model)
      .then((r) => setItems(r.versions ? r.versions.map((v) => ({ key: String(v.id), label: v.detail || 'Standard', id: v.id })) : (r.items ?? []).map((x) => ({ key: x, label: x }))))
      .catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t load the car list.'));
  }, [step]);

  async function choose(item: { label: string; id?: number }) {
    void Haptics.selectionAsync();
    if (step === 'year') { setPick({ year: item.label }); setStep('make'); return; }
    if (step === 'make') { setPick({ ...pick, make: item.label }); setStep('model'); return; }
    if (step === 'model') { setPick({ ...pick, model: item.label }); setStep('version'); return; }
    try {
      const v = await getVehicle(item.id!, { year: pick.year!, make: pick.make!, model: pick.model! });
      await saveSettings({ vehicle: v, own: '' });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch { setError('Couldn’t load that car. Try again.'); }
  }

  function back() {
    if (step === 'year') return router.back();
    setStep(step === 'version' ? 'model' : step === 'model' ? 'make' : 'year');
  }

  // Skip the version step when there's only one.
  useEffect(() => { if (step === 'version' && items?.length === 1) void choose(items[0]!); }, [items]);

  const shown = (items ?? []).filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()));
  const crumbs = [pick.year, pick.make, pick.model].filter(Boolean).join(' ');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space.md }}>
      <View style={{ paddingHorizontal: space.xl }}>
        <Pressable onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' }}>
          <Icon name="chevron.left" size={20} color={a.accent} />
          <Text style={[type.bodyStrong, { color: a.accent }]}>{step === 'year' ? 'Cancel' : 'Back'}</Text>
        </Pressable>
        {crumbs ? <Text style={[type.subhead, { color: c.textMuted, marginTop: space.md }]}>{crumbs}</Text> : null}
        <Text style={[type.title2, { color: c.text, marginTop: crumbs ? 2 : space.md }]}>{TITLES[step]}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: radius.control, backgroundColor: c.surface2, paddingHorizontal: space.md, marginTop: space.lg, marginBottom: space.sm }}>
          <Icon name="magnifyingglass" size={17} color={c.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder={`Search ${step === 'year' ? 'years' : step === 'make' ? 'makes' : step === 'model' ? 'models' : 'versions'}`} placeholderTextColor={c.textSubtle}
            autoCorrect={false} keyboardType={step === 'year' ? 'number-pad' : 'default'} style={{ flex: 1, fontFamily: font.regular, fontSize: 17, color: c.text }} accessibilityLabel="Search" />
        </View>
        {error ? <Text style={[type.footnote, { color: c.negative, marginTop: space.sm }]}>{error}</Text> : null}
      </View>
      {!items && !error ? <ActivityIndicator style={{ marginTop: space.xxl }} color={a.accent} /> : (
        <FlatList
          data={shown}
          keyExtractor={(i) => i.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.xl }}
          ListEmptyComponent={items ? <Text style={[type.subhead, { color: c.textMuted, marginTop: space.lg }]}>No matches for “{q}”.</Text> : null}
          renderItem={({ item }) => (
            <Pressable onPress={() => void choose(item)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: c.border, opacity: pressed ? 0.5 : 1 })}>
              <Text style={[type.body, { color: c.text, flex: 1 }]}>{item.label}</Text>
              <Icon name="chevron.right" size={15} color={c.textSubtle} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
