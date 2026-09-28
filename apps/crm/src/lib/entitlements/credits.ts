import { AI_CREDITS } from './config';

/**
 * Aritmetica de creditos de IA (pura). Los factores viven en `AI_CREDITS`.
 *
 *   weightedTokens = inputTokens + outputTokens * 4
 *   credits        = ceil(weightedTokens * providerMultiplier * modelMultiplier / 1000)
 *
 * 1000 tokens ponderados = 1 credito; se redondea hacia arriba POR INFERENCIA
 * (1001 → 2). Los multiplicadores valen 1 si el proveedor/modelo no esta
 * configurado.
 */
export function weightedTokens(input: { inputTokens: number; outputTokens: number }) {
  return Math.max(0, input.inputTokens) + Math.max(0, input.outputTokens) * AI_CREDITS.outputWeight;
}

export function providerMultiplier(provider?: string) {
  return provider ? AI_CREDITS.providerMultiplier[provider] ?? 1 : 1;
}

export function modelMultiplier(model?: string) {
  return model ? AI_CREDITS.modelMultiplier[model] ?? 1 : 1;
}

export function creditsFor(input: { inputTokens: number; outputTokens: number; provider?: string; model?: string }) {
  const weighted = weightedTokens(input);
  return Math.ceil((weighted * providerMultiplier(input.provider) * modelMultiplier(input.model)) / AI_CREDITS.tokensPerCredit);
}
