import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { type, useColors } from '@/theme/tokens';

export default function NotFound() {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, padding: 20 }}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Text style={[type.title3, { color: c.text }]}>That screen doesn’t exist.</Text>
      <Link href="/" style={[type.body, { color: c.section.home.accent, marginTop: 16 }]}>Go home</Link>
    </View>
  );
}
