# VibeUsage

> Know your AI coding habits. Usage insights for Claude Code, Codex, and more.

**[vibeusage.com](https://vibeusage.com)** · **[npm](https://www.npmjs.com/package/vusage)**

**VibeUsage** analyzes your local AI coding session data and provides actionable insights — not just how much you've used, but how to use it smarter.

## Quick Start

```bash
npx vibeusage
```

No installation required. Works with Node.js 18+.

## Commands

### `vibeusage overview`

Shows your AI coding activity summary — sessions, messages, top tools, active projects.

```
╭──────────────────────────────────────────╮
│  VibeUsage — Know your AI coding habits  │
╰──────────────────────────────────────────╯

  Claude Code (last 7 days)
  ├── Sessions  42
  ├── Messages  1,205 user / 1,890 assistant
  ├── Tool calls  3,401
  └── Data scanned  128.5MB

  Top Tools
  ├── Read          █████████████░░ 892
  ├── Edit          ████████░░░░░░░ 634
  ├── Bash          ██████░░░░░░░░░ 521
  └── Grep          ████░░░░░░░░░░░ 389

  💡 Insight: 40% of your tool calls are file reads.
     Consider using Grep for targeted searches to save tokens.
```

### `vibeusage limits`

Shows your current rate limit status. Requires Claude Code login.

```
╭───────────────────────────╮
│  VibeUsage — Rate Limits  │
╰───────────────────────────╯

  5-Hour Window
  ├── Usage  ████████░░░░░░░░░░░░  42%
  └── Resets in  2h 14m

  7-Day Window
  ├── Overall  ██████░░░░░░░░░░░░░░  31%
  ├── Sonnet   ████░░░░░░░░░░░░░░░░  22%
  └── Resets in  143h 39m

  💡 Insight: Plenty of headroom. You're well within limits.
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-d, --days <n>` | Number of days to look back | 7 |

## How It Works

VibeUsage reads your **local** AI coding data. Nothing is uploaded or shared.

| Data Source | Location | What It Reads |
|-------------|----------|---------------|
| Claude Code sessions | `~/.claude/projects/` | JSONL conversation files |
| Rate limits | `~/.claude/.credentials.json` | OAuth token → Anthropic API |
| Codex sessions | `~/.codex/sessions/` | Rollout JSONL files (coming soon) |

## Privacy

- **100% local processing** — your data never leaves your machine
- **Read-only** — VibeUsage never modifies any files
- **No telemetry** — zero analytics, zero tracking
- **Open source** — audit the code yourself

## Roadmap

- [x] Claude Code session overview
- [x] Rate limit monitoring
- [ ] Tool usage breakdown (parse content blocks)
- [ ] Codex support
- [ ] Cursor support
- [ ] Usage insights engine (personalized optimization tips)
- [ ] Weekly digest (`vibeusage digest`)
- [ ] Gemini CLI support

## Related

- **[ccusage](https://github.com/ryoppippi/ccusage)** — Excellent tool for retrospective cost analysis. VibeUsage focuses on real-time monitoring and actionable insights.
- **[Vibe Island](https://vibeisland.app)** — macOS Notch panel for Claude Code, Codex, Gemini CLI. Real-time status, permission approval, terminal jump. By the same author.

## License

MIT
