'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Card, CardBody, Field, Input, Button } from '@/components/ui/primitives';
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
  mode, action, secondFactorAction,
}: {
  mode: 'sign-in' | 'sign-up';
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  /** Only passed on sign-in. Present so the code step is a real form action, not a fetch. */
  secondFactorAction?: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction] = useActionState(action, {} as AuthFormState);
  const isSignUp = mode === 'sign-up';

  /**
   * Sign-up asks for a name first, on its own screen.
   *
   * Not decoration: the second screen can then greet them by name, which is the
   * difference between a form and a conversation. It also means the first thing
   * anyone is asked for is the easiest possible question, rather than a password
   * policy.
   */
  const [firstName, setFirstName] = useState('');
  const [namePassed, setNamePassed] = useState(false);

  // The password was accepted and a code is now required. Rendered as its own step
  // rather than a field that appears beneath the password, because leaving the
  // password on screen invites people to change it and try again, which cannot work.
  if (state.needsSecondFactor && secondFactorAction) {
    return <SecondFactorStep action={secondFactorAction} />;
  }

  if (isSignUp && !namePassed) {
    return (
      <NameStep
        value={firstName}
        onChange={setFirstName}
        onContinue={() => setNamePassed(true)}
      />
    );
  }

  return (
    <Card>
      <CardBody className="pt-5">
        <h1 className="text-lg font-semibold">
          {isSignUp
            ? firstName.trim()
              ? `Nice to meet you, ${firstName.trim()}.`
              : 'Create your account'
            : 'Welcome back'}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {isSignUp ? "Let's get your account set up." : 'Sign in to continue.'}
        </p>

        <form action={formAction} className="mt-5 flex flex-col gap-3.5">
          {isSignUp ? <input type="hidden" name="displayName" value={firstName.trim()} /> : null}

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
              {/* What they track and which currency used to sit here, turning the
                  account form into a five-field wall. Both are asked later, in the
                  financial setup, where they have context. */}
              <input type="hidden" name="useCase" value="personal" />
              <input type="hidden" name="baseCurrency" value="CAD" />
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

        {isSignUp ? (
          <button
            type="button"
            onClick={() => setNamePassed(false)}
            className="mt-3 w-full text-center text-sm text-[var(--text-subtle)] hover:text-[var(--text)]"
          >
            ← Back
          </button>
        ) : null}

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


/**
 * The second step of signing in.
 *
 * `inputMode="numeric"` and `autoComplete="one-time-code"` matter more than they
 * look: together they give a phone the number pad and let iOS and Android offer the
 * code from the authenticator app or an SMS, which is most of the difference between
 * 2FA people keep and 2FA people turn off.
 */
function SecondFactorStep({
  action,
}: {
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction] = useActionState(action, { needsSecondFactor: true } as AuthFormState);

  return (
    <Card>
      <CardBody className="pt-5">
        <h1 className="text-lg font-semibold">Enter your code</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Open your authenticator app and type the six digits for Pockit.
        </p>

        <form action={formAction} className="mt-5 flex flex-col gap-3.5">
          <Field label="Six-digit code" htmlFor="code">
            <Input
              id="code" name="code" required autoFocus
              inputMode="numeric" autoComplete="one-time-code"
              placeholder="000000" maxLength={20}
              className="text-center text-lg tracking-[0.3em]"
            />
          </Field>

          {state.error ? (
            <div role="alert" className="rounded-[var(--radius-control)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">
              {state.error}
            </div>
          ) : null}

          <SubmitButton label="Continue" />
        </form>

        <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
          Lost your phone? Type one of your recovery codes in the same box.
        </p>
        <p className="mt-2 text-center text-sm">
          <Link href="/sign-in" className="font-medium text-[var(--accent)] hover:underline">
            Start over
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}


/**
 * "First things first — what should we call you?"
 *
 * One question, one input, one button. It is skippable by simply continuing with
 * it blank: a name is a courtesy, not a credential, and blocking on it would make
 * the very first screen of the product a validation error.
 */
function NameStep({
  value, onChange, onContinue,
}: { value: string; onChange: (v: string) => void; onContinue: () => void }) {
  return (
    <Card>
      <CardBody className="pt-5">
        <h1 className="text-lg font-semibold">First things first — what should we call you?</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Just a first name is fine.</p>

        <form
          className="mt-5 flex flex-col gap-3.5"
          onSubmit={(e) => { e.preventDefault(); onContinue(); }}
        >
          <Field label="First name" htmlFor="firstName">
            <Input
              id="firstName"
              value={value}
              autoFocus
              autoComplete="given-name"
              maxLength={60}
              placeholder="Ishpreet"
              onChange={(e) => onChange(e.target.value)}
            />
          </Field>

          <Button type="submit" variant="primary" className="w-full">Continue</Button>
        </form>

        <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
          Already have an account?{' '}
          <Link href="/sign-in" className="font-medium text-[var(--accent)] hover:underline">Sign in</Link>
        </p>
      </CardBody>
    </Card>
  );
}
