import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

/**
 * App Store subscriptions, through RevenueCat.
 *
 * RevenueCat is told the Pockit user id, so its webhook can tell the server who
 * paid. The phone never decides on its own that someone has Plus — after any
 * purchase it asks the server again (/api/mobile/me), which is the only source
 * of truth.
 */
const KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
let configuredFor: string | null = null;

export function purchasesAvailable(): boolean {
  return Platform.OS === 'ios' && KEY.length > 0;
}

export function configurePurchases(userId: string) {
  if (!purchasesAvailable() || configuredFor === userId) return;
  if (configuredFor === null) Purchases.configure({ apiKey: KEY, appUserID: userId });
  else void Purchases.logIn(userId);
  configuredFor = userId;
}

export interface PlanOption {
  pkg: PurchasesPackage;
  title: string;
  price: string;
  /** e.g. "1 month free" — the App Store introductory offer, when one is set up. */
  trial: string | null;
  yearly: boolean;
}

const UNIT: Record<string, string> = { DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' };

export async function loadPlanOptions(): Promise<PlanOption[]> {
  if (!purchasesAvailable()) return [];
  const offerings = await Purchases.getOfferings();
  return (offerings.current?.availablePackages ?? []).map((pkg) => {
    const intro = pkg.product.introPrice;
    const yearly = pkg.packageType === 'ANNUAL';
    const n = intro?.periodNumberOfUnits ?? 0;
    const unit = intro ? UNIT[intro.periodUnit] ?? 'period' : '';
    return {
      pkg,
      yearly,
      title: yearly ? 'Yearly' : 'Monthly',
      price: `${pkg.product.priceString}/${yearly ? 'year' : 'month'}`,
      trial: intro && intro.price === 0 ? `${n} ${unit}${n === 1 ? '' : 's'} free` : null,
    };
  });
}

/** True when bought; false when the person backed out. Throws on a real failure. */
export async function buy(option: PlanOption): Promise<boolean> {
  try {
    await Purchases.purchasePackage(option.pkg);
    return true;
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}

export async function restore(): Promise<void> {
  if (purchasesAvailable()) await Purchases.restorePurchases();
}
