import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { tts, speechBus } from "../lib/speech.js";
import { VoiceController } from "../lib/voice.js";
import { useSettings, updateSettings } from "../lib/settings.js";
import { getAvatar } from "../lib/avatars.js";

/*
  ChatPanel — text + real-time voice console.

  PERFORMANCE: the in-progress reply streams into a dedicated `streaming` state
  rendered by ONE small bubble, and token updates are coalesced to at most one
  setState per animation frame (requestAnimationFrame). The completed `messages`
  list is therefore not copied or re-rendered on every token — the old O(n)
  per-token churn that made long chats feel laggy is gone. Finished replies are
  committed to `messages` once, on completion.

  Plus: simultaneous voice (tts.feed), a Stop button (abort + tts.cancel), and
  hands-free voice mode with barge-in.

  READING HIGHLIGHTER: the backend now emits per-sentence SSE "sentence" events
  as soon as a sentence boundary is produced. Each sentence is registered with
  tts.highlighter (lib/highlighter.js), which then drives a live [start,end)
  character range — synced either to Piper word-level marks (speak_marks) or
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
  const [highlightRange, setHighlightRange] = useState(null); // {start,end} | null

  const vcRef = useRef(null);
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
      tts.feed(full);
    });
  }
  function clearFrame() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }

  function commitAssistant(text, opts = {}) {
    setMessages((m) => [
      ...m,
      { id: "a" + Date.now(), role: "assistant", content: text, ...opts },
    ]);
    setStreaming(null);
    setHighlightRange(null);
  }

  function stopAll() {
    abortRef.current?.abort();
    clearFrame();
    tts.cancel();
    setSpeaking(false);
    setSpeakingLocal(false);
    setBusy(false);
    if (pendingRef.current.trim()) commitAssistant(pendingRef.current);
    else setStreaming(null);
    setHighlightRange(null);
  }

  async function send(text) {
    const content = text.trim();
    const conv = convRef.current;
    if (!content || !conv || busy) return;
    setDraft("");
    setBusy(true);
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
          pendingRef.current = f;
          scheduleFrame();
        },
        ctrl.signal,
        (sentence) => tts.registerSentence(sentence),
      );
      clearFrame();
      tts.feed(full);
      tts.flush();
      commitAssistant(full);
    } catch (e) {
      clearFrame();
      if (e.name === "AbortError") {
        if (pendingRef.current.trim()) commitAssistant(pendingRef.current);
        else setStreaming(null);
      } else {
        commitAssistant("\u26A0 " + e.message, { error: true });
      }
    } finally {
      setBusy(false);
    }
  }

  // Hands-free voice mode lifecycle.
  useEffect(() => {
    const wantOn = settings.voiceMode && settings.micEnabled;
    if (wantOn && !vcRef.current) {
      const vc = new VoiceController({
        deviceId: settings.micDeviceId,
        onState: setVoiceState,
        onUtterance: (t) => send(t),
        onBargeIn: () => tts.cancel(),
        isSpeaking: () => speechBus.speaking,
      });
      vcRef.current = vc;
      vc.start().catch(() => {
        vcRef.current = null;
        setVoiceState("idle");
      });
    } else if (!wantOn && vcRef.current) {
      vcRef.current.stop();
      vcRef.current = null;
      setVoiceState("idle");
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
          <Bubble key={m.id} role={m.role} error={m.error} text={m.content} />
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
        {listening && (
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-cyan">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan" />
            {voiceState === "capturing" ? "listening to you…" : "awaiting your voice…"}
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
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={1}
            placeholder="Transmit a message…  (Enter to send · Shift+Enter for newline)"
            className="max-h-40 flex-1 resize-none rounded-lg border border-line bg-void-700 px-4 py-3 font-mono text-[13px] text-frost placeholder:text-steel/50 focus:border-cyan/50 focus:outline-none"
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
  return (
    <div className={"flex animate-rise " + (isUser ? "justify-end" : "justify-start")}>
      <div
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
        <span className={streaming ? "caret" : ""}>
          {streaming ? renderHighlighted(text, highlightRange, markRef) : text}
        </span>
      </div>
    </div>
  );
}
