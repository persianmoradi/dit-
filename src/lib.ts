/** 0..1 progress of an element through the viewport: starts when its top reaches 75% of the viewport, ends when its bottom reaches 50%. */
export function scrollProgress(top: number, height: number, vh: number) {
  const p = (vh * 0.75 - top) / Math.max(1, height + vh * 0.25);
  return Math.min(1, Math.max(0, p));
}

export const MILESTONES = [10, 50, 100] as const;
/** Label for the BOOP stamp when the counter lands exactly on a milestone. */
export const stampFor = (n: number) => ((MILESTONES as readonly number[]).includes(n) ? `×${n}` : null);

/** Remove `[trick:x]` tags (and a half-typed one at the end while streaming); returns the clean text and the last complete tag id. */
export function stripTrick(raw: string) {
  let trick: string | null = null;
  let text = raw.replace(/\[trick:([a-z]*)\]/gi, (_, id: string) => ((trick = id.toLowerCase()), ""));
  const at = text.lastIndexOf("[");
  if (at >= 0 && !text.includes("]", at)) {
    const tail = text.slice(at).toLowerCase();
    if ("[trick:".startsWith(tail) || tail.startsWith("[trick:")) text = text.slice(0, at);
  }
  return { text: onlyBearEmoji(text).replace(/[ \t]+$/, ""), trick };
}

// one emoji incl. skin tones, variation selectors and ZWJ sequences (flags via regional indicators)
const EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|[\u{1F3FB}-\u{1F3FF}]|‍\p{Extended_Pictographic})*️?/gu;
const tidy = (s: string) => s.replace(/ {2,}/g, " ").replace(/ +([.,!?])/g, "$1");
/** Ditó may only use the teddy 🧸 emoji; drop any other the model slips in. */
export const onlyBearEmoji = (s: string) => tidy(s.replace(EMOJI, (e) => (e === "🧸" ? e : "")));
/** Text for read-aloud: no emoji at all, so the voice never says "teddy bear" or "star". */
export const speakable = (s: string) => tidy(s.replace(EMOJI, "")).trim();

export type Msg = { role: "user" | "assistant"; content: string; error?: boolean };

/** What the API accepts: last 20 real messages, starting with a user turn (greeting and error bubbles never go out). */
export function chatPayload(msgs: Msg[]) {
  const real = msgs.filter((m) => !m.error && m.content.trim()).slice(-20);
  const out = real.map(({ role, content }) => ({ role, content: content.trim().slice(0, 800) }));
  // the server caps the whole conversation at 8000 chars: forget the oldest turns first
  let total = out.reduce((n, m) => n + m.content.length, 0);
  while (out.length > 1 && (total > 8000 || out[0].role !== "user")) total -= out.shift()!.content.length;
  return out;
}

/** Index of the schedule row whose slot contains `hour` (0..24, fractional ok): the latest start <= hour, wrapping to the latest start overall. Order of `starts` doesn't matter. */
export function slotAt(starts: readonly number[], hour: number) {
  let best = -1;
  starts.forEach((s, i) => s <= hour && (best < 0 || s > starts[best]) && (best = i));
  if (best >= 0) return best;
  return starts.reduce((b, s, i) => (s > starts[b] ? i : b), 0);
}

/** In-character replies while the chat key is missing: rotate, never hit the network. */
export const NOKEY_LINES = [
  "Mmm, my voice isn’t connected yet. Wave at me instead?",
  "*yawn* I can’t answer yet. Try a trick!",
  "My words are still on the way. Poke my nose?",
] as const;
export const noKeyLine = (n: number) => NOKEY_LINES[((n % NOKEY_LINES.length) + NOKEY_LINES.length) % NOKEY_LINES.length];

/** Split a reply into words for the bubble; `*stage directions*` come back with em=true and without the asterisks (an unclosed one while streaming counts too). */
export function splitWords(text: string) {
  const out: { w: string; em: boolean }[] = [];
  let em = false;
  for (const tok of text.split(/\s+/)) {
    if (!tok) continue;
    const opens = tok.startsWith("*");
    const closes = tok.length > 1 && tok.endsWith("*");
    if (opens) em = true;
    const w = tok.replace(/\*/g, "");
    if (w) out.push({ w, em });
    if (closes || (opens && tok.length > 1 && tok.lastIndexOf("*") > 0)) em = false;
  }
  return out;
}

/** How long the bubble stays after the last word: 4 s + 60 ms per char, capped at 14 s. */
export const bubbleHold = (chars: number) => Math.min(14000, 4000 + 60 * chars);
