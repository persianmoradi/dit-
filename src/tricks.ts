import { useSyncExternalStore } from "react";

// Shared between the DOM (trick bar, chat tags) and the 3D bear: one trick at a time, like boop.ts.
export const TRICK_IDS = ["wave", "spin", "jump", "dance", "hug", "sleep"] as const;
export type TrickId = (typeof TRICK_IDS)[number];
export const isTrick = (s: string): s is TrickId => (TRICK_IDS as readonly string[]).includes(s);

let current: TrickId | null = null;
let talking = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => void subs.delete(fn);
};

export const tricks = {
  subscribe,
  get: () => current,
  /** Request a trick; ignored while another plays (sleep can always be interrupted). Returns whether it started. */
  play(id: TrickId) {
    if (current && current !== "sleep") return false;
    current = current === "sleep" && id === "sleep" ? null : id; // pressing Sleep again wakes him
    emit();
    return true;
  },
  /** Called by the 3D scene when a trick has finished (or by reduced-motion timers). */
  done() {
    current = null;
    emit();
  },
};

/** True while Ditó's chat reply is streaming or being spoken: the bear does its talking bob. */
export const talk = {
  subscribe,
  get: () => talking,
  set(on: boolean) {
    if (on !== talking) (talking = on), emit();
  },
};

/** Live breathing phase (radians, accumulated by Hero3D each frame). Plain mutable: no emit, no React. sin() rising = inhale; trough = -PI/2. */
export const breath = { phase: 0 };

export const useTrick = () => useSyncExternalStore(tricks.subscribe, tricks.get);
export const useTalking = () => useSyncExternalStore(talk.subscribe, talk.get);

/** What the hero talk UI is doing, for the bear's body language. "kb" = mobile keyboard open: the stage shrinks the bear upward. */
export type Mood = { thinking: boolean; listening: boolean; kb: boolean; speaking: boolean };
let mood: Mood = { thinking: false, listening: false, kb: false, speaking: false };
export const moods = {
  subscribe,
  get: () => mood,
  set(patch: Partial<Mood>) {
    const next = { ...mood, ...patch };
    if (next.thinking !== mood.thinking || next.listening !== mood.listening || next.kb !== mood.kb || next.speaking !== mood.speaking) (mood = next), emit();
  },
};
export const useMood = () => useSyncExternalStore(moods.subscribe, moods.get);
