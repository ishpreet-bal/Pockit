import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (PREVIEW) return;
    api<TxnPage>('/api/mobile/transactions').then((r) => setAccounts(r.accounts)).catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t load your accounts.'));
  }, []);

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
