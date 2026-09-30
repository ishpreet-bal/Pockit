import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAccent } from './ui';

/**
 * Pock: a rounded "P" with two eyes. Friendly, not a cartoon.
 *
 * It blinks now and then, and nods when tapped — enough life to notice, never
 * enough to distract from a balance.
 */
export function PockMark({ size = 24, color }: { size?: number; color: string }) {
  const blink = useSharedValue(1);
  useEffect(() => {
    blink.value = withRepeat(
      withSequence(withDelay(3800, withTiming(0.1, { duration: 90 })), withTiming(1, { duration: 120 })),
      -1,
    );
  }, [blink]);
  const eyes = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'absolute' }}>
        <Path d="M6 20V6.5A2.5 2.5 0 0 1 8.5 4H13a5.5 5.5 0 0 1 0 11H9" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
      <Animated.View style={[{ position: 'absolute', width: size, height: size }, eyes, { transformOrigin: `50% ${(9.5 / 24) * 100}%` }]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={11.5} cy={9.5} r={1.25} fill={color} />
          <Circle cx={15} cy={9.5} r={1.25} fill={color} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** The tappable Pock button in a screen's top-right corner. */
export function PockButton({ onPress }: { onPress?: () => void }) {
  const a = useAccent();
  const nod = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${nod.value}deg` }] }));
  return (
    <Pressable
      accessibilityLabel="Ask Pock"
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        nod.value = withSequence(withTiming(-10, { duration: 90 }), withSpring(0, { damping: 6 }));
        onPress?.();
      }}
      style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={style}><PockMark color={a.accent} /></Animated.View>
    </Pressable>
  );
}
