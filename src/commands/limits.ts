// ── limits 命令 ───────────────────────────────────────────────
// 查询 Claude Code 当前限流状态

import chalk from "chalk";
import { fetchUsage, type UsageData } from "../parsers/oauth.js";
import {
  headerBox,
  sectionHeader,
  treeItem,
  progressBar,
  formatTimeUntil,
  insightBox,
} from "../ui/format.js";

export async function runLimits(): Promise<void> {
  console.log(headerBox("VibeUsage", "Rate Limits"));

  console.log(chalk.dim("  Fetching usage data..."));

  const usage = await fetchUsage();

  if (!usage) {
    console.log();
    console.log(
      chalk.yellow("  Could not fetch usage data. Possible reasons:")
    );
    console.log(chalk.dim("  ├── No OAuth token found in ~/.claude/.credentials.json"));
    console.log(chalk.dim("  ├── Token expired (re-login to Claude Code)"));
    console.log(chalk.dim("  └── API rate limited (try again in a minute)"));
    console.log();
    console.log(
      chalk.dim("  Tip: Make sure you're logged into Claude Code (claude login)")
    );
    console.log();
    return;
  }

  // 清除 "Fetching" 行 (移到上一行并清除)
  process.stdout.write("\x1b[1A\x1b[2K");

  // ── 5 Hour Window ──
  console.log(sectionHeader("5-Hour Window"));
  console.log(
    treeItem(
      "Usage",
      progressBar(usage.fiveHour.utilization, 20)
    )
  );
  console.log(
    treeItem(
      "Resets in",
      formatTimeUntil(usage.fiveHour.resetsAt),
      true
    )
  );

  // ── 7 Day Window ──
  console.log(sectionHeader("7-Day Window"));
  console.log(
    treeItem(
      "Overall",
      progressBar(usage.sevenDay.utilization, 20)
    )
  );

  if (usage.sevenDayOpus) {
    console.log(
      treeItem(
        "Opus",
        progressBar(usage.sevenDayOpus.utilization, 20, "opus")
      )
    );
  }

  if (usage.sevenDaySonnet) {
    console.log(
      treeItem(
        "Sonnet",
        progressBar(usage.sevenDaySonnet.utilization, 20, "sonnet")
      )
    );
  }

  console.log(
    treeItem(
      "Resets in",
      formatTimeUntil(usage.sevenDay.resetsAt),
      true
    )
  );

  // ── Extra Usage ──
  if (usage.extraUsage?.isEnabled) {
    console.log(sectionHeader("Extra Usage (Pay-as-you-go)"));
    const spendPct =
      usage.extraUsage.limit > 0
        ? (usage.extraUsage.spend / usage.extraUsage.limit) * 100
        : 0;
    console.log(
      treeItem(
        "Spend",
        `$${usage.extraUsage.spend.toFixed(2)} / $${usage.extraUsage.limit.toFixed(2)}`
      )
    );
    console.log(
      treeItem("Budget", progressBar(spendPct, 20), true)
    );
  }

  // ── Insight ──
  const insight = generateLimitsInsight(usage);
  if (insight) console.log(insightBox(insight));

  console.log();
}

function generateLimitsInsight(usage: UsageData): string | null {
  const fiveHour = usage.fiveHour.utilization;
  const sevenDay = usage.sevenDay.utilization;

  if (fiveHour > 90) {
    const resetTime = formatTimeUntil(usage.fiveHour.resetsAt);
    return `You're at ${Math.round(fiveHour)}% of your 5-hour limit. Consider taking a break — resets in ${resetTime}.`;
  }

  if (sevenDay > 80) {
    return `Weekly usage at ${Math.round(sevenDay)}%. Consider batching your prompts and using CLAUDE.md to reduce context-building tokens.`;
  }

  if (fiveHour > 50 && sevenDay < 30) {
    return `High burst, low weekly — you're using Claude intensively but infrequently. Your weekly budget has plenty of room.`;
  }

  if (fiveHour < 20 && sevenDay < 20) {
    return `Plenty of headroom. You're well within limits on both windows.`;
  }

  return null;
}
