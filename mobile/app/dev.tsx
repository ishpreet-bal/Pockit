import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Card, Row, Screen, SectionHeader } from '@/components/ui';
import { api, API_URL } from '@/lib/api';
import { purchasesAvailable } from '@/lib/purchases';
import { sendTestReminder } from '@/lib/reminders';
import { PREVIEW, useSession } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { space, type, useColors } from '@/theme/tokens';

/**
 * Developer mode, for the people who run Pockit (ADMIN_EMAILS on the server).
 *
 * Everything here uses the same endpoints a normal account would, so it can't do
 * anything a person couldn't already do to their own account — it just puts the
 * testing shortcuts in one place.
 */
export default function Dev() {
  const c = useColors();
  const { me, refresh } = useSession();
  const { refresh: refreshSummary } = useSummary();
  const [note, setNote] = useState<string | null>(null);

  if (!me?.admin) {
    return <Screen section="more" title="Developer" back><Text style={[type.body, { color: c.textMuted }]}>Only Pockit admins can see this.</Text></Screen>;
  }

  const run = (label: string, fn: () => Promise<string | void>) => async () => {
    setNote(`${label}…`);
    try { setNote((await fn()) ?? `${label} — done.`); }
    catch (e) { setNote(`${label} failed: ${e instanceof Error ? e.message : 'unknown error'}`); }
  };

  const info: [string, string][] = [
    ['Signed in as', me.email],
    ['Plan', 'Admin — Plus, unlimited, never charged'],
    ['Pockit Plus launched', me.plusEnabled ? 'Yes (PLUS_ENABLED=true)' : 'No — hidden from everyone else'],
    ['Free Pock questions', me.pockLeftThisMonth === null || me.pockLeftThisMonth === undefined ? 'Unlimited' : String(me.pockLeftThisMonth)],
    ['Server', API_URL],
    ['App Store purchases', purchasesAvailable() ? 'Connected' : 'Not configured in this build'],
    ['App version', `${Constants.expoConfig?.version ?? '?'} · ${Platform.OS}${PREVIEW ? ' · preview data' : ''}`],
  ];

  return (
    <Screen section="more" title="Developer" back>
      <Text style={[type.footnote, { color: c.textMuted, marginBottom: space.md }]}>Only you can see this screen.</Text>
      <Card style={{ paddingVertical: space.lg, gap: 10 }}>
        {info.map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
            <Text style={[type.footnote, { color: c.textMuted }]}>{k}</Text>
            <Text style={[type.footnote, { color: c.text, flexShrink: 1, textAlign: 'right' }]} selectable>{v}</Text>
          </View>
        ))}
      </Card>

      <SectionHeader title="Look at any screen" />
      <Card>
        <Row icon="star" title="Pockit Plus screen" detail="What people will see when Plus launches" value="›" onPress={() => router.push('/plus')} />
        <Row icon="house.fill" title="Welcome screen" detail="The first thing a new person sees" value="›" onPress={() => router.push('/welcome')} />
        <Row icon="bubble.left" title="Ask Pock" value="›" onPress={() => router.push('/pock')} last />
      </Card>

      <SectionHeader title="Test tools" />
      <Card>
        <Row icon="calendar" title="Send a test bill reminder" detail="Arrives in 5 seconds — lock your phone to see it" onPress={run('Test reminder', async () => ((await sendTestReminder()) ? 'Reminder on its way — arrives in 5 seconds.' : 'Notifications aren’t allowed (or this is the web preview).'))} />
        <Row icon="square.and.arrow.down" title="Add sample data" detail="Fills this account with a realistic month of spending, bills and goals" onPress={run('Add sample data', async () => { await api('/api/demo/seed', { method: 'POST' }); await refreshSummary(); return 'Sample data added. Pull down on any tab to see it.'; })} />
        <Row icon="repeat" title="Run setup again" detail="Go through the first-run questions as a new person would" onPress={run('Restart setup', async () => { await api('/api/onboarding/state', { method: 'PATCH', body: { stage: 'not_started' } }); await refresh(); router.replace('/setup'); })} />
        <Row icon="arrow.left.arrow.right" title="Reload everything" detail="Fetch your account and numbers fresh from the server" onPress={run('Reload', async () => { await Promise.all([refresh(), refreshSummary()]); })} last />
      </Card>
      {note ? <Text style={[type.footnote, { color: c.textMuted, marginTop: space.md }]}>{note}</Text> : null}
    </Screen>
  );
}
