// ── cost 命令 ─────────────────────────────────────────────────
// 费用估算 + 模型拆分 + 日期聚合

import chalk from "chalk";
import { parseClaudeSessions, type ClaudeSession } from "../parsers/claude.js";
import {
  estimateCost,
  formatUSD,
  modelDisplayName,
  type TokenBreakdown,
} from "../pricing.js";
import {
  headerBox,
  sectionHeader,
  treeItem,
  sortedEntries,
} from "../ui/format.js";

type GroupBy = "day" | "week" | "none";

export async function runCost(options: {
  days: number;
  group: GroupBy;
}): Promise<void> {
  console.log(headerBox("VibeUsage", "Cost Estimate"));

  const data = await parseClaudeSessions(options.days);

  if (data.totalSessions === 0) {
    console.log(
      chalk.dim(`  No sessions found in the last ${options.days} days.`)
    );
    console.log();
    return;
  }

  // 按模型汇总费用（总费用 = 各模型之和，避免单一定价层偏差）
  const modelCosts = aggregateByModel(data.sessions);
  const totalAmount = modelCosts.reduce((sum, m) => sum + m.cost, 0);

  // 按类型汇总费用明细
  const costDetail = modelCosts.reduce(
    (acc, m) => {
      const c = estimateCost(m.model, m.tokens);
      acc.input += c.inputCost;
      acc.output += c.outputCost;
      acc.cacheRead += c.cacheReadCost;
      acc.cacheWrite += c.cacheWriteCost;
      return acc;
    },
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  );

  console.log(sectionHeader(`Estimated Cost (last ${options.days} days)`));
  console.log(
    treeItem("Total", `${chalk.bold.green(formatUSD(totalAmount))}  ${chalk.dim("(API-equivalent)")}`)
  );
  console.log(
    treeItem(
      "Breakdown",
      [
        `output ${formatUSD(costDetail.output)}`,
        `cache write ${formatUSD(costDetail.cacheWrite)}`,
        `cache read ${formatUSD(costDetail.cacheRead)}`,
        `input ${formatUSD(costDetail.input)}`,
      ].join(chalk.dim(" · ")),
      true
    )
  );

  // ── 模型拆分 ──
  if (modelCosts.length > 0) {
    console.log(sectionHeader("By Model"));
    const maxCost = modelCosts[0]?.cost ?? 1;

    modelCosts.forEach(({ model, cost, messages, tokens }, i) => {
      const barWidth = Math.max(1, Math.round((cost / maxCost) * 12));
      const bar = chalk.green("█".repeat(barWidth));
      const isLast = i === modelCosts.length - 1;
      const name = modelDisplayName(model).padEnd(10);
      const tokenStr = formatTokenCompact(tokens);
      console.log(
        treeItem(
          name,
          `${bar} ${chalk.bold(formatUSD(cost))}  ${chalk.dim(`${messages} msgs`)}  ${chalk.dim(tokenStr)}`,
          isLast
        )
      );
    });
  }

  // ── 日期聚合 ──
  if (options.group !== "none") {
    const grouped = groupByDate(data.sessions, options.group);
    if (grouped.length > 0) {
      const label = options.group === "day" ? "Daily" : "Weekly";
      console.log(sectionHeader(`${label} Breakdown`));

      const maxDayCost = Math.max(...grouped.map((g) => g.cost));

      grouped.forEach(({ label, cost, sessions }, i) => {
        const barWidth = Math.max(
          1,
          Math.round((cost / (maxDayCost || 1)) * 12)
        );
        const bar = chalk.green("█".repeat(barWidth));
        const isLast = i === grouped.length - 1;
        console.log(
          treeItem(
            label.padEnd(12),
            `${bar} ${chalk.bold(formatUSD(cost))}  ${chalk.dim(`${sessions} sessions`)}`,
            isLast
          )
        );
      });
    }
  }

  // ── Insight ──
  const insight = generateCostInsight(totalAmount, options.days, modelCosts);
  if (insight) {
    console.log(
      `\n  ${chalk.yellow("💡")} ${chalk.italic.yellow("Insight:")} ${chalk.italic(insight)}`
    );
  }

  console.log();
}

// ── 按模型汇总 ──

interface ModelCostEntry {
  model: string;
  cost: number;
  messages: number;
  tokens: TokenBreakdown;
}

