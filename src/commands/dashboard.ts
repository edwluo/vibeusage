// ── dashboard 命令 ───────────────────────────────────────────
// 一屏截图友好的终端面板
// Activity Heatmap + Sparkline + Cost 大字 + Model 分布

import chalk from "chalk";
import { parseClaudeSessions, type ClaudeSession } from "../parsers/claude.js";
import {
  estimateCost,
  formatUSD,
  modelDisplayName,
  type TokenBreakdown,
} from "../pricing.js";

// ── 常量 ──

// Sparkline 块（8 级高度）
const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

// 颜色：用 hex 绕过终端主题覆盖（ANSI green 常被改成白色）
const C = {
  green: chalk.hex("#26a641"),
  greenBright: chalk.hex("#39d353"),
  cyan: chalk.hex("#58a6ff"),
  cost: chalk.hex("#3fb950"),
  dimGreen: chalk.hex("#0e4429"),
};

// Heatmap 色阶（5 级，GitHub contribution 精确色值）
const HEAT_COLORS = [
  (s: string) => chalk.hex("#30363d")(s),   // 0: 无活动
  (s: string) => chalk.hex("#0e4429")(s),   // 1: 低
  (s: string) => chalk.hex("#006d32")(s),   // 2: 中
  (s: string) => chalk.hex("#26a641")(s),   // 3: 高
  (s: string) => chalk.hex("#39d353")(s),   // 4: 峰值
];

