/*
  highlighter.js — Real-Time Reading Progress Highlighter engine.

  PROBLEM: the full reply renders on screen almost instantly (LLM token
  stream), but the avatar's voice takes much longer to read it aloud. Users
  lose track of what's currently being spoken.

  SOLUTION: a small state machine that:
    1. Receives sentence boundaries as the backend emits them (`pushSentence`,
       same boundaries used by chat/service.py and the TTS queue in speech.js)
       and registers each sentence's [charStart, charEnd) range within the
       full reply text.
    2. Receives "speaking progress" updates from speech.js — either:
         a. word-level timing marks from /voice/speak_marks (Piper), or
         b. SpeechSynthesis `onboundary` events (webspeech), or
         c. a coarse per-sentence fallback (highlight the whole sentence
            while it's spoken).
    3. Emits a single `range` {start, end} via onUpdate — the character span
       of the reply text that should be visually highlighted right now.

  The frontend (ChatPanel) only needs to render the full text with that range
  wrapped in a <mark>, and auto-scroll it into view — karaoke/teleprompter
  style, smoothly advancing, regardless of which TTS backend is active.
*/

export class ReadingHighlighter {
  constructor({ onUpdate } = {}) {
    this.onUpdate = onUpdate || (() => {});
    this.reset();
  }

  reset() {
    // Sentences: [{ index, text, charStart, charEnd }]
    this.sentences = [];
    this.fullLen = 0;
    this.activeRange = null;
    this._timers = [];
  }

  /** Register a sentence as it streams in. Computes its char range within
   *  the growing full text (sentences are emitted in order, contiguous). */
  pushSentence({ index, text }) {
    const charStart = this.fullLen;
    const charEnd = charStart + text.length;
    this.sentences[index] = { index, text, charStart, charEnd };
    this.fullLen = charEnd;
  }

  /** Word-level marks (from /voice/speak_marks) for a given sentence index.
   *  `marks`: [{ word, start, end, char_start, char_end }] in seconds,
   *  relative to that sentence's own audio. Schedules highlight updates as
   *  the audio plays, using `audioStartedAt` (performance.now() ms) as t0. */
  driveWithMarks(sentenceIndex, marks, audioStartedAt) {
    const sentence = this.sentences[sentenceIndex];
    if (!sentence || !marks?.length) return;
    this._clearTimers();

    for (const mark of marks) {
      const delay = Math.max(0, mark.start * 1000 - (performance.now() - audioStartedAt));
      const timer = setTimeout(() => {
        this._setRange({
          start: sentence.charStart + mark.char_start,
          end: sentence.charStart + mark.char_end,
        });
      }, delay);
      this._timers.push(timer);
    }
  }

  /** webspeech onboundary fallback: highlight from charIndex to the next
   *  word boundary within the sentence (approximated by whitespace). */
  driveWithBoundary(sentenceIndex, charIndexInSentence) {
    const sentence = this.sentences[sentenceIndex];
    if (!sentence) return;
    const text = sentence.text;
    let end = text.indexOf(" ", charIndexInSentence);
    if (end === -1) end = text.length;
    this._setRange({
      start: sentence.charStart + charIndexInSentence,
      end: sentence.charStart + end,
    });
  }

  /** Coarse fallback: highlight the entire sentence while it's spoken. */
  driveWholeSentence(sentenceIndex) {
    const sentence = this.sentences[sentenceIndex];
    if (!sentence) return;
    this._setRange({ start: sentence.charStart, end: sentence.charEnd });
  }

  /** Call when all speech for the response has finished. */
  finish() {
    this._clearTimers();
    this._setRange(null);
  }

  _setRange(range) {
    const changed =
      !range !== !this.activeRange ||
      (range &&
        this.activeRange &&
        (range.start !== this.activeRange.start || range.end !== this.activeRange.end));
    this.activeRange = range;
    if (changed) this.onUpdate(range);
  }

  _clearTimers() {
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
  }
}
