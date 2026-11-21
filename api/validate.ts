// Pure request-body validation for /api/chat (no SDK import so it is testable alone).
export type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_MESSAGES = 20;
const MAX_CONTENT = 800;
const MAX_TOTAL = 8000;

/** Returns trimmed messages, or null if the body is invalid. */
export function validate(body: unknown): ChatMessage[] | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_MESSAGES) return null;
  const out: ChatMessage[] = [];
  let total = 0;
  for (const m of raw) {
    if (typeof m !== "object" || m === null) return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string") return null;
    const text = content.trim();
    if (text.length < 1 || text.length > MAX_CONTENT) return null;
    total += text.length;
    out.push({ role, content: text });
  }
  if (total > MAX_TOTAL) return null;
  if (out[0].role !== "user" || out[out.length - 1].role !== "user") return null;
  return out;
}
