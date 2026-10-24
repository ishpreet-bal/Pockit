import { useRef, useState } from 'react';
import { Linking, Pressable, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { Button, Field, FormError, StepScreen } from '@/components/form';
import { api, ApiError, API_URL } from '@/lib/api';
import { useSession } from '@/lib/session';
import { type, useColors } from '@/theme/tokens';

/** Signing up is two small screens: your name, then how you'll sign in. */
export default function SignUp() {
  const c = useColors();
  const { adopt } = useSession();
  const [step, setStep] = useState<'name' | 'account'>('name');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const passwordRef = useRef<TextInput>(null);

  const back = (
    <Pressable onPress={() => (step === 'account' ? setStep('name') : router.back())} hitSlop={12} accessibilityRole="button">
      <Text style={[type.bodyStrong, { color: c.section.home.accent }]}>‹ Back</Text>
    </Pressable>
  );

  async function create() {
    setBusy(true); setError(null); setFieldErrors({});
    try {
      const { token } = await api<{ token: string }>('/api/mobile/auth/sign-up', {
        body: { firstName: firstName.trim(), email: email.trim(), password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      await adopt(token);
      router.replace('/setup');
    } catch (e) {
      if (e instanceof ApiError && e.body.fieldErrors) setFieldErrors(e.body.fieldErrors as Record<string, string>);
      else setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally { setBusy(false); }
  }

  if (step === 'name') {
    return (
      <Animated.View key="name" entering={FadeInRight.duration(350)} exiting={FadeOutLeft.duration(200)} style={{ flex: 1 }}>
        <StepScreen
          top={back}
          title="What should we call you?"
          subtitle="Just your first name is fine."
          footer={<Button label="Continue" disabled={!firstName.trim()} onPress={() => setStep('account')} />}
        >
          <Field label="First name" value={firstName} onChangeText={setFirstName} autoFocus autoCapitalize="words" textContentType="givenName" autoComplete="given-name" returnKeyType="next" onSubmitEditing={() => firstName.trim() && setStep('account')} />
        </StepScreen>
      </Animated.View>
    );
  }

  return (
    <Animated.View key="account" entering={FadeInRight.duration(350)} style={{ flex: 1 }}>
      <StepScreen
        top={back}
        title={`Nice to meet you, ${firstName.trim()}.`}
        subtitle="Now an email and password, so your money stays yours."
        footer={<>
          <Button label="Create account" loading={busy} disabled={!email || password.length < 10} onPress={create} />
          <Text style={[type.caption, { color: c.textSubtle, textAlign: 'center', lineHeight: 17 }]}>
            By creating an account you agree to the{' '}
            <Text style={{ textDecorationLine: 'underline' }} onPress={() => void Linking.openURL(`${API_URL}/terms`)}>terms</Text> and{' '}
            <Text style={{ textDecorationLine: 'underline' }} onPress={() => void Linking.openURL(`${API_URL}/privacy`)}>privacy policy</Text>.
          </Text>
        </>}
      >
        <Field label="Email" value={email} onChangeText={setEmail} error={fieldErrors.email} autoFocus keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
        <Field ref={passwordRef} label="Password" value={password} onChangeText={setPassword} error={fieldErrors.password} secureTextEntry textContentType="newPassword" autoComplete="new-password" placeholder="At least 10 characters" returnKeyType="go" onSubmitEditing={create} />
        <FormError message={error} />
      </StepScreen>
    </Animated.View>
  );
}
