import type { Pose } from "../components/Bear.tsx";
import type { TrickId } from "../tricks.ts";

// start = hour of day (decimal) in the visitor's local time; `now` completes "Right now: ..."
export const SCHEDULE = [
  { time: "06:00", start: 6, what: "Sunrise stretch", note: "with a very big yawn", now: "stretching, with a very big yawn" },
  { time: "08:00", start: 8, what: "Counting windows", note: "stops at forty", now: "counting windows" },
  { time: "10:30", start: 10.5, what: "Waving at planes", note: "", now: "waving at planes" },
  { time: "12:30", start: 12.5, what: "Biscuit o’clock", note: "dunked in warm milk", now: "dunking a biscuit" },
  { time: "15:00", start: 15, what: "Watching pigeons", note: "from a safe distance", now: "watching pigeons from a safe distance" },
  { time: "18:00", start: 18, what: "Orange hour", note: "a spin just because", now: "spinning, just because" },
  { time: "21:00", start: 21, what: "Chatting with the moon", note: "", now: "chatting with the moon" },
  { time: "00:00", start: 0, what: "Naps at midnight", note: "", now: "napping, one ear on the town" },
  { time: "03:00", start: 3, what: "Dreaming of very fluffy socks", note: "", now: "dreaming of very fluffy socks" },
] as const;
export const SLEEPY_ROWS: readonly number[] = [7, 8];

export const TRICKS: readonly { id: TrickId; name: string; line: string; pose: Pose }[] = [
  { id: "wave", name: "Wave", line: "Hello, to everyone, always.", pose: "wave" },
  { id: "spin", name: "Spin", line: "One full turn, clouds included.", pose: "spin" },
  { id: "jump", name: "Jump", line: "Up, up, poof.", pose: "jump" },
  { id: "dance", name: "Dance", line: "Four beats, one very happy bear.", pose: "dance" },
  { id: "hug", name: "Hug", line: "Squeezes you through the screen.", pose: "hug" },
  { id: "sleep", name: "Sleep", line: "Please whisper.", pose: "sleep" },
];

export const FACTS: readonly { title: string; items: readonly string[] }[] = [
  { title: "Likes", items: ["Moonlight on warm clouds.", "Being counted: one boop, two boops.", "Honey-oat biscuits, dunked in warm milk.", "The far-off bell of the clock tower."] },
  { title: "Dislikes", items: ["Being called “just a toy”.", "Thunderclouds with bad manners.", "Rooftop pigeons who stand too close.", "Rain on his ears (mostly)."] },
  { title: "Habits", items: ["Counts the lit windows, loses count at forty, starts again happily.", "Waves at every plane, even the ones that are stars.", "Hums when he thinks, a little flat.", "Naps at midnight, one ear on the town."] },
  { title: "Favourites", items: ["Colour: lantern orange at 6:04 pm.", "Number: seven.", "Word: “poof”.", "Place: exactly here, on top."] },
];
export const MINI_FACTS = [["Species", "teddy bear"], ["Home", "the cloud right above the town"], ["Age", "one full moon, he says"], ["Stuffing", "a secret"]] as const;

export const STORY = [
  ["I", "The ring", "Every full moon a brass ring lights up at the edge of the sky. The night watchman called it the gate and kept his lantern well away. Nobody had ever seen anything come through it."],
  ["II", "The landing", "One warm night, something did. First two round ears, then a sleepy orange head, then a very serious little face. Ditó stepped onto the nearest cloud, patted it twice and sat down. It was soft, he said, and he was staying."],
  ["III", "The stitch", "He arrived with a seam down his tummy, a mended patch on one ear and a tiny brass ring on a string, a piece of the gate he would not give back. The night watchman asked his name. He said “Ditó”, and it sounded like a small bell going up."],
] as const;
