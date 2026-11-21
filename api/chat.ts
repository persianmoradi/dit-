import { SYSTEM_PROMPT } from "./system-prompt.ts";
import { validate } from "./validate.ts";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// openai/gpt-oss-120b is Groq's featured production model on the free tier; override with GROQ_MODEL
const model = () => process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b"; // trim: a stray space in .env breaks the model id

const LIMIT = 20;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

// shortcut: in-memory, resets per instance; use a shared store (e.g. Upstash) before real traffic
function limited(ip: string): boolean {
  const now = Date.now();
  for (const [k, v] of hits) {
    if (v[v.length - 1] <= now - WINDOW_MS) hits.delete(k); // prune idle IPs
  }
  const recent = (hits.get(ip) ?? []).filter((t) => t > now - WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}

const json = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

const MID_ERROR = "Oh no, I got a little sleepy and lost my words. Try again in a moment?";

export async function handler(req: Request): Promise<Response> {
  // cheap status probe so the page can show the no-key state on load; 200 either way to keep the console clean
  if (req.method === "GET") return Response.json({ ready: Boolean(process.env.GROQ_API_KEY) }, { headers: { "cache-control": "no-store" } });
  if (req.method !== "POST") return json(405, "method_not_allowed");

  // rate limit first so the endpoint can't be hammered, even without a key
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  if (limited(ip)) return json(429, "rate_limited");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, "bad_request");
  }
  const messages = validate(body);
  if (!messages) return json(400, "bad_request");

  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return json(503, "no_key");

  const ac = new AbortController();
  let upstream: Response;
  try {
    upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: model(),
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
        max_completion_tokens: 2048, // room for gpt-oss reasoning tokens + a short reply
      }),
      signal: ac.signal,
    });
  } catch (err) {
    console.error("chat upstream error", err instanceof Error ? err.message : err);
    return json(502, "upstream");
  }
  if (!upstream.ok || !upstream.body) {
    console.error("chat upstream status", upstream.status, await upstream.text().catch(() => ""));
    if (upstream.status === 429) return json(429, "busy");
    if (upstream.status === 401 || upstream.status === 403) return json(503, "no_key");
    return json(502, "upstream");
  }

  // Groq streams OpenAI-style SSE: "data: {json}" lines, text in choices[0].delta.content, ends with "data: [DONE]"
  const reader = upstream.body.pipeThrough(new TextDecoderStream()).getReader();
  const enc = new TextEncoder();
  const body$ = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = false;
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += value;
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const data = line.startsWith("data:") ? line.slice(5).trim() : "";
            if (!data || data === "[DONE]") continue;
            const text = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
            if (text) {
              controller.enqueue(enc.encode(text));
              sent = true;
            }
          }
        }
      } catch (err) {
        console.error("chat stream error", err instanceof Error ? err.message : err);
        controller.enqueue(enc.encode(sent ? ` ${MID_ERROR}` : MID_ERROR));
      } finally {
        controller.close();
      }
    },
    cancel() {
      ac.abort();
    },
  });

  return new Response(body$, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export default handler;
