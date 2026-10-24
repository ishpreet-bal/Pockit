import { useEffect, useState } from 'react';
import { Linking, Platform, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Card, Row, Screen, SectionHeader, Segmented } from '@/components/ui';
import { router } from 'expo-router';
import { API_URL } from '@/lib/api';
import { biometricsAvailable, confirmWithBiometrics } from '@/lib/lock';
import { getPref, saveAppearance, setPref } from '@/lib/prefs';
import { askForNotifications, checkBudgetAlerts, syncBillReminders, syncWeeklySummary } from '@/lib/reminders';
import { useSummary } from '@/lib/summary';
import { useSession } from '@/lib/session';
import { setAppearance, space, type, useAppearance, useColors, type Appearance } from '@/theme/tokens';

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
  const { me } = useSession();
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
      <SectionHeader title="Appearance" />
      <AppearancePicker />
      <SectionHeader title="Security" />
      <Card>
        <Toggle title={`Lock with ${bio.label}`} detail={bio.ok ? `Ask for ${bio.label} when Pockit opens, and after a minute away.` : `${bio.label} isn’t set up on this phone.`}
          value={faceId} onChange={changeFaceId} disabled={!bio.ok} last />
      </Card>
      <SectionHeader title="Notifications" />
      <Card>
        <Toggle title="Bill reminders" detail="A heads-up at 9am the day before each bill is due." value={reminders} onChange={changeReminders} disabled={Platform.OS === 'web'} />
        <Toggle title="Budget alerts" detail="When a category reaches 80% of its budget, and if it goes over." value={alerts} onChange={(v) => void changeNotify('budgetAlerts', v)} disabled={Platform.OS === 'web'} />
        <Toggle title="Weekly summary" detail="Sundays at 6pm: what went out this week and what’s left." value={weekly} onChange={(v) => void changeNotify('weeklySummary', v)} disabled={Platform.OS === 'web'} last />
      </Card>
      {note ? <Text style={[type.footnote, { color: c.textMuted, marginTop: space.sm, marginLeft: 4 }]} onPress={note.includes('iPhone Settings') ? () => Linking.openSettings() : undefined}>{note}</Text> : null}
      <SectionHeader title="Account" />
      <Card style={{ paddingVertical: space.lg, gap: 4 }}>
        <Text style={[type.body, { color: c.text }]}>{me?.name ?? 'You'}</Text>
        <Text style={[type.footnote, { color: c.textMuted }]}>{me?.email}</Text>
      </Card>
      <Card style={{ marginTop: space.md }}>
        <Row icon="" title="Privacy policy" value="›" valueColor={c.textSubtle} onPress={() => void Linking.openURL(`${API_URL}/privacy`)} />
        <Row icon="" title="Terms of use" value="›" valueColor={c.textSubtle} onPress={() => void Linking.openURL(`${API_URL}/terms`)} />
        <Row icon="" title="Delete account" valueColor={c.negative} value="›" last onPress={() => router.push('/delete-account')} />
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
