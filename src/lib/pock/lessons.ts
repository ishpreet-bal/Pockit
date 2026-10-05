/**
 * Pockit's investing lessons — one source for two readers.
 *
 * The app shows these on the Learn screen, and the server gives the same text to
 * Pock (src/lib/pock/lessons.ts is an exact copy, checked by a test) so what Pock
 * says always matches what the lesson said.
 *
 * Written for people in Canada starting out. Figures that change every year
 * (contribution limits, rates) say so, and point to where to check. Education
 * only: nothing here tells anyone what to buy.
 */

export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface Lesson {
  id: string;
  level: Exclude<Level, 'advanced'>;
  title: string;
  line: string;
  sections: { heading: string; text: string }[];
  risk: string;
  ask: string;
}

export const LESSONS: Lesson[] = [
  {
    id: 'stocks', level: 'beginner', title: 'Stocks', line: 'Owning a small piece of a company',
    sections: [
      { heading: 'What it is', text: 'A share is a small slice of ownership in a company. Buy one share of a company with a million shares and you own one-millionth of it — a sliver of its profits and its future.' },
      { heading: 'How you make (or lose) money', text: 'Two ways. The price can rise if the company grows or people expect it to (a capital gain), and some companies pay part of their profit to owners as dividends. Prices can also fall — sometimes sharply — and a company can go bankrupt, making its shares worth nothing.' },
      { heading: 'What history says', text: 'Across many decades, broad stock markets have grown faster than savings accounts or bonds, but with deep drops along the way: falls of 30–50% have happened several times and taken years to recover. That’s why stocks suit money you won’t need for five years or more.' },
      { heading: 'In Canada', text: 'Canadian companies trade on the TSX; US ones on the NYSE and Nasdaq. You buy through a brokerage account (a bank’s online brokerage, or apps like Wealthsimple or Questrade). Gains are taxed when you sell, unless they’re inside a TFSA, RRSP or FHSA.' },
      { heading: 'Watch out for', text: 'Putting a lot into one company. Even great companies stumble, and picking winners consistently is very hard — most professional fund managers fail to beat the overall market over long periods. Tips from social media are not research.' },
    ],
    risk: 'Higher risk, higher potential reward',
    ask: 'How do stocks actually make money for me?',
  },
  {
    id: 'etfs', level: 'beginner', title: 'ETFs', line: 'A basket of many investments in one',
    sections: [
      { heading: 'What it is', text: 'An exchange-traded fund holds a collection of investments — hundreds or thousands of stocks or bonds — and you buy a slice of the whole basket in one purchase, on the stock exchange, like a single stock.' },
      { heading: 'Why people start here', text: 'Spreading money across many companies means one failure barely matters (diversification). An index ETF simply copies a market, like the S&P/TSX 60 or the S&P 500, instead of paying someone to pick stocks — so fees are low, often 0.05–0.25% a year.' },
      { heading: 'All-in-one ETFs', text: 'Some ETFs hold a complete portfolio — Canadian, US and international stocks, and often bonds — at a set mix, rebalanced for you. They’re usually labelled by risk, such as “growth” (mostly stocks) or “balanced” (more bonds). One fund can be an entire plan.' },
      { heading: 'Watch out for', text: 'An ETF is only as calm as what’s inside it: a stock ETF still drops when markets drop. Narrow or “leveraged” ETFs (one industry, or 2x daily moves) behave very differently from a broad index fund and aren’t a starting point.' },
      { heading: 'A good first step', text: 'Look up a broad index or all-in-one ETF in Pockit’s search, follow it for a few weeks, and read its fee (MER) and what it holds on the provider’s site.' },
    ],
    risk: 'Risk depends on what it holds — broad index ETFs spread it out',
    ask: 'What’s the difference between an ETF and a mutual fund?',
  },
  {
    id: 'bonds', level: 'beginner', title: 'Bonds', line: 'Lending money and getting paid interest',
    sections: [
      { heading: 'What it is', text: 'A bond is a loan you make to a government or company. They pay you interest on a schedule and return your money on a set date (maturity).' },
      { heading: 'How you make (or lose) money', text: 'Mostly through the interest. Bond prices also move: when interest rates rise, existing bonds paying less become worth less, and when rates fall they’re worth more. Longer bonds move more. If the borrower can’t pay, you can lose money — government of Canada bonds are about as safe as it gets; riskier companies pay more to make up for it.' },
      { heading: 'Why they matter', text: 'Bonds usually fall far less than stocks in a crash, and sometimes rise, so they steady a portfolio. Most people buy them through a bond ETF rather than one bond at a time.' },
      { heading: 'Watch out for', text: 'Bonds aren’t risk-free: in 2022, when rates jumped, many bond funds fell more than 10%. And returns after inflation can be low.' },
    ],
    risk: 'Lower risk than stocks, lower expected return',
    ask: 'Why do bond prices fall when interest rates rise?',
  },
  {
    id: 'gics', level: 'beginner', title: 'GICs & high-interest savings', line: 'Safe places for money you’ll need soon',
    sections: [
      { heading: 'What they are', text: 'A high-interest savings account pays interest and you can take money out any time. A GIC (Guaranteed Investment Certificate) locks your money for a set term — 1 to 5 years is common — for a guaranteed rate.' },
      { heading: 'When they make sense', text: 'For money you’ll need within a few years — an emergency fund, a house down payment, next year’s tuition — where losing even 10% would hurt. You won’t get stock-market growth, but you won’t get a stock-market drop either.' },
      { heading: 'In Canada', text: 'Deposits at member banks are protected by CDIC up to $100,000 per category per institution (credit unions have provincial coverage). Rates change with the Bank of Canada’s rate, so compare a few. Interest is taxed as income unless it’s held in a TFSA, RRSP or FHSA.' },
      { heading: 'Watch out for', text: 'Promotional rates that drop after a few months, and cashable vs non-redeemable GICs — locked ones pay more but you can’t get your money out early.' },
    ],
    risk: 'Very low risk — your money is protected',
    ask: 'Should my emergency fund be in a GIC or a savings account?',
  },
  {
    id: 'crypto', level: 'beginner', title: 'Crypto', line: 'Digital currencies like Bitcoin',
    sections: [
      { heading: 'What it is', text: 'Cryptocurrencies are digital tokens recorded on a shared public ledger (a blockchain) instead of by a bank. Bitcoin, the first, has a fixed maximum supply; Ethereum also runs programs (“smart contracts”). Thousands of others exist, and many have gone to zero.' },
      { heading: 'How you make (or lose) money', text: 'Almost entirely from the price changing — most crypto pays no interest or dividends and earns no profits. Prices swing far more than stocks: Bitcoin has fallen 70–80% more than once. Some people see it as digital gold; others as pure speculation. Both views have serious backers.' },
      { heading: 'In Canada', text: 'Buy only through platforms registered with Canadian regulators (CIRO / your provincial securities commission). You can also get Bitcoin or Ether through ETFs on the TSX, which fit inside a TFSA or RRSP. Selling at a profit is taxable — the CRA treats crypto as property, not currency.' },
      { heading: 'Watch out for', text: 'Scams: anyone promising guaranteed returns, “investment managers” met online, and fake exchanges. If you hold crypto yourself, a lost password means lost money — there’s no bank to call. A common rule of thumb is to keep it to a small slice you could afford to lose entirely.' },
    ],
    risk: 'Very high risk — prices can swing wildly',
    ask: 'Is crypto a good investment for a beginner?',
  },
  {
    id: 'accounts', level: 'beginner', title: 'TFSA, RRSP & FHSA', line: 'Canadian accounts that cut your taxes',
    sections: [
      { heading: 'The idea', text: 'These aren’t investments — they’re containers. You put investments (ETFs, GICs, stocks) inside them so the growth is sheltered from tax.' },
      { heading: 'TFSA', text: 'Tax-Free Savings Account. No deduction when you put money in, but growth and withdrawals are completely tax-free, and you can take money out any time (the room comes back the next year). Room builds every year from age 18 — the annual amount is set by the government ($7,000 in recent years); check your total room in CRA My Account. Over-contributing costs 1% a month.' },
      { heading: 'RRSP', text: 'Registered Retirement Savings Plan. Contributions lower your taxable income now (you get a refund), and you pay tax when you withdraw — ideally in retirement, at a lower rate. Room is 18% of last year’s earned income up to a yearly maximum; your Notice of Assessment shows yours.' },
      { heading: 'FHSA', text: 'First Home Savings Account, for first-time buyers. Up to $8,000 a year, $40,000 in total, deductible like an RRSP and tax-free when used to buy a first home. Unused room (up to $8,000) carries forward one year. If you never buy, it can move to an RRSP.' },
      { heading: 'Watch out for', text: 'A TFSA holding only cash earns very little — the account is the wrapper, you still need to choose what goes inside.' },
    ],
    risk: 'Not an investment — the account that holds one',
    ask: 'Should I start with a TFSA or an RRSP?',
  },
  {
    id: 'start', level: 'beginner', title: 'How to start', line: 'The first steps, in order',
    sections: [
      { heading: '1. Cover the basics first', text: 'Pay off high-interest debt (credit cards at 20%+ beat almost any investment return) and build an emergency fund of roughly 3–6 months of essentials in savings.' },
      { heading: '2. Pick the account', text: 'Usually a TFSA to start; an FHSA if a first home is likely; an RRSP once your income is higher. See the TFSA, RRSP & FHSA lesson.' },
      { heading: '3. Pick what goes inside', text: 'For money you won’t touch for 5+ years, many beginners use one low-fee all-in-one ETF matched to how much ups and downs they can stomach. For sooner money, a GIC or savings.' },
      { heading: '4. Automate it', text: 'Set an amount to go in every payday. Small and steady beats big and occasional, and it removes the temptation to time the market.' },
      { heading: '5. Leave it alone', text: 'Expect drops. Checking daily makes people sell at the worst moments. Review once or twice a year.' },
    ],
    risk: 'Starting small is low risk',
    ask: 'I have $100 a month — where do I start?',
  },
  {
    id: 'fees', level: 'intermediate', title: 'Fees and MERs', line: 'The quiet cost that compounds against you',
    sections: [
      { heading: 'What an MER is', text: 'The Management Expense Ratio is the yearly cost of a fund, taken out of its value — you never see a bill. A 2% MER on $50,000 is $1,000 a year, every year, rising as your balance grows.' },
      { heading: 'Why it matters so much', text: 'Fees compound like returns do, in reverse. On $10,000 a year for 30 years at a 6% return, a 0.2% fee leaves you around $770,000; a 2% fee around $560,000. Same investments, different costs.' },
      { heading: 'Typical costs in Canada', text: 'Broad index ETFs: roughly 0.05–0.25%. All-in-one ETFs: about 0.15–0.25%. Robo-advisors add a management fee of roughly 0.4–0.7%. Many bank and advisor mutual funds: 1.5–2.5%.' },
      { heading: 'Other costs', text: 'Trading commissions (many brokerages now charge none for ETFs), currency conversion on US purchases (often 1.5–2% each way), and bid-ask spreads on thinly traded funds.' },
    ],
    risk: 'Not a risk — a cost you control',
    ask: 'How much would a 2% fee cost me over 25 years?',
  },
  {
    id: 'allocation', level: 'intermediate', title: 'Asset allocation', line: 'How much in stocks vs bonds',
    sections: [
      { heading: 'What it is', text: 'Your mix — for example 80% stocks, 20% bonds. Research suggests this mix explains most of how bumpy your ride is, more than which particular funds you pick.' },
      { heading: 'Choosing a mix', text: 'Two questions: when do you need the money, and how would you act if your balance fell 30% in a few months? A long timeline and a steady nerve can handle more stocks; a short timeline or a likelihood of panic-selling calls for more bonds.' },
      { heading: 'Geography', text: 'Canada is about 3% of world stock markets. Many Canadian investors hold a home tilt (often around a quarter to a third in Canadian stocks) for tax and currency reasons, with the rest in US and international.' },
      { heading: 'The simple version', text: 'All-in-one ETFs come in fixed mixes — roughly 100/0, 80/20, 60/40, 40/60 — so choosing a mix and choosing a fund become the same decision.' },
    ],
    risk: 'Sets how bumpy the ride is',
    ask: 'How do I pick a stock and bond mix that suits me?',
  },
  {
    id: 'dca', level: 'intermediate', title: 'Investing regularly', line: 'Dollar-cost averaging, and why timing is hard',
    sections: [
      { heading: 'What it is', text: 'Investing a fixed amount on a schedule. When prices are low your money buys more units; when high, fewer. You never buy everything at a peak.' },
      { heading: 'Lump sum or a bit at a time?', text: 'If you already have a lump sum, studies find investing it all at once has historically come out ahead about two-thirds of the time, because markets rise more often than they fall. Spreading it out lowers regret if a crash follows. For most people investing from each paycheque, regular investing is simply what happens.' },
      { heading: 'Why timing is hard', text: 'Many of the market’s best days come within weeks of its worst. Sitting out to avoid drops usually means missing the rebounds.' },
    ],
    risk: 'Lowers the risk of bad timing',
    ask: 'Is it better to invest a lump sum or a bit each month?',
  },
  {
    id: 'rebalance', level: 'intermediate', title: 'Rebalancing', line: 'Keeping your mix on target',
    sections: [
      { heading: 'Why mixes drift', text: 'After a strong year for stocks, an 80/20 portfolio might sit at 86/14 — more risk than you chose.' },
      { heading: 'How to rebalance', text: 'Once or twice a year, or when any part drifts more than about 5 percentage points, sell some of what grew and buy what lagged. Easier still: aim new contributions at whatever is under target.' },
      { heading: 'In Canada', text: 'Inside a TFSA, RRSP or FHSA, selling has no tax cost. In a regular (non-registered) account, selling at a gain is taxable, so rebalancing with new money is gentler. All-in-one ETFs rebalance automatically.' },
    ],
    risk: 'Keeps your risk where you set it',
    ask: 'How often should I rebalance?',
  },
  {
    id: 'tax', level: 'intermediate', title: 'Which account first?', line: 'TFSA vs RRSP vs FHSA, in order',
    sections: [
      { heading: 'A common order', text: 'High-interest debt and an emergency fund first. Then an FHSA if a first home is a real possibility (deduction now, tax-free out for the home), then TFSA and RRSP depending on income.' },
      { heading: 'TFSA or RRSP?', text: 'The RRSP wins when your tax rate now is higher than it will be when you withdraw — typically higher earners. The TFSA wins when your income is lower now or you may need the money. Lower-income retirees should know RRSP withdrawals can reduce income-tested benefits like GIS; TFSA withdrawals don’t.' },
      { heading: 'Employer matching', text: 'If your employer matches group RRSP or pension contributions, take the full match first — it’s an instant return no investment can beat.' },
      { heading: 'Where to hold what', text: 'US-listed stocks and ETFs paying dividends lose 15% to US withholding tax in a TFSA but not in an RRSP. Interest income is taxed most heavily, so it’s best sheltered.' },
    ],
    risk: 'Gets you more of your own returns',
    ask: 'Should I put money in my TFSA or RRSP first?',
  },
];
