import type { CompleteInput, ModelProvider, ModelResponse } from './provider';
/** Deterministic demo driver. Executes real registered tools; never calls a model API. */
export class LocalKnowledgeProvider implements ModelProvider {
  readonly name = 'local-fake';
  async complete(input: CompleteInput): Promise<ModelResponse> {
    const responses = input.messages.filter(m => m.role === 'tool');
    const names = input.tools.map(t => t.name);
    const pending = ['getBusinessInfo', 'searchKnowledge', 'getProducts', 'getServices'].filter(n => names.includes(n) && !responses.some(r => r.name === n));
    if (pending.length) return { text: null, toolCalls: pending.map((name, i) => ({ id: `demo-${responses.length}-${i}`, name, arguments: name === 'searchKnowledge' ? { query: '' } : {} })), inputTokens: 0, outputTokens: 0 };
    if (names.includes('createCheckoutLink')) {
      const productsResponse = responses.find(r => r.name === 'getProducts');
      const products = productsResponse ? JSON.parse(productsResponse.content).data : [];
      const product = Array.isArray(products) ? products.find((p: { productId: string }) => input.instructions.includes(p.productId)) : undefined;
      if (product) {
        const checkout = responses.find(r => r.name === 'createCheckoutLink');
        if (checkout) {
          const result = JSON.parse(checkout.content);
          return { text: result.ok ? `Checkout demo: ${result.data.checkoutUrl}\n${result.data.displayName}: ${result.data.displayPrice} ${result.data.currency}` : result.error, toolCalls: [], inputTokens: 0, outputTokens: 0 };
        }
        const last = [...input.messages].reverse().find(m => m.role === 'user')?.content ?? '';
        if (/^(sí|si|confirmo|confirmar)(\b|\s)/i.test(last.trim())) return { text: null, toolCalls: [{ id: 'demo-checkout', name: 'createCheckoutLink', arguments: { productId: product.productId } }], inputTokens: 0, outputTokens: 0 };
        return { text: `Demo: ${product.name}, 1 unidad, ${product.variants[0]?.priceClp} CLP. ¿Confirmas la compra? Responde «confirmo» para crear el enlace.`, toolCalls: [], inputTokens: 0, outputTokens: 0 };
      }
    }
    return { text: responses.length ? `Demostración local. Información consultada en este workspace:\n${responses.map(r => r.content).join('\n').slice(0, 3500)}` : 'Demostración local: recibí tu mensaje. Configura conocimiento y herramientas para consultar el negocio.', toolCalls: [], inputTokens: 0, outputTokens: 0 };
  }
}
