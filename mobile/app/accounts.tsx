import { useCallback, useEffect, useState } from 'react';
import { connectBank, disconnectBank, listConnections, syncBanks, type Connection } from '@/lib/bank';
import { Alert, Platform, Text, View } from 'react-native';
import { Button, Field, FormError, toMinor } from '@/components/form';
import { Card, EmptyCard, Loading, Row, Screen, SectionHeader, formatMoney } from '@/components/ui';
import { previewAccounts } from '@/data/preview';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { space, type, useColors } from '@/theme/tokens';

interface Account {
  id: string; name: string; type: string; currency: string;
  balanceMinor: number; balanceFormatted: string; normalBalance: 'debit' | 'credit';
}

/** Your accounts, and the one number that matters most: what's in the everyday one now. */
const KIND: Record<string, string> = { chequing: 'Everyday', checking: 'Everyday', savings: 'Savings', credit: 'Credit card', credit_card: 'Credit card', investment: 'Investment', cash: 'Cash' };

export default function Accounts() {
  const c = useColors();
  const { refresh } = useSummary();
  const [accounts, setAccounts] = useState<Account[] | null>(PREVIEW ? previewAccounts : null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [banks, setBanks] = useState<{ available: boolean; connections: Connection[] } | null>(PREVIEW ? { available: true, connections: [] } : null);
  const [bankBusy, setBankBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (PREVIEW) return;
    api<{ accounts: Account[] }>('/api/mobile/balance').then((r) => setAccounts(r.accounts)).catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t load your accounts.'));
    listConnections().then(setBanks).catch(() => setBanks({ available: false, connections: [] }));
  }, []);
  useEffect(load, [load]);

  async function connect() {
    if (PREVIEW) { setNote('In your own account this opens your bank’s secure sign-in.'); return; }
    setError(null); setNote(null);
    try {
      const bank = await connectBank(setBankBusy);
      setBankBusy(null);
      if (bank) { setNote(`${bank} is connected. Your transactions are coming in.`); await refresh(); load(); }
      else setNote('Connection wasn’t finished. You can try again any time.');
    } catch (e) { setBankBusy(null); setError(e instanceof Error ? e.message : 'Couldn’t connect your bank.'); }
  }
  async function syncNow() {
    if (bankBusy) return;
    setError(null); setNote(null);
    if (PREVIEW) { setNote('Demo banks use sample data. Nothing was sent to a bank.'); return; }
    setBankBusy('Syncing…');
    try {
      const result = await syncBanks();
      await refresh(); load();
      const failed = result.synced.filter((b) => !b.ok).length;
      if (failed) setError(`${failed === 1 ? 'One bank couldn’t sync' : `${failed} banks couldn’t sync`}. Your last saved balances are still shown. Try again or reconnect the bank.`);
      else setNote(result.synced.length ? 'Up to date.' : 'No banks were synced.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Sync failed.'); }
    finally { setBankBusy(null); }
  }
  async function signInAgain(b: Connection) {
    setError(null); setNote(null);
    try {
      const fixed = await connectBank(setBankBusy, b.id);
      setBankBusy(null);
      if (fixed) { setNote(`${b.institution ?? 'Your bank'} is working again.`); await refresh(); load(); }
      else setNote('Signing in wasn’t finished. You can try again any time.');
    } catch (e) { setBankBusy(null); setError(e instanceof Error ? e.message : 'Couldn’t reconnect your bank.'); }
  }
  /** Tapping a bank: sign in again if it needs it, otherwise offer to disconnect (and ask first). */
  function manage(b: Connection) {
    if (bankBusy) return;
    const name = b.institution ?? 'this bank';
    const body = 'Pockit stops updating it. The transactions already here are kept.';
    if (Platform.OS === 'web') {
      if (b.status === 'reconnect' && globalThis.confirm?.(`Sign in to ${name} again?`)) { void signInAgain(b); return; }
      if (globalThis.confirm?.(`Disconnect ${name}? ${body}`)) void disconnect(b.id);
      return;
    }
    Alert.alert(b.status === 'reconnect' ? `${name} needs you to sign in again` : name, b.status === 'reconnect' ? 'Your bank asked for your login again. Nothing is lost while it waits.' : undefined, [
      ...(b.status === 'reconnect' ? [{ text: 'Sign in again', onPress: () => void signInAgain(b) }] : []),
      { text: 'Disconnect', style: 'destructive' as const, onPress: () => Alert.alert(`Disconnect ${name}?`, body, [
        { text: 'Cancel', style: 'cancel' }, { text: 'Disconnect', style: 'destructive', onPress: () => void disconnect(b.id) },
      ]) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }
  async function disconnect(id: string) {
    setBankBusy('Disconnecting…');
    try { await disconnectBank(id); load(); setNote('Disconnected. Your past transactions are kept.'); } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t disconnect.'); }
    finally { setBankBusy(null); }
  }

  async function save() {
    setBusy(true); setError(null); setNote(null);
    try {
      if (!PREVIEW) { await api('/api/mobile/balance', { body: { amount: toMinor(amount)! / 100 } }); await refresh(); load(); }
      setNote(`Saved. Safe to spend now starts from ${formatMoney(toMinor(amount)!, { cents: false })}.`); setAmount('');
    } catch (e) { setError(e instanceof Error ? e.message : 'That could not be saved.'); }
    finally { setBusy(false); }
  }

  const bankLinked = Boolean(banks?.connections.length);
  return (
    <Screen section="more" title="Accounts" back>
      {!accounts ? <Loading error={error} /> : (
        <>
          {accounts.length === 0 ? <EmptyCard title="No accounts yet" body="Add your everyday balance below, or connect a bank, to start tracking your money." /> : <Card>
            {accounts.map((acc, i) => (
              <Row key={acc.id} icon="building.columns" title={acc.name}
                detail={`${KIND[acc.type] ?? acc.type} · ${acc.currency}${acc.normalBalance === 'credit' ? ' · owed' : ''}`}
                value={acc.balanceFormatted} valueColor={acc.normalBalance === 'credit' || acc.balanceMinor < 0 ? c.negative : c.text}
                last={i === accounts.length - 1} />
            ))}
          </Card>}
          <SectionHeader title="Connected banks" action={banks?.connections.length ? 'Sync now' : undefined} onAction={() => void syncNow()} />
          {banks?.connections.length ? (
            <Card>
              {banks.connections.map((b, i) => (
                <Row key={b.id} icon="building.columns" title={b.institution ?? 'Bank'}
                  detail={b.status === 'active' ? (b.lastSyncedAt ? `Synced ${new Date(b.lastSyncedAt).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Connected') : b.status === 'reconnect' ? 'Needs you to sign in again' : 'Couldn’t sync — try Sync now'}
                  value={b.status === 'reconnect' ? 'Sign in' : 'Manage'} valueColor={b.status === 'reconnect' ? c.negative : c.textMuted} last={i === banks.connections.length - 1} onPress={() => manage(b)} />
              ))}
            </Card>
          ) : (
            <Text style={[type.footnote, { color: c.textMuted, lineHeight: 20, marginBottom: space.md }]}>
              {banks && !banks.available ? 'Bank connection is coming soon. For now, add purchases or import a statement.' : 'Connect your bank and your transactions and balances add themselves. You sign in on your bank’s secure page through Plaid — Pockit never sees your password, and can’t move money.'}
            </Text>
          )}
          {banks?.available ? (
            <View style={{ marginTop: space.md }}>
              <Button label={bankBusy ?? (banks.connections.length ? 'Connect another bank' : 'Connect a bank')} loading={Boolean(bankBusy)} onPress={() => void connect()} />
            </View>
          ) : null}
          {bankLinked ? (
            <View style={{ marginTop: space.md, gap: space.sm }}>
              <FormError message={error} />
              {note ? <Text style={[type.footnote, { color: c.positive }]}>{note}</Text> : null}
              <Text style={[type.footnote, { color: c.textMuted, lineHeight: 20 }]}>Balances come from your bank and update every day, or when you tap Sync now.</Text>
            </View>
          ) : (
            <>
              {/* Typing a balance only makes sense without a bank: the next sync would overwrite it. */}
              <SectionHeader title="Everyday balance" />
              <Text style={[type.footnote, { color: c.textMuted, lineHeight: 20, marginBottom: space.md }]}>
                What’s in your chequing account right now. Pockit counts from here, so update it if the numbers ever drift from your bank.
              </Text>
              <View style={{ gap: space.md }}>
                <Field label="Balance right now" prefix="$" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="1,500" />
                <FormError message={error} />
                {note ? <Text style={[type.footnote, { color: c.positive }]}>{note}</Text> : null}
                <Button label="Update balance" loading={busy} disabled={toMinor(amount) === null} onPress={() => void save()} />
              </View>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
