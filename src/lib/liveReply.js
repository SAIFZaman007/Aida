/*
  liveReply.js — the reply that is being written and read RIGHT NOW.

  Pure state (no React, no browser), so the rules are unit-tested.

  PACED (the default with the voice on): the text shown is only the sentences the
  voice has begun to read (`reveal(index)` is driven by the speech queue), so text
  and voice advance together, one sentence at a time. The reply is filed into the
  history once it is complete AND the last sentence has been read.

  UNPACED (voice off, or "reveal text with the voice" off): the text streams as fast
  as the model writes, and is filed as soon as it is complete.
*/
export class LiveReply {
  constructor({ paced = true } = {}) {
    this.paced = paced;
    this.sentences = []; // by sentence index
    this.revealed = -1; // highest sentence index the voice has begun to read
    this.full = ""; // everything streamed so far (the whole reply once complete)
    this.streamDone = false;
  }

  tokens(full) {
    this.full = full || "";
  }

  sentence({ index, text }) {
    this.sentences[index] = text;
  }

  reveal(index) {
    if (index > this.revealed) this.revealed = index;
  }

  complete(full) {
    if (typeof full === "string" && full) this.full = full;
    this.streamDone = true;
  }

  /** The text to show now. */
  visible() {
    if (!this.paced) return this.full;
    let out = "";
    for (let i = 0; i <= this.revealed; i++) out += this.sentences[i] ?? "";
    return out;
  }

  /** The text to file: the whole reply, or only what the person has seen. */
  finalText(whole) {
    return whole ? this.full || this.visible() : this.visible();
  }

  /** Time to move it from the live bubble into the history? */
  readyToCommit(voiceBusy) {
    return this.streamDone && (!this.paced || !voiceBusy);
  }
}
