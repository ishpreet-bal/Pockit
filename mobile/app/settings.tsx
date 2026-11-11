import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Switch, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { Card, Row, Screen, SectionHeader, Segmented } from '@/components/ui';
import { router } from 'expo-router';
import { api, API_URL } from '@/lib/api';
import { biometricsAvailable, confirmWithBiometrics } from '@/lib/lock';
import { getPref, saveAppearance, setPref, setText } from '@/lib/prefs';
import { askForNotifications, checkBudgetAlerts, syncBillReminders, syncWeeklySummary } from '@/lib/reminders';
import { useSummary } from '@/lib/summary';
import { useSession } from '@/lib/session';
import { hsl, setAccentHue, setAppearance, space, type, useAccentHue, useAppearance, useColors, useIsDark, type Appearance } from '@/theme/tokens';
import { GuestBanner } from '@/components/GuestBanner';

function Toggle({ title, detail, value, onChange, disabled, last }: { title: string; detail: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; last?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: c.border, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: c.text }]}>{title}</Text>
        <Text style={[type.footnote, { color: c.textMuted, marginTop: 2, lineHeight: 18 }]}>{detail}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: c.section.home.accent }} accessibilityLabel={title} />
    </View>
  );
}

/** The few settings that belong on the phone: Face ID, reminders, and who you're signed in as. */
export default function Settings() {
  const c = useColors();
  const { data } = useSummary();
  const { me, refresh: refreshMe } = useSession();
  const [faceId, setFaceId] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [weekly, setWeekly] = useState(false);
  const [bio, setBio] = useState({ ok: false, label: 'Face ID' });
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setFaceId(await getPref('faceId'));
      setReminders(await getPref('billReminders'));
      setAlerts(await getPref('budgetAlerts'));
      setWeekly(await getPref('weeklySummary'));
      setBio(await biometricsAvailable());
    })();
  }, []);

  async function changeFaceId(on: boolean) {
    // Prove it works before relying on it, so nobody locks themselves out.
    if (on && !(await confirmWithBiometrics(`Turn on ${bio.label} for Pockit`))) return;
    await setPref('faceId', on); setFaceId(on);
  }

  async function changeNotify(key: 'budgetAlerts' | 'weeklySummary', on: boolean) {
    setNote(null);
    if (on && !(await askForNotifications())) {
      setNote('Notifications are off for Pockit. Turn them on in iPhone Settings → Pockit → Notifications.');
      return;
    }
    await setPref(key, on);
    if (key === 'budgetAlerts') { setAlerts(on); if (on) void checkBudgetAlerts(data); }
    else { setWeekly(on); void syncWeeklySummary(on); }
  }

  async function setAi(allow: boolean) {
    try { await api('/api/account/ai-consent', { body: { allow } }); await refreshMe(); } catch { /* the switch stays where it was */ }
  }

  async function changeReminders(on: boolean) {
    setNote(null);
    if (on && !(await askForNotifications())) {
      setNote('Notifications are off for Pockit. Turn them on in iPhone Settings → Pockit → Notifications.');
      return;
    }
    await setPref('billReminders', on); setReminders(on);
    const n = await syncBillReminders(data);
    if (on) setNote(n ? `${n} reminder${n === 1 ? '' : 's'} set for your next bills.` : 'You’ll get a reminder the day before each bill.');
  }

  return (
    <Screen section="more" title="Settings" back>
      <GuestBanner />
      <SectionHeader title="Appearance" />
      <AppearancePicker />
      <ColourTryout />
      <SectionHeader title="Security" />
      <Card>
        <Toggle title={`Lock with ${bio.label}`} detail={bio.ok ? `Ask for ${bio.label} when Pockit opens, and after a minute away.` : `${bio.label} isn’t set up on this phone.`}
          value={faceId} onChange={changeFaceId} disabled={!bio.ok} last />
      </Card>
      {me?.aiProvider ? (
        <>
          <SectionHeader title="Pock and AI" />
          <Card>
            <Toggle title={`Use ${me.aiProvider}`}
              detail={me.aiConsent
                ? `Your questions, the figures needed to answer them, and receipts you scan go to ${me.aiProvider} to be answered or read. Not used to train its models.`
                : `Off: Pock and receipt scanning wait for your OK. Nothing is sent to ${me.aiProvider}.`}
              value={Boolean(me.aiConsent)} onChange={(on) => void setAi(on)} last />
          </Card>
        </>
      ) : null}
      <SectionHeader title="Notifications" />
      <Card>
        <Toggle title="Bill reminders" detail="A heads-up at 9am the day before each bill is due." value={reminders} onChange={changeReminders} disabled={Platform.OS === 'web'} />
        <Toggle title="Budget alerts" detail="When a category reaches 80% of its budget, and if it goes over." value={alerts} onChange={(v) => void changeNotify('budgetAlerts', v)} disabled={Platform.OS === 'web'} />
        <Toggle title="Weekly summary" detail="Sundays at 6pm: what went out this week and what’s left." value={weekly} onChange={(v) => void changeNotify('weeklySummary', v)} disabled={Platform.OS === 'web'} last />
      </Card>
      {note ? <Text style={[type.footnote, { color: c.textMuted, marginTop: space.sm, marginLeft: 4 }]} onPress={note.includes('iPhone Settings') ? () => Linking.openSettings() : undefined}>{note}</Text> : null}
      <SectionHeader title="Account" />
      <Card style={{ paddingVertical: space.lg, gap: 4 }}>
        <Text style={[type.body, { color: c.text }]}>{me?.guest ? 'Looking around' : me?.name ?? 'You'}</Text>
        <Text style={[type.footnote, { color: c.textMuted }]}>{me?.guest ? 'Sample money on a temporary account' : me?.email}</Text>
      </Card>
      <Card style={{ marginTop: space.md }}>
        <Row icon="" title="Privacy policy" value="›" valueColor={c.textSubtle} onPress={() => void Linking.openURL(`${API_URL}/privacy`)} />
        <Row icon="" title="Terms of use" value="›" valueColor={c.textSubtle} onPress={() => void Linking.openURL(`${API_URL}/terms`)} />
        {me?.guest ? null : <Row icon="" title="Delete account" valueColor={c.negative} value="›" last onPress={() => router.push('/delete-account')} />}
      </Card>
      <Text style={[type.caption, { color: c.textSubtle, textAlign: 'center', marginTop: space.xl }]}>Pockit {Constants.expoConfig?.version ?? ''}</Text>
    </Screen>
  );
}

