import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Card, Screen } from '@/components/ui';
import { Button } from '@/components/form';
import { space, type, useColors } from '@/theme/tokens';

/**
 * "Want to learn about investing?"
 *
 * A short menu of the main things people invest in. Nothing is explained until
 * someone taps a topic — then it's three plain sentences, a sense of the risk,
 * and a way to ask the tutor anything else. Curiosity-led, not a lecture.
 */
const TOPICS = [
  {
    id: 'stocks', emoji: '🏢', title: 'Stocks', line: 'Owning a small piece of a company',
    points: [
      'A share is a tiny slice of a company like Apple or Shopify. If the company grows, your slice can be worth more.',
      'Prices go up and down every day — sometimes a lot. Over many years, the stock market as a whole has tended to rise, but single companies can also fail.',
      'Some companies pay you a share of their profits, called a dividend.',
    ],
    risk: 'Higher risk, higher potential reward',
    ask: 'How do stocks actually make money for me?',
  },
  {
    id: 'etfs', emoji: '🧺', title: 'ETFs', line: 'A basket of many investments in one',
    points: [
      'An ETF (exchange-traded fund) holds lots of stocks or bonds at once — sometimes hundreds — so you’re not betting on one company.',
      'Many track an index, like the S&P 500 (the 500 biggest US companies). Examples popular in Canada: XEQT, VFV.',
      'They usually have low yearly fees, which matters a lot over time.',
    ],
    risk: 'Spread-out risk — a common way to start',
    ask: 'Why do people say ETFs are good for beginners?',
  },
  {
    id: 'bonds', emoji: '📜', title: 'Bonds', line: 'Lending money and getting paid interest',
    points: [
      'When you buy a bond you lend money to a government or company. They pay you interest and give the money back on a set date.',
      'Bonds usually move less than stocks, so people use them to make a portfolio steadier.',
      'The trade-off: lower growth over the long run.',
    ],
    risk: 'Lower risk, lower reward',
    ask: 'When would someone choose bonds over stocks?',
  },
  {
    id: 'gics', emoji: '🔒', title: 'GICs & high-interest savings', line: 'Safe places for money you’ll need soon',
    points: [
      'A GIC locks your money for a set time (like 1 year) at a guaranteed interest rate. You can’t lose what you put in.',
      'A high-interest savings account pays interest and lets you take money out any time.',
      'Good for an emergency fund or money you’ll need within a couple of years.',
    ],
    risk: 'Very low risk',
    ask: 'Should my emergency fund be in a GIC or savings account?',
  },
  {
    id: 'crypto', emoji: '🪙', title: 'Crypto', line: 'Digital currencies like Bitcoin',
    points: [
      'Crypto is digital money that isn’t run by a bank or government. Bitcoin and Ethereum are the best known.',
      'Prices can rise or fall 50% or more in months. Nothing backs it the way profits back a stock.',
      'If someone invests in it at all, a common rule is only a small amount they could afford to lose.',
    ],
    risk: 'Very high risk',
    ask: 'Why is crypto so risky?',
  },
  {
    id: 'accounts', emoji: '🇨🇦', title: 'TFSA, RRSP & FHSA', line: 'Canadian accounts that cut your taxes',
    points: [
      'These aren’t investments themselves — they’re accounts you hold investments in, with tax benefits.',
      'TFSA: growth is tax-free and you can take money out any time. RRSP: lowers your taxes now, taxed when you take it out in retirement.',
      'FHSA: for a first home — you get a tax break putting money in and taking it out for the purchase.',
    ],
    risk: 'Depends on what you hold inside',
    ask: 'TFSA or RRSP — which should I start with?',
  },
  {
    id: 'start', emoji: '🌱', title: 'How to start', line: 'The first steps, in order',
    points: [
      'First: an emergency fund (a few months of costs) and no high-interest credit card debt.',
      'Then: a small, regular amount — even $50 a month — into a low-fee, spread-out fund, ideally inside a TFSA.',
      'Time matters more than timing: starting early and staying steady beats trying to guess the market.',
    ],
    risk: 'Start small, stay steady',
    ask: 'How would I start investing with $100 a month?',
  },
];

export default function Learn() {
  const c = useColors();
  const a = c.section.invest;
  const [open, setOpen] = useState<string | null>(null);

  const askTutor = (question?: string) =>
    router.push({ pathname: '/pock', params: { mode: 'learn', ...(question ? { q: question } : {}) } });

  return (
    <Screen section="invest" title="Learn to invest" back>
      <Text style={[type.body, { color: c.textMuted, lineHeight: 23, marginBottom: space.xl }]}>
        Tap anything you’re curious about. Each one is a quick, plain explanation — no jargon, and nothing to buy.
      </Text>
      <View style={{ gap: 10 }}>
        {TOPICS.map((t) => {
          const isOpen = open === t.id;
          return (
            <Card key={t.id} style={{ padding: 0 }}>
              <Pressable onPress={() => { void Haptics.selectionAsync(); setOpen(isOpen ? null : t.id); }} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg }}>
                <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22 }}>{t.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.headline, { color: c.text }]}>{t.title}</Text>
                  <Text style={[type.footnote, { color: c.textMuted }]}>{t.line}</Text>
                </View>
                <Text style={[type.title3, { color: c.textSubtle }]}>{isOpen ? '−' : '+'}</Text>
              </Pressable>
              {isOpen ? (
                <Animated.View entering={FadeIn.duration(220)} style={{ paddingBottom: space.lg, gap: 10 }}>
                  {t.points.map((p) => (
                    <View key={p} style={{ flexDirection: 'row', gap: 8 }}>
                      <Text style={{ color: a.accent }}>•</Text>
                      <Text style={[type.subhead, { color: c.text, flex: 1, lineHeight: 21 }]}>{p}</Text>
                    </View>
                  ))}
                  <Text style={[type.caption, { color: a.accent, marginTop: 4 }]}>RISK: {t.risk.toUpperCase()}</Text>
                  <Pressable onPress={() => askTutor(t.ask)} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                    <Text style={[type.subhead, { color: a.accent }]}>Ask: “{t.ask}” →</Text>
                  </Pressable>
                </Animated.View>
              ) : null}
            </Card>
          );
        })}
      </View>
      <View style={{ marginTop: space.xl }}>
        <Button label="Ask the investing tutor anything" accent={a.accent} onPress={() => askTutor()} />
      </View>
      <Text style={[type.caption, { color: c.textSubtle, marginTop: space.lg, textAlign: 'center' }]}>For learning only — not financial advice.</Text>
    </Screen>
  );
}
