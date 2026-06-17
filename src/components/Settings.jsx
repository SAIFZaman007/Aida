import { useEffect, useState } from "react";
import { useSettings, updateSettings } from "../lib/settings.js";
import { AVATARS } from "../lib/avatars.js";

/*
  Settings — a clean, scalable preferences panel.

  Grouped into Avatar / Voice / Microphone / Conversation so new options slot in
  without redesigning anything. Every change writes through updateSettings(),
  which persists to localStorage immediately, so choices survive restarts and
  the voice never reverts to a random gender.
*/
export default function Settings({ open, onClose }) {
  const s = useSettings();
  const [voices, setVoices] = useState([]);
  const [mics, setMics] = useState([]);

  useEffect(() => {
    if (!open) return;
    const loadVoices = () =>
      setVoices((window.speechSynthesis?.getVoices() || []).filter((v) => v.lang.startsWith("en")));
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
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

        {/* Avatar */}
        <section className="mb-6">
          <p className="label mb-2">Avatar</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(AVATARS).map((a) => (
              <button
                key={a.id}
                onClick={() => updateSettings({ avatar: a.id, voiceURI: "" })}
                className={
                  "rounded-lg border p-3 text-left transition " +
                  (s.avatar === a.id
                    ? "border-cyan/60 bg-cyan/10"
                    : "border-line hover:border-cyan/40")
                }
              >
                <div className="font-hud text-sm text-frost">{a.label}</div>
                <div className="font-mono text-[10px] text-steel">{a.role}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px] text-steel/60">
            Changing the avatar re-picks a matching voice automatically.
          </p>
          <div className="mt-3 space-y-2">
            <p className="label">Custom model URLs (optional)</p>
            <input
              value={s.customAvatarFemale}
              onChange={(e) => updateSettings({ customAvatarFemale: e.target.value })}
              placeholder="Female .glb URL (e.g. https://models.readyplayer.me/<id>.glb)"
              className="w-full rounded-md border border-line bg-void-700 px-2 py-1.5 font-mono text-[11px] text-frost placeholder:text-steel/40 focus:border-cyan/50 focus:outline-none"
            />
            <input
              value={s.customAvatarMale}
              onChange={(e) => updateSettings({ customAvatarMale: e.target.value })}
              placeholder="Male .glb URL"
              className="w-full rounded-md border border-line bg-void-700 px-2 py-1.5 font-mono text-[11px] text-frost placeholder:text-steel/40 focus:border-cyan/50 focus:outline-none"
            />
            <p className="font-mono text-[10px] text-steel/60">
              Paste any hosted .glb (ARKit/Oculus morph targets recommended). Leave
              blank to use the local file in public/avatars/.
            </p>
          </div>
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
          <Row label="Engine">
            <select
              value={s.ttsProvider}
              onChange={(e) => updateSettings({ ttsProvider: e.target.value })}
              className="select"
            >
              <option value="webspeech">Browser (instant)</option>
              <option value="piper">Piper · natural (needs backend)</option>
            </select>
          </Row>
          <Row label="Voice">
            <select
              value={s.voiceURI}
              onChange={(e) => updateSettings({ voiceURI: e.target.value })}
              className="select"
            >
              <option value="">Auto (match avatar)</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                </option>
              ))}
            </select>
          </Row>
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
            In voice mode AIDA listens continuously; speaking over her stops her
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