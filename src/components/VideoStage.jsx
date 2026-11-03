import { useEffect, useRef, useState } from "react";
import { figureX } from "../lib/avatars.js";

/*
  VideoStage — the avatar, as full-screen video behind the whole interface.

  Two clips per avatar, stacked in the same spot:
    IDLE  welcoming, smiling, waiting — loops whenever nobody is talking
    TALK  speaking, lip movement, expressions — loops while a reply is read aloud
  When the voice starts, TALK fades in over IDLE; when it ends, TALK fades out and the
  idle loop is already there, so the avatar simply "comes back" and the cycle repeats.
  Both clips share framing and lighting, so the switch is invisible. The clips are muted
  (the voice comes from the speech engine).

  ONE frame for every avatar, idle or talking: a 9:16 portrait (e.g. 534 x 954 px on a
  954 px-tall window), as tall as the screen and centred, its sides blended into a blurred copy
  of the avatar's own picture (the blurred Maktech logo scene). A 9:16 clip simply fills the frame;
  a 16:9 office clip is cropped to it around the person (`focus`, see figureX in avatars.js).

  A mode whose clips have not been added yet (avatar.video === null) shows its still
  portrait in the same place, so every mode always has a face.

  PERFORMANCE: the TALK clip only plays while someone is speaking (it is paused and rewound
  afterwards), and both clips pause when the tab or window is hidden.
*/
const FADE_MS = 420;

function Layer({ avatar, speaking, fading }) {
  const idleRef = useRef(null);
  const talkRef = useRef(null);
  const [talkShown, setTalkShown] = useState(false);
  const [ready, setReady] = useState(false); // the idle clip has a first frame
  const [entered, setEntered] = useState(false); // fades the layer in after it mounts
  useEffect(() => {
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const video = avatar.video;
  const reduceMotion = useRef(
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // IDLE: loops for as long as this layer exists (and the tab is visible).
  useEffect(() => {
    const el = idleRef.current;
    if (!video || !el) return undefined;
    const run = () => {
      if (document.hidden || reduceMotion.current) el.pause();
      else el.play().catch(() => {}); // autoplay can be refused (battery saver): the poster stays
    };
    run();
    document.addEventListener("visibilitychange", run);
    return () => document.removeEventListener("visibilitychange", run);
  }, [video]);

  // TALK: starts from its first frame when speech starts; faded out and parked when it ends.
  useEffect(() => {
    const el = talkRef.current;
    if (!video || !el) return undefined;
    if (speaking && !fading) {
      let cancelled = false;
      el.currentTime = 0;
      const show = () => !cancelled && setTalkShown(true);
      el.play().then(show, show); // show it even if play() is refused: its first frame is the same pose
      return () => {
        cancelled = true;
      };
    }
    setTalkShown(false);
    const park = setTimeout(() => {
      el.pause();
      el.currentTime = 0;
    }, FADE_MS + 60);
    return () => clearTimeout(park);
  }, [speaking, fading, video]);

  // Pause the talk clip with the tab too.
  useEffect(() => {
    const el = talkRef.current;
    if (!video || !el) return undefined;
    const onVis = () => {
      if (document.hidden) el.pause();
      else if (speaking && !fading) el.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [speaking, fading, video]);

  // Every clip fills the same centred 9:16 frame; a 16:9 clip is cropped around the person.
  const idleStyle = { objectPosition: `${figureX(video?.focus, video?.shape)}% 50%` };
  const talkStyle = { objectPosition: `${figureX(video?.talkFocus, video?.talkShape)}% 50%` };
  return (
    <div
      className="absolute inset-0 overflow-hidden transition-opacity ease-out"
      style={{ opacity: fading || !entered ? 0 : 1, transitionDuration: `${FADE_MS + 100}ms` }}
    >
      {video?.poster ? (
        // Blurred, dimmed copy of the avatar's own picture (Maktech logo and all) fills what the frame does not cover.
        <img
          src={video.poster}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70"
          style={{ filter: "blur(48px) brightness(0.55) saturate(1.15)" }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(60% 70% at 50% 38%, #2f3190 0%, #14173f 55%, #080a22 100%)" }}
        />
      )}
      <div className="stage-figure">
        {video ? (
          <>
            <video
              ref={idleRef}
              src={video.idle}
              poster={video.poster}
              muted
              loop
              playsInline
              autoPlay={!reduceMotion.current}
              preload="auto"
              disablePictureInPicture
              tabIndex={-1}
              aria-hidden="true"
              onLoadedData={() => setReady(true)}
              className={"transition-opacity duration-500 " + (ready ? "opacity-100" : "opacity-90")}
              style={idleStyle}
            />
            <video
              ref={talkRef}
              src={video.talk}
              muted
              loop
              playsInline
              preload="auto"
              disablePictureInPicture
              tabIndex={-1}
              aria-hidden="true"
              className="transition-opacity ease-in-out"
              style={{ ...talkStyle, opacity: talkShown ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
            />
          </>
        ) : (
          // No clips yet: the portrait, framed head-to-waist. `multiply` lets a studio-white
          // background take the colour of the stage instead of showing as a white block.
          <div style={{ background: "radial-gradient(55% 45% at 50% 22%, #8d84ff 0%, #4a4fc4 45%, #1c2060 100%)" }}>
            <img
              src={avatar.still}
              alt=""
              draggable={false}
              style={{
                inset: "7% 0 auto 0",
                height: "150%",
                objectPosition: "50% 0%",
                mixBlendMode: "multiply",
                filter: "contrast(1.06) saturate(1.1)",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function VideoStage({ avatar, activity }) {
  // Changing the avatar cross-fades: the previous layer stays for a moment and fades out.
  const [prev, setPrev] = useState(null);
  const last = useRef(avatar);
  useEffect(() => {
    if (last.current.id === avatar.id) return undefined;
    setPrev(last.current);
    last.current = avatar;
    const t = setTimeout(() => setPrev(null), FADE_MS + 200);
    return () => clearTimeout(t);
  }, [avatar]);

  return (
    <div className="pointer-events-none absolute inset-0 -z-0 bg-void-900" aria-hidden="true">
      {prev && <Layer key={"p-" + prev.id} avatar={prev} speaking={false} fading />}
      <Layer key={avatar.id} avatar={avatar} speaking={!!activity?.speaking} fading={false} />
    </div>
  );
}
