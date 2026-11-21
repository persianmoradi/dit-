import { useSyncExternalStore } from "react";

// Shared between the DOM boop button and the 3D cat: a click on either boops the same Ditó.
let count = 0;
const subs = new Set<() => void>();

export const boops = {
  get: () => count,
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => void subs.delete(fn);
  },
  boop() {
    count++;
    subs.forEach((f) => f());
  },
};

export const useBoops = () => useSyncExternalStore(boops.subscribe, boops.get);
