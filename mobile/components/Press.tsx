import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Everything you can tap gives a little: it settles in on a soft spring and eases
 * back, instead of blinking. `depth` is how far it sinks (0.97 for buttons and
 * cards, less for long rows so the text doesn't swim).
 */
export function Press({ children, style, depth = 0.97, dim = 0.85, disabled, onPressIn, onPressOut, ...rest }: Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode; style?: StyleProp<ViewStyle>; depth?: number; dim?: number;
}) {
  const scale = useSharedValue(1);
  const fade = useSharedValue(1);
  // The press fade multiplies the element's own opacity (a disabled button stays dim).
  const base = (StyleSheet.flatten(style)?.opacity as number | undefined) ?? 1;
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: fade.value * base }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        scale.value = withSpring(depth, { damping: 20, stiffness: 420, mass: 0.6 });
        fade.value = withTiming(dim, { duration: 90 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 260, mass: 0.7 });
        fade.value = withTiming(1, { duration: 180 });
        onPressOut?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
