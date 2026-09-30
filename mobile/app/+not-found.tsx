import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { colors, type } from '@/theme/tokens';

export default function NotFound() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 20 }}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Text style={[type.title3, { color: colors.text }]}>That screen doesn’t exist.</Text>
      <Link href="/" style={[type.body, { color: colors.accent, marginTop: 16 }]}>Go home</Link>
    </View>
  );
}
