import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { Place, Route } from '@/lib/trip';

/** Apple Maps on iPhone (no key needed), with the route drawn on it. */
export function TripMap({ from, to, route, color }: { from: Place | null; to: Place | null; route: Route | null; color: string }) {
  const map = useRef<MapView>(null);
  const coords = (route?.points ?? []).map(([latitude, longitude]) => ({ latitude, longitude }));
  const pins = [from, to].filter((p): p is Place => Boolean(p)).map((p) => ({ latitude: p.lat, longitude: p.lon }));

  useEffect(() => {
    const all = coords.length ? coords : pins;
    if (all.length) map.current?.fitToCoordinates(all, { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true });
  }, [route, from, to]);

  return (
    <View style={{ height: 220, borderRadius: 18, overflow: 'hidden' }}>
      <MapView ref={map} style={{ flex: 1 }} initialRegion={{ latitude: 43.65, longitude: -79.38, latitudeDelta: 4, longitudeDelta: 4 }}>
        {from ? <Marker coordinate={{ latitude: from.lat, longitude: from.lon }} title={from.name} pinColor="green" /> : null}
        {to ? <Marker coordinate={{ latitude: to.lat, longitude: to.lon }} title={to.name} /> : null}
        {coords.length > 1 ? <Polyline coordinates={coords} strokeColor={color} strokeWidth={4} /> : null}
      </MapView>
    </View>
  );
}
