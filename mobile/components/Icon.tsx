import { SymbolView } from 'expo-symbols';

/**
 * SF Symbols on iPhone; the nearest Material Symbol on web and Android.
 *
 * On iOS these are Apple's own icons, which is a large part of what makes an app
 * feel native. The web names exist only so the design-review screenshots — taken
 * from a browser at iPhone size — show the same shapes.
 */
const WEB: Record<string, string> = {
  'house.fill': 'home',
  'arrow.left.arrow.right': 'swap_horiz',
  'target': 'track_changes',
  'chart.line.uptrend.xyaxis': 'trending_up',
  'ellipsis': 'more_horiz',
  'iphone': 'smartphone',
  'music.note': 'music_note',
  'plus': 'add',
  'chevron.right': 'chevron_right',
  'repeat': 'repeat',
  'calendar': 'calendar_month',
  'building.columns': 'account_balance',
  'chart.bar': 'bar_chart',
  'square.and.arrow.down': 'download',
  'briefcase': 'work',
  'gearshape': 'settings',
  'magnifyingglass': 'search',
  'cart': 'shopping_cart',
  'fork.knife': 'restaurant',
  'car': 'directions_car',
  'cup.and.saucer': 'local_cafe',
};

export function Icon({ name, size = 20, color }: { name: string; size?: number; color: string }) {
  return (
    <SymbolView
      name={{ ios: name, android: (WEB[name] ?? 'circle') as never, web: (WEB[name] ?? 'circle') as never } as never}
      size={size}
      tintColor={color}
    />
  );
}