const LOOKS: { value: Appearance; label: string }[] = [
  { value: 'system', label: 'Match phone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function AppearancePicker() {
  const current = useAppearance();
  return (
    <Segmented
      options={LOOKS.map((l) => l.label)}
      value={LOOKS.find((l) => l.value === current)!.label}
      onChange={(label) => { const v = LOOKS.find((l) => l.label === label)!.value; setAppearance(v); void saveAppearance(v); }}
    />
  );
}

/**
 * Accent colour: Pockit orange unless the person picks another. The first swatch is
 * always orange, so getting back is one tap; the choice is kept on this device.
 */
function ColourTryout() {
  const c = useColors();
  const hue = useAccentHue();
  const dark = useIsDark();
  const hues = Array.from({ length: 22 }, (_, i) => 50 + i * 15);
  const pick = (h: number | null) => { void Haptics.selectionAsync(); setAccentHue(h); void setText('accentHue', h === null ? null : String(h)); };
  const dot = <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' }} />;
  return (
    <View style={{ marginTop: space.lg, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[type.subhead, { color: c.text, flex: 1 }]}>Accent colour</Text>
        <Text style={[type.footnote, { color: c.textMuted }]}>{hue === null ? 'Pockit orange' : 'Your colour'}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable onPress={() => pick(null)} accessibilityRole="button" accessibilityLabel="Pockit orange"
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: dark ? '#da5100' : '#c04600', alignItems: 'center', justifyContent: 'center', borderWidth: hue === null ? 2 : 0, borderColor: c.text }}>
          {hue === null ? dot : null}
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row', height: 40, borderRadius: 20, overflow: 'hidden' }} accessibilityLabel="Colour wheel">
          {hues.map((h) => (
            <Pressable key={h} onPress={() => pick(h)} accessibilityRole="button" accessibilityLabel={`Hue ${h}`}
              style={{ flex: 1, backgroundColor: dark ? hsl(h, 85, 62) : hsl(h, 78, 40), alignItems: 'center', justifyContent: 'center' }}>
              {hue === h ? dot : null}
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={[type.footnote, { color: c.textMuted }]}>Make Pockit yours. Tap the orange circle to go back to the original.</Text>
    </View>
  );
}
