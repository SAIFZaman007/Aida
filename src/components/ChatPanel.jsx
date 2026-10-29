import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { tts, speechBus } from "../lib/speech.js";
import { VoiceController } from "../lib/voice.js";
import { useSettings, updateSettings } from "../lib/settings.js";
import { detectLanguage } from "../lib/text.js";
import { LiveReply } from "../lib/liveReply.js";
import { BRAND } from "../lib/brand.js";

/*
  ChatPanel — text + real-time voice console.

  THE LOOP (text and voice run together, one sentence at a time)
      sentence 1 appears → it is read aloud → sentence 2 appears → …
  The backend streams `sentence` events as the model writes; each goes to the voice
  queue (tts.speakSentence). The queue tells us — tts.onSentenceStart — the moment a
  sentence begins to be read, and only then is its text shown (lib/liveReply.js).
  Voice for the next sentences is already downloading while the current one plays,
  so there is no dead air. With "Reveal text with the voice" off (or the voice off)
  the text simply streams as fast as the model writes.

  LIVE LISTENING: while the person speaks, a live caption (ghost bubble) shows the
  words as they are recognised; the final text becomes the message a moment after
  they stop. Everything the avatar needs to look alive (speaking / listening /
  thinking) is reported through `onActivity`.

  PERFORMANCE: the in-progress reply renders in ONE small bubble, updated at most
  once per animation frame; finished replies are committed to `messages` once.
*/
export default function ChatPanel({ conversation, avatar, onActivity }) {
  const settings = useSettings();
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(null); // { text } while a reply is being produced / read
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false); // a request is in flight
  const [speaking, setSpeaking] = useState(false);
  const [voiceState, setVoiceState] = useState("idle");
  const [transcribing, setTranscribing] = useState(false);
  const [caption, setCaption] = useState(""); // live words of what the person is saying
  const [voiceNote, setVoiceNote] = useState({ kind: "", text: "" });
  const [highlightRange, setHighlightRange] = useState(null); // {start,end} | null
  // A finished reply that is still being read aloud (only when text is not paced by the voice).
  const [spokenId, setSpokenId] = useState(null);

  const vcRef = useRef(null);
  const meterRef = useRef(null);
  const noteTimer = useRef(0);
  const reqRef = useRef(0); // id of the live request; stale handlers must not touch state
  const busyRef = useRef(false);
  const sendRef = useRef(null); // always the latest send() — voice callbacks must not capture a stale one
  const stopRef = useRef(null);
  const abortRef = useRef(null);
  const liveRef = useRef(null); // LiveReply being produced / read, or null
  const rafRef = useRef(0);
  const scrollRef = useRef(null);
  const markRef = useRef(null);
  const convRef = useRef(conversation);
  convRef.current = conversation;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // ---- voice engine wiring ---------------------------------------------------------
  useEffect(() => {
    tts.onSpeakingChange = setSpeaking;
    tts.onSentenceStart = (index) => {
      const live = liveRef.current;
      if (live) {
        live.reveal(index);
        scheduleFrame();
      }
    };
    tts.onBusyChange = (isBusy) => {
      if (!isBusy) maybeFinish();
    };
    tts.highlighter.onUpdate = (range) => setHighlightRange(range);
    return () => {
      tts.onSpeakingChange = null;
      tts.onSentenceStart = null;
      tts.onBusyChange = null;
      tts.highlighter.onUpdate = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The avatar decides the voice: its gender goes to the cloud voice / browser voice picker.
  useEffect(() => {
    tts.configure(settings, avatar);
  }, [settings, avatar]);

  // What the avatar should be doing right now.
  const capturing = voiceState === "capturing";
  const thinkingNow = (busy && !speaking) || transcribing;
  useEffect(() => {
    onActivity?.({ speaking, listening: capturing, thinking: thinkingNow });
  }, [speaking, capturing, thinkingNow, onActivity]);

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

  // Opening another session: silence and drop whatever belonged to the previous one.
  const conversationId = conversation?.id;
  useEffect(() => {
    discardAll();
    setMessages([]);
    if (!conversationId) return undefined;
    let alive = true;
    api
      .listMessages(conversationId)
      .then((m) => alive && setMessages(m))
      .catch(() => alive && setMessages([]));
    return () => {
      alive = false;
    };
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming, caption]);

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
    if (!visible) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightRange]);

  // ---- the live reply ----------------------------------------------------------------
  // Coalesce updates to one render per frame.
  function scheduleFrame() {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const live = liveRef.current;
      if (live) setStreaming({ text: live.visible() });
    });
  }
  function clearFrame() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }

  /** File the live reply into the history (once) and clear the live bubble. */
  function commitLive({ whole }) {
    const live = liveRef.current;
    if (!live) return null;
    liveRef.current = null; // the guard against double commits: nothing is left to commit
    clearFrame();
    setStreaming(null);
    const text = live.finalText(whole);
    if (!text.trim()) return null;
    const id = "a" + Date.now();
    setMessages((m) => [...m, { id, role: "assistant", content: text }]);
    // Unpaced text is filed while speech may still be going: the highlight follows it.
    if (!live.paced && tts.busy) setSpokenId(id);
    return id;
  }

  /** The reply is complete AND (when paced) has been read to the end → file it away. */
  function maybeFinish() {
    const live = liveRef.current;
    if (live && live.readyToCommit(tts.busy)) commitLive({ whole: true });
  }

  function addError(message) {
    setMessages((m) => [...m, { id: "e" + Date.now(), role: "assistant", content: message, error: true }]);
  }

  /** Silence everything and drop the live reply WITHOUT filing it (the session changed). */
  function discardAll() {
    reqRef.current++;
    abortRef.current?.abort();
    clearFrame();
    liveRef.current = null;
    setStreaming(null);
    setCaption("");
    tts.cancel();
    busyRef.current = false;
    setBusy(false);
    setHighlightRange(null);
    setSpokenId(null);
  }

  // The Stop button, barge-in, and "a new message replaces the reply in progress".
  function stopAll() {
    reqRef.current++; // the in-flight request's handlers become no-ops (no double commit)
    abortRef.current?.abort();
    const live = liveRef.current;
    // A reply that finished generating is complete (and saved) — keep all of it; one
    // that was cut short keeps what the person has actually seen.
    commitLive({ whole: !!live?.streamDone });
    tts.cancel();
    busyRef.current = false;
    setBusy(false);
    setHighlightRange(null);
    setSpokenId(null);
  }

  // interrupt=true (voice): a new utterance replaces the reply still in progress.
  async function send(text, { interrupt = false } = {}) {
    const content = text.trim();
    const conv = convRef.current;
    if (!content || !conv) return;
    if (busyRef.current && !interrupt) return;
    if (busyRef.current || liveRef.current) stopAll(); // also covers "still being read aloud"
    const myReq = ++reqRef.current;
    busyRef.current = true;
    setDraft("");
    setCaption("");
    setBusy(true);
    tts.cancel(); // silence the previous reply so its audio can't mix with this one
    tts.resetStream();
    setHighlightRange(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const s = settingsRef.current;
    const live = new LiveReply({ paced: !!(s.syncText && s.ttsEnabled) });
    liveRef.current = live;
    setMessages((m) => [...m, { id: "u" + Date.now(), role: "user", content }]);
    setStreaming({ text: "" });

    try {
      const full = await api.streamChat(
        { conversationId: conv.id, content },
        (_, f) => {
          if (reqRef.current !== myReq) return;
          live.tokens(f);
          if (!live.paced) scheduleFrame();
        },
        ctrl.signal,
        (sentence) => {
          if (reqRef.current !== myReq) return;
          live.sentence(sentence);
          tts.speakSentence(sentence);
        },
      );
      if (reqRef.current !== myReq) return;
      live.complete(full);
      busyRef.current = false;
      setBusy(false);
      if (live.paced) scheduleFrame();
      maybeFinish(); // done already? otherwise it is filed when the last sentence has been read
    } catch (e) {
      if (reqRef.current !== myReq) return; // superseded or stopped: stopAll() already tidied up
      if (e.name === "AbortError") {
        commitLive({ whole: false });
      } else {
        // Keep whatever was already shown (the server saves partial replies too).
        commitLive({ whole: false });
        tts.cancel();
        const ref = e.requestId ? ` (ref ${e.requestId})` : "";
        addError("⚠ " + e.message + ref);
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
        live: settings.liveStt !== false,
        onState: setVoiceState,
        // Latest send()/stop via refs: this controller outlives many renders.
        onUtterance: (t) => sendRef.current?.(t, { interrupt: true }),
        onInterim: setCaption,
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
      setCaption("");
    }
    return () => {
      if (!settings.voiceMode && vcRef.current) {
        vcRef.current.stop();
        vcRef.current = null;
      }
    };
  }, [settings.voiceMode, settings.micEnabled, settings.micDeviceId, settings.liveStt]);

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
      <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
        <img
          src={BRAND.logo}
          alt="A.I.D.A — Artificial Intelligence · Desktop Assistant"
          className="w-full max-w-[420px] select-none"
          draggable={false}
        />
        <p className="font-mono text-sm text-steel">Select or create a conversation to begin.</p>
      </div>
    );
  }

  const listening = voiceState !== "idle";
  const canStop = busy || speaking || !!streaming;
  const phase = capturing
    ? "listening to you…"
    : transcribing
      ? "transcribing…"
      : speaking
        ? "speaking — talk to interrupt"
        : busy
          ? "thinking…"
          : "awaiting your voice…";

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
        {caption && <Bubble role="user" text={caption} ghost />}
      </div>

      <div className="border-t border-line bg-void-900/60 px-4 py-3">
        {(listening || voiceNote.text) && (
          <div className="mb-2 space-y-1 font-mono text-[10px] uppercase tracking-widest">
            {listening && (
              <div className="flex items-center gap-2 text-cyan">
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan" />
                <span>{phase}</span>
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
            {settings.voiceMode ? "⏹" : "●"}
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
              <span className="text-xs">{"■"}</span> Stop
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
function Bubble({ role, text, error, streaming, ghost, highlightRange, markRef }) {
  const isUser = role === "user";
  // lang lets the browser pick Bengali shaping/fonts and screen readers the right voice.
  const lang = detectLanguage(text) === "bn" ? "bn" : undefined;
  return (
    <div className={"flex animate-rise " + (isUser ? "justify-end" : "justify-start")}>
      <div
        lang={lang}
        className={
          "max-w-[80%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-[13px] leading-relaxed " +
          (ghost
            ? "border border-dashed border-cyan/40 bg-cyan/5 italic text-frost/80"
            : isUser
              ? "border border-cyan/25 bg-cyan/5 text-frost"
              : error
                ? "border border-crimson/40 bg-crimson/5 text-crimson"
                : "border border-line bg-void-700/70 text-frost")
        }
      >
        {!isUser && !error && <div className="label mb-1">aida</div>}
        {ghost && <div className="label mb-1 not-italic">listening…</div>}
        {streaming && !text ? (
          <span className="animate-pulse font-mono text-xs text-steel">thinking…</span>
        ) : (
          <span className={streaming || ghost ? "caret" : ""}>
            {highlightRange ? renderHighlighted(text, highlightRange, markRef) : text}
          </span>
        )}
      </div>
    </div>
  );
}