export async function runDashboard(options: {
  days: number;
}): Promise<void> {
  const data = await parseClaudeSessions(options.days);

  if (data.totalSessions === 0) {
    console.log(chalk.dim("  No sessions found."));
    return;
  }

  const width = Math.min(process.stdout.columns || 80, 90);

  // ── 计算费用 ──
  let totalCost = 0;
  const dailyCosts = new Map<string, number>();
  const dailySessions = new Map<string, number>();
  const modelTokens = new Map<
    string,
    { tokens: TokenBreakdown; messages: number }
  >();

  for (const s of data.sessions) {
    const model = primaryModel(s);
    const cost = estimateCost(model, {
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      cacheCreationTokens: s.cacheCreationTokens,
      cacheReadTokens: s.cacheReadTokens,
    }).total;
    totalCost += cost;

    // 日粒度
    const date = s.lastTimestamp ?? s.firstTimestamp;
    if (date) {
      const key = dateKey(date);
      dailyCosts.set(key, (dailyCosts.get(key) ?? 0) + cost);
      dailySessions.set(key, (dailySessions.get(key) ?? 0) + 1);
    }

    // 模型粒度
    if (model !== "unknown" && model !== "<synthetic>") {
      const existing = modelTokens.get(model) ?? {
        tokens: {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        },
        messages: 0,
      };
      existing.tokens.inputTokens += s.inputTokens;
      existing.tokens.outputTokens += s.outputTokens;
      existing.tokens.cacheCreationTokens += s.cacheCreationTokens;
      existing.tokens.cacheReadTokens += s.cacheReadTokens;
      existing.messages += s.assistantMessages;
      modelTokens.set(model, existing);
    }
  }

  // ── Header ──
  console.log();
  console.log(
    chalk.bold.cyan(
      center("⚡ VibeUsage Dashboard", width)
    )
  );
  console.log(chalk.dim(center(`Last ${options.days} days`, width)));
  console.log();

  // ── 核心指标（一行四列）──
  const metrics = [
    { label: "COST", value: chalk.bold(C.cost(formatUSD(totalCost))) },
    { label: "SESSIONS", value: chalk.bold.white(String(data.totalSessions)) },
    { label: "MESSAGES", value: chalk.bold.white(formatCompact(data.totalMessages)) },
    { label: "TOOLS", value: chalk.bold.white(formatCompact(data.totalToolCalls)) },
  ];
  const metricLine = metrics
    .map((m) => `${chalk.dim(m.label)} ${m.value}`)
    .join(chalk.dim("  │  "));
  console.log(`  ${metricLine}`);
  console.log(chalk.dim(`  ${"─".repeat(width - 4)}`));
  console.log();

  // ── Sparkline: 日费用趋势 ──
  const sortedDays = generateDateRange(options.days);
  const costValues = sortedDays.map((d) => dailyCosts.get(d) ?? 0);
  const sessionValues = sortedDays.map((d) => dailySessions.get(d) ?? 0);

  console.log(chalk.dim("  Cost Trend"));
  console.log(
    `  ${sparkline(costValues, C.green)}  ${chalk.dim("daily cost")}`
  );
  console.log(
    `  ${sparkline(sessionValues, C.cyan)}  ${chalk.dim("sessions")}`
  );

  // 日期标签（首尾 + 中间均匀分布）
  const labels = sortedDays.map((d) => d.slice(3)); // 取日
  const totalLen = labels.length;
  const labelPositions = new Set([0, Math.floor(totalLen / 4), Math.floor(totalLen / 2), Math.floor(totalLen * 3 / 4), totalLen - 1]);
  let labelLine = "  ";
  for (let i = 0; i < totalLen; i++) {
    labelLine += labelPositions.has(i) ? labels[i] : " ";
  }
  console.log(chalk.dim(labelLine));
  console.log();

  // ── Activity Heatmap (GitHub contribution 风格: 7 行 × N 周) ──
  console.log(chalk.dim("  Activity"));
  const grid = buildContributionGrid(sortedDays, dailySessions);
  for (const row of grid) {
    console.log(`  ${row}`);
  }
  // 色阶图例
  const legend = `     ${HEAT_COLORS[0]("■")} less ${HEAT_COLORS[1]("■")} ${HEAT_COLORS[2]("■")} ${HEAT_COLORS[3]("■")} ${HEAT_COLORS[4]("■")} more`;
  console.log(legend);
  console.log();

  // ── 模型分布 ──
  const models = [...modelTokens.entries()]
    .map(([model, { tokens, messages }]) => ({
      name: modelDisplayName(model),
      cost: estimateCost(model, tokens).total,
      messages,
    }))
    .sort((a, b) => b.cost - a.cost);

  if (models.length > 0) {
    console.log(chalk.dim("  Model Split"));
    const maxModelCost = models[0].cost;
    for (const m of models) {
      const pct =
        totalCost > 0 ? Math.round((m.cost / totalCost) * 100) : 0;
      const barW = Math.max(1, Math.round((m.cost / maxModelCost) * 20));
      const bar = C.green("█".repeat(barW));
      console.log(
        `  ${chalk.white(m.name.padEnd(8))} ${bar} ${chalk.bold(formatUSD(m.cost))} ${chalk.dim(`(${pct}%)  ${m.messages} msgs`)}`
      );
    }
    console.log();
  }

  // ── Top Tools (横向紧凑) ──
  const topTools = [...data.toolBreakdown.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (topTools.length > 0) {
    const maxTool = topTools[0][1];
    console.log(chalk.dim("  Top Tools"));
    for (const [tool, count] of topTools) {
      const barW = Math.max(1, Math.round((count / maxTool) * 15));
      const bar = C.cyan("█".repeat(barW));
      console.log(
        `  ${chalk.dim(tool.padEnd(10))} ${bar} ${chalk.bold(String(count))}`
      );
    }
    console.log();
  }

  // ── Footer ──
  console.log(
    chalk.dim(center("vibeusage.com · npx vusage", width))
  );
  console.log();
}

// ── Sparkline 渲染 ──

function sparkline(
  values: number[],
  color: (s: string) => string
): string {
  if (values.length === 0) return "";
  const max = Math.max(...values);
  if (max === 0) return chalk.dim(SPARK[0].repeat(values.length));

  return values
    .map((v) => {
      const level = Math.min(7, Math.floor((v / max) * 7.99));
      return v === 0 ? chalk.dim(SPARK[0]) : color(SPARK[level]);
    })
    .join("");
}

// ── Contribution Grid（7 行 × N 周，GitHub 风格）──

const DAY_LABELS = ["Mon", "   ", "Wed", "   ", "Fri", "   ", "Sun"];

function buildContributionGrid(
  dateRange: string[],
  dailySessions: Map<string, number>
): string[] {
  // 将日期映射到 (weekCol, dayRow) 网格
  const now = new Date();
  const values: number[] = dateRange.map(
    (d) => dailySessions.get(d) ?? 0
  );
  const max = Math.max(...values, 1);

  // 计算每天的星期几 (0=Mon, 6=Sun)
  type Cell = { value: number };
  const weeks: Cell[][] = []; // weeks[col][row]
  let currentWeek: Cell[] = [];

  for (let i = 0; i < dateRange.length; i++) {
    const [m, d] = dateRange[i].split("/").map(Number);
    const date = new Date(now.getFullYear(), m - 1, d);
    const dow = (date.getDay() + 6) % 7; // 0=Mon

    // 新的一周
    if (i === 0) {
      // 填充前面空白
      for (let j = 0; j < dow; j++) currentWeek.push({ value: -1 });
    } else if (dow === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }

    currentWeek.push({ value: values[i] });
  }
  if (currentWeek.length > 0) {
    // 填充尾部空白
    while (currentWeek.length < 7) currentWeek.push({ value: -1 });
    weeks.push(currentWeek);
  }

  // 渲染 7 行
  const rows: string[] = [];
  for (let row = 0; row < 7; row++) {
    let line = chalk.dim(DAY_LABELS[row]) + " ";
    for (let col = 0; col < weeks.length; col++) {
      const cell = weeks[col][row];
      if (!cell || cell.value < 0) {
        line += "  ";
      } else if (cell.value === 0) {
        line += HEAT_COLORS[0]("■") + " ";
      } else {
        const level = Math.min(4, Math.ceil((cell.value / max) * 4));
        line += HEAT_COLORS[level]("■") + " ";
      }
    }
    rows.push(line);
  }

  return rows;
}

// ── 日期范围 ──

function generateDateRange(days: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    result.push(dateKey(d));
  }
  return result;
}

function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}

// ── Helpers ──

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

function center(text: string, width: number): string {
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, Math.floor((width - stripped.length) / 2));
  return " ".repeat(pad) + text;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
