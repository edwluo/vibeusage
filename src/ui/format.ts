// ── Terminal UI 格式化 ────────────────────────────────────────
// 进度条、颜色、布局、品牌元素

import chalk from "chalk";

// ── Brand ──

export const BRAND = {
  name: "VibeUsage",
  tagline: "Know your AI coding habits",
  version: "0.1.0",
};

// ── Progress Bar ──

export function progressBar(
  percent: number,
  width: number = 20,
  label?: string
): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;

  const bar = "█".repeat(filled) + "░".repeat(empty);

  // 颜色: 绿(<50) → 黄(50-80) → 红(>80)
  const coloredBar =
    clamped > 80
      ? chalk.red(bar)
      : clamped > 50
        ? chalk.yellow(bar)
        : chalk.green(bar);

  const pctStr = chalk.bold(`${Math.round(clamped)}%`);
  const suffix = label ? `  ${chalk.dim(label)}` : "";

  return `${coloredBar}  ${pctStr}${suffix}`;
}

// ── Time Formatting ──

export function formatTimeUntil(target: Date | null): string {
  if (!target) return chalk.dim("unknown");

  const now = Date.now();
  const diff = target.getTime() - now;

  if (diff <= 0) return chalk.green("reset!");

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatTimeAgo(date: Date | null): string {
  if (!date) return chalk.dim("unknown");

  const now = Date.now();
  const diff = now - date.getTime();

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ── Size Formatting ──

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── Box Drawing ──

export function headerBox(title: string, subtitle?: string): string {
  const inner = subtitle ? `${title} — ${subtitle}` : title;
  const width = inner.length + 4;
  const top = `╭${"─".repeat(width)}╮`;
  const mid = `│  ${inner}  │`;
  const bot = `╰${"─".repeat(width)}╯`;

  return [
    "",
    chalk.cyan(top),
    chalk.cyan(mid),
    chalk.cyan(bot),
    "",
  ].join("\n");
}

export function sectionHeader(title: string): string {
  return `\n  ${chalk.bold.white(title)}`;
}

export function treeItem(
  label: string,
  value: string,
  last: boolean = false
): string {
  const prefix = last ? "└──" : "├──";
  return `  ${chalk.dim(prefix)} ${chalk.dim(label)}  ${value}`;
}

export function insightBox(text: string): string {
  return [
    "",
    `  ${chalk.yellow("💡")} ${chalk.italic.yellow("Insight:")} ${chalk.italic(text)}`,
  ].join("\n");
}

// ── Table ──

export function sortedEntries(
  map: Map<string, number>,
  limit: number = 10
): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}
