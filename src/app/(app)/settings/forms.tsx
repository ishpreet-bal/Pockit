'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody, Field, Input, Select, Button, Badge, Table, Th, Td } from '@/components/ui/primitives';
import { SUPPORTED_CURRENCIES } from '@/lib/money';

interface Profile {
  displayName: string | null;
  baseCurrency: string;
  timezone: string;
  locale: string;
  fileRetention: string;
  aiEnabled: boolean;
}

interface CategoryRow {
  id: string; name: string; icon: string | null; parent: string | null;
  classification: string; necessity: string;
}

interface RuleRow {
  id: string; pattern: string; matchType: string; source: string;
  timesApplied: number; categoryName: string | null;
}

const TIMEZONES = [
  'America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg',
  'America/Halifax', 'America/St_Johns', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris',
  'Asia/Tokyo', 'Australia/Sydney', 'UTC',
];

const EXPORTS = [
  { dataset: 'transactions', label: 'Transactions', detail: 'Every transaction with both its original and converted amount' },
  { dataset: 'summary', label: 'Monthly summary', detail: 'Income, expenses, net and savings rate by month' },
  { dataset: 'goals', label: 'Goals', detail: 'Targets, progress and dates' },
  { dataset: 'categories', label: 'Categories', detail: 'Your full category tree and its classifications' },
];

