/*
  Settings store — a tiny, dependency-free state container backed by
  localStorage (valid in a real Electron/browser app; only Claude.ai artifacts
  forbid it). We use useSyncExternalStore so any component can read settings
  reactively without a Provider wrapping the tree.

  Everything the user can configure lives here, so adding a new preference later
  is a one-line change. This is the single source of truth for voice and audio
  behavior. (The avatar is not a setting: it follows the selected mode.)
*/
import { useSyncExternalStore } from "react";

const KEY = "aida.settings.v1";
// Bump when a stored value must be migrated once (see load()).
const SCHEMA = 3;

const DEFAULTS = {
  ttsProvider: "cloud", // "cloud" (Gemini via backend: natural, Bengali + English) | "webspeech" (browser voices)
  voiceURI: "", // resolved & pinned once so the voice never changes randomly
  rate: 1.0,
  pitch: 1.0,
  ttsEnabled: true,
  syncText: true, // reveal the reply one sentence at a time, in step with the voice
  liveStt: true, // real-time captions while speaking (falls back to upload-after-speaking)
  micEnabled: true,
  micDeviceId: "", // "" = system default
  voiceMode: false, // continuous hands-free conversation (VAD + barge-in)
  _v: SCHEMA,
};

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    const merged = { ...DEFAULTS, ...stored };
    // v1 -> v2: the local Piper engine was replaced by the cloud (Gemini) voice,
    // and "webspeech" was only ever the old default for everyone, not a choice
    // made for Bengali. Move people to "cloud" once; they can switch back.
    if ((stored._v || 1) < 2) merged.ttsProvider = "cloud";
    if (merged.ttsProvider === "piper") merged.ttsProvider = "cloud";
    // v2 -> v3: the avatar now follows the mode; drop the old picker fields.
    delete merged.avatar;
    delete merged.customAvatarFemale;
    delete merged.customAvatarMale;
    merged._v = SCHEMA;
    return merged;
  } catch {
    return { ...DEFAULTS, _v: SCHEMA };
  }
}

let state = load();
const listeners = new Set();

function emit() {
  for (const l of listeners) l();
}

export function getSettings() {
  return state;
}

export function updateSettings(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable; keep in-memory */
  }
  emit();
}

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// React hook — reactive read of the whole settings object.
export function useSettings() {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}