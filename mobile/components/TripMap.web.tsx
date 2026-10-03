import { Text, View } from 'react-native';
import type { Place, Route } from '@/lib/trip';
import { type, useColors } from '@/theme/tokens';

/** Browser previews only — the real map is Apple Maps on the phone. */
export function TripMap({ from, to, route, color }: { from: Place | null; to: Place | null; route: Route | null; color: string }) {
  const c = useColors();
  return (
    <View style={{ height: 160, borderRadius: 18, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Text style={[type.subhead, { color: c.textMuted, textAlign: 'center' }]}>
        {from && to ? `${from.name} → ${to.name}` : 'The map appears here on your phone'}
      </Text>
      {route ? <View style={{ width: 120, height: 4, borderRadius: 4, backgroundColor: color, marginTop: 10 }} /> : null}
    </View>
  );
}
