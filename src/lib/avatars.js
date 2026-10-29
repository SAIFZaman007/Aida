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

const make = (persona, file, label, gender, animation = {}, extra = {}) => ({
  id: persona,
  persona,
  label,
  file,
  url: `${BASE}avatars/${file}`,
  gender,
  voiceHints: gender === "female" ? FEMALE_HINTS : MALE_HINTS,
  animation,
  ...extra,
});

export const AVATARS = {
  nonstop: make("nonstop", "non-stop.glb", "Non-stop", "male", {}, {
    face: { mouth: { y: 0.0, half: 0.027 }, eyes: { w: 0.0135, h: 0.009 } },
  }),
  executive: make("executive", "executive.glb", "Executive", "male", { idle: "hold", holdAt: 0, speaking: "signature" }, {
    face: { mouth: { y: 0.013, half: 0.02 }, eyes: { y: 0.08, x: 0.03, w: 0.0135, h: 0.0075 } },
  }),
  coder: make("coder", "coder.glb", "Coder", "male", { idle: "loop" }, {
    face: { mouth: { y: 0.013, half: 0.02 }, eyes: { y: 0.078, x: 0.0295, w: 0.0135, h: 0.0075 } },
  }),
  // a static model (no skeleton): coordinates are absolute, in metres on the 1.75 m stage
  architect: make("architect", "architect.glb", "Architect", "male", {}, {
    face: {
      origin: { x: 0, y: 1.55, z: 0 },
      mouth: { y: 0.009, half: 0.022 },
      eyes: { y: 0.0735, x: 0.034, w: 0.0185, h: 0.0095 },
      chin: 0.06,
      jaw: 0.012,
    },
  }),
  security: make("security", "security.glb", "Security", "male", { idle: "loop" }, {
    face: { mouth: { y: 0.0, half: 0.024 }, eyes: { w: 0.0135, h: 0.0085 } },
  }),
  researcher: make("researcher", "researcher.glb", "Researcher", "male", {}, {
    face: { mouth: { y: 0.02, half: 0.026 }, eyes: { w: 0.0125, h: 0.0085 }, lidBoost: 1.15 },
  }),
  writer: make("writer", "writer.glb", "Writer", "female", {}, {
    // her own mouth/smile morphs are subtle: scale them so speech and smiles read clearly
    face: { eyes: { w: 0.0125, h: 0.0085 }, lidBoost: 1.55, gain: { mouth: 2, smile: 1.5 } },
  }),
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
