import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Button, Chip, ChipRow, FormError } from '@/components/form';
import { Icon } from '@/components/Icon';
import { TripMap } from '@/components/TripMap';
import { Card, PreviewBadge, Screen, SectionHeader, Segmented, formatMoney as money } from '@/components/ui';
import { api } from '@/lib/api';
import { estimateCommute, estimateTrip, typicalTank, type Days } from '@/lib/fuel';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { defaultPrice, loadSettings, nameHere, route as getRoute, saveSettings, searchPlaces, type Place, type Route, type Vehicle } from '@/lib/trip';
import { font, radius, space, type, useColors } from '@/theme/tokens';
import type { TxnPage } from './transactions';

/**
 * Plan a trip: pick your car, where you're starting and where you're going,
 * and see the fuel, fill-ups and cost — for one drive, or for a commute by the
 * week and month. Either can go straight into your spending.
 */

type Mode = 'One trip' | 'Commute';
const num = (s: string) => { const text = s.trim().replace(',', '.'); const n = Number(text); return /^\d*\.?\d+$/.test(text) && Number.isFinite(n) && n >= 0 ? n : null; };
const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

export default function Trip() {
  const c = useColors();
  const a = c.section.spending;
  const { data: summary, refresh } = useSummary();
  const currency = summary?.currency ?? 'CAD';
  const minorFactor = ['JPY', 'KRW'].includes(currency) ? 1 : 100;
  const formatMoney = (minor: number, opts: { cents?: boolean } = {}) => money(minor, { ...opts, currency });
  const [mode, setMode] = useState<Mode>('One trip');
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [own, setOwn] = useState('');
  const [price, setPrice] = useState('');
  const [tank, setTank] = useState('');
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeRetry, setRouteRetry] = useState(0);
  const [roundTrip, setRoundTrip] = useState(false);
  const [days, setDays] = useState<Days>(5);
  const [custom, setCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [budget, setBudget] = useState<{ planMinor: number; spentMinor: number } | null>(null);

  // The car is chosen on its own screen; pick it up whenever we come back.
  useFocusEffect(useCallback(() => {
    void loadSettings().then((s) => { setVehicle(s.vehicle); setOwn(s.own); setPrice(s.priceCurrency === currency || (!s.priceCurrency && currency === 'CAD') ? s.price : ''); setTank(s.tank); });
  }, [currency]));

  useEffect(() => {
    if (PREVIEW) { setBudget({ planMinor: 30_000, spentMinor: 18_900 }); return; }
    api<{ categories: { name: string; planMinor: number | null; spentMinor: number }[] }>('/api/mobile/budget')
      .then((r) => { const t = r.categories.find((x) => /transport/i.test(x.name)); if (t?.planMinor) setBudget({ planMinor: t.planMinor, spentMinor: t.spentMinor }); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setRoute(null); setSaved(null);
    if (!from || !to) { setRouting(false); return; }
    setRouting(true); setError(null);
    getRoute(from, to).then((r) => { if (active) setRoute(r); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Couldn’t find a route.'); }).finally(() => { if (active) setRouting(false); });
    return () => { active = false; };
  }, [from, to, routeRetry]);

  const electric = Boolean(vehicle?.electric);
  const priceN = num(price) ?? defaultPrice(vehicle);
  const tankN = electric ? null : num(tank) ?? typicalTank(vehicle?.vehicleClass);
  const ownN = num(own);
  const unit = electric ? 'kWh' : 'L';
  const inputError = price.trim() && num(price) === null ? 'Enter a valid price of zero or more.'
    : tank.trim() && !electric && (!num(tank) || num(tank)! > 2000) ? 'Enter a tank size greater than zero, up to 2,000 L.'
    : own.trim() && (!ownN || ownN > 1000) ? 'Enter consumption greater than zero, up to 1,000 per 100 km.'
    : currency !== 'CAD' && !price.trim() ? `Enter your local price in ${currency} to see an estimate.` : null;

  const result = useMemo(() => {
    if (!route || !vehicle || inputError) return null;
    const base = { distanceKm: route.distanceKm, durationMin: route.durationMin, efficiency: vehicle, ownPer100km: ownN, price: priceN };
    return { trip: estimateTrip({ ...base, tankLitres: tankN, roundTrip }), commute: estimateCommute({ ...base, daysPerWeek: days }) };
  }, [route, vehicle, ownN, priceN, tankN, roundTrip, days, inputError]);

  useEffect(() => { setSaved(null); }, [vehicle, own, price, tank, roundTrip, days]);

  function remember(patch: { own?: string; price?: string; tank?: string }) { void saveSettings({ ...patch, ...(patch.price !== undefined ? { priceCurrency: currency } : {}) }).catch(() => setError('Couldn’t remember these settings on this device.')); }

  async function addToSpending() {
    if (!result || !from || !to || saving) return;
    setSaving(true); setError(null);
    const trip = mode === 'One trip';
    try {
      if (!PREVIEW) {
        const meta = await api<TxnPage>('/api/mobile/transactions');
        const cat = meta.categories.find((x) => /^gas|fuel/i.test(x.name) && x.kind === 'expense') ?? meta.categories.find((x) => /transport/i.test(x.name));
        const account = meta.accounts.find((x) => x.type === 'chequing' && x.currency === currency) ?? meta.accounts.find((x) => x.currency === currency && !['credit_card', 'loan'].includes(x.type));
        if (!account) throw new Error(`Add an account in ${currency} before saving this estimate.`);
        if (trip) {
          await api('/api/transactions', { body: {
            amount: result.trip.cost.toFixed(2), description: `${electric ? 'Charging' : 'Gas'}: ${from.name} → ${to.name}${roundTrip ? ' and back' : ''}`,
            accountId: account.id, categoryId: cat?.id ?? null, postedDate: summary?.today ?? localToday(), type: 'expense',
          } });
        } else {
          await api('/api/schedules', { body: {
            name: `Commute ${electric ? 'charging' : 'gas'}: ${to.name}`, amount: result.commute.perWeek.toFixed(2),
            cadence: 'weekly', startDate: summary?.today ?? localToday(), direction: 'outflow', categoryId: cat?.id ?? null, accountId: account.id,
          } });
        }
        await refresh();
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(PREVIEW ? 'Demo only — nothing was added to your spending or bills.' : trip ? 'Added the fuel estimate to your spending.' : 'Added as a weekly cost — it now counts in Safe to spend and Bills.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.');
    } finally { setSaving(false); }
  }

  const trip = result?.trip;
  const commute = result?.commute;
  const budgetLeft = budget ? budget.planMinor - budget.spentMinor : null;
  const thisCostMinor = result ? Math.round((mode === 'One trip' ? result.trip.cost : result.commute.perMonth) * minorFactor) : 0;

  return (
    <Screen section="spending" title="Plan a trip" back>
      {PREVIEW ? <PreviewBadge /> : null}
      <Segmented options={['One trip', 'Commute'] as const} value={mode} onChange={(m) => { setMode(m); setSaved(null); }} />

      <SectionHeader title="Your car" />
      <Card onPress={() => router.push('/vehicle')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg }}>
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="car" size={22} color={a.accent} />
          </View>
          <View style={{ flex: 1 }}>
            {vehicle ? (
              <>
                <Text style={[type.bodyStrong, { color: c.text }]}>{vehicle.custom ? vehicle.model : `${vehicle.year} ${vehicle.make} ${vehicle.model}`}</Text>
                <Text style={[type.footnote, { color: c.textMuted }]} numberOfLines={1}>
                  {vehicle.city.toFixed(1)} city · {vehicle.highway.toFixed(1)} hwy {unit}/100 km{vehicle.detail ? ` · ${vehicle.detail}` : ''}
                </Text>
              </>
            ) : (
              <>
                <Text style={[type.bodyStrong, { color: c.text }]}>Choose your car</Text>
                <Text style={[type.footnote, { color: c.textMuted }]}>EPA catalogue, or enter your own fuel use</Text>
              </>
            )}
          </View>
          <Text style={[type.bodyStrong, { color: a.accent }]}>{vehicle ? 'Change' : 'Choose'}</Text>
        </View>
      </Card>

      <SectionHeader title={mode === 'Commute' ? 'Your commute' : 'Where to?'} />
      <View style={{ gap: space.sm }}>
        <PlaceField label={mode === 'Commute' ? 'Home' : 'From'} value={from} onChange={setFrom} near={to} offerHere />
        <PlaceField label={mode === 'Commute' ? 'Work' : 'To'} value={to} onChange={setTo} near={from} />
      </View>
      {from && to ? <View style={{ marginTop: space.md }}><TripMap from={from} to={to} route={route} color={a.accent} /></View> : null}
      {routing ? <ActivityIndicator style={{ marginTop: space.md }} color={a.accent} /> : null}
      <FormError message={error} />
      {error && from && to && !route && !routing ? <Button label="Retry route" variant="plain" onPress={() => setRouteRetry((n) => n + 1)} /> : null}

      {mode === 'One trip' ? (
        <Card style={{ marginTop: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.lg }}>
            <Text style={[type.body, { color: c.text, flex: 1 }]}>Round trip</Text>
            <Switch value={roundTrip} onValueChange={setRoundTrip} trackColor={{ true: a.accent }} accessibilityLabel="Round trip" />
          </View>
        </Card>
      ) : (
        <View style={{ marginTop: space.md }}>
          <Text style={[type.footnote, { color: c.textMuted, marginBottom: 6 }]}>Days you drive it (there and back)</Text>
          <ChipRow>
            <Chip section="spending" label="Mon–Fri" selected={!custom && days === 5} onPress={() => { setCustom(false); setDays(5); }} />
            <Chip section="spending" label="Every day" selected={!custom && days === 7} onPress={() => { setCustom(false); setDays(7); }} />
            <Chip section="spending" label="Other" selected={custom} onPress={() => setCustom(true)} />
          </ChipRow>
          {custom ? (
            <View style={{ marginTop: space.sm }}>
              <ChipRow>
                {([1, 2, 3, 4, 5, 6, 7] as Days[]).map((d) => <Chip key={d} section="spending" label={`${d} day${d === 1 ? '' : 's'}`} selected={days === d} onPress={() => setDays(d)} />)}
              </ChipRow>
            </View>
          ) : null}
        </View>
      )}

      <SectionHeader title="Fuel" />
      <Card>
        <NumberRow label={electric ? 'Electricity price' : 'Gas price'} suffix={electric ? '/kWh' : '/L'} prefix={currency} value={price} placeholder={currency === 'CAD' ? defaultPrice(vehicle).toFixed(2) : 'Enter price'}
          onChange={(v) => { setPrice(v); remember({ price: v }); }} />
        {!electric ? (
          <NumberRow label="Tank size" suffix="L" value={tank} placeholder={String(typicalTank(vehicle?.vehicleClass))} onChange={(v) => { setTank(v); remember({ tank: v }); }} />
        ) : null}
        <NumberRow label="Your real use (optional)" hint="From your dashboard — the most accurate figure" suffix={`${unit}/100 km`} value={own}
          placeholder={vehicle ? ((vehicle.city + vehicle.highway) / 2).toFixed(1) : '—'} onChange={(v) => { setOwn(v); remember({ own: v }); }} last />
      </Card>
      <FormError message={inputError} />
      <Text style={[type.footnote, { color: c.textMuted, marginTop: space.sm }]}>Prices in {currency}. {price.trim() ? 'Using your entered price.' : 'The starting price is an illustrative Canadian estimate, not a live local price.'} Fuel or charging only; tolls, parking and wear are extra. {vehicle?.detail.includes('Plug-in Hybrid') ? 'Plug-in hybrid ratings estimate gasoline use; charging is extra.' : ''}</Text>

      {!vehicle && from && to ? <Text style={[type.subhead, { color: c.textMuted, marginTop: space.lg }]}>Choose your car above to see the cost.</Text> : null}

      {trip && commute && route ? (
        <>
          <SectionHeader title="The cost" />
          <Card>
            <View style={{ paddingVertical: space.lg }}>
              {mode === 'One trip' ? (
                <>
                  <Text style={[type.subhead, { color: c.textMuted }]}>{roundTrip ? 'There and back' : 'One way'}</Text>
                  <Text style={[type.hero, { color: c.text }]}>{formatMoney(Math.round(trip.cost * minorFactor))}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginTop: space.md }}>
                    <Stat label="Distance" value={`${Math.round(trip.distanceKm).toLocaleString()} km`} />
                    <Stat label="Driving" value={hours(route.durationMin * (roundTrip ? 2 : 1))} />
                    <Stat label={electric ? 'Energy' : 'Fuel'} value={`${trip.amount.toFixed(1)} ${unit}`} />
                    {trip.refills !== null ? <Stat label="Fill-ups on the way" value={trip.refills === 0 ? 'None' : String(trip.refills)} /> : null}
                  </View>
                  {trip.tanks !== null ? (
                    <Text style={[type.footnote, { color: c.textMuted, marginTop: space.md, lineHeight: 18 }]}>
                      Uses about {Math.round(trip.tanks * 100)}% of a {tankN} L tank{trip.refills ? `, so plan ${trip.refills === 1 ? 'one stop' : `${trip.refills} stops`} for gas if you leave full` : ' — no stop needed if you leave with a full tank'}.
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={[type.subhead, { color: c.textMuted }]}>Each month</Text>
                  <Text style={[type.hero, { color: c.text }]}>{formatMoney(Math.round(commute.perMonth * minorFactor))}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginTop: space.md }}>
                    <Stat label="Per day" value={formatMoney(Math.round(commute.perDay * minorFactor))} />
                    <Stat label="Per week" value={formatMoney(Math.round(commute.perWeek * minorFactor))} />
                    <Stat label="Per year" value={formatMoney(Math.round(commute.perYear * minorFactor), { cents: false })} />
                    <Stat label="Each way" value={`${Math.round(route.distanceKm)} km`} />
                    <Stat label={`${unit} a week`} value={commute.litresPerWeek.toFixed(0)} />
                  </View>
                </>
              )}
            </View>
          </Card>

          {budgetLeft !== null ? (
            <Text style={[type.subhead, { color: thisCostMinor > budgetLeft ? c.negative : c.textMuted, marginTop: space.md, lineHeight: 21 }]}>
              {thisCostMinor > budgetLeft
                ? `That’s more than the ${formatMoney(Math.max(0, budgetLeft), { cents: false })} left in your Transportation budget this month.`
                : `Your Transportation budget has ${formatMoney(budgetLeft, { cents: false })} left this month — ${mode === 'One trip' ? 'this trip' : 'a month of this commute'} would use ${Math.round((thisCostMinor / Math.max(1, budgetLeft)) * 100)}% of it.`}
            </Text>
          ) : null}

          <Text style={[type.footnote, { color: c.textSubtle, marginTop: space.md, lineHeight: 18 }]}>
            {ownN || vehicle?.custom ? 'Using your own fuel figure. ' : `Based on the EPA rating for this car and an estimated mix of city (${Math.round((1 - trip.highwayShare) * 100)}%) and highway (${Math.round(trip.highwayShare * 100)}%) driving. `}
            Speed, weather, traffic and load change real use{ownN ? '.' : ' — add your own figure above for the closest number.'}
          </Text>

          <View style={{ marginTop: space.xl }}>
            {saved ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: a.soft, borderRadius: radius.card, padding: space.lg }}>
                <Text style={[type.subhead, { color: c.text, flex: 1 }]}>✓ {saved}</Text>
              </View>
            ) : (
              <Button accent={a.accent} loading={saving} disabled={thisCostMinor <= 0}
                label={mode === 'One trip' ? `Add ${formatMoney(Math.round(trip.cost * minorFactor))} to my spending` : `Add ${formatMoney(Math.round(commute.perWeek * minorFactor))} a week to my bills`}
                onPress={() => void addToSpending()} />
            )}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function hours(min: number) {
  const rounded = Math.round(min);
  const h = Math.floor(rounded / 60), m = rounded % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

function Stat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ minWidth: 92 }}>
      <Text style={[type.caption, { color: c.textMuted }]}>{label}</Text>
      <Text style={[type.headline, { color: c.text, marginTop: 2 }]}>{value}</Text>
    </View>
  );
}

