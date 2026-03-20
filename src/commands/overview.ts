// ── overview 命令 ─────────────────────────────────────────────
// 默认命令: 展示 Claude Code 使用概况

import chalk from "chalk";
import { parseClaudeSessions } from "../parsers/claude.js";
import {
  headerBox,
  sectionHeader,
  treeItem,
  formatBytes,
  formatTimeAgo,
  sortedEntries,
  insightBox,
} from "../ui/format.js";

export async function runOverview(options: { days: number }): Promise<void> {
  console.log(headerBox("VibeUsage", "Know your AI coding habits"));

  const data = await parseClaudeSessions(options.days);

  if (data.totalSessions === 0) {
    console.log(
      chalk.dim(
        "  No Claude Code sessions found in the last " +
          options.days +
          " days."
      )
    );
    console.log(
      chalk.dim("  Make sure you have Claude Code installed and have used it.")
    );
    console.log();
    return;
  }

  // ── Session Summary ──
  console.log(sectionHeader(`Claude Code (last ${options.days} days)`));
  console.log(
    treeItem("Sessions", chalk.bold(String(data.totalSessions)))
  );
  console.log(
    treeItem(
      "Messages",
      `${chalk.bold(String(data.totalUserMessages))} user / ${chalk.bold(String(data.totalAssistantMessages))} assistant`
    )
  );
  console.log(
    treeItem("Tool calls", chalk.bold(String(data.totalToolCalls)))
  );

  // Token 统计
  if (data.totalInputTokens > 0 || data.totalOutputTokens > 0) {
    const totalTokens = data.totalInputTokens + data.totalOutputTokens;
    console.log(
      treeItem(
        "Tokens",
        `${chalk.bold(formatNumber(totalTokens))} total (${formatNumber(data.totalInputTokens)} in / ${formatNumber(data.totalOutputTokens)} out)`
      )
    );
  }

  console.log(
    treeItem("Data scanned", formatBytes(data.totalBytes), true)
  );

  // ── Top Tools ──
  if (data.toolBreakdown.size > 0) {
    console.log(sectionHeader("Top Tools"));
    const topTools = sortedEntries(data.toolBreakdown, 8);
    const maxCount = topTools[0]?.[1] ?? 1;

    topTools.forEach(([tool, count], i) => {
      const barWidth = Math.max(1, Math.round((count / maxCount) * 15));
      const bar = chalk.cyan("█".repeat(barWidth));
      const isLast = i === topTools.length - 1;
      console.log(
        treeItem(
          tool.padEnd(12),
          `${bar} ${chalk.bold(String(count))}`,
          isLast
        )
      );
    });
  }

  // ── Top Projects ──
  if (data.projectBreakdown.size > 0) {
    console.log(sectionHeader("Active Projects"));
    const topProjects = sortedEntries(data.projectBreakdown, 5);
    topProjects.forEach(([project, count], i) => {
      // 还原目录名: -Users-foo-project → ~/project
      const displayName = restoreProjectPath(project);
      const isLast = i === topProjects.length - 1;
      console.log(
        treeItem(
          displayName.slice(0, 30).padEnd(30),
          `${chalk.bold(String(count))} sessions`,
          isLast
        )
      );
    });
  }

  // ── Recent Sessions ──
  const recentSessions = data.sessions.slice(0, 5);
  if (recentSessions.length > 0) {
    console.log(sectionHeader("Recent Sessions"));
    recentSessions.forEach((s, i) => {
      const title = s.customTitle ?? s.id.slice(0, 8);
      const project = restoreProjectPath(s.project);
      const ago = formatTimeAgo(s.lastTimestamp);
      const msgs = `${s.userMessages}u/${s.assistantMessages}a`;
      const isLast = i === recentSessions.length - 1;
      console.log(
        treeItem(
          `${chalk.white(title.slice(0, 20).padEnd(20))} ${chalk.dim(project.slice(0, 20))}`,
          `${msgs}  ${chalk.dim(ago)}`,
          isLast
        )
      );
    });
  }

  // ── Insight ──
  const insight = generateInsight(data);
  if (insight) console.log(insightBox(insight));

  console.log();
}

// ── Helpers ──

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function restoreProjectPath(encoded: string): string {
  // -Users-grluo-Documents-Magic-vibe-island → ~/vibe-island
  const parts = encoded.split("-").filter(Boolean);
  if (parts.length >= 2) {
    // 取最后 1-2 段作为显示名
    const tail = parts.slice(-2).join("/");
    return `~/${tail}`;
  }
  return encoded;
}

function generateInsight(data: ReturnType<typeof import("../parsers/claude.js").parseClaudeSessions> extends Promise<infer T> ? T : never): string | null {
  // 工具使用洞察
  const tools = sortedEntries(data.toolBreakdown);
  if (tools.length === 0) return null;

  const readCount = data.toolBreakdown.get("Read") ?? 0;
  const grepCount = data.toolBreakdown.get("Grep") ?? 0;
  const totalTools = data.totalToolCalls;

  if (totalTools > 0 && readCount / totalTools > 0.4) {
    return `${Math.round((readCount / totalTools) * 100)}% of your tool calls are file reads. Consider using Grep for targeted searches to save tokens.`;
  }

  if (totalTools > 20 && grepCount === 0) {
    return "You haven't used Grep at all. Targeted searches can significantly reduce token usage vs reading entire files.";
  }

  // 默认洞察
  if (data.totalSessions > 0) {
    const avgMsgs = Math.round(data.totalMessages / data.totalSessions);
    return `Average ${avgMsgs} messages per session across ${data.totalSessions} sessions.`;
  }

  return null;
}
