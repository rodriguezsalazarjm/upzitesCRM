import type { CompleteInput, ModelProvider, ModelResponse } from './provider';

/** Deterministic demo driver using the same layered prompt and tools as OpenAI. */
export class LocalKnowledgeProvider implements ModelProvider {
  readonly name = 'local-fake';

  async complete(input: CompleteInput): Promise<ModelResponse> {
    const responses = input.messages.filter((message) => message.role === 'tool');
    const names = input.tools.map((tool) => tool.name);
    if (names.includes('getBusinessInfo') && !responses.some((response) => response.name === 'getBusinessInfo')) {
      return { text: null, toolCalls: [{ id: 'demo-global', name: 'getBusinessInfo', arguments: {} }], inputTokens: 0, outputTokens: 0 };
    }

    const productId = input.instructions.match(/ACTIVE_PRODUCT_ID=([^\s]+)/)?.[1];
    const productName = input.instructions.match(/\[PRODUCT FACTS\]\nNombre: ([^\n]+)/)?.[1];
    const price = input.instructions.match(/\[PRODUCT FACTS\][\s\S]*?\n[^\n]+: ((?:\$|US\$)[^\n]+)/)?.[1];
    const last = [...input.messages].reverse().find((message) => message.role === 'user')?.content ?? '';

    if (names.includes('createCheckoutLink') && productId && productName) {
      const checkout = responses.find((response) => response.name === 'createCheckoutLink');
      if (checkout) {
        const result = JSON.parse(checkout.content) as { ok: boolean; data?: { checkoutUrl: string; displayName: string; displayPrice: string }; error?: string };
        return { text: result.ok && result.data ? `Checkout: ${result.data.checkoutUrl}\n${result.data.displayName}: ${result.data.displayPrice}` : (result.error ?? 'No pude crear el checkout.'), toolCalls: [], inputTokens: 0, outputTokens: 0 };
      }
      if (/^(sí|si|confirmo|confirmar|quiero comprar|comprar)(\b|\s)/i.test(last.trim())) {
        return { text: null, toolCalls: [{ id: 'demo-checkout', name: 'createCheckoutLink', arguments: {} }], inputTokens: 0, outputTokens: 0 };
      }
    }

    const handoffRule = input.instructions.match(/\[HUMAN HANDOFF\]\n([^\[]+)/)?.[1] ?? '';
    if (handoffRule && /(negociar|contrato|cl[aá]usul)/i.test(last) && names.includes('assign_to_human')) {
      return { text: null, toolCalls: [{ id: 'demo-handoff', name: 'assign_to_human', arguments: { reason: handoffRule.trim() } }], inputTokens: 0, outputTokens: 0 };
    }
    const stopRule = input.instructions.match(/Cuándo detenerse: ([^\n]+)/)?.[1] ?? '';
    if (stopRule && /(no me interesa|no me contactes|no quiero)/i.test(last)) return { text: 'Entendido. No insistiré con esta oferta.', toolCalls: [], inputTokens: 0, outputTokens: 0 };
    const prohibited = input.instructions.match(/\[PROHIBITED CLAIMS\]\n([^\[]+)/)?.[1] ?? '';
    if (prohibited && /(promete|garantiza|duplicar)/i.test(last)) return { text: `No puedo hacer esa promesa. ${prohibited.trim()}`, toolCalls: [], inputTokens: 0, outputTokens: 0 };
    const guarantee = input.instructions.match(/\[GUARANTEE\]\n([^\[]+)/)?.[1] ?? '';
    if (/garant[ií]a/i.test(last) && /No configurada/i.test(guarantee)) return { text: 'No tengo una garantía configurada y no quiero inventar ese dato. Puedo pedir que una persona lo confirme.', toolCalls: [], inputTokens: 0, outputTokens: 0 };
    const objectionBlock = input.instructions.match(/\[OBJECTIONS\]\n([\s\S]*?)(?=\n\n\[|$)/)?.[1] ?? '';
    const objection = objectionBlock.match(/Objeción: ([^\n]+)\nRespuesta sugerida: ([^\n]+)/);
    if (objection && /(caro|precio|costoso)/i.test(last)) return { text: objection[2], toolCalls: [], inputTokens: 0, outputTokens: 0 };
    const faqBlock = input.instructions.match(/\[FAQ\]\n([\s\S]*?)(?=\n\n\[|$)/)?.[1] ?? '';
    const faq = faqBlock.match(/P: ([^\n]+)\nR: ([^\n]+)/);
    if (faq && last) return { text: faq[2], toolCalls: [], inputTokens: 0, outputTokens: 0 };
    if (productName) return { text: `${productName}${price ? ` cuesta ${price}` : ''}. ¿Te gustaría comprar?`, toolCalls: [], inputTokens: 0, outputTokens: 0 };
    return { text: 'Demostración local: recibí tu mensaje. Configura el entrenamiento comercial del producto para responder con ese contexto.', toolCalls: [], inputTokens: 0, outputTokens: 0 };
  }
}