function NumberRow({ label, hint, prefix, suffix, value, placeholder, onChange, last }: { label: string; hint?: string; prefix?: string; suffix: string; value: string; placeholder: string; onChange: (v: string) => void; last?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: c.border }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: c.text }]}>{label}</Text>
        {hint ? <Text style={[type.footnote, { color: c.textMuted }]}>{hint}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', width: 150, height: 42, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, backgroundColor: c.bg }}>
        {prefix ? <Text style={{ fontFamily: font.medium, color: c.textMuted }}>{prefix}</Text> : null}
        <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.textSubtle} keyboardType="decimal-pad"
          style={{ flex: 1, minWidth: 40, textAlign: 'right', fontFamily: font.medium, fontSize: 16, color: c.text }} />
        <Text style={[type.footnote, { color: c.textMuted, marginLeft: 4 }]}>{suffix}</Text>
      </View>
    </View>
  );
}

/** A place box: tap to search; "From" can also use where you are now. */
function PlaceField({ label, value, onChange, near, offerHere }: { label: string; value: Place | null; onChange: (p: Place | null) => void; near: Place | null; offerHere?: boolean }) {
  const c = useColors();
  const a = c.section.spending;
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    setResults([]); setNote(null); setSearching(false);
    if (!editing || q.trim().length < 2) return;
    setSearching(true);
    const t = setTimeout(() => {
      searchPlaces(q.trim(), near).then((r) => { if (id === seq.current) { setResults(r); if (!r.length) setNote('No places found. Try a nearby city or a fuller address.'); } }).catch(() => { if (id === seq.current) setNote('Search isn’t working right now. Try again.'); }).finally(() => { if (id === seq.current) setSearching(false); });
    }, 300);
    return () => { clearTimeout(t); seq.current++; };
  }, [q, editing, near?.lat, near?.lon]);

  async function useHere() {
    setBusy(true); setNote(null);
    try {
      if (PREVIEW) { onChange(await nameHere(43.6532, -79.3832)); setEditing(false); return; }
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { setNote('Allow location in Settings, or search for a place instead.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      onChange(await nameHere(pos.coords.latitude, pos.coords.longitude));
      setEditing(false);
    } catch { setNote('Couldn’t find where you are. Search instead.'); }
    finally { setBusy(false); }
  }

  if (!editing) {
    return (
      <Card onPress={() => { setEditing(true); setQ(''); }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg }}>
          <Text style={[type.caption, { color: c.textMuted, width: 42 }]}>{label.toUpperCase()}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: value ? c.text : c.textSubtle }]} numberOfLines={1}>{value?.name ?? 'Search for a place'}</Text>
            {value?.address ? <Text style={[type.footnote, { color: c.textMuted }]} numberOfLines={1}>{value.address}</Text> : null}
          </View>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, height: 52, borderBottomWidth: 0.5, borderBottomColor: c.border }}>
        <Text style={[type.caption, { color: c.textMuted, width: 42 }]}>{label.toUpperCase()}</Text>
        <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Address, place or city" placeholderTextColor={c.textSubtle} accessibilityLabel={`${label} place`}
          style={{ flex: 1, fontFamily: font.regular, fontSize: 16, color: c.text }} />
        <Pressable onPress={() => setEditing(false)} hitSlop={10}><Text style={[type.subhead, { color: a.accent }]}>Cancel</Text></Pressable>
      </View>
      {offerHere ? (
        <Pressable disabled={busy} accessibilityRole="button" onPress={() => void useHere()} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg, borderBottomWidth: results.length ? 0.5 : 0, borderBottomColor: c.border }}>
          <Icon name="location" size={18} color={a.accent} />
          <Text style={[type.bodyStrong, { color: a.accent }]}>{busy ? 'Finding you…' : 'Use my current location'}</Text>
        </Pressable>
      ) : null}
      {searching ? <ActivityIndicator accessibilityLabel="Searching places" color={a.accent} style={{ padding: space.md }} /> : null}
      {results.map((p, i) => (
        <Pressable key={`${p.lat},${p.lon},${i}`} onPress={() => { onChange(p); setEditing(false); void Haptics.selectionAsync(); }}
          style={({ pressed }) => ({ padding: space.lg, paddingVertical: 12, borderBottomWidth: i < results.length - 1 ? 0.5 : 0, borderBottomColor: c.border, opacity: pressed ? 0.5 : 1 })}>
          <Text style={[type.body, { color: c.text }]} numberOfLines={1}>{p.name}</Text>
          {p.address ? <Text style={[type.footnote, { color: c.textMuted }]} numberOfLines={1}>{p.address}</Text> : null}
        </Pressable>
      ))}
      {note ? <Text style={[type.footnote, { color: c.negative, padding: space.lg }]}>{note}</Text> : null}
    </Card>
  );
}
