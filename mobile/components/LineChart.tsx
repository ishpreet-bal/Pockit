import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useColors, type } from '@/theme/tokens';
import { useAccent } from './ui';

/**
 * A balance line you can scrub: drag a finger across and the point, the label and
 * a light haptic tick follow each day. Lifting the finger returns to today.
 */
export function LineChart({
  values, labels, width, height = 120, format,
}: { values: number[]; labels: string[]; width: number; height?: number; format: (v: number) => string }) {
  const c = useColors();
  const a = useAccent();
  const [active, setActive] = useState<number | null>(null);
  const min = Math.min(...values), max = Math.max(...values);
  const pad = 10;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (height - pad * 2);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const i = active ?? values.length - 1;

  const pick = (px: number) => {
    const next = Math.max(0, Math.min(values.length - 1, Math.round((px / width) * (values.length - 1))));
    if (next !== active) { void Haptics.selectionAsync(); setActive(next); }
  };

  return (
    <View>
      <Text style={[type.footnote, { color: c.textMuted, marginBottom: 6, paddingHorizontal: 22 }]}>
        {labels[i]} · <Text style={{ color: c.text }}>{format(values[i])}</Text>
      </Text>
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        onResponderRelease={() => setActive(null)}
        onResponderTerminate={() => setActive(null)}
      >
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={a.accent} stopOpacity={0.2} />
              <Stop offset="1" stopColor={a.accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={`${d} L${width} ${height} L0 ${height}Z`} fill="url(#fill)" />
          <Path d={d} fill="none" stroke={a.accent} strokeWidth={2.2} strokeLinejoin="round" />
          {active !== null ? <Line x1={x(i)} y1={0} x2={x(i)} y2={height} stroke={c.textSubtle} strokeDasharray="3 3" /> : null}
          <Circle cx={x(i)} cy={y(values[i])} r={5.5} fill={c.bg} stroke={a.accent} strokeWidth={2.5} />
        </Svg>
      </View>
    </View>
  );
}
