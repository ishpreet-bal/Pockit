import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque';
import 'react-native-reanimated';
import { setAppearance, useColors, useIsDark } from '@/theme/tokens';
import { getAppearance } from '@/lib/prefs';
import { SessionProvider } from '@/lib/session';
import { SummaryProvider } from '@/lib/summary';
import { AppLock } from '@/lib/lock';

export { ErrorBoundary } from 'expo-router';
export const unstable_settings = { initialRouteName: '(tabs)' };

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
  });
  const c = useColors();
  const dark = useIsDark();

  useEffect(() => { void getAppearance().then(setAppearance); }, []);
  useEffect(() => { if (loaded) void SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;

  // Navigation chrome takes the same colours as the screens so nothing flashes.
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: c.bg, card: c.bg, text: c.text, border: c.border, primary: c.section.home.accent } };

  return (
    <SessionProvider>
      <SummaryProvider>
      <ThemeProvider value={theme}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <AppLock>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
          <Stack.Screen name="sign-up" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="setup" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="transactions" />
          <Stack.Screen name="add" options={{ presentation: 'modal' }} />
          <Stack.Screen name="new-goal" options={{ presentation: 'modal' }} />
          <Stack.Screen name="bills" />
          <Stack.Screen name="goal/[id]" />
          <Stack.Screen name="search" />
          <Stack.Screen name="stock/[symbol]" />
          <Stack.Screen name="pock" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" />
          <Stack.Screen name="plus" options={{ presentation: 'modal' }} />
          <Stack.Screen name="dev" />
          <Stack.Screen name="learn" />
          <Stack.Screen name="budget" />
          <Stack.Screen name="trip" />
          <Stack.Screen name="vehicle" options={{ presentation: 'modal' }} />
          <Stack.Screen name="tour" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        </Stack>
        </AppLock>
      </ThemeProvider>
      </SummaryProvider>
    </SessionProvider>
  );
}
