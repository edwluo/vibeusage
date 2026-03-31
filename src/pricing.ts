// ── 费用估算 ─────────────────────────────────────────────────
// Anthropic 公开定价 × 本地 token 统计 = 离线费用估算
// 价格单位: $/1M tokens

// ── 定价表 ──

interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const TIER_PRICING: Record<string, ModelPricing> = {
  opus: {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  sonnet: {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  haiku: {
    input: 0.8,
    output: 4,
    cacheRead: 0.08,
    cacheWrite: 1.0,
  },
};

// ── 模型 ID → 定价层 ──

function modelTier(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.includes("opus")) return "opus";
  if (id.includes("sonnet")) return "sonnet";
  if (id.includes("haiku")) return "haiku";
  return "sonnet"; // 未知模型按 Sonnet 估算
}

// ── 人类可读模型名 ──

export function modelDisplayName(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.includes("opus")) return "Opus";
  if (id.includes("sonnet")) return "Sonnet";
  if (id.includes("haiku")) return "Haiku";
  if (id === "<synthetic>" || id === "unknown") return modelId;
  return modelId;
}

// ── 费用计算 ──

export interface TokenBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  total: number;
}

export function estimateCost(
  model: string,
  tokens: TokenBreakdown
): CostBreakdown {
  const tier = modelTier(model);
  const pricing = TIER_PRICING[tier] ?? TIER_PRICING.sonnet;

  const perM = 1_000_000;
  const inputCost = (tokens.inputTokens / perM) * pricing.input;
  const outputCost = (tokens.outputTokens / perM) * pricing.output;
  const cacheReadCost = (tokens.cacheReadTokens / perM) * pricing.cacheRead;
  const cacheWriteCost =
    (tokens.cacheCreationTokens / perM) * pricing.cacheWrite;

  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    total: inputCost + outputCost + cacheReadCost + cacheWriteCost,
  };
}

// ── 格式化 ──

export function formatUSD(amount: number): string {
  if (amount < 0.01) return "<$0.01";
  if (amount < 1) return `$${amount.toFixed(2)}`;
  if (amount < 100) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(0)}`;
}
