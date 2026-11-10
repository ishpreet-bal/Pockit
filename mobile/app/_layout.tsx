import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Tinos_400Regular, Tinos_400Regular_Italic, Tinos_700Bold } from '@expo-google-fonts/tinos';
import { DMSans_400Regular, DMSans_400Regular_Italic, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import 'react-native-reanimated';
import { setAccentHue, setAppearance, useColors, useIsDark } from '@/theme/tokens';
import { getAppearance, getText } from '@/lib/prefs';
import { SessionProvider } from '@/lib/session';
import { SummaryProvider } from '@/lib/summary';
import { AppLock } from '@/lib/lock';
import { TourProvider } from '@/lib/tour';

export { ErrorBoundary } from 'expo-router';
export const unstable_settings = { initialRouteName: '(tabs)' };

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Tinos_400Regular, Tinos_400Regular_Italic, Tinos_700Bold, DMSans_400Regular, DMSans_400Regular_Italic, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold });
  // A font that fails to load must not leave a blank screen; the system serif stands in.
  const loaded = fontsLoaded || Boolean(fontError);
  const c = useColors();
  const dark = useIsDark();

  useEffect(() => { void getAppearance().then(setAppearance); }, []);
  // TEMPORARY try-a-colour: restore the hue picked in Settings.
  useEffect(() => { void getText('accentHue').then((v) => { const h = v === null ? NaN : Number(v); if (Number.isFinite(h)) setAccentHue(h); }); }, []);
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
        <TourProvider>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: c.bg } }}>
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
          <Stack.Screen name="trends" />
          <Stack.Screen name="more" />
          <Stack.Screen name="accounts" />
          <Stack.Screen name="spaces" />
          <Stack.Screen name="trip" />
          <Stack.Screen name="vehicle" options={{ presentation: 'modal' }} />
          <Stack.Screen name="holdings" />
          <Stack.Screen name="txn/[id]" />
          <Stack.Screen name="owed" />
          <Stack.Screen name="delete-account" options={{ presentation: 'modal' }} />
          <Stack.Screen name="feedback" options={{ presentation: 'modal' }} />
        </Stack>
        </TourProvider>
        </AppLock>
      </ThemeProvider>
      </SummaryProvider>
    </SessionProvider>
  );
}