export function SettingsForms({
  profile, categories, rules, aiProviderLabel, aiConfigured,
}: {
  profile: Profile;
  categories: CategoryRow[];
  rules: RuleRow[];
  aiProviderLabel: string;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localRules, setLocalRules] = useState(rules);
  const [localCategories, setLocalCategories] = useState(categories);
  const [showAllCategories, setShowAllCategories] = useState(false);

  async function send(body: unknown, successMessage: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Could not save.');
      }
      setSaved(successMessage);
      setTimeout(() => setSaved(null), 2500);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const visibleCategories = showAllCategories ? localCategories : localCategories.slice(0, 12);

  return (
    <>
      {saved ? (
        <p role="status" className="rounded-[var(--radius-control)] bg-[var(--positive-soft)] px-3 py-2 text-sm text-[var(--positive)]">
          {saved}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader title="Profile" />
        <CardBody>
          <form
            className="grid gap-3.5 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void send({
                kind: 'profile',
                displayName: String(fd.get('displayName') ?? '') || null,
                baseCurrency: String(fd.get('baseCurrency') ?? ''),
                timezone: String(fd.get('timezone') ?? ''),
                locale: String(fd.get('locale') ?? ''),
              }, 'Profile saved.');
            }}
          >
            <Field label="Name" htmlFor="displayName">
              <Input id="displayName" name="displayName" defaultValue={profile.displayName ?? ''} placeholder="Your name" />
            </Field>
            <Field label="Base currency" htmlFor="baseCurrency" hint="Original currencies stay on each transaction.">
              <Select id="baseCurrency" name="baseCurrency" defaultValue={profile.baseCurrency}>
                {SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </Select>
            </Field>
            <Field label="Timezone" htmlFor="timezone" hint="Decides where a month starts and ends for you.">
              <Select id="timezone" name="timezone" defaultValue={profile.timezone}>
                {TIMEZONES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </Select>
            </Field>
            <Field label="Date and number format" htmlFor="locale">
              <Select id="locale" name="locale" defaultValue={profile.locale}>
                <option value="en-CA">English (Canada)</option>
                <option value="en-US">English (United States)</option>
                <option value="en-GB">English (United Kingdom)</option>
                <option value="fr-CA">Français (Canada)</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" disabled={busy}>Save profile</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Privacy" description="What happens to the files you upload" />
        <CardBody className="space-y-3.5">
          <Field
            label="Keep uploaded source files?"
            htmlFor="fileRetention"
            hint="Files are private to your workspace and served only through an authenticated route."
          >
            <Select
              id="fileRetention"
              defaultValue={profile.fileRetention}
              onChange={(e) => void send({ kind: 'profile', fileRetention: e.target.value }, 'Retention preference saved.')}
            >
              <option value="keep">Keep the file attached to the transaction</option>
              <option value="delete_after_extract">Delete it once extraction succeeds</option>
              <option value="ask">Ask me each time</option>
            </Select>
          </Field>

          <div className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">AI features</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {aiConfigured
                  ? `Turning this off disables the assistant and image extraction. CSV, Excel and text PDF import keep working — they never use an AI provider.`
                  : 'No AI provider is configured, so only on-device parsing is in use.'}
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <input
                type="checkbox"
                defaultChecked={profile.aiEnabled}
                onChange={(e) => void send({ kind: 'profile', aiEnabled: e.target.checked }, 'AI preference saved.')}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="sr-only">Enable AI features</span>
              {profile.aiEnabled ? 'On' : 'Off'}
            </label>
          </div>
          <p className="text-xs text-[var(--text-subtle)]">Processing provider: {aiProviderLabel}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Export your data"
          description="Exact decimal amounts, both original and converted currency. Nothing is locked in."
        />
        <CardBody>
          <ul className="space-y-2">
            {EXPORTS.map((e) => (
              <li key={e.dataset} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{e.label}</p>
                  <p className="text-xs text-[var(--text-muted)]">{e.detail}</p>
                </div>
                <a
                  href={`/api/export?dataset=${e.dataset}`}
                  className="shrink-0 rounded-[var(--radius-control)] border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)]"
                >
                  Download CSV
                </a>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Category classifications"
          description="These drive fixed-vs-variable budgeting and the essential-spending estimate. They are yours to set."
        />
        <CardBody className="px-0 pb-0">
          <Table>
            <thead>
              <tr><Th>Category</Th><Th>Fixed or variable</Th><Th>Essential or discretionary</Th></tr>
            </thead>
            <tbody>
              {visibleCategories.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--surface-2)]">
                  <Td>
                    {c.parent ? <span className="text-[var(--text-subtle)]">{c.parent} › </span> : null}
                    {c.name}
                  </Td>
                  <Td>
                    <Select
                      className="h-8 text-xs"
                      defaultValue={c.classification}
                      aria-label={`${c.name} classification`}
                      onChange={(e) => {
                        setLocalCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, classification: e.target.value } : x)));
                        void send({ kind: 'category', categoryId: c.id, classification: e.target.value }, `${c.name} updated.`);
                      }}
                    >
                      <option value="variable">Variable</option>
                      <option value="fixed">Fixed</option>
                    </Select>
                  </Td>
                  <Td>
                    <Select
                      className="h-8 text-xs"
                      defaultValue={c.necessity}
                      aria-label={`${c.name} necessity`}
                      onChange={(e) => {
                        setLocalCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, necessity: e.target.value } : x)));
                        void send({ kind: 'category', categoryId: c.id, necessity: e.target.value }, `${c.name} updated.`);
                      }}
                    >
                      <option value="discretionary">Discretionary</option>
                      <option value="essential">Essential</option>
                    </Select>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {localCategories.length > 12 ? (
            <div className="border-t border-[var(--border)] p-3 text-center">
              <Button size="sm" onClick={() => setShowAllCategories((v) => !v)}>
                {showAllCategories ? 'Show fewer' : `Show all ${localCategories.length}`}
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Learned rules"
          description="Every categorisation the system has inferred from your corrections. Delete any of them."
        />
        <CardBody className={localRules.length > 0 ? 'px-0 pb-0' : undefined}>
          {localRules.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No rules yet. When you re-categorise a merchant during an import review, the system records a rule here
              so the next import already knows — and you can see and remove every one.
            </p>
          ) : (
            <Table>
              <thead>
                <tr><Th>When the description matches</Th><Th>Category</Th><Th>Source</Th><Th numeric>Used</Th><Th /></tr>
              </thead>
              <tbody>
                {localRules.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--surface-2)]">
                    <Td><code className="text-xs">{r.matchType} &ldquo;{r.pattern}&rdquo;</code></Td>
                    <Td className="text-[var(--text-muted)]">{r.categoryName ?? '—'}</Td>
                    <Td><Badge tone={r.source === 'learned' ? 'info' : 'neutral'}>{r.source}</Badge></Td>
                    <Td numeric className="text-[var(--text-muted)]">{r.timesApplied}</Td>
                    <Td>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setLocalRules((prev) => prev.filter((x) => x.id !== r.id));
                            void send({ kind: 'deleteRule', ruleId: r.id }, 'Rule removed.');
                          }}
                          className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--negative)] hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}
