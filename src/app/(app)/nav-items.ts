import {
  Repeat, CalendarDays, Landmark, BarChart3, Upload, Briefcase, Settings,
  type LucideIcon,
} from 'lucide-react';

/**
 * Everything else, on one More screen.
 *
 * These used to be thirteen equal destinations, and people who tried the app said
 * they would not use it because there was too much going on. Nothing here was
 * removed — it was moved behind one door, so the front of the app is three
 * questions instead of thirteen. Assistant is gone from the list because Pock, one
 * tap away on every screen, now does its job.
 */
export const MORE_ITEMS: { href: string; label: string; icon: LucideIcon; blurb: string }[] = [
  { href: '/recurring', label: 'Bills & subscriptions', icon: Repeat, blurb: 'Everything that repeats' },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, blurb: 'What lands when' },
  { href: '/accounts', label: 'Accounts & debts', icon: Landmark, blurb: 'Balances and what you owe' },
  { href: '/analytics', label: 'Insights', icon: BarChart3, blurb: 'Patterns and forecast' },
  { href: '/imports', label: 'Import a statement', icon: Upload, blurb: 'Bring in your bank history' },
  { href: '/business', label: 'Business', icon: Briefcase, blurb: 'If you run one' },
  { href: '/settings', label: 'Settings', icon: Settings, blurb: 'Profile, privacy, security' },
];

