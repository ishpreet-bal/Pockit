/**
 * A seeded merchant → category lexicon.
 *
 * This is what lets categorisation work on the very first import, with no AI key and
 * no history. It is intentionally a plain lookup table rather than a model: it is
 * fast, free, deterministic, and the user can override any entry, which then becomes
 * a `merchant_rules` row that takes precedence.
 */
export const MERCHANT_LEXICON: { pattern: string; slug: string; display?: string }[] = [
  // Fuel
  { pattern: 'shell', slug: 'gas', display: 'Shell' },
  { pattern: 'petro-canada', slug: 'gas', display: 'Petro-Canada' },
  { pattern: 'petro canada', slug: 'gas', display: 'Petro-Canada' },
  { pattern: 'esso', slug: 'gas', display: 'Esso' },
  { pattern: 'chevron', slug: 'gas', display: 'Chevron' },
  { pattern: 'husky', slug: 'gas', display: 'Husky' },
  { pattern: 'ultramar', slug: 'gas', display: 'Ultramar' },
  { pattern: 'mobil', slug: 'gas', display: 'Mobil' },
  { pattern: 'bp ', slug: 'gas', display: 'BP' },
  // Groceries
  { pattern: 'loblaws', slug: 'groceries', display: 'Loblaws' },
  { pattern: 'no frills', slug: 'groceries', display: 'No Frills' },
  { pattern: 'sobeys', slug: 'groceries', display: 'Sobeys' },
  { pattern: 'metro', slug: 'groceries', display: 'Metro' },
  { pattern: 'freshco', slug: 'groceries', display: 'FreshCo' },
  { pattern: 'food basics', slug: 'groceries', display: 'Food Basics' },
  { pattern: 'superstore', slug: 'groceries', display: 'Real Canadian Superstore' },
  { pattern: 'save on foods', slug: 'groceries', display: 'Save-On-Foods' },
  { pattern: 'whole foods', slug: 'groceries', display: 'Whole Foods' },
  { pattern: 'trader joe', slug: 'groceries', display: "Trader Joe's" },
  { pattern: 'safeway', slug: 'groceries', display: 'Safeway' },
  { pattern: 'kroger', slug: 'groceries', display: 'Kroger' },
  { pattern: 'costco', slug: 'groceries', display: 'Costco' },
  { pattern: 'walmart', slug: 'groceries', display: 'Walmart' },
  // Fast food
  { pattern: 'mcdonald', slug: 'fast-food', display: "McDonald's" },
  { pattern: 'tim horton', slug: 'coffee', display: 'Tim Hortons' },
  { pattern: 'starbucks', slug: 'coffee', display: 'Starbucks' },
  { pattern: 'second cup', slug: 'coffee', display: 'Second Cup' },
  { pattern: 'subway', slug: 'fast-food', display: 'Subway' },
  { pattern: 'a&w', slug: 'fast-food', display: 'A&W' },
  { pattern: 'wendy', slug: 'fast-food', display: "Wendy's" },
  { pattern: 'burger king', slug: 'fast-food', display: 'Burger King' },
  { pattern: 'chipotle', slug: 'fast-food', display: 'Chipotle' },
  { pattern: 'popeyes', slug: 'fast-food', display: 'Popeyes' },
  { pattern: 'kfc', slug: 'fast-food', display: 'KFC' },
  { pattern: 'pizza', slug: 'fast-food' },
  { pattern: 'doordash', slug: 'restaurants', display: 'DoorDash' },
  { pattern: 'uber eats', slug: 'restaurants', display: 'Uber Eats' },
  { pattern: 'skip the dishes', slug: 'restaurants', display: 'SkipTheDishes' },
  { pattern: 'skipthedishes', slug: 'restaurants', display: 'SkipTheDishes' },
  // Transport
  { pattern: 'uber', slug: 'rideshare', display: 'Uber' },
  { pattern: 'lyft', slug: 'rideshare', display: 'Lyft' },
  { pattern: 'presto', slug: 'public-transit', display: 'PRESTO' },
  { pattern: 'ttc', slug: 'public-transit', display: 'TTC' },
  { pattern: 'go transit', slug: 'public-transit', display: 'GO Transit' },
  { pattern: 'green p', slug: 'parking', display: 'Green P Parking' },
  { pattern: 'impark', slug: 'parking', display: 'Impark' },
  { pattern: '407 etr', slug: 'tolls', display: '407 ETR' },
  { pattern: 'canadian tire', slug: 'car-maintenance', display: 'Canadian Tire' },
  { pattern: 'mr lube', slug: 'car-maintenance', display: 'Mr. Lube' },
  // Subscriptions
  { pattern: 'netflix', slug: 'subscriptions', display: 'Netflix' },
  { pattern: 'spotify', slug: 'subscriptions', display: 'Spotify' },
  { pattern: 'disney', slug: 'subscriptions', display: 'Disney+' },
  { pattern: 'crave', slug: 'subscriptions', display: 'Crave' },
  { pattern: 'apple.com/bill', slug: 'subscriptions', display: 'Apple' },
  { pattern: 'itunes', slug: 'subscriptions', display: 'Apple' },
  { pattern: 'google storage', slug: 'subscriptions', display: 'Google One' },
  { pattern: 'youtube premium', slug: 'subscriptions', display: 'YouTube Premium' },
  { pattern: 'prime video', slug: 'subscriptions', display: 'Prime Video' },
  { pattern: 'audible', slug: 'subscriptions', display: 'Audible' },
  { pattern: 'patreon', slug: 'subscriptions', display: 'Patreon' },
  // Software / business
  { pattern: 'adobe', slug: 'software', display: 'Adobe' },
  { pattern: 'figma', slug: 'software', display: 'Figma' },
  { pattern: 'notion', slug: 'software', display: 'Notion' },
  { pattern: 'slack', slug: 'software', display: 'Slack' },
  { pattern: 'github', slug: 'software', display: 'GitHub' },
  { pattern: 'openai', slug: 'software', display: 'OpenAI' },
  { pattern: 'anthropic', slug: 'software', display: 'Anthropic' },
  { pattern: 'aws', slug: 'software', display: 'Amazon Web Services' },
  { pattern: 'vercel', slug: 'software', display: 'Vercel' },
  { pattern: 'google ads', slug: 'advertising', display: 'Google Ads' },
  { pattern: 'meta platforms', slug: 'advertising', display: 'Meta Ads' },
  { pattern: 'facebook ads', slug: 'advertising', display: 'Meta Ads' },
  // Shopping
  { pattern: 'amazon', slug: 'general-shopping', display: 'Amazon' },
  { pattern: 'amzn', slug: 'general-shopping', display: 'Amazon' },
  { pattern: 'best buy', slug: 'electronics', display: 'Best Buy' },
  { pattern: 'apple store', slug: 'electronics', display: 'Apple Store' },
  { pattern: 'ikea', slug: 'household', display: 'IKEA' },
  { pattern: 'home depot', slug: 'home-maintenance', display: 'Home Depot' },
  { pattern: 'winners', slug: 'clothing', display: 'Winners' },
  { pattern: 'uniqlo', slug: 'clothing', display: 'Uniqlo' },
  { pattern: 'zara', slug: 'clothing', display: 'Zara' },
  { pattern: 'h&m', slug: 'clothing', display: 'H&M' },
  { pattern: 'lululemon', slug: 'clothing', display: 'Lululemon' },
  { pattern: 'dollarama', slug: 'household', display: 'Dollarama' },
  // Health
  { pattern: 'shoppers drug', slug: 'pharmacy', display: 'Shoppers Drug Mart' },
  { pattern: 'rexall', slug: 'pharmacy', display: 'Rexall' },
  { pattern: 'goodlife', slug: 'fitness', display: 'GoodLife Fitness' },
  { pattern: 'planet fitness', slug: 'fitness', display: 'Planet Fitness' },
  // Utilities / telecom
  { pattern: 'rogers', slug: 'phone', display: 'Rogers' },
  { pattern: 'bell canada', slug: 'phone', display: 'Bell' },
  { pattern: 'telus', slug: 'phone', display: 'Telus' },
  { pattern: 'freedom mobile', slug: 'phone', display: 'Freedom Mobile' },
  { pattern: 'koodo', slug: 'phone', display: 'Koodo' },
  { pattern: 'fido', slug: 'phone', display: 'Fido' },
  { pattern: 'hydro', slug: 'utilities' },
  { pattern: 'enbridge', slug: 'utilities', display: 'Enbridge' },
  // Travel
  { pattern: 'air canada', slug: 'flights', display: 'Air Canada' },
  { pattern: 'westjet', slug: 'flights', display: 'WestJet' },
  { pattern: 'airbnb', slug: 'accommodation', display: 'Airbnb' },
  { pattern: 'booking.com', slug: 'accommodation', display: 'Booking.com' },
  { pattern: 'expedia', slug: 'accommodation', display: 'Expedia' },
  // Income
  { pattern: 'payroll', slug: 'salary' },
  { pattern: 'direct deposit', slug: 'salary' },
  { pattern: 'stripe', slug: 'business-revenue', display: 'Stripe' },
  { pattern: 'shopify', slug: 'business-revenue', display: 'Shopify' },
  { pattern: 'paypal', slug: 'business-revenue', display: 'PayPal' },
];

export interface LexiconMatch {
  slug: string;
  display: string | null;
  confidence: number;
}

/** Longest-pattern-wins lookup, so "uber eats" beats "uber". */
export function lookupMerchant(text: string): LexiconMatch | null {
  const haystack = text.toLowerCase();
  let best: { pattern: string; slug: string; display?: string } | null = null;
  for (const entry of MERCHANT_LEXICON) {
    if (!haystack.includes(entry.pattern)) continue;
    if (!best || entry.pattern.length > best.pattern.length) best = entry;
  }
  if (!best) return null;
  return {
    slug: best.slug,
    display: best.display ?? null,
    // Longer matches are more specific and therefore more trustworthy.
    confidence: Math.min(95, 70 + best.pattern.length * 2),
  };
}
