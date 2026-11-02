/*
  Avatar registry — ONE video avatar per mode, and the avatar decides the voice.

  Switching the mode switches the avatar; the avatar carries `gender`, which the
  speech engine sends to the cloud voice (and uses to pick a matching browser
  voice), so the person on screen and the voice you hear always match.

  EVERY avatar has
    still    a portrait image  (public/avatars/stills/<mode>.webp)  — the card in
             "Meet your AI specialists" and the stand-in while a mode has no video yet
  and, once its videos exist,
    video    { idle, talk, poster, shape, focus, talkShape, talkFocus }
             idle   the avatar waiting: welcoming, smiling (loops while nobody is talking)
             talk   the avatar speaking: lip movement, expressions (loops while a reply is read)
             poster a still frame of the idle clip (shown while the video loads)
             shape  "wide" (16:9 office scene, fills the whole screen) or "tall" (9:16 portrait,
                    centred and blended into a blurred backdrop) — of the idle clip
             focus  wide clips only: where the person stands across the frame (0-100 %), so a
                    window narrower than 16:9 crops the sides without cutting the person off
             talkShape / talkFocus   the same for the talk clip (default: same as the idle clip)

  ADD THE VIDEOS OF A MODE (no other code change):
    1. scripts/encode-avatar-clips.sh <mode-id> <idle.mp4> <talk.mp4>
       (writes public/avatars/video/<name>-idle.mp4, -talk.mp4, -poster.jpg;
        <name> = the mode id, except Non-stop which is "non-stop");
    2. add the mode id to VIDEO_READY, and its shape/focus to CLIPS, below.
  See public/avatars/README.txt for the recommended encoding.
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

/** Modes whose idle + talk clips are in public/avatars/video/. */
export const VIDEO_READY = ["nonstop", "executive", "coder", "architect", "security", "researcher", "writer"];

// Framing of each avatar's clips. `shape`/`focus` describe the idle clip; `talkShape` /
// `talkFocus` the talk clip when it differs (Non-stop: a 9:16 close-up idle and a 16:9 talk).
const CLIPS = {
  nonstop: { shape: "tall", focus: 50, talkShape: "wide", talkFocus: 50 },
  executive: { shape: "wide", focus: 51 },
  coder: { shape: "wide", focus: 43 },
  architect: { shape: "wide", focus: 48 },
  security: { shape: "wide", focus: 46 },
  researcher: { shape: "wide", focus: 39 },
  writer: { shape: "wide", focus: 45 },
};

function clipFrame(persona) {
  const c = CLIPS[persona] || { shape: "tall", focus: 50 };
  return { ...c, talkShape: c.talkShape ?? c.shape, talkFocus: c.talkFocus ?? c.focus };
}

const fileName = (persona) => (persona === "nonstop" ? "non-stop" : persona);

const make = (persona, label, gender) => {
  const name = fileName(persona);
  return {
    id: persona,
    persona,
    label,
    gender,
    voiceHints: gender === "female" ? FEMALE_HINTS : MALE_HINTS,
    still: `${BASE}avatars/stills/${persona}.webp`,
    video: VIDEO_READY.includes(persona)
      ? {
          idle: `${BASE}avatars/video/${name}-idle.mp4`,
          talk: `${BASE}avatars/video/${name}-talk.mp4`,
          poster: `${BASE}avatars/video/${name}-poster.jpg`,
          ...clipFrame(persona),
        }
      : null,
  };
};

export const AVATARS = {
  nonstop: make("nonstop", "Non-stop", "female"),
  executive: make("executive", "Executive", "female"),
  coder: make("coder", "Coder", "male"),
  architect: make("architect", "Architect", "male"),
  security: make("security", "Security", "male"),
  researcher: make("researcher", "Researcher", "female"),
  writer: make("writer", "Writer", "female"),
};

// Non-stop is the default avatar: its idle video is what fills the screen on start.
export const DEFAULT_PERSONA = "nonstop";

// Modes that still exist on the backend (older sessions) but are not offered in the
// picker: they borrow the closest avatar.
const LEGACY = { developer: "coder", ccna_trainer: "researcher" };

/** The avatar for a persona id; unknown ids fall back to the default. */
export function avatarForPersona(persona) {
  const key = LEGACY[persona] || persona;
  return AVATARS[key] || AVATARS[DEFAULT_PERSONA];
}

/** Every avatar, in picker order. */
export function allAvatars() {
  return Object.values(AVATARS);
}
