'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Card, CardBody, Field, Input, Select, Button } from '@/components/ui/primitives';
import { SUPPORTED_CURRENCIES } from '@/lib/money';
import type { AuthFormState } from '@/lib/auth/actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending} className="w-full">
      {/* The width is preserved while loading so the layout does not jump. */}
      {pending ? <span className="inline-block h-3.5 w-3.5 animate-[pk-spin_0.7s_linear_infinite] rounded-full border-2 border-current border-t-transparent" /> : label}
    </Button>
  );
}

export function AuthForm({
  mode, action,
}: {
  mode: 'sign-in' | 'sign-up';
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction] = useActionState(action, {} as AuthFormState);
  const isSignUp = mode === 'sign-up';

  return (
    <Card>
      <CardBody className="pt-5">
        <h1 className="text-lg font-semibold">{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {isSignUp ? 'Your financial data stays private to your account.' : 'Sign in to continue.'}
        </p>

        <form action={formAction} className="mt-5 flex flex-col gap-3.5">
          {isSignUp ? (
            <Field label="Name" htmlFor="displayName" hint="Optional.">
              <Input id="displayName" name="displayName" autoComplete="name" placeholder="Your name" />
            </Field>
          ) : null}

          <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            error={state.fieldErrors?.password}
            hint={isSignUp ? 'At least 10 characters.' : undefined}
          >
            <Input
              id="password" name="password" type="password" required
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={isSignUp ? 10 : undefined}
            />
          </Field>

          {isSignUp ? (
            <>
              <Field label="What will you track?" htmlFor="useCase">
                <Select id="useCase" name="useCase" defaultValue="personal">
                  <option value="personal">Personal finances</option>
                  <option value="business">Business finances</option>
                  <option value="both">Both — separate workspaces</option>
                </Select>
              </Field>
              <Field label="Base currency" htmlFor="baseCurrency" hint="Original currencies are always preserved on each transaction.">
                <Select id="baseCurrency" name="baseCurrency" defaultValue="CAD">
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </Select>
              </Field>
              <input type="hidden" name="timezone" value="America/Toronto" />
            </>
          ) : null}

          {state.error ? (
            <div role="alert" className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">
              <p>{state.error}</p>
              {state.setupRequired ? (
                <Link href="/setup" className="mt-1 inline-block font-medium underline">
                  See what is missing
                </Link>
              ) : null}
            </div>
          ) : null}

          <SubmitButton label={isSignUp ? 'Create account' : 'Sign in'} />
        </form>

        <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
          {isSignUp ? (
            <>Already have an account? <Link href="/sign-in" className="font-medium text-[var(--accent)] hover:underline">Sign in</Link></>
          ) : (
            <>New here? <Link href="/sign-up" className="font-medium text-[var(--accent)] hover:underline">Create an account</Link></>
          )}
        </p>
      </CardBody>
    </Card>
  );
}
