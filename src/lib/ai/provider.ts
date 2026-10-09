/**
 * Model providers.
 *
 * Two are supported and both are bring-your-own:
 *
 *   Ollama  — fully local, no key, no data leaves the machine. The default,
 *             because a self-hosted analytics tool that phones a vendor for
 *             every question would undercut its entire premise.
 *
 *   OpenAI-compatible — any endpoint speaking /v1/chat/completions: OpenAI,
 *             Groq, Together, vLLM, LM Studio, llama.cpp. Set AI_BASE_URL and
 *             AI_API_KEY and it works unchanged.
 *
 * Honest expectation-setting, because this is where self-hosted AI tools usually
 * oversell: a small local model writes noticeably worse SQL than a frontier one.
 * A 7B model will need a retry or two where a large model would not. The agent
 * loop below is built to survive that rather than pretend it does not happen.
 */

export type Role = "system" | "user" | "assistant" | "tool";

export type Message = {
  role: Role;
  content: string;
  /** Set on assistant messages that requested tools. */
  toolCalls?: ToolCall[];
  /** Set on tool results. */
  toolCallId?: string;
  name?: string;
};

export type ToolCall = { id: string; name: string; arguments: Record<string, unknown> };

export type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "done"; reason: "stop" | "tool_calls" | "length" };

export type Provider = {
  name: string;
  chat(messages: Message[], tools: ToolDef[], signal?: AbortSignal): Promise<StreamChunk[]>;
};

function ollamaHost(): string {
  return (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");
}

export function aiConfigured(): boolean {
  // Ollama is assumed available locally; the OpenAI-compatible path needs a key.
  return Boolean(process.env.AI_API_KEY) || process.env.AI_PROVIDER === "ollama" || !process.env.AI_BASE_URL;
}

export function aiProviderName(): string {
  if (process.env.AI_PROVIDER === "ollama") return "ollama";
  if (process.env.AI_BASE_URL) return process.env.AI_MODEL || "openai-compatible";
  return "ollama";
}

function ollamaModel(): string {
  return process.env.AI_MODEL || "qwen2.5-coder:7b";
}

/** Ollama's /api/chat with tool support. */
export const ollama: Provider = {
  name: "ollama",
  async chat(messages, tools, signal) {
    const res = await fetch(`${ollamaHost()}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        model: ollamaModel(),
        stream: false,
        // qwen2.5-coder and llama3.1 both handle tools; older models ignore the
        // field and get the tool list in the system prompt instead, which the
        // agent below handles.
        tools,
        messages: messages.map(toOllamaMessage),
        options: { temperature: 0, num_ctx: 8192 },
      }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const json = (await res.json()) as {
      message?: { content?: string; tool_calls?: { function?: { name?: string; arguments?: unknown } }[] };
      done_reason?: string;
    };

    const chunks: StreamChunk[] = [];
    for (let i = 0; i < (json.message?.tool_calls?.length ?? 0); i++) {
      const tc = json.message!.tool_calls![i];
      let args: Record<string, unknown> = {};
      try {
        args = typeof tc.function?.arguments === "string"
          ? JSON.parse(tc.function.arguments)
          : ((tc.function?.arguments as Record<string, unknown>) ?? {});
      } catch {
        args = {};
      }
      chunks.push({
        type: "tool_call",
        call: { id: `call_${i}`, name: tc.function?.name ?? "query", arguments: args },
      });
    }
    if (json.message?.content) chunks.push({ type: "text", text: json.message.content });
    chunks.push({
      type: "done",
      reason: (json.message?.tool_calls?.length ?? 0) > 0 ? "tool_calls" : "stop",
    });
    return chunks;
  },
};

function toOllamaMessage(m: Message) {
  return {
    role: m.role === "tool" ? "tool" : m.role,
    content: m.content,
    ...(m.toolCalls
      ? {
          tool_calls: m.toolCalls.map((c) => ({
            function: { name: c.name, arguments: c.arguments },
          })),
        }
      : {}),
    ...(m.toolCallId ? { tool_name: m.name } : {}),
  };
}

/**
 * Anything OpenAI-compatible. The only shape that varies between providers is
 * whether tool arguments arrive as a JSON string or an object, so that is
 * normalised here rather than at every call site.
 */
export function openAiCompatible(baseUrl: string, apiKey: string): Provider {
  return {
    name: "openai-compatible",
    async chat(messages, tools, signal) {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        signal,
        body: JSON.stringify({
          model: process.env.AI_MODEL || "gpt-4o-mini",
          temperature: 0,
          stream: false,
          tools: tools.length
            ? [
                {
                  type: "function",
                  function: {
                    name: tools[0].name,
                    description: tools[0].description,
                    parameters: tools[0].parameters,
                  },
                },
                ...tools.slice(1).map((t) => ({
                  type: "function",
                  function: { name: t.name, description: t.description, parameters: t.parameters },
                })),
              ]
            : undefined,
          messages: messages.map((m) =>
            m.role === "tool"
              ? { role: "tool", tool_call_id: m.toolCallId, content: m.content }
              : m.role === "assistant" && m.toolCalls
                ? {
                    role: "assistant",
                    content: m.content || null,
                    tool_calls: m.toolCalls.map((c) => ({
                      id: c.id,
                      type: "function",
                      function: { name: c.name, arguments: JSON.stringify(c.arguments) },
                    })),
                  }
                : { role: m.role, content: m.content },
          ),
        }),
      });
      if (!res.ok) throw new Error(`model ${res.status}: ${(await res.text()).slice(0, 200)}`);

      const json = (await res.json()) as {
        choices?: {
          message?: {
            content?: string | null;
            tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
          };
          finish_reason?: string;
        }[];
      };
      const msg = json.choices?.[0]?.message;
      const chunks: StreamChunk[] = [];
      for (const tc of msg?.tool_calls ?? []) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function?.arguments ?? "{}");
        } catch {
          args = {};
        }
        chunks.push({
          type: "tool_call",
          call: { id: tc.id ?? `call_${chunks.length}`, name: tc.function?.name ?? "query", arguments: args },
        });
      }
      if (msg?.content) chunks.push({ type: "text", text: msg.content });
      chunks.push({
        type: "done",
        reason: (msg?.tool_calls?.length ?? 0) > 0 ? "tool_calls" : "stop",
      });
      return chunks;
    },
  };
}

export function getProvider(): Provider {
  if (process.env.AI_PROVIDER === "openai" || process.env.AI_BASE_URL) {
    if (!process.env.AI_BASE_URL) {
      throw new Error("AI_BASE_URL is required when AI_PROVIDER is not ollama");
    }
    return openAiCompatible(process.env.AI_BASE_URL, process.env.AI_API_KEY ?? "");
  }
  return ollama;
}