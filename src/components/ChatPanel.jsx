import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { tts, speechBus } from "../lib/speech.js";
import { VoiceController } from "../lib/voice.js";
import { useSettings, updateSettings } from "../lib/settings.js";
import { getAvatar } from "../lib/avatars.js";
import { detectLanguage } from "../lib/text.js";

/*
  ChatPanel — text + real-time voice console.

  PERFORMANCE: the in-progress reply streams into a dedicated `streaming` state
  rendered by ONE small bubble, and token updates are coalesced to at most one
  setState per animation frame (requestAnimationFrame). The completed `messages`
  list is therefore not copied or re-rendered on every token — the old O(n)
  per-token churn that made long chats feel laggy is gone. Finished replies are
  committed to `messages` once, on completion.

  Plus: simultaneous voice (the backend's `sentence` events feed tts.speakSentence,
  so voice and highlighter share one set of Bengali/English-aware boundaries),
  a Stop button (abort + tts.cancel), and hands-free voice mode with barge-in.

  READING HIGHLIGHTER: the backend now emits per-sentence SSE "sentence" events
  as soon as a sentence boundary is produced. Each sentence is registered with
  tts.highlighter (lib/highlighter.js), which then drives a live [start,end)
  character range — synced either to cloud-voice word-level marks (speak_marks) or
  to the Web Speech "boundary" event — via tts.highlighter.onUpdate. The
  streaming bubble renders that range as a <mark> and auto-scrolls it into
  view, teleprompter-style.
*/
export default function ChatPanel({ conversation, setSpeaking }) {
  const settings = useSettings();
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(null); // { text } while generating
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeakingLocal] = useState(false);
  const [voiceState, setVoiceState] = useState("idle");
  const [transcribing, setTranscribing] = useState(false);
  const [voiceNote, setVoiceNote] = useState({ kind: "", text: "" });
  const [highlightRange, setHighlightRange] = useState(null); // {start,end} | null
  // The finished reply that is still being read aloud. Speech usually outlasts
  // streaming, so the highlight must follow the reply into `messages`.
  const [spokenId, setSpokenId] = useState(null);

  const vcRef = useRef(null);
  const meterRef = useRef(null);
  const noteTimer = useRef(0);
  const reqRef = useRef(0); // id of the live request; stale handlers must not touch state
  const busyRef = useRef(false);
  const sendRef = useRef(null); // always the latest send() — voice callbacks must not capture a stale one
  const stopRef = useRef(null);
  const abortRef = useRef(null);
  const pendingRef = useRef("");
  const rafRef = useRef(0);
  const scrollRef = useRef(null);
  const markRef = useRef(null);
  const convRef = useRef(conversation);
  convRef.current = conversation;

  useEffect(() => {
    tts.onSpeakingChange = (v) => {
      setSpeaking(v);
      setSpeakingLocal(v);
    };
    tts.configure(settings, getAvatar(settings.avatar));
  }, [settings, setSpeaking]);

  // Drive the live highlight range from the TTS highlighter.
  useEffect(() => {
    tts.highlighter.onUpdate = (range) => setHighlightRange(range);
    return () => {
      tts.highlighter.onUpdate = null;
    };
  }, []);

  // A Non-stop session means "keep listening": switch hands-free voice on.
  useEffect(() => {
    if (conversation?.persona === "nonstop") updateSettings({ voiceMode: true });
  }, [conversation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // While hands-free voice is on, keep the screen awake (a sleeping display or
  // throttled tab would end the conversation mid-presentation).
  useEffect(() => {
    if (!settings.voiceMode || !navigator.wakeLock) return undefined;
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request("screen");
        if (cancelled) l.release().catch(() => {});
        else lock = l;
      } catch {
        /* unsupported or denied: not essential */
      }
    };
    const onVisible = () => {
      if (!document.hidden) acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [settings.voiceMode]);

  useEffect(() => {
    if (!conversation) return;
    api.listMessages(conversation.id).then(setMessages).catch(() => setMessages([]));
    setStreaming(null);
    setHighlightRange(null);
  }, [conversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  // Auto-scroll the active highlight into view, smoothly, without yanking
  // the viewport when it's already visible.
  useEffect(() => {
    if (!highlightRange || !markRef.current) return;
    const el = markRef.current;
    const container = scrollRef.current;
    if (!container) return;
    const elRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    const visible = elRect.top >= cRect.top && elRect.bottom <= cRect.bottom;
    if (!visible) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [highlightRange]);

  // Coalesce token updates to one render per frame.
  function scheduleFrame() {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const full = pendingRef.current;
      setStreaming((s) => (s ? { text: full } : s));
    });
  }
  function clearFrame() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }

  function commitAssistant(text, opts = {}) {
    const id = "a" + Date.now();
    setMessages((m) => [...m, { id, role: "assistant", content: text, ...opts }]);
    setStreaming(null);
    // Keep any active highlight: tts.highlighter clears it itself when speech ends.
    setSpokenId(opts.error ? null : id);
  }

  function stopAll() {
    reqRef.current++; // the in-flight request's handlers become no-ops (no double commit)
    abortRef.current?.abort();
    clearFrame();
    tts.cancel();
    setSpeaking(false);
    setSpeakingLocal(false);
    busyRef.current = false;
    setBusy(false);
    if (pendingRef.current.trim()) commitAssistant(pendingRef.current);
    else setStreaming(null);
    pendingRef.current = "";
    setHighlightRange(null);
    setSpokenId(null);
  }

  // interrupt=true (voice): a new utterance replaces the reply still in progress.
  async function send(text, { interrupt = false } = {}) {
    const content = text.trim();
    const conv = convRef.current;
    if (!content || !conv) return;
    if (busyRef.current) {
      if (!interrupt) return;
      stopAll();
    }
    const myReq = ++reqRef.current;
    busyRef.current = true;
    setDraft("");
    setBusy(true);
    tts.cancel(); // silence the previous reply so its audio can't mix with this one
    tts.resetStream();
    pendingRef.current = "";
    setHighlightRange(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setMessages((m) => [...m, { id: "u" + Date.now(), role: "user", content }]);
    setStreaming({ text: "" });

    try {
      const full = await api.streamChat(
        { conversationId: conv.id, content },
        (_, f) => {
          if (reqRef.current !== myReq) return;
          pendingRef.current = f;
          scheduleFrame();
        },
        ctrl.signal,
        (sentence) => {
          if (reqRef.current === myReq) tts.speakSentence(sentence);
        },
      );
      if (reqRef.current !== myReq) return;
      clearFrame();
      commitAssistant(full);
    } catch (e) {
      if (reqRef.current !== myReq) return; // superseded or stopped: stopAll() already tidied up
      clearFrame();
      if (e.name === "AbortError") {
        if (pendingRef.current.trim()) commitAssistant(pendingRef.current);
        else setStreaming(null);
      } else {
        // Keep whatever was already shown (the server saves partial replies too).
        if (pendingRef.current.trim()) commitAssistant(pendingRef.current);
        const ref = e.requestId ? ` (ref ${e.requestId})` : "";
        commitAssistant("\u26A0 " + e.message + ref, { error: true });
      }
    } finally {
      if (reqRef.current === myReq) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  sendRef.current = send;
  stopRef.current = stopAll;

  function showNote(kind, text) {
    clearTimeout(noteTimer.current);
    setVoiceNote({ kind, text });
    if (text) noteTimer.current = setTimeout(() => setVoiceNote({ kind: "", text: "" }), kind === "error" ? 9000 : 4000);
  }

  // Hands-free voice mode lifecycle.
  useEffect(() => {
    const wantOn = settings.voiceMode && settings.micEnabled;
    if (wantOn && !vcRef.current) {
      const vc = new VoiceController({
        deviceId: settings.micDeviceId,
        onState: setVoiceState,
        // Latest send()/stop via refs: this controller outlives many renders.
        onUtterance: (t) => sendRef.current?.(t, { interrupt: true }),
        onBargeIn: () => stopRef.current?.(),
        isSpeaking: () => speechBus.speaking,
        onLevel: ({ level, threshold }) => {
          const el = meterRef.current;
          if (el) el.style.width = Math.min(100, (level / Math.max(threshold * 2, 0.02)) * 100) + "%";
        },
        onStatus: ({ kind, text }) => {
          if (kind === "busy") setTranscribing(!!text);
          else showNote(kind, text);
        },
        onFatal: () => {
          vcRef.current = null;
          updateSettings({ voiceMode: false });
        },
      });
      vcRef.current = vc;
      vc.start().catch((e) => {
        vcRef.current = null;
        setVoiceState("idle");
        showNote("error", e?.message || "Could not start the microphone.");
        updateSettings({ voiceMode: false });
      });
    } else if (!wantOn && vcRef.current) {
      vcRef.current.stop();
      vcRef.current = null;
      setVoiceState("idle");
      setTranscribing(false);
    }
    return () => {
      if (!settings.voiceMode && vcRef.current) {
        vcRef.current.stop();
        vcRef.current = null;
      }
    };
  }, [settings.voiceMode, settings.micEnabled, settings.micDeviceId]);

  useEffect(
    () => () => {
      clearFrame();
      vcRef.current?.stop();
      tts.cancel();
    },
    [],
  );

  function toggleVoiceMode() {
    updateSettings({ voiceMode: !settings.voiceMode });
  }

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-sm text-steel">
          Select or create a conversation to begin.
        </p>
      </div>
    );
  }

  const listening = voiceState !== "idle";
  const canStop = busy || speaking;

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((m) => (
          <Bubble
            key={m.id}
            role={m.role}
            error={m.error}
            text={m.content}
            highlightRange={m.id === spokenId ? highlightRange : null}
            markRef={markRef}
          />
        ))}
        {streaming && (
          <Bubble
            role="assistant"
            text={streaming.text}
            streaming
            highlightRange={highlightRange}
            markRef={markRef}
          />
        )}
      </div>

      <div className="border-t border-line bg-void-900/60 px-4 py-3">
        {(listening || voiceNote.text) && (
          <div className="mb-2 space-y-1 font-mono text-[10px] uppercase tracking-widest">
            {listening && (
              <div className="flex items-center gap-2 text-cyan">
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan" />
                <span>
                  {voiceState === "capturing"
                    ? "listening to you…"
                    : transcribing
                      ? "transcribing…"
                      : "awaiting your voice…"}
                </span>
                <span
                  className="h-1.5 w-28 overflow-hidden rounded-full bg-cyan/15"
                  title="Live microphone level"
                  aria-hidden="true"
                >
                  <span ref={meterRef} className="block h-full w-0 rounded-full bg-cyan" />
                </span>
              </div>
            )}
            {voiceNote.text && (
              <div
                role="status"
                className={"normal-case tracking-normal " + (voiceNote.kind === "error" ? "text-crimson" : "text-steel")}
              >
                {voiceNote.text}
              </div>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={toggleVoiceMode}
            title={settings.voiceMode ? "Stop hands-free voice" : "Start hands-free voice"}
            className={
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-base transition " +
              (settings.voiceMode
                ? "border-cyan bg-cyan/20 text-cyan"
                : "border-line text-steel hover:border-cyan/50 hover:text-cyan")
            }
          >
            {settings.voiceMode ? "\u23F9" : "\u25CF"}
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // isComposing: Bengali/phonetic IMEs use Enter to commit a word.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={1}
            placeholder="Transmit a message…  (Enter to send · Shift+Enter for newline)"
            className="max-h-40 flex-1 resize-none rounded-lg border border-line bg-void-700 px-4 py-3 font-mono text-[13px] text-frost placeholder:text-steel/50 focus:border-cyan/50 focus:outline-hidden"
          />
          {canStop ? (
            <button
              onClick={stopAll}
              title="Stop generating / speaking"
              className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-crimson/50 bg-crimson/15 px-5 font-hud text-sm font-semibold uppercase tracking-wider text-crimson transition hover:bg-crimson/25"
            >
              <span className="text-xs">{"\u25A0"}</span> Stop
            </button>
          ) : (
            <button
              onClick={() => send(draft)}
              disabled={!draft.trim()}
              className="h-11 shrink-0 rounded-lg border border-cyan/40 bg-cyan/15 px-5 font-hud text-sm font-semibold uppercase tracking-wider text-cyan transition hover:bg-cyan/25 disabled:opacity-25"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Split bubble text into [before, highlighted, after] for the reading
// progress highlighter. `range` is {start, end} character offsets into
// `text`, or null/out-of-bounds to render plain text.
function renderHighlighted(text, range, markRef) {
  if (!range || range.start == null || range.end == null) return text;
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  if (start >= end) return text;
  const before = text.slice(0, start);
  const current = text.slice(start, end);
  const after = text.slice(end);
  return (
    <>
      {before}
      <mark ref={markRef} className="reading-highlight">
        {current}
      </mark>
      {after}
    </>
  );
}

// Isolated so streaming updates only touch this one bubble.
function Bubble({ role, text, error, streaming, highlightRange, markRef }) {
  const isUser = role === "user";
  // lang lets the browser pick Bengali shaping/fonts and screen readers the right voice.
  const lang = detectLanguage(text) === "bn" ? "bn" : undefined;
  return (
    <div className={"flex animate-rise " + (isUser ? "justify-end" : "justify-start")}>
      <div
        lang={lang}
        className={
          "max-w-[80%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-[13px] leading-relaxed " +
          (isUser
            ? "border border-cyan/25 bg-cyan/5 text-frost"
            : error
              ? "border border-crimson/40 bg-crimson/5 text-crimson"
              : "border border-line bg-void-700/70 text-frost")
        }
      >
        {!isUser && !error && <div className="label mb-1">aida</div>}
        {streaming && !text ? (
          <span className="animate-pulse font-mono text-xs text-steel">thinking…</span>
        ) : (
          <span className={streaming ? "caret" : ""}>
            {highlightRange ? renderHighlighted(text, highlightRange, markRef) : text}
          </span>
        )}
      </div>
    </div>
  );
}
