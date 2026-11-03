import Waveform from "./Waveform.jsx";
import { ChatIcon, MicIcon, WaveIcon, WaveOffIcon, StopIcon } from "./icons.jsx";

/*
  ControlDock — the three controls in the middle of the screen.
    left    open the text chat
    centre  the mic: starts / stops hands-free voice (the big glowing button)
    right   speak replies aloud: on / off  (the same switch as "Speak responses" in Settings)
  Above them the waveform shows who is making sound; below, one line says what to do or
  what is happening.
*/
export default function ControlDock({
  state, // "idle" | "listening" | "capturing" | "thinking" | "speaking"
  voiceOn,
  micAllowed,
  speakOn,
  onMic,
  onChat,
  onSpeakToggle,
  starting,
}) {
  const waveMode = state === "speaking" ? "speaking" : state === "capturing" || state === "listening" ? "listening" : state === "thinking" ? "thinking" : "idle";
  const caption = !micAllowed
    ? "The microphone is turned off in Settings."
    : starting
      ? "Starting…"
      : {
          idle: null,
          listening: "I'm listening — just speak.",
          capturing: "Listening to you…",
          thinking: "Thinking…",
          speaking: "Speaking — talk to interrupt.",
        }[state];

  return (
    <div className="flex flex-col items-center">
      <Waveform mode={waveMode} className="h-14 w-[min(520px,70vw)]" />
      <div className="mt-2 flex items-center gap-7">
        <button
          type="button"
          onClick={onChat}
          title="Open text chat (C)"
          aria-label="Open text chat"
          className="glass flex h-14 w-14 items-center justify-center rounded-full text-frost/90 transition hover:border-accent/60 hover:text-frost hover:shadow-glow"
        >
          <ChatIcon size={22} />
        </button>

        <div className="relative">
          {voiceOn && <span className="absolute inset-0 animate-pulsering rounded-full border border-accent/70" />}
          <button
            type="button"
            onClick={onMic}
            disabled={starting}
            aria-pressed={voiceOn}
            title={voiceOn ? "Stop listening" : "Click to talk"}
            aria-label={voiceOn ? "Stop listening" : "Start talking"}
            className={
              "relative flex h-[88px] w-[88px] items-center justify-center rounded-full border-2 transition duration-300 " +
              (voiceOn
                ? "border-accent bg-gradient-to-b from-accent-dim to-accent-deep text-white shadow-glow"
                : "border-accent/70 bg-gradient-to-b from-void-600 to-void-800 text-frost shadow-glowsoft hover:border-accent hover:shadow-glow") +
              (starting ? " opacity-70" : "")
            }
          >
            {voiceOn ? <StopIcon size={30} /> : <MicIcon size={38} />}
          </button>
        </div>

        <button
          type="button"
          onClick={onSpeakToggle}
          aria-pressed={speakOn}
          title={speakOn ? "Voice replies on — click to mute" : "Voice replies off — click to turn on"}
          aria-label="Toggle spoken replies"
          className={
            "glass flex h-14 w-14 items-center justify-center rounded-full transition hover:border-accent/60 hover:shadow-glow " +
            (speakOn ? "text-frost/90 hover:text-frost" : "text-steel/70")
          }
        >
          {speakOn ? <WaveIcon size={22} /> : <WaveOffIcon size={22} />}
        </button>
      </div>

      <p role="status" className="mt-3 flex h-6 items-center gap-2 text-[13px] text-frost/90 [text-shadow:0_1px_8px_rgb(var(--s0-rgb)/0.9)]">
        {caption ?? (
          <>
            Click the mic to talk with me
            <span className="rounded-full border border-line bg-void-700/70 px-2 py-0.5 text-[11px] text-steel">or</span>
            <button type="button" onClick={onChat} className="underline-offset-4 hover:text-frost hover:underline">
              open text chat
            </button>
          </>
        )}
      </p>
    </div>
  );
}
