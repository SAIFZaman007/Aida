/*
  speech.js — the app-wide voice output singleton.

  The engine itself (sentence queue, ordered playback, cloud/browser voices,
  circuit breaker, reading-highlighter sync) lives in ttsEngine.js so it can be
  unit-tested without a network. This file wires it to the real API client and
  keeps the import surface the UI already uses: `tts`, `speechBus`.
*/
import { api } from "./api.js";
import { TTS, speechBus, sanitizeForSpeech, normalizeForSpeech, pickVoice, resolveVoice } from "./ttsEngine.js";

export { speechBus, sanitizeForSpeech, normalizeForSpeech, pickVoice, resolveVoice };
export const tts = new TTS({ api });
