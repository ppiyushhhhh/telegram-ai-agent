/**
 * Calculates estimated API costs for OpenAI & Gemini models based on token usage.
 */

interface ModelPricing {
  promptCostPer1MTokens: number; // USD per 1,000,000 tokens
  completionCostPer1MTokens: number; // USD per 1,000,000 tokens
}

const PRICING_TABLE: Record<string, ModelPricing> = {
  // OpenAI Models
  'gpt-4o-mini': {
    promptCostPer1MTokens: 0.15,
    completionCostPer1MTokens: 0.60
  },
  'gpt-4o': {
    promptCostPer1MTokens: 2.50,
    completionCostPer1MTokens: 10.00
  },
  'gpt-4-turbo': {
    promptCostPer1MTokens: 10.00,
    completionCostPer1MTokens: 30.00
  },
  'gpt-3.5-turbo': {
    promptCostPer1MTokens: 0.50,
    completionCostPer1MTokens: 1.50
  },
  // Gemini Models
  'gemini-1.5-flash': {
    promptCostPer1MTokens: 0.075,
    completionCostPer1MTokens: 0.30
  },
  'gemini-1.5-pro': {
    promptCostPer1MTokens: 1.25,
    completionCostPer1MTokens: 5.00
  }
};

/**
 * Returns estimated cost in USD with high precision.
 */
export function estimateUsageCost(
  model: string,
  promptTokens: number = 0,
  completionTokens: number = 0
): number {
  const pricing = PRICING_TABLE[model] || PRICING_TABLE['gpt-4o-mini'];
  const promptCost = (promptTokens / 1_000_000) * pricing.promptCostPer1MTokens;
  const completionCost = (completionTokens / 1_000_000) * pricing.completionCostPer1MTokens;
  return Number((promptCost + completionCost).toFixed(7));
}
