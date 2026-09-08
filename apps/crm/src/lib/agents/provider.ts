/**
 * Proveedor de modelo. El resto del sistema no habla con OpenAI: habla con esta
 * interfaz.
 *
 * Sirve para dos cosas: cambiar de proveedor sin tocar el runner, y probar los
 * guardrails con un modelo simulado y determinista. Verificar "no inventa
 * precios" contra un modelo real seria una prueba que a veces pasa; contra un
 * guion es una prueba que siempre significa lo mismo.
 */
export type ToolSpec = {
  name: string;
  description: string;
  /** JSON Schema de los argumentos. */
  parameters: Record<string, unknown>;
};

export type ModelMessage =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export type ModelToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ModelResponse = {
  text: string | null;
  toolCalls: ModelToolCall[];
  inputTokens: number;
  outputTokens: number;
  /** Identificador del proveedor, si lo entrega. Es auxiliar, no fuente de verdad. */
  externalId?: string;
};

export type CompleteInput = {
  model: string;
  instructions: string;
  messages: ModelMessage[];
  tools: ToolSpec[];
  maxOutputTokens?: number;
  options?: Record<string, unknown>;
};

export interface ModelProvider {
  readonly name: string;
  complete(input: CompleteInput): Promise<ModelResponse>;
}

export class ModelProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ModelProviderError';
  }
}

/** Costo por millon de tokens, en pesos chilenos. Aproximado y configurable. */
const COST_PER_MILLION_CLP: Record<string, { input: number; output: number }> = {
  default: { input: 200, output: 1600 },
};

export function estimateCostClp(model: string, inputTokens: number, outputTokens: number) {
  const rate = COST_PER_MILLION_CLP[model] ?? COST_PER_MILLION_CLP.default;
  return Math.round((inputTokens * rate.input + outputTokens * rate.output) / 1_000_000);
}

/**
 * Implementacion sobre la Responses API de OpenAI.
 *
 * La cuenta la opera UPZITES de forma central durante la beta (decision de la
 * spec): el token vive en el servidor y nunca se expone por workspace.
 */
export class OpenAIProvider implements ModelProvider {
  readonly name = 'openai';

  constructor(private readonly apiKey = process.env.OPENAI_API_KEY) {}

  static isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }

  async complete(input: CompleteInput): Promise<ModelResponse> {
    if (!this.apiKey) {
      throw new ModelProviderError('OPENAI_API_KEY no esta configurada.', false, 'NOT_CONFIGURED');
    }

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(process.env.OPENAI_PROJECT_ID ? { 'OpenAI-Project': process.env.OPENAI_PROJECT_ID } : {}),
        },
        body: JSON.stringify({
          model: input.model,
          instructions: input.instructions,
          input: toResponsesInput(input.messages),
          tools: input.tools.map((tool) => ({
            type: 'function',
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          })),
          max_output_tokens: input.maxOutputTokens ?? 800,
          ...(input.options ?? {}),
        }),
      });
    } catch (error) {
      throw new ModelProviderError(
        error instanceof Error ? error.message : 'error de red',
        true,
        'NETWORK',
      );
    }

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const error = (body.error ?? {}) as Record<string, unknown>;
      // 429 y 5xx son transitorios; el resto es un problema de la peticion.
      const retryable = response.status === 429 || response.status >= 500;
      throw new ModelProviderError(
        String(error.message ?? `HTTP ${response.status}`),
        retryable,
        String(error.code ?? response.status),
      );
    }

    return parseResponsesBody(body);
  }
}

/** Convierte los mensajes propios al formato de la Responses API. */
function toResponsesInput(messages: ModelMessage[]) {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        type: 'function_call_output',
        call_id: message.toolCallId,
        output: message.content,
      };
    }
    return { role: message.role, content: message.content };
  });
}

function parseResponsesBody(body: Record<string, unknown>): ModelResponse {
  const output = Array.isArray(body.output) ? body.output : [];
  const toolCalls: ModelToolCall[] = [];
  const textParts: string[] = [];

  for (const item of output as Record<string, unknown>[]) {
    if (item.type === 'function_call') {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(String(item.arguments ?? '{}'));
      } catch {
        // Argumentos ilegibles: se registra la llamada vacia para que el runner
        // devuelva un error al modelo en vez de romper la ejecucion.
        args = {};
      }
      toolCalls.push({
        id: String(item.call_id ?? item.id ?? ''),
        name: String(item.name ?? ''),
        arguments: args,
      });
    }

    if (item.type === 'message') {
      const content = Array.isArray(item.content) ? item.content : [];
      for (const part of content as Record<string, unknown>[]) {
        if (typeof part.text === 'string') textParts.push(part.text);
      }
    }
  }

  const usage = (body.usage ?? {}) as Record<string, unknown>;

  return {
    text: textParts.join('\n').trim() || null,
    toolCalls,
    inputTokens: Number(usage.input_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
    externalId: typeof body.id === 'string' ? body.id : undefined,
  };
}

/**
 * Proveedor guionado para pruebas y para el simulador.
 *
 * Recibe una lista de respuestas y las devuelve en orden. Permite verificar el
 * comportamiento del runner —limite de pasos, herramientas no autorizadas,
 * escalamiento— sin gastar tokens ni depender de la red.
 */
export class ScriptedProvider implements ModelProvider {
  readonly name = 'scripted';
  private index = 0;
  readonly calls: CompleteInput[] = [];

  constructor(private readonly script: Partial<ModelResponse>[]) {}

  async complete(input: CompleteInput): Promise<ModelResponse> {
    this.calls.push(input);
    const step = this.script[this.index] ?? {};
    this.index += 1;

    return {
      text: step.text ?? null,
      toolCalls: step.toolCalls ?? [],
      inputTokens: step.inputTokens ?? 100,
      outputTokens: step.outputTokens ?? 40,
    };
  }
}

export function defaultModel() {
  return process.env.OPENAI_DEFAULT_MODEL ?? 'gpt-5-mini';
}
