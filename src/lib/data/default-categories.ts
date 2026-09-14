/**
 * The default category tree (spec §4).
 *
 * `classification` (fixed/variable) and `necessity` (essential/discretionary) ship
 * with sensible defaults but are USER-EDITABLE, because the app must not assume
 * everyone's priorities are identical (spec §48). A gym membership is essential to
 * one person and discretionary to another.
 */
export interface CategorySeed {
  slug: string;
  name: string;
  kind: 'expense' | 'income' | 'transfer' | 'investment';
  classification: 'fixed' | 'variable';
  necessity: 'essential' | 'discretionary';
  icon: string;
  color: string;
  children?: CategorySeed[];
}

const C = (
  slug: string, name: string, icon: string, color: string,
  classification: 'fixed' | 'variable' = 'variable',
  necessity: 'essential' | 'discretionary' = 'discretionary',
  children?: CategorySeed[],
): CategorySeed => ({ slug, name, kind: 'expense', classification, necessity, icon, color, children });

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  C('housing', 'Housing', '🏠', '#4a6fa5', 'fixed', 'essential', [
    C('rent', 'Rent', '🏠', '#4a6fa5', 'fixed', 'essential'),
    C('mortgage', 'Mortgage', '🏦', '#4a6fa5', 'fixed', 'essential'),
    C('utilities', 'Utilities', '💡', '#4a6fa5', 'variable', 'essential'),
    C('phone', 'Phone', '📱', '#4a6fa5', 'fixed', 'essential'),
    C('internet', 'Internet', '🌐', '#4a6fa5', 'fixed', 'essential'),
    C('home-maintenance', 'Home maintenance', '🔧', '#4a6fa5', 'variable', 'essential'),
  ]),
  C('food', 'Food', '🍽️', '#b8763e', 'variable', 'essential', [
    C('groceries', 'Groceries', '🛒', '#b8763e', 'variable', 'essential'),
    C('restaurants', 'Restaurants', '🍽️', '#b8763e', 'variable', 'discretionary'),
    C('fast-food', 'Fast food', '🍔', '#b8763e', 'variable', 'discretionary'),
    C('coffee', 'Coffee', '☕', '#b8763e', 'variable', 'discretionary'),
  ]),
  C('transportation', 'Transportation', '🚗', '#3f8f8a', 'variable', 'essential', [
    C('gas', 'Gas', '⛽', '#3f8f8a', 'variable', 'essential'),
    C('car-insurance', 'Car insurance', '🛡️', '#3f8f8a', 'fixed', 'essential'),
    C('car-maintenance', 'Car maintenance', '🔧', '#3f8f8a', 'variable', 'essential'),
    C('parking', 'Parking', '🅿️', '#3f8f8a', 'variable', 'discretionary'),
    C('public-transit', 'Public transit', '🚌', '#3f8f8a', 'variable', 'essential'),
    C('tolls', 'Tolls', '🛣️', '#3f8f8a', 'variable', 'discretionary'),
    C('rideshare', 'Rideshare', '🚕', '#3f8f8a', 'variable', 'discretionary'),
  ]),
  C('shopping', 'Shopping', '🛍️', '#7d5ba6', 'variable', 'discretionary', [
    C('clothing', 'Clothing', '👕', '#7d5ba6'),
    C('electronics', 'Electronics', '💻', '#7d5ba6'),
    C('household', 'Household goods', '🧺', '#7d5ba6', 'variable', 'essential'),
    C('general-shopping', 'General shopping', '🛍️', '#7d5ba6'),
  ]),
  C('entertainment', 'Entertainment', '🎬', '#a4554b', 'variable', 'discretionary', [
    C('subscriptions', 'Subscriptions', '📺', '#a4554b', 'fixed', 'discretionary'),
    C('events', 'Events', '🎟️', '#a4554b'),
    C('hobbies', 'Hobbies', '🎨', '#a4554b'),
    C('games', 'Games', '🎮', '#a4554b'),
  ]),
  C('health', 'Health', '🩺', '#177245', 'variable', 'essential', [
    C('medical', 'Medical', '🩺', '#177245', 'variable', 'essential'),
    C('pharmacy', 'Pharmacy', '💊', '#177245', 'variable', 'essential'),
    C('dental', 'Dental', '🦷', '#177245', 'variable', 'essential'),
    C('fitness', 'Fitness', '🏋️', '#177245', 'fixed', 'discretionary'),
    C('personal-care', 'Personal care', '💈', '#177245', 'variable', 'discretionary'),
  ]),
  C('travel', 'Travel', '✈️', '#1f5f8b', 'variable', 'discretionary', [
    C('flights', 'Flights', '✈️', '#1f5f8b'),
    C('accommodation', 'Accommodation', '🏨', '#1f5f8b'),
    C('travel-other', 'Travel other', '🧳', '#1f5f8b'),
  ]),
  C('education', 'Education', '🎓', '#6b8e3d', 'variable', 'essential', [
    C('tuition', 'Tuition', '🎓', '#6b8e3d', 'fixed', 'essential'),
    C('books-courses', 'Books & courses', '📚', '#6b8e3d'),
  ]),
  C('financial', 'Financial', '🏦', '#8a6d3b', 'fixed', 'essential', [
    C('insurance', 'Insurance', '🛡️', '#8a6d3b', 'fixed', 'essential'),
    C('bank-fees', 'Bank fees', '🏦', '#8a6d3b', 'fixed', 'essential'),
    C('taxes', 'Taxes', '🧾', '#8a6d3b', 'variable', 'essential'),
    C('debt-payments', 'Debt payments', '💳', '#8a6d3b', 'fixed', 'essential'),
  ]),
  C('gifts-giving', 'Gifts & giving', '🎁', '#a4303f', 'variable', 'discretionary', [
    C('gifts', 'Gifts', '🎁', '#a4303f'),
    C('charity', 'Charity', '❤️', '#a4303f'),
  ]),
  C('pets', 'Pets', '🐾', '#b8763e', 'variable', 'essential'),
  C('childcare', 'Childcare', '🧸', '#4a6fa5', 'fixed', 'essential'),
  C('business', 'Business expenses', '💼', '#2f6f5e', 'variable', 'essential', [
    C('software', 'Software & tools', '🧰', '#2f6f5e', 'fixed', 'essential'),
    C('advertising', 'Advertising', '📣', '#2f6f5e'),
    C('contractors', 'Contractors', '🤝', '#2f6f5e'),
    C('equipment', 'Equipment', '🖥️', '#2f6f5e'),
    C('business-travel', 'Business travel', '🧳', '#2f6f5e'),
    C('professional-fees', 'Professional fees', '⚖️', '#2f6f5e'),
    C('business-other', 'Business other', '💼', '#2f6f5e'),
  ]),
  C('miscellaneous', 'Miscellaneous', '❓', '#6b6560', 'variable', 'discretionary'),

  // Income
  { slug: 'income', name: 'Income', kind: 'income', classification: 'variable', necessity: 'essential', icon: '💰', color: '#177245', children: [
    { slug: 'salary', name: 'Salary', kind: 'income', classification: 'fixed', necessity: 'essential', icon: '💼', color: '#177245' },
    { slug: 'freelance', name: 'Freelance', kind: 'income', classification: 'variable', necessity: 'essential', icon: '🧾', color: '#177245' },
    { slug: 'business-revenue', name: 'Business revenue', kind: 'income', classification: 'variable', necessity: 'essential', icon: '📈', color: '#177245' },
    { slug: 'interest-dividends', name: 'Interest & dividends', kind: 'income', classification: 'variable', necessity: 'essential', icon: '🏦', color: '#177245' },
    { slug: 'refunds-reimbursements', name: 'Refunds & reimbursements', kind: 'income', classification: 'variable', necessity: 'essential', icon: '↩️', color: '#177245' },
    { slug: 'other-income', name: 'Other income', kind: 'income', classification: 'variable', necessity: 'essential', icon: '💰', color: '#177245' },
  ] },

  // Investments — saving, not spending.
  { slug: 'investments', name: 'Investments', kind: 'investment', classification: 'fixed', necessity: 'essential', icon: '📈', color: '#4a6fa5', children: [
    { slug: 'retirement', name: 'Retirement', kind: 'investment', classification: 'fixed', necessity: 'essential', icon: '🏖️', color: '#4a6fa5' },
    { slug: 'brokerage', name: 'Brokerage', kind: 'investment', classification: 'variable', necessity: 'essential', icon: '📊', color: '#4a6fa5' },
    { slug: 'crypto', name: 'Crypto', kind: 'investment', classification: 'variable', necessity: 'discretionary', icon: '🪙', color: '#4a6fa5' },
    { slug: 'savings-transfer', name: 'Savings', kind: 'investment', classification: 'fixed', necessity: 'essential', icon: '🐖', color: '#4a6fa5' },
  ] },

  { slug: 'transfer', name: 'Transfer', kind: 'transfer', classification: 'variable', necessity: 'essential', icon: '↔️', color: '#6b6560' },
];

/** Flatten to (parentSlug, seed) pairs in insert order. */
export function flattenCategories(
  seeds: readonly CategorySeed[] = DEFAULT_CATEGORIES,
): { seed: CategorySeed; parentSlug: string | null; sortOrder: number }[] {
  const out: { seed: CategorySeed; parentSlug: string | null; sortOrder: number }[] = [];
  seeds.forEach((seed, i) => {
    out.push({ seed, parentSlug: null, sortOrder: i });
    seed.children?.forEach((child, j) => out.push({ seed: child, parentSlug: seed.slug, sortOrder: j }));
  });
  return out;
}
