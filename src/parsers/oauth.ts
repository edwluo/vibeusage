// ── OAuth + Usage API ─────────────────────────────────────────
// 读取 Claude Code OAuth 凭证, 查询 usage API
// 三层降级: credentials.json → Keychain → 返回 null

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";

// ── Types ──

export interface UsageTier {
  utilization: number; // 0-100
  resetsAt: Date | null;
}

export interface ExtraUsage {
  isEnabled: boolean;
  spend: number;
  limit: number;
}

export interface UsageData {
  fiveHour: UsageTier;
  sevenDay: UsageTier;
  sevenDayOpus: UsageTier | null;
  sevenDaySonnet: UsageTier | null;
  extraUsage: ExtraUsage | null;
  fetchedAt: Date;
}

// ── Credential Reading ──

const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const USAGE_API = "https://api.anthropic.com/api/oauth/usage";

async function readCredentialsFile(): Promise<string | null> {
  try {
    const raw = await readFile(CREDENTIALS_PATH, "utf-8");
    const data = JSON.parse(raw);

    // 新格式: {claudeAiOauth: {accessToken, expiresAt}}
    if (data.claudeAiOauth?.accessToken) {
      const expiry = new Date(data.claudeAiOauth.expiresAt);
      if (expiry > new Date()) return data.claudeAiOauth.accessToken;
    }

    // 旧格式: {accessToken, expiresAt}
    if (data.accessToken) {
      if (data.expiresAt) {
        const expiry = new Date(data.expiresAt);
        if (expiry > new Date()) return data.accessToken;
      }
      return data.accessToken;
    }

    return null;
  } catch {
    return null;
  }
}

async function readKeychainToken(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "/usr/bin/security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(null);
          return;
        }

        try {
          const data = JSON.parse(stdout.trim());
          if (data.claudeAiOauth?.accessToken) {
            resolve(data.claudeAiOauth.accessToken);
          } else if (data.accessToken) {
            resolve(data.accessToken);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      }
    );
  });
}

async function getAccessToken(): Promise<string | null> {
  // Layer 1: credentials.json
  const fileToken = await readCredentialsFile();
  if (fileToken) return fileToken;

  // Layer 2: Keychain (macOS only)
  if (process.platform === "darwin") {
    const keychainToken = await readKeychainToken();
    if (keychainToken) return keychainToken;
  }

  return null;
}

// ── Usage API ──

export async function fetchUsage(): Promise<UsageData | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(USAGE_API, {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    const data = await res.json();

    return {
      fiveHour: parseTier(data.five_hour),
      sevenDay: parseTier(data.seven_day),
      sevenDayOpus: data.seven_day_opus ? parseTier(data.seven_day_opus) : null,
      sevenDaySonnet: data.seven_day_sonnet
        ? parseTier(data.seven_day_sonnet)
        : null,
      extraUsage: data.extra_usage
        ? {
            isEnabled: data.extra_usage.is_enabled ?? false,
            spend: data.extra_usage.spend ?? 0,
            limit: data.extra_usage.limit ?? 0,
          }
        : null,
      fetchedAt: new Date(),
    };
  } catch {
    return null;
  }
}

function parseTier(raw: Record<string, unknown>): UsageTier {
  const utilization =
    typeof raw.utilization === "number"
      ? raw.utilization
      : typeof raw.used_percentage === "number"
        ? raw.used_percentage
        : 0;

  let resetsAt: Date | null = null;
  if (raw.resets_at) {
    if (typeof raw.resets_at === "string") {
      resetsAt = new Date(raw.resets_at);
    } else if (typeof raw.resets_at === "number") {
      resetsAt = new Date(raw.resets_at * 1000);
    }
  }

  return { utilization, resetsAt };
}