function aggregateByModel(sessions: ClaudeSession[]): ModelCostEntry[] {
  const acc = new Map<string, { messages: number; tokens: TokenBreakdown }>();

  for (const s of sessions) {
    // 按主模型归类（session 内可能混合，取主模型）
    const primary = primaryModel(s);
    const existing = acc.get(primary) ?? {
      messages: 0,
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
    };

    existing.messages += s.assistantMessages;
    existing.tokens.inputTokens += s.inputTokens;
    existing.tokens.outputTokens += s.outputTokens;
    existing.tokens.cacheCreationTokens += s.cacheCreationTokens;
    existing.tokens.cacheReadTokens += s.cacheReadTokens;
    acc.set(primary, existing);
  }

  return [...acc.entries()]
    .map(([model, { messages, tokens }]) => ({
      model,
      cost: estimateCost(model, tokens).total,
      messages,
      tokens,
    }))
    .sort((a, b) => b.cost - a.cost);
}

function primaryModel(s: ClaudeSession): string {
  let best = "unknown";
  let bestCount = 0;
  for (const [model, count] of s.modelBreakdown) {
    if (count > bestCount) {
      best = model;
      bestCount = count;
    }
  }
  return best;
}

// ── 日期聚合 ──

interface DateGroup {
  label: string;
  cost: number;
  sessions: number;
}

function groupByDate(
  sessions: ClaudeSession[],
  mode: "day" | "week"
): DateGroup[] {
  const groups = new Map<string, { cost: number; sessions: number }>();

  for (const s of sessions) {
    const date = s.lastTimestamp ?? s.firstTimestamp;
    if (!date) continue;

    const key = mode === "day" ? dateKey(date) : weekKey(date);
    const cost = estimateCost(primaryModel(s), {
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      cacheCreationTokens: s.cacheCreationTokens,
      cacheReadTokens: s.cacheReadTokens,
    }).total;
    const existing = groups.get(key) ?? { cost: 0, sessions: 0 };
    existing.cost += cost;
    existing.sessions++;
    groups.set(key, existing);
  }

  return [...groups.entries()]
    .map(([label, { cost, sessions }]) => ({ label, cost, sessions }))
    .sort((a, b) => b.label.localeCompare(a.label)); // 最新在前
}

function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}

function weekKey(d: Date): string {
  // 周一为起始
  const day = new Date(d);
  const diff = (day.getDay() + 6) % 7; // 0=Mon
  day.setDate(day.getDate() - diff);
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const dd = String(day.getDate()).padStart(2, "0");
  return `W ${m}/${dd}`;
}

// ── Helpers ──

function formatTokenCompact(t: TokenBreakdown): string {
  const total =
    t.inputTokens + t.outputTokens + t.cacheCreationTokens + t.cacheReadTokens;
  if (total >= 1_000_000_000) return `${(total / 1_000_000_000).toFixed(1)}B tok`;
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M tok`;
  if (total >= 1_000) return `${(total / 1_000).toFixed(0)}K tok`;
  return `${total} tok`;
}

function generateCostInsight(
  totalCost: number,
  days: number,
  modelCosts: ModelCostEntry[]
): string | null {
  // 月度投射
  const dailyAvg = totalCost / days;
  const monthProjection = dailyAvg * 30;

  if (monthProjection > 200) {
    return `At this pace, ~${formatUSD(monthProjection)}/month. Max 20x ($200/mo) might make sense for you.`;
  }
  if (monthProjection > 100) {
    return `Projected ~${formatUSD(monthProjection)}/month. Max 5x ($100/mo) covers this usage level.`;
  }
  if (monthProjection > 20) {
    return `Projected ~${formatUSD(monthProjection)}/month. Pro plan ($20/mo) is good value at this level.`;
  }

  // Opus 占比提示
  const opusEntry = modelCosts.find((m) =>
    m.model.toLowerCase().includes("opus")
  );
  if (opusEntry && totalCost > 0) {
    const opusPct = Math.round((opusEntry.cost / totalCost) * 100);
    if (opusPct > 80) {
      return `${opusPct}% of cost is Opus. Switching routine tasks to Sonnet could save ~${formatUSD(opusEntry.cost * 0.8)}.`;
    }
  }

  return null;
}
