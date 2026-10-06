import { useCallback, useEffect, useState } from 'react';
import { connectBank, disconnectBank, listConnections, syncBanks, type Connection } from '@/lib/bank';
import { Text, View } from 'react-native';
import { Button, Field, FormError, toMinor } from '@/components/form';
import { Card, Loading, Row, Screen, SectionHeader, formatMoney } from '@/components/ui';
import { previewTransactions } from '@/data/preview';
import { api } from '@/lib/api';
import { PREVIEW } from '@/lib/session';
import { useSummary } from '@/lib/summary';
import { space, type, useColors } from '@/theme/tokens';
import type { TxnPage } from './transactions';

/** Your accounts, and the one number that matters most: what's in the everyday one now. */
const KIND: Record<string, string> = { chequing: 'Everyday', checking: 'Everyday', savings: 'Savings', credit: 'Credit card', credit_card: 'Credit card', investment: 'Investment', cash: 'Cash' };

export default function Accounts() {
  const c = useColors();
  const { refresh } = useSummary();
  const [accounts, setAccounts] = useState<TxnPage['accounts'] | null>(PREVIEW ? previewTransactions.accounts : null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [banks, setBanks] = useState<{ available: boolean; connections: Connection[] } | null>(PREVIEW ? { available: true, connections: [] } : null);
  const [bankBusy, setBankBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (PREVIEW) return;
    api<TxnPage>('/api/mobile/transactions').then((r) => setAccounts(r.accounts)).catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t load your accounts.'));
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
    setBankBusy('Syncing…');
    try { await syncBanks(); await refresh(); load(); setNote('Up to date.'); } catch (e) { setError(e instanceof Error ? e.message : 'Sync failed.'); }
    finally { setBankBusy(null); }
  }
  async function disconnect(id: string) {
    setBankBusy('Disconnecting…');
    try { await disconnectBank(id); load(); setNote('Disconnected. Your past transactions are kept.'); } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t disconnect.'); }
    finally { setBankBusy(null); }
  }

  async function save() {
    setBusy(true); setError(null); setNote(null);
    try {
      if (!PREVIEW) { await api('/api/mobile/balance', { body: { amount: toMinor(amount)! / 100 } }); await refresh(); }
      setNote(`Saved. Safe to spend now starts from ${formatMoney(toMinor(amount)!, { cents: false })}.`); setAmount('');
    } catch (e) { setError(e instanceof Error ? e.message : 'That could not be saved.'); }
    finally { setBusy(false); }
  }

  return (
    <Screen section="more" title="Accounts" back>
      {!accounts ? <Loading error={error} /> : (
        <>
          <Card>
            {accounts.map((acc, i) => (
              <Row key={acc.id} icon="building.columns" title={acc.name} detail={KIND[acc.type] ?? acc.type} last={i === accounts.length - 1} />
            ))}
          </Card>
          <SectionHeader title="Connected banks" action={banks?.connections.length ? 'Sync now' : undefined} onAction={() => void syncNow()} />
          {banks?.connections.length ? (
            <Card>
              {banks.connections.map((b, i) => (
                <Row key={b.id} icon="building.columns" title={b.institution ?? 'Bank'}
                  detail={b.status === 'active' ? (b.lastSyncedAt ? `Synced ${new Date(b.lastSyncedAt).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Connected') : b.status === 'reconnect' ? 'Needs you to sign in again' : 'Couldn’t sync — try Sync now'}
                  value="Disconnect" valueColor={c.textMuted} last={i === banks.connections.length - 1} onPress={() => void disconnect(b.id)} />
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
    </Screen>
  );
}
