/*
  avatarSync.js — the avatar's talk video and the voice start at the SAME moment.

  The voice engine (ttsEngine.js) knows when the first sound of a reply is ready; the picture
  (VideoStage.jsx) knows when the talk clip is actually moving on screen. This tiny meeting
  point lets the engine hold the first sound for that one moment — never longer than `maxMs`,
  so a stalled video can never delay or silence the voice.

    engine:      speaking = true  →  await avatarSync.whenMoving(maxMs)  →  start the sound
    VideoStage:  talk clip playing and a frame shown  →  avatarSync.videoMoving()
*/
let attached = false; // an avatar with a talk video is on screen
let release = null; // resolves the engine's current wait

export const avatarSync = {
  /** VideoStage: a talk video is (true) or is not (false) on screen. */
  attach(on) {
    attached = !!on;
    if (!attached) release?.(); // nothing to wait for any more
  },

  /** VideoStage: the talk clip is playing and its picture is on screen. */
  videoMoving() {
    release?.();
  },

  /** Engine: resolves when the talk video is moving — at once when there is none (a still
   *  portrait, a hidden tab), and after `maxMs` at the latest. */
  whenMoving(maxMs) {
    if (!attached || (typeof document !== "undefined" && document.hidden) || !(maxMs > 0)) {
      return Promise.resolve();
    }
    release?.(); // a wait that was never answered is over
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        if (release === done) release = null;
        resolve();
      };
      const timer = setTimeout(done, maxMs);
      release = done;
    });
  },
};
