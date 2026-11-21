import { useCallback, useEffect, useRef, useState } from "react";
import { bubbleHold, chatPayload, noKeyLine, speakable, stripTrick, type Msg } from "./lib.ts";
import { isTrick, moods, talk, TRICK_IDS, tricks } from "./tricks.ts";

export const CHIPS = ["Tell me a story", "How was your day?", "Do a trick!", "Good night, Ditó"] as const;
const GREETING = "Hi, I’m Ditó. Say something!";
const NOKEY_GREETING = "Hi, I’m Ditó. My voice isn’t connected yet… *yawn*";
const COPY = {
  rate: "Whoa, so many questions! Ditó needs a biscuit break. Try again in a minute.",
  net: "A cloud drifted over that one. Check your connection and ask again?",
  generic: "Hm. Ditó lost his words in the fog. Ask me again?",
  mic: "Ditó couldn’t hear you. Allow the microphone, or type.",
};

// minimal Web Speech API typings (not in lib.dom for every TS version)
type SRResult = { isFinal: boolean; 0: { transcript: string } };
type SREvent = { results: ArrayLike<SRResult> };
interface SRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SRec;
const w = typeof window === "undefined" ? undefined : (window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor });
export const SR: SRCtor | undefined = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
export const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : undefined;

const SOFT = /samantha|karen|google uk english female|moira|tessa|fiona/i;
function pickVoice() {
  const en = synth?.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en")) ?? [];
  return en.find((v) => SOFT.test(v.name)) ?? en[0];
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

export type Phase = "idle" | "thinking" | "streaming";

/** All of Ditó's talking: send/stream, memory, trick tags, mic, read-aloud. State is just the last reply; history lives in a ref. */
export function useDitoChat() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [reply, setReply] = useState("");
  const [replyId, setReplyId] = useState(0); // bumps for every new reply: the bubble restarts its timer
  const [hold, setHold] = useState(9000);
  const [echo, setEcho] = useState("");
  const [input, setInput] = useState("");
  const [noKey, setNoKey] = useState(false);
  const [error, setError] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakOn, setSpeakOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [typing, setTyping] = useState(false);
  const [dim, setDim] = useState(false);

  const hist = useRef<Msg[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const reqRef = useRef(0);
  const recRef = useRef<SRec | null>(null);
  const finalRef = useRef("");
  const speechToken = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const noKeyRef = useRef(false);
  const speakRef = useRef(false);
  const lastLine = useRef("");
  const sentOnce = useRef(false);
  const noKeyN = useRef(0);
  const timers = useRef<{ echo?: number; type?: number; dim?: number }>({});
  speakRef.current = speakOn;
  noKeyRef.current = noKey;

  const stopSpeech = useCallback(() => {
    speechToken.current++; // late onend/onerror from cancelled utterances are ignored
    synth?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!synth) return;
    const clean = speakable(text.replace(/\*[^*]*\*/g, " ")); // don't read stage directions like *yawn* or emoji
    const parts = clean.match(/[^.!?\n]+[.!?]*\s*/g);
    if (!parts) return;
    const token = ++speechToken.current;
    synth.cancel();
    const voice = pickVoice();
    setSpeaking(true);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      if (voice) u.voice = voice;
      u.pitch = 1.25;
      u.rate = 1;
      u.onend = () => token === speechToken.current && i === parts.length - 1 && setSpeaking(false);
      u.onerror = () => token === speechToken.current && setSpeaking(false);
      synth.speak(u);
    });
  }, []);

  /** Show a finished reply (replaces the bubble). */
  const show = useCallback((text: string, holdMs: number) => {
    clearInterval(timers.current.type);
    setTyping(false);
    setReply(text);
    setHold(holdMs);
    setReplyId((n) => n + 1);
  }, []);

  /** Typewriter at 28 ms/char for the lines that don't come from the network. */
  const typeOut = useCallback((text: string, holdMs: number) => {
    clearInterval(timers.current.type);
    let i = 0;
    setReply("");
    setHold(holdMs);
    setReplyId((n) => n + 1);
    setTyping(true);
    timers.current.type = window.setInterval(() => {
      i++;
      setReply(text.slice(0, i));
      if (i >= text.length) (clearInterval(timers.current.type), setTyping(false));
    }, 28);
  }, []);

  const flagNoKey = useCallback(() => {
    noKeyRef.current = true;
    setNoKey(true);
  }, []);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim().slice(0, 400);
    if (!text) return;
    stopSpeech();
    recRef.current?.abort();
    abortRef.current?.abort(); // a new line replaces the one in flight
    clearInterval(timers.current.type);
    setTyping(false);
    lastLine.current = text;
    sentOnce.current = true;
    setInput("");
    setError(false);
    setEcho(text);
    clearTimeout(timers.current.echo);
    setDim(true);
    clearTimeout(timers.current.dim);
    timers.current.dim = window.setTimeout(() => setDim(false), 20_000);
    if (text === CHIPS[2]) tricks.play(TRICK_IDS[Math.floor(Math.random() * TRICK_IDS.length)]);

    if (noKeyRef.current) {
      // no network: a rotating in-character line; the chips still do their tricks
      if (text === CHIPS[3]) tricks.play("sleep");
      timers.current.echo = window.setTimeout(() => setEcho(""), 3000);
      typeOut(noKeyLine(noKeyN.current++), 14000);
      return;
    }

    const id = ++reqRef.current;
    const ctl = new AbortController();
    abortRef.current = ctl;
    const payload = chatPayload([...hist.current, { role: "user", content: text }]);
    hist.current.push({ role: "user", content: text });
    setReply("");
    setReplyId((n) => n + 1);
    setPhase("thinking");
    moods.set({ thinking: true }); // optimistic: the bear starts thinking this frame
    let raw$ = "";
    let first = true;
    const fail = (content: string) => {
      hist.current.push({ role: "assistant", content, error: true });
      setError(true);
      show(content, 9000);
    };
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: payload }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().then((j: { error?: string }) => j.error, () => undefined);
        if (res.status === 503 && err === "no_key") {
          hist.current.pop(); // the unanswered turn never happened
          flagNoKey();
          typeOut(NOKEY_GREETING, 14000);
        } else fail(res.status === 429 ? COPY.rate : COPY.generic);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw$ += dec.decode(value, { stream: true });
        const shown = stripTrick(raw$).text;
        if (!shown) continue;
        if (first) {
          first = false;
          moods.set({ thinking: false });
          setPhase("streaming");
          timers.current.echo = window.setTimeout(() => setEcho(""), 3000);
        }
        setReply(shown);
      }
      const { text: final, trick } = stripTrick(raw$ + dec.decode());
      if (!final) return fail(COPY.generic);
      hist.current.push({ role: "assistant", content: final });
      show(final, bubbleHold(final.length));
      if (trick && isTrick(trick)) tricks.play(trick); // cosmetic, whitelist-checked
      if (speakRef.current) speak(final);
    } catch (e) {
      if (id !== reqRef.current) return; // replaced by a newer line
      if (isAbort(e)) {
        const partial = stripTrick(raw$).text;
        if (partial) (hist.current.push({ role: "assistant", content: partial }), show(partial, bubbleHold(partial.length)));
        else hist.current.pop();
      } else fail(COPY.net);
    } finally {
      if (id === reqRef.current) {
        abortRef.current = null;
        setPhase("idle");
        moods.set({ thinking: false });
      }
    }
  }, [flagNoKey, show, speak, stopSpeech, typeOut]);

  // microphone
  const stopMic = useCallback(() => recRef.current?.stop(), []);
  const startMic = useCallback(() => {
    if (!SR || noKeyRef.current || recRef.current) return;
    stopSpeech();
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    finalRef.current = "";
    rec.onresult = (e) => {
      const parts = Array.from(e.results);
      const said = parts.map((r) => r[0].transcript).join(" ");
      setInput(said);
      if (parts[parts.length - 1]?.isFinal) finalRef.current = said;
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") (setError(true), show(COPY.mic, 9000));
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      moods.set({ listening: false });
      const said = finalRef.current;
      finalRef.current = "";
      if (said) void send(said);
      else setInput("");
    };
    recRef.current = rec;
    setListening(true);
    moods.set({ listening: true });
    try { rec.start(); } catch { recRef.current = null; setListening(false); moods.set({ listening: false }); }
  }, [send, show, stopSpeech]);
  const toggleMic = useCallback(() => (recRef.current ? stopMic() : startMic()), [startMic, stopMic]);

  // Escape stops everything (stream, mic), then leaves the input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (abortRef.current) abortRef.current.abort();
      else if (recRef.current) (finalRef.current = "", recRef.current.abort());
      else if (document.activeElement === inputRef.current) inputRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // hold Space (input not focused, hero on screen): start after 180 ms, release sends
  useEffect(() => {
    if (!SR) return;
    let on = false;
    let started = false;
    let t = 0;
    const hero = document.getElementById("top");
    const io = new IntersectionObserver(([e]) => (on = e.isIntersecting), { threshold: 0.4 });
    if (hero) io.observe(hero);
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !on || noKeyRef.current) return;
      if ((e.target as HTMLElement | null)?.closest("input,textarea,button,a,select,[contenteditable]")) return;
      e.preventDefault(); // Space is talk here, not page-scroll (incl. the first keydown and repeats)
      if (started || e.repeat) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => ((started = true), startMic()), 180);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      window.clearTimeout(t);
      if (started) (started = false, e.preventDefault(), stopMic());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      io.disconnect();
      window.clearTimeout(t);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startMic, stopMic]);

  // the bear talks while text streams, types out, or speech plays
  useEffect(() => {
    talk.set(phase === "streaming" || typing || speaking);
  }, [phase, typing, speaking]);
  useEffect(() => moods.set({ speaking }), [speaking]); // the music ducks under his voice

  // probe once: is the voice connected? then greet (no-key: the lovely resting state)
  useEffect(() => {
    const ctl = new AbortController();
    let t = 0;
    fetch("/api/chat", { signal: ctl.signal })
      .then((r) => r.json() as Promise<{ ready?: boolean }>)
      .then((j) => j.ready !== false, () => true)
      .then((ready) => {
        if (ctl.signal.aborted) return;
        if (!ready) flagNoKey();
        t = window.setTimeout(() => {
          if (sentOnce.current) return;
          if (ready) show(GREETING, 9000);
          else typeOut(NOKEY_GREETING, 14000);
        }, ready ? 1800 : 2400);
      });
    return () => (ctl.abort(), clearTimeout(t));
  }, [flagNoKey, show, typeOut]);

  // autofocus on desktop only; never pops a touch keyboard
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const off = () => synth?.cancel();
    window.addEventListener("pagehide", off);
    const tm = timers.current;
    return () => {
      window.removeEventListener("pagehide", off);
      abortRef.current?.abort();
      recRef.current?.abort();
      synth?.cancel();
      clearInterval(tm.type);
      clearTimeout(tm.echo);
      clearTimeout(tm.dim);
      talk.set(false);
      moods.set({ thinking: false, listening: false, speaking: false });
    };
  }, []);

  const toggleSpeak = useCallback(() => {
    if (speakRef.current) stopSpeech();
    setSpeakOn((v) => !v);
  }, [stopSpeech]);

  const askAgain = useCallback(() => {
    setInput(lastLine.current);
    inputRef.current?.focus();
  }, []);

  return {
    phase, reply, replyId, hold, echo, input, setInput, noKey, error, listening, speakOn, speaking, typing, dim,
    done: phase === "idle" && !speaking && !typing,
    send, toggleMic, startMic, stopMic, toggleSpeak, askAgain, inputRef,
    stream: () => abortRef.current?.abort(),
  };
}
export type DitoChat = ReturnType<typeof useDitoChat>;
