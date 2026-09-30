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
import { useColors, useIsDark } from '@/theme/tokens';

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

  useEffect(() => { if (loaded) void SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;

  // Navigation chrome takes the same colours as the screens so nothing flashes.
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: c.bg, card: c.bg, text: c.text, border: c.border, primary: c.section.home.accent } };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
