import { Fragment, useEffect, useState } from "react";
import { splitWords } from "../lib.ts";
import { CHIPS, SR, synth, type DitoChat } from "../useDitoChat.ts";

/** Site owner cue while the chat key is missing; flip to false (or delete) at launch. */
const SHOW_OWNER_HINT = true;

const Icon = ({ children, size = 20 }: { children: React.ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/** One cream puff by Ditó's head: words fade in as they stream, then it floats away. */
export function Bubble({ chat }: { chat: DitoChat }) {
  const { reply, replyId, hold, done, phase, listening, noKey, error, speakOn } = chat;
  const [gone, setGone] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => { if (replyId) setGone(false); }, [replyId]);
  useEffect(() => {
    if (gone || !done || paused || !reply) return;
    const t = window.setTimeout(() => setGone(true), hold);
    return () => clearTimeout(t);
  }, [gone, done, paused, reply, replyId, hold]);

  const mode = listening ? "listen" : phase === "thinking" ? "think" : replyId && reply ? "reply" : "none";
  const hidden = mode === "none" || (mode === "reply" && gone);
  const words = splitWords(reply);
  // words present when the reply first lands get a stagger; later streamed words just appear
  const [base, setBase] = useState({ id: -1, n: 0 });
  if (base.id !== replyId) setBase({ id: replyId, n: words.length });

  return (
    <div className="bubblebox">
      <div
        className={`bubble-wrap ${hidden ? "is-gone" : ""} ${mode === "listen" ? "is-listen" : ""}`}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <div className="bubble">
          {mode === "listen" && <p className="bubble__text"><em>I’m listening…</em></p>}
          {mode === "think" && <span className="dots" aria-hidden="true"><i /><i /><i /></span>}
          {mode === "reply" && (
            <p className="bubble__text" aria-hidden="true">
              {words.map((x, i) => (
                <Fragment key={i}>
                  <span className={`w ${x.em ? "w--em" : ""}`} style={{ animationDelay: i < base.n ? `${Math.min(i, 24) * 55}ms` : undefined }}>{x.w}</span>{" "}
                </Fragment>
              ))}
            </p>
          )}
          <span className="visually-hidden" role="status">{done && mode === "reply" ? reply.replace(/\*([^*]*)\*/g, "$1") : ""}</span>
        </div>
        {synth && !noKey && (
          <button type="button" className="bubble__spk glass" aria-pressed={speakOn} aria-label="Read replies aloud" title="Read replies aloud" onClick={chat.toggleSpeak}>
            <Icon size={16}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />{speakOn && <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}</Icon>
          </button>
        )}
      </div>
      {error && !hidden && <button type="button" className="hint hint--btn" onClick={chat.askAgain}>Ask again</button>}
      {noKey && SHOW_OWNER_HINT && (
        <p className="hint">
          <Icon size={14}><circle cx="8" cy="15" r="3.5" /><path d="M10.5 12.5 20 3m-4 4 3 3" /></Icon>
          Site owner: add the chat API key to give Ditó his voice.
        </p>
      )}
    </div>
  );
}

/** The slim pill, the mic, and four one-tap chips. */
export function Prompter({ chat, tricksOpen, onTricks }: { chat: DitoChat; tricksOpen: boolean; onTricks: () => void }) {
  const { input, setInput, listening, noKey, send, inputRef, dim, echo } = chat;
  const hasText = input.trim().length > 0;
  const canMic = !!SR && !noKey;
  return (
    <div className="prompter reveal" style={{ "--i": 3 } as React.CSSProperties}>
      <div className={`chips ${dim ? "is-dim" : ""}`}>
        {CHIPS.map((c) => <button key={c} type="button" className="chip" onClick={() => void send(c)}>{c}</button>)}
      </div>
      <form className={`pill ${listening ? "is-listening" : ""} ${hasText ? "has-text" : ""}`} onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <button type="button" className="pill__sparkle" aria-label="Tricks" aria-expanded={tricksOpen} aria-controls="dock" onClick={onTricks}>
          <Icon size={20}><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4L4.5 10.8 10.2 9 12 3.5ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></Icon>
        </button>
        <input
          ref={inputRef}
          id="dito-input"
          className="pill__input"
          type="text"
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="on"
          maxLength={400}
          value={input}
          readOnly={listening}
          aria-label="Say something to Ditó"
          placeholder={listening ? "Listening…" : "Say something to Ditó…"}
          onChange={(e) => setInput(e.target.value)}
        />
        {canMic && (
          <button
            type="button"
            className={`pill__btn pill__mic ${listening ? "is-on" : ""}`}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Talk to Ditó"}
            title="Hold to talk"
            onPointerDown={(e) => { if (e.pointerType !== "touch") { e.currentTarget.setPointerCapture(e.pointerId); chat.startMic(); } }}
            onPointerUp={(e) => { if (e.pointerType !== "touch") chat.stopMic(); }}
            onPointerCancel={chat.stopMic}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => { const t = (e.nativeEvent as PointerEvent).pointerType; if (t === "touch" || !t) chat.toggleMic(); }}
          >
            <Icon><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></Icon>
          </button>
        )}
        {hasText && (
          <button type="submit" className="pill__btn pill__send" aria-label="Send">
            <Icon><path d="M12 19V5m-6 6 6-6 6 6" /></Icon>
          </button>
        )}
      </form>
      <p className="prompter__under">
        <span className="prompter__echo" key={echo}>{echo && `you: ${echo}`}</span>
        {canMic && <span className="prompter__keys">hold <kbd>Space</kbd> to talk</span>}
      </p>
    </div>
  );
}
