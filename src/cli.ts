#!/usr/bin/env node

// ── VibeUsage CLI ─────────────────────────────────────────────
// Know your AI coding habits.
// https://vibeusage.com

import { Command } from "commander";
import { runOverview } from "./commands/overview.js";
import { runLimits } from "./commands/limits.js";

const program = new Command();

program
  .name("vibeusage")
  .description("Know your AI coding habits. Usage insights for Claude Code, Codex, and more.")
  .version("0.1.0");

// ── 默认命令: overview ──
program
  .command("overview", { isDefault: true })
  .description("Show usage overview for recent sessions")
  .option("-d, --days <number>", "Number of days to look back", "7")
  .action(async (options) => {
    const days = parseInt(options.days, 10) || 7;
    await runOverview({ days });
  });

// ── limits 命令 ──
program
  .command("limits")
  .description("Show current rate limit status (requires Claude Code login)")
  .action(async () => {
    await runLimits();
  });

program.parse();
