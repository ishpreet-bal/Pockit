import { requireAuthApi } from '@/lib/auth/api';
import { WorkspaceRepo } from '@/lib/data/repository';
import {
  exportTransactionsCsv, exportCategoriesCsv, exportGoalsCsv, exportSummaryCsv,
} from '@/lib/export';
import { monthlySeries } from '@/lib/finance/ledger';
import { todayIn, startOfMonth, addMonths } from '@/lib/finance/period';
import { audit } from '@/lib/auth/session';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DATASETS = ['transactions', 'categories', 'goals', 'summary'] as const;
type Dataset = (typeof DATASETS)[number];

export async function GET(request: Request) {
  const ctx = await requireAuthApi();
  if ('response' in ctx) return ctx.response;

  const url = new URL(request.url);
  const dataset = (url.searchParams.get('dataset') ?? 'transactions') as Dataset;
  if (!DATASETS.includes(dataset)) {
    return NextResponse.json({ error: 'Unknown dataset' }, { status: 400 });
  }

  const repo = new WorkspaceRepo(ctx.user.id, ctx.workspace.id, ctx.workspace.baseCurrency);
  const cur = ctx.workspace.baseCurrency;
  const today = todayIn(ctx.user.timezone);

  let csv: string;
  switch (dataset) {
    case 'transactions': {
      const [txns, categories, accounts] = await Promise.all([
        repo.listTransactions(), repo.listCategories(), repo.listAccounts(),
      ]);
      csv = exportTransactionsCsv(txns, categories, accounts, cur);
      break;
    }
    case 'categories':
      csv = exportCategoriesCsv(await repo.listCategories());
      break;
    case 'goals': {
      const goals = await repo.listGoals();
      csv = exportGoalsCsv(goals.map((g) => ({
        name: g.name,
        target: BigInt(g.targetMinor as unknown as string),
        current: BigInt(g.currentMinor as unknown as string),
        targetDate: g.targetDate,
        status: g.status,
        currency: g.currency,
      })));
      break;
    }
    case 'summary': {
      const txns = await repo.listTransactions();
      const series = monthlySeries(txns, { start: startOfMonth(addMonths(today, -23)), end: today });
      csv = exportSummaryCsv(series, cur);
      break;
    }
  }

  await audit({
    actorUserId: ctx.user.id, workspaceId: ctx.workspace.id,
    action: 'data.export', entity: 'workspace', entityId: ctx.workspace.id,
    metadata: { dataset },
  });

  const filename = `pockit-${ctx.workspace.name.toLowerCase().replace(/\W+/g, '-')}-${dataset}-${today}.csv`;
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
