/**
 * Calculates estimated compute costs for Cloudflare Workers AI models.
 * Cloudflare Workers AI includes 10,000 free Neurons per day on all accounts.
 * Above the free allowance, Workers AI compute is billed at $0.011 per 1,000 Neurons.
 */

interface ModelPricing {
  neuronsPer1kTokens: number;
  costPer1MTokensUsd: number;
}

const WORKERS_AI_PRICING: Record<string, ModelPricing> = {
  // Flagship 70B Model (~220 Neurons per 1K tokens)
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': {
    neuronsPer1kTokens: 220,
    costPer1MTokensUsd: 0.0
  },
  // High efficiency 3B Model (~15 Neurons per 1K tokens)
  '@cf/meta/llama-3.2-3b-instruct': {
    neuronsPer1kTokens: 15,
    costPer1MTokensUsd: 0.0
  },
  // Fast 8B Model (~30 Neurons per 1K tokens)
  '@cf/meta/llama-3-8b-instruct': {
    neuronsPer1kTokens: 30,
    costPer1MTokensUsd: 0.0
  },
  // Text Embeddings (~10 Neurons per 1K tokens)
  '@cf/baai/bge-base-en-v1.5': {
    neuronsPer1kTokens: 10,
    costPer1MTokensUsd: 0.0
  }
};

/**
 * Returns estimated cost in USD for Workers AI inference.
 * Defaults to 0.0 USD within standard daily free allowance.
 */
export function estimateUsageCost(
  model: string,
  promptTokens: number = 0,
  completionTokens: number = 0
): number {
  const pricing = WORKERS_AI_PRICING[model] || { neuronsPer1kTokens: 30, costPer1MTokensUsd: 0.0 };
  const totalTokens = promptTokens + completionTokens;
  const cost = (totalTokens / 1_000_000) * pricing.costPer1MTokensUsd;
  return Number(cost.toFixed(7));
}

/**
 * Estimates Neurons consumed for Workers AI request quota monitoring.
 */
export function estimateNeurons(model: string, totalTokens: number = 0): number {
  const pricing = WORKERS_AI_PRICING[model] || { neuronsPer1kTokens: 30, costPer1MTokensUsd: 0.0 };
  return Math.ceil((totalTokens / 1_000) * pricing.neuronsPer1kTokens);
}
