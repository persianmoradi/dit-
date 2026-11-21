import assert from "node:assert/strict";
import { validate } from "./validate.ts";

const u = (content: string) => ({ role: "user", content });
const a = (content: string) => ({ role: "assistant", content });

assert.deepEqual(validate({ messages: [u("  hi  ")] }), [{ role: "user", content: "hi" }]);
assert.ok(validate({ messages: [u("a"), a("b"), u("c")] }));
assert.equal(validate(null), null);
assert.equal(validate({}), null);
assert.equal(validate({ messages: [] }), null);
assert.equal(validate({ messages: [a("x")] }), null); // assistant first
assert.equal(validate({ messages: [u("x"), a("y")] }), null); // assistant last
assert.equal(validate({ messages: [{ role: "system", content: "x" }] }), null);
assert.equal(validate({ messages: [u("   ")] }), null); // empty after trim
assert.equal(validate({ messages: [{ role: "user", content: 5 }] }), null);
assert.equal(validate({ messages: [u("x".repeat(801))] }), null);
assert.ok(validate({ messages: [u("x".repeat(800))] }));
assert.equal(validate({ messages: Array.from({ length: 21 }, (_, i) => (i % 2 ? a("x") : u("x"))) }), null);
// 20 messages ok length-wise (odd count needed for user-last): 19
assert.ok(validate({ messages: Array.from({ length: 19 }, (_, i) => (i % 2 ? a("x") : u("x"))) }));
// total > 8000: 11 x 800 = 8800
assert.equal(validate({ messages: Array.from({ length: 11 }, (_, i) => (i % 2 ? a("x".repeat(800)) : u("x".repeat(800)))) }), null);
console.log("validate.check ok");
