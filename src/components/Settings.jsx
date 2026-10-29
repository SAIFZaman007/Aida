import { useEffect, useState } from "react";
import { useSettings, updateSettings } from "../lib/settings.js";
import { allAvatars } from "../lib/avatars.js";

/*
  Settings — a clean, scalable preferences panel.

  Grouped into Avatar & voice / Voice / Microphone / Conversation so new options
  slot in without redesigning anything. Every change writes through
  updateSettings(), which persists to localStorage immediately.

  The avatar is NOT chosen here: each mode has its own avatar (and its voice
  gender), so picking a mode on the main screen picks both.
*/
export default function Settings({ open, onClose }) {
  const s = useSettings();
  const [voices, setVoices] = useState([]);
  const [mics, setMics] = useState([]);

  useEffect(() => {
    if (!open) return;
    const loadVoices = () =>
      setVoices(
        (window.speechSynthesis?.getVoices() || [])
          .filter((v) => /^(en|bn)/i.test(v.lang))
          .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name)),
      );
    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setMics(d.filter((x) => x.kind === "audioinput")))
      .catch(() => {});
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="brackets panel max-h-[85vh] w-[560px] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-hud text-lg uppercase tracking-[0.25em] text-frost">Settings</h2>
          <button onClick={onClose} className="text-steel hover:text-cyan">
            ✕
          </button>
        </div>

        {/* Avatar & voice follow the mode */}
        <section className="mb-6">
          <p className="label mb-2">Avatar &amp; voice</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {allAvatars().map((a) => (
              <div key={a.id} className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-frost/80">{a.label}</span>
                <span className="text-steel">{a.gender === "female" ? "female voice" : "male voice"}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px] text-steel/60">
            Each mode has its own avatar, and the voice changes with it. Choose the mode on the main
            screen; the avatar and voice switch automatically.
          </p>
        </section>

        {/* Voice */}
        <section className="mb-6 space-y-3">
          <p className="label">Voice</p>
          <Row label="Speak responses">
            <Toggle
              on={s.ttsEnabled}
              onClick={() => updateSettings({ ttsEnabled: !s.ttsEnabled })}
            />
          </Row>
          <Row label="Reveal text with the voice">
            <Toggle
              on={s.syncText}
              onClick={() => updateSettings({ syncText: !s.syncText })}
            />
          </Row>
          <p className="font-mono text-[10px] text-steel/60">
            On: each sentence appears as it starts being read, then the next, until the reply is
            finished. Off: the text streams as fast as it is written.
          </p>
          <Row label="Engine">
            <select
              value={s.ttsProvider}
              onChange={(e) => updateSettings({ ttsProvider: e.target.value })}
              className="select"
            >
              <option value="cloud">Gemini · natural (Bengali + English)</option>
              <option value="webspeech">Browser (instant, offline)</option>
            </select>
          </Row>
          {s.ttsProvider === "webspeech" && !voices.some((v) => /^bn/i.test(v.lang)) && (
            <p className="font-mono text-[10px] text-crimson/80">
              No Bengali voice is installed on this device, so Bengali replies will not
              sound right with the browser engine. Choose the Gemini engine, or install a
              Bengali voice in your system settings.
            </p>
          )}
          <Row label="Browser voice">
            <select
              value={s.voiceURI}
              onChange={(e) => updateSettings({ voiceURI: e.target.value })}
              className="select"
            >
              <option value="">Auto (match avatar)</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </Row>
          <p className="font-mono text-[10px] text-steel/60">
            The browser voice is used when the engine is set to Browser, and as an automatic
            fallback if the Gemini voice is unavailable. Rate and pitch apply to it.
          </p>
          <Row label={`Rate · ${s.rate.toFixed(2)}`}>
            <input
              type="range" min="0.6" max="1.4" step="0.05" value={s.rate}
              onChange={(e) => updateSettings({ rate: parseFloat(e.target.value) })}
            />
          </Row>
          <Row label={`Pitch · ${s.pitch.toFixed(2)}`}>
            <input
              type="range" min="0.6" max="1.4" step="0.05" value={s.pitch}
              onChange={(e) => updateSettings({ pitch: parseFloat(e.target.value) })}
            />
          </Row>
        </section>

        {/* Microphone */}
        <section className="mb-6 space-y-3">
          <p className="label">Microphone</p>
          <Row label="Enable microphone">
            <Toggle
              on={s.micEnabled}
              onClick={() => updateSettings({ micEnabled: !s.micEnabled })}
            />
          </Row>
          <Row label="Live captions while I speak">
            <Toggle
              on={s.liveStt !== false}
              onClick={() => updateSettings({ liveStt: s.liveStt === false })}
            />
          </Row>
          <Row label="Input device">
            <select
              value={s.micDeviceId}
              onChange={(e) => updateSettings({ micDeviceId: e.target.value })}
              className="select"
            >
              <option value="">System default</option>
              {mics.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label || "Microphone"}
                </option>
              ))}
            </select>
          </Row>
        </section>

        {/* Conversation */}
        <section className="space-y-3">
          <p className="label">Conversation</p>
          <Row label="Hands-free voice mode (barge-in)">
            <Toggle
              on={s.voiceMode}
              onClick={() => updateSettings({ voiceMode: !s.voiceMode })}
            />
          </Row>
          <p className="font-mono text-[10px] text-steel/60">
            In voice mode AIDA listens continuously; speaking over the avatar stops it
            instantly. Headphones recommended to prevent echo.
          </p>
        </section>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-mono text-[12px] text-frost/80">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        "h-6 w-11 rounded-full border transition " +
        (on ? "border-cyan/60 bg-cyan/30" : "border-line bg-void-700")
      }
    >
      <span
        className={
          "block h-4 w-4 rounded-full bg-frost transition " +
          (on ? "translate-x-6" : "translate-x-1")
        }
      />
    </button>
  );
}