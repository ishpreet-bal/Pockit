import { useEffect } from 'react';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';

export type Mood = 'idle' | 'happy' | 'thinking';

/**
 * Pock, the sea otter — the same drawing as the web app, in react-native-svg.
 *
 * It floats: a slow bob and sway on the UI thread via Reanimated, so it never
 * competes with scrolling for the JS thread. Slow on purpose — a mascot that moves
 * fast next to a bank balance reads as anxiety.
 */
export function Otter({ size = 48, mood = 'idle', float = true }: { size?: number; mood?: Mood; float?: boolean }) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (!float) return;
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2100, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2100, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [float, t]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -t.value * size * 0.03 }, { rotate: `${(t.value - 0.5) * 5}deg` }],
  }));

  const eyeY = mood === 'thinking' ? 20.5 : 22;

  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Svg viewBox="0 0 64 64" width={size} height={size}>
        <Path d="M6 52 Q16 48 26 52 T46 52 T58 52" fill="none" stroke="#5ed3f0" strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" />
        <Ellipse cx={32} cy={42} rx={17} ry={12} fill="#7a4e33" />
        <Ellipse cx={32} cy={44} rx={11} ry={8} fill="#c79d7a" />
        <Path d="M47 46 Q56 47 58 42" fill="none" stroke="#6a4229" strokeWidth={4} strokeLinecap="round" />
        <Circle cx={32} cy={24} r={15} fill="#8a5a3c" />
        <Circle cx={19.5} cy={13.5} r={3.4} fill="#7a4e33" />
        <Circle cx={44.5} cy={13.5} r={3.4} fill="#7a4e33" />
        <Circle cx={19.5} cy={13.5} r={1.6} fill="#c79d7a" />
        <Circle cx={44.5} cy={13.5} r={1.6} fill="#c79d7a" />
        <Ellipse cx={32} cy={27} rx={11.5} ry={9.5} fill="#e8cfb4" />
        {mood === 'happy' ? (
          <G>
            <Path d="M22.5 22.5 Q25 19.5 27.5 22.5" fill="none" stroke="#1a1210" strokeWidth={2} strokeLinecap="round" />
            <Path d="M36.5 22.5 Q39 19.5 41.5 22.5" fill="none" stroke="#1a1210" strokeWidth={2} strokeLinecap="round" />
          </G>
        ) : (
          <G>
            <Ellipse cx={25} cy={eyeY} rx={2.4} ry={2.6} fill="#1a1210" />
            <Ellipse cx={39} cy={eyeY} rx={2.4} ry={2.6} fill="#1a1210" />
            <Circle cx={25.8} cy={eyeY - 1} r={0.8} fill="#fff" />
            <Circle cx={39.8} cy={eyeY - 1} r={0.8} fill="#fff" />
          </G>
        )}
        <Ellipse cx={32} cy={27.5} rx={2.6} ry={1.9} fill="#2b1d17" />
        <Path d="M29 30.5 Q32 33.5 35 30.5" fill="none" stroke="#2b1d17" strokeWidth={1.3} strokeLinecap="round" />
        <G stroke="#f7ecdf" strokeWidth={0.9} strokeLinecap="round" opacity={0.9}>
          <Path d="M24 28 L15 26.5" /><Path d="M24 29.5 L15 30.5" />
          <Path d="M40 28 L49 26.5" /><Path d="M40 29.5 L49 30.5" />
        </G>
        <Circle cx={32} cy={40} r={5} fill="#f5c451" stroke="#c8931f" strokeWidth={1} />
        <Circle cx={32} cy={40} r={2.6} fill="none" stroke="#c8931f" strokeWidth={0.9} />
        <Circle cx={25.5} cy={41} r={3.2} fill="#6a4229" />
        <Circle cx={38.5} cy={41} r={3.2} fill="#6a4229" />
      </Svg>
    </Animated.View>
  );
}
