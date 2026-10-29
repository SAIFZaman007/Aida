/*
  Avatar registry — ONE avatar per mode, and the avatar decides the voice.

  Switching the mode switches the avatar; the avatar carries `gender`, which the
  speech engine sends to the cloud voice (and uses to pick a matching browser
  voice), so the person on screen and the voice you hear always match.

  Files live in frontend/public/avatars/ and are named after the modes:
      non-stop.glb  executive.glb  coder.glb  architect.glb
      security.glb  researcher.glb writer.glb

  `animation` describes the clip embedded in the model, if any:
      idle: "loop"  → the clip is the idle animation (coder, security)
      idle: "hold"  → one frame of the clip (`holdAt`, 0..1) is the standing pose; the clip
                      plays only while speaking (executive: it is a talking gesture)
      none          → no clip; the posture/gesture rig (lib/avatarRig.js) does everything

  Add a mode later = one more object here + one more entry in MODES (lib/modes.js).
*/
const BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "./";

const MALE_HINTS = [
  "david", "mark", "guy", "daniel", "george", "james", "fred",
  "male", "google uk english male", "google us english male",
];
const FEMALE_HINTS = [
  "zira", "aria", "jenny", "samantha", "eva", "hazel", "susan", "linda",
  "catherine", "female", "google uk english female", "google us english female",
];

const make = (persona, file, label, gender, animation = {}) => ({
  id: persona,
  persona,
  label,
  file,
  url: `${BASE}avatars/${file}`,
  gender,
  voiceHints: gender === "female" ? FEMALE_HINTS : MALE_HINTS,
  animation,
});

export const AVATARS = {
  nonstop: make("nonstop", "non-stop.glb", "Non-stop", "male"),
  executive: make("executive", "executive.glb", "Executive", "male", { idle: "hold", holdAt: 0, speaking: "loop" }),
  coder: make("coder", "coder.glb", "Coder", "male", { idle: "loop" }),
  architect: make("architect", "architect.glb", "Architect", "male"),
  security: make("security", "security.glb", "Security", "male", { idle: "loop" }),
  researcher: make("researcher", "researcher.glb", "Researcher", "male"),
  writer: make("writer", "writer.glb", "Writer", "female"),
};

export const DEFAULT_PERSONA = "executive";

// Modes that still exist on the backend (older sessions) but are not offered in the
// picker: they borrow the closest avatar.
const LEGACY = { developer: "coder", ccna_trainer: "researcher" };

/** The avatar for a persona id; unknown ids fall back to the default. */
export function avatarForPersona(persona) {
  const key = LEGACY[persona] || persona;
  return AVATARS[key] || AVATARS[DEFAULT_PERSONA];
}

/** Every avatar file, in picker order (used to preload the rest after the first one). */
export function allAvatars() {
  return Object.values(AVATARS);
}
