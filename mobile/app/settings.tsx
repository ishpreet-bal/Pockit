import { useEffect, useState } from 'react';
import { Linking, Platform, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Card, Screen, SectionHeader, Segmented } from '@/components/ui';
import { biometricsAvailable, confirmWithBiometrics } from '@/lib/lock';
import { getPref, saveAppearance, setPref } from '@/lib/prefs';
import { askForNotifications, syncBillReminders } from '@/lib/reminders';
import { useSummary } from '@/lib/summary';
import { useSession } from '@/lib/session';
import { setAppearance, space, type, useAppearance, useColors, type Appearance } from '@/theme/tokens';

function Toggle({ title, detail, value, onChange, disabled, last }: { title: string; detail: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; last?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: c.border, opacity: disabled ? 0.5 : 1 }}>
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
  const [bio, setBio] = useState({ ok: false, label: 'Face ID' });
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setFaceId(await getPref('faceId'));
      setReminders(await getPref('billReminders'));
      setBio(await biometricsAvailable());
    })();
  }, []);

  async function changeFaceId(on: boolean) {
    // Prove it works before relying on it, so nobody locks themselves out.
    if (on && !(await confirmWithBiometrics(`Turn on ${bio.label} for Pockit`))) return;
    await setPref('faceId', on); setFaceId(on);
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
        <Toggle title="Bill reminders" detail="A heads-up at 9am the day before each bill is due." value={reminders} onChange={changeReminders} disabled={Platform.OS === 'web'} last />
      </Card>
      {note ? <Text style={[type.footnote, { color: c.textMuted, marginTop: space.sm, marginLeft: 4 }]} onPress={note.includes('iPhone Settings') ? () => Linking.openSettings() : undefined}>{note}</Text> : null}
      <SectionHeader title="Account" />
      <Card style={{ padding: space.lg, gap: 4 }}>
        <Text style={[type.body, { color: c.text }]}>{me?.name ?? 'You'}</Text>
        <Text style={[type.footnote, { color: c.textMuted }]}>{me?.email}</Text>
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
