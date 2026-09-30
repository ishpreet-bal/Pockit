import { useRef, useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Button, Field, FormError, StepScreen } from '@/components/form';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { type, useColors } from '@/theme/tokens';

/**
 * Sign in. If the account has two-step verification, the same screen asks for the
 * six-digit code next — no second page to get lost on.
 */
export default function SignIn() {
  const c = useColors();
  const { adopt } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const res = await api<{ token?: string; needsSecondFactor?: boolean }>('/api/mobile/auth/sign-in', {
        body: { email: email.trim(), password, ...(needsCode ? { code: code.trim() } : {}) },
      });
      if (res.needsSecondFactor && !res.token) { setNeedsCode(true); return; }
      const me = await adopt(res.token!);
      router.replace(me && !me.setupDone ? '/setup' : '/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally { setBusy(false); }
  }

  const back = (
    <Pressable onPress={() => (needsCode ? setNeedsCode(false) : router.back())} hitSlop={12} accessibilityRole="button">
      <Text style={[type.bodyStrong, { color: c.section.home.accent }]}>‹ Back</Text>
    </Pressable>
  );

  if (needsCode) {
    return (
      <StepScreen
        top={back}
        title="Enter your code"
        subtitle="Open your authenticator app and type the 6-digit code for Pockit. A recovery code works too."
        footer={<Button label="Sign in" loading={busy} disabled={code.trim().length < 6} onPress={submit} />}
      >
        <Field label="Code" value={code} onChangeText={setCode} autoFocus keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={20} onSubmitEditing={submit} />
        <FormError message={error} />
      </StepScreen>
    );
  }

  return (
    <StepScreen
      top={back}
      title="Welcome back"
      footer={<Button label="Sign in" loading={busy} disabled={!email || !password} onPress={submit} />}
    >
      <Field label="Email" value={email} onChangeText={setEmail} autoFocus keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
      <Field ref={passwordRef} label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="current-password" returnKeyType="go" onSubmitEditing={submit} />
      <FormError message={error} />
    </StepScreen>
  );
}
