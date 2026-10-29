import test from "node:test";
import assert from "node:assert/strict";
import { LiveReply } from "../src/lib/liveReply.js";

const s = (index, text) => ({ index, text, code: false });

test("paced: only sentences the voice has started reading are visible", () => {
  const r = new LiveReply({ paced: true });
  r.tokens("One. Two. Thr");
  r.sentence(s(0, "One. "));
  r.sentence(s(1, "Two. "));
  assert.equal(r.visible(), "", "nothing is shown before the voice begins");
  r.reveal(0);
  assert.equal(r.visible(), "One. ");
  r.reveal(1);
  assert.equal(r.visible(), "One. Two. ");
  r.reveal(0); // a late/duplicate reveal never goes backwards
  assert.equal(r.visible(), "One. Two. ");
});

test("paced: filed only when complete AND the voice has finished", () => {
  const r = new LiveReply({ paced: true });
  r.sentence(s(0, "Hello. "));
  r.reveal(0);
  assert.equal(r.readyToCommit(true), false);
  r.complete("Hello. ");
  assert.equal(r.readyToCommit(true), false, "still being read");
  assert.equal(r.readyToCommit(false), true, "read to the end");
});

test("paced: a reply that finished generating keeps ALL its text on Stop; one cut short keeps what was seen", () => {
  const done = new LiveReply({ paced: true });
  done.sentence(s(0, "A. "));
  done.sentence(s(1, "B."));
  done.reveal(0);
  done.complete("A. B.");
  assert.equal(done.finalText(true), "A. B.");

  const cut = new LiveReply({ paced: true });
  cut.tokens("A. B. C");
  cut.sentence(s(0, "A. "));
  cut.sentence(s(1, "B. "));
  cut.reveal(0);
  assert.equal(cut.finalText(false), "A. ");
});

test("paced: a reply with no sentence events at all is still filed whole", () => {
  const r = new LiveReply({ paced: true });
  r.complete("Just text.");
  assert.equal(r.readyToCommit(false), true);
  assert.equal(r.finalText(true), "Just text.");
});

test("unpaced: text streams as written and is filed as soon as it is complete", () => {
  const r = new LiveReply({ paced: false });
  r.tokens("Hel");
  assert.equal(r.visible(), "Hel");
  r.tokens("Hello");
  r.complete("Hello");
  assert.equal(r.readyToCommit(true), true, "does not wait for the voice");
  assert.equal(r.finalText(false), "Hello");
});

test("Bengali sentences are concatenated exactly as sent (offsets for the highlighter stay valid)", () => {
  const r = new LiveReply({ paced: true });
  r.sentence(s(0, "আপনি কেমন আছেন? "));
  r.sentence(s(1, "আমি ভালো আছি।"));
  r.reveal(1);
  assert.equal(r.visible(), "আপনি কেমন আছেন? আমি ভালো আছি।");
});
