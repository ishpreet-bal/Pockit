import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Icon } from '@/components/Icon';
import { Button, Chip, ChipRow, Field, FormError } from '@/components/form';
import { getVehicle, saveSettings, vehicleMenu, type Vehicle } from '@/lib/trip';
import { font, radius, space, type, useColors } from '@/theme/tokens';

/**
 * Pick your car: year → make → model → version, with a search box at every step.
 * EPA catalogue with a manual option for cars and regions outside its coverage.
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
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    let active = true;
    setItems(null); setQ(''); setError(null);
    vehicleMenu(pick.year, pick.make, pick.model)
      .then((r) => { if (active) setItems(r.versions ? r.versions.map((v) => ({ key: String(v.id), label: v.detail || 'Standard', id: v.id })) : (r.items ?? []).map((x) => ({ key: x, label: x }))); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Couldn’t load the car list.'); });
    return () => { active = false; };
  }, [step, pick.year, pick.make, pick.model, retry]);

  async function choose(item: { label: string; id?: number }) {
    if (saving) return;
    void Haptics.selectionAsync();
    if (step === 'year') { setPick({ year: item.label }); setStep('make'); return; }
    if (step === 'make') { setPick({ year: pick.year, make: item.label }); setStep('model'); return; }
    if (step === 'model') { setPick({ ...pick, model: item.label }); setStep('version'); return; }
    setSaving(true); setError(null);
    try {
      const v = await getVehicle(item.id!, { year: pick.year!, make: pick.make!, model: pick.model! });
      await saveSettings({ vehicle: v, own: '', price: '', tank: '' });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch { setError('Couldn’t load that car. Try again, or enter your fuel use manually.'); }
    finally { setSaving(false); }
  }

  function back() {
    if (manual) { setManual(false); return; }
    if (step === 'year') return router.back();
    setPick(step === 'version' ? { year: pick.year, make: pick.make } : step === 'model' ? { year: pick.year } : {});
    setStep(step === 'version' ? 'model' : step === 'model' ? 'make' : 'year');
  }

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
        <Text style={[type.title2, { color: c.text, marginTop: crumbs ? 2 : space.md }]}>{manual ? 'Use your own fuel figure' : TITLES[step]}</Text>
        {!manual ? <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: radius.control, backgroundColor: c.surface2, paddingHorizontal: space.md, marginTop: space.lg, marginBottom: space.sm }}>
          <Icon name="magnifyingglass" size={17} color={c.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder={`Search ${step === 'year' ? 'years' : step === 'make' ? 'makes' : step === 'model' ? 'models' : 'versions'}`} placeholderTextColor={c.textSubtle}
            autoCorrect={false} keyboardType={step === 'year' ? 'number-pad' : 'default'} style={{ flex: 1, fontFamily: font.regular, fontSize: 17, color: c.text }} accessibilityLabel="Search" />
        </View>
        {error ? <Text style={[type.footnote, { color: c.negative, marginTop: space.sm }]}>{error}</Text> : null}
        {error ? <Button label="Retry car list" variant="plain" onPress={() => setRetry((n) => n + 1)} /> : null}
        <Pressable onPress={() => setManual(true)} accessibilityRole="button" style={{ paddingVertical: space.md }}>
          <Text style={[type.bodyStrong, { color: a.accent }]}>Can’t find your car? Enter fuel use manually</Text>
        </Pressable>
        <Text style={[type.footnote, { color: c.textMuted, marginBottom: space.md }]}>EPA-rated US-market models. Canadian names and trims can differ. Choose the matching engine and drivetrain.</Text>
        </> : null}
      </View>
      {manual ? <ManualVehicle /> : !items && !error ? <ActivityIndicator style={{ marginTop: space.xxl }} color={a.accent} /> : (
        <FlatList
          data={shown}
          keyExtractor={(i) => i.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.xl }}
          ListEmptyComponent={items ? <Text style={[type.subhead, { color: c.textMuted, marginTop: space.lg }]}>{q ? `No matches for “${q}”.` : 'No rated cars found for this selection. Try another year, or enter fuel use manually.'}</Text> : null}
          renderItem={({ item }) => (
            <Pressable disabled={saving} onPress={() => void choose(item)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: c.border, opacity: pressed || saving ? 0.5 : 1 })}>
              <Text style={[type.body, { color: c.text, flex: 1 }]}>{item.label}</Text>
              <Icon name="chevron.right" size={15} color={c.textSubtle} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function ManualVehicle() {
  const c = useColors();
  const [name, setName] = useState('');
  const [fuel, setFuel] = useState<Vehicle['fuel']>('regular');
  const [use, setUse] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = Number(use.trim().replace(',', '.'));
  const valid = Number.isFinite(amount) && amount > 0 && amount <= 1000;
  async function save() {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      await saveSettings({ vehicle: { id: 0, year: 0, make: '', model: name.trim() || 'My car', detail: 'Your fuel use', city: amount, highway: amount, electric: fuel === 'electric', fuel, vehicleClass: '', custom: true }, own: '', price: '', tank: '' });
      router.back();
    } catch { setError('Couldn’t save your car. Try again.'); }
    finally { setSaving(false); }
  }
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.lg, paddingBottom: space.xxl }}>
    <Field label="Car name (optional)" accessibilityLabel="Car name" value={name} onChangeText={setName} placeholder="e.g. My Civic" maxLength={80} />
    <ChipRow>{([['regular', 'Regular'], ['premium', 'Premium'], ['midgrade', 'Midgrade'], ['diesel', 'Diesel'], ['electric', 'Electric']] as const).map(([value, label]) => <Chip key={value} label={label} selected={fuel === value} onPress={() => setFuel(value)} section="spending" />)}</ChipRow>
    <Field label={fuel === 'electric' ? 'Energy use (kWh/100 km)' : 'Fuel use (L/100 km)'} accessibilityLabel="Consumption per 100 km" value={use} onChangeText={setUse} keyboardType="decimal-pad" placeholder={fuel === 'electric' ? 'e.g. 18.5' : 'e.g. 7.5'} />
    <Text style={[type.footnote, { color: c.textMuted }]}>Use the average from your dashboard or owner’s manual. For a plug-in hybrid, use gasoline-mode consumption; charging costs are separate.</Text>
    {use && !valid ? <FormError message="Enter a consumption greater than zero, up to 1,000 per 100 km." /> : null}
    <FormError message={error} />
    <Button label="Use this car" onPress={() => void save()} disabled={!valid} loading={saving} accent={c.section.spending.accent} />
  </ScrollView>;
}
