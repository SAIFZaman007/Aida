import { useCallback, useEffect, useRef, useState } from "react";
import ChatPanel from "./components/ChatPanel.jsx";
import Settings from "./components/Settings.jsx";
import Dialog from "./components/Dialog.jsx";
import VideoStage from "./components/VideoStage.jsx";
import HistoryPanel from "./components/HistoryPanel.jsx";
import ControlDock from "./components/ControlDock.jsx";
import SpecialistCarousel from "./components/SpecialistCarousel.jsx";
import WindowControls from "./components/WindowControls.jsx";
import { ChatIcon, ChevronRightIcon, CloseIcon, GearIcon, SparkleIcon } from "./components/icons.jsx";
import { api } from "./lib/api.js";
import { useSettings, updateSettings } from "./lib/settings.js";
import { avatarForPersona, DEFAULT_PERSONA } from "./lib/avatars.js";
import { MODE_LABEL } from "./lib/modes.js";
import { BRAND } from "./lib/brand.js";

const LIVE_PROJECT = "Live Session"; // where sessions started from the mic / chat buttons go
const isTyping = (el) =>
  !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

const IDLE = { speaking: false, listening: false, thinking: false };

export default function App() {
  const settings = useSettings();
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [persona, setPersona] = useState(DEFAULT_PERSONA); // the mode for NEW sessions (no session open)
  const [activity, setActivity] = useState(IDLE); // what the avatar is doing: speaking / listening / thinking
  const [modeNote, setModeNote] = useState("");
  const noteTimer = useRef(0);
  const [status, setStatus] = useState({ online: false, model: "—" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [focusKey, setFocusKey] = useState(0); // bumps to focus the chat composer
  const [autoVoice, setAutoVoice] = useState(true); // false while a session is opened just to type into
  const [starting, setStarting] = useState(false); // a session is being opened for the mic
  const [chatNote, setChatNote] = useState({ kind: "", text: "" }); // voice / mic notices from the chat panel
  const [toast, setToast] = useState("");
  const toastTimer = useRef(0);

  // One avatar per mode. With a session open, the session's mode decides; otherwise the
  // mode chosen for new sessions. The avatar carries the voice gender (see lib/avatars.js).
  const activePersona = conversation?.persona ?? persona;
  const avatar = avatarForPersona(activePersona);

  const handleActivity = useCallback(
    (next) =>
      setActivity((prev) =>
        prev.speaking === next.speaking && prev.listening === next.listening && prev.thinking === next.thinking
          ? prev
          : next,
      ),
    [],
  );

  useEffect(() => {
    const checkHealth = () =>
      api
        .health()
        .then((h) => setStatus({ online: true, model: h.model || "—" }))
        .catch(() => setStatus({ online: false, model: "—" }));

    checkHealth();
    api.listProjects().then(setProjects).catch(() => {});

    const timer = setInterval(checkHealth, 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!project) {
      setConversations([]);
      return;
    }
    api.listConversations(project.id).then(setConversations).catch(() => {});
  }, [project]);

  // ---- Projects CRUD ----
  function newProject() {
    setDialog({
      type: "input",
      title: "New project",
      placeholder: "Project name",
      confirmLabel: "Create",
      onConfirm: async (name) => {
        const p = await api.createProject(name);
        setProjects((ps) => [p, ...ps]);
        setProject(p);
        setConversation(null);
      },
    });
  }
  function renameProject(p) {
    setDialog({
      type: "input",
      title: "Rename project",
      value: p.name,
      confirmLabel: "Save",
      onConfirm: async (name) => {
        const up = await api.updateProject(p.id, { name });
        setProjects((ps) => ps.map((x) => (x.id === p.id ? up : x)));
        if (project?.id === p.id) setProject(up);
      },
    });
  }
  function deleteProject(p) {
    setDialog({
      type: "confirm",
      title: "Delete project",
      message: `Delete "${p.name}" and all its sessions and memory? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        await api.deleteProject(p.id);
        setProjects((ps) => ps.filter((x) => x.id !== p.id));
        if (project?.id === p.id) {
          setProject(null);
          setConversation(null);
        }
      },
    });
  }

  // ---- Conversations CRUD ----
  async function newConversation() {
    if (!project) return;
    const c = await api.createConversation(project.id, "New session", activePersona);
    setConversations((cs) => [c, ...cs]);
    setConversation(c);
  }
  // A session is needed before anything can be said. With none open: use the "Live Session"
  // project (create it once), and open — or start — a session of this mode in it.
  async function ensureSession(id) {
    if (conversation) return conversation;
    let proj = project;
    let created = null;
    if (!proj) {
      proj = projects.find((p) => p.name === LIVE_PROJECT) || null;
      if (!proj) {
        created = await api.createProject(LIVE_PROJECT);
        proj = created;
      }
    }
    const known = proj.id === project?.id ? conversations : await api.listConversations(proj.id);
    let c = known.find((x) => x.persona === id);
    if (!c) {
      c = await api.createConversation(proj.id, id === "nonstop" ? "Non-stop conversation" : `${MODE_LABEL[id] || id} session`, id);
    }
    if (created) setProjects((ps) => [created, ...ps]);
    setProject(proj);
    setConversations([c, ...known.filter((x) => x.id !== c.id)]);
    setConversation(c);
    return c;
  }
  // Non-stop = open, hands-free voice conversation: open (or start) its session and switch the mic on.
  async function startNonstop() {
    setPersona("nonstop");
    updateSettings({ voiceMode: true });
    try {
      await ensureSession("nonstop");
    } catch {
      /* offline: the mode stays selected; the next action tells the person */
    }
  }
  function flashModeNote(text) {
    clearTimeout(noteTimer.current);
    setModeNote(text);
    noteTimer.current = setTimeout(() => setModeNote(""), 5000);
  }
  // Picking a mode picks its avatar (and voice) AT ONCE: the picker, the avatar and the
  // voice switch from local state in the same frame, and the server is told in the
  // background. Nothing on screen waits for the network. The chat request also carries the
  // mode on screen (see ChatPanel), so the server can never answer in a different mode than
  // the avatar shown, even if this background call is slow or fails.
  const modeSeq = useRef(0);
  function selectMode(id) {
    setAutoVoice(true);
    if (id === "nonstop") updateSettings({ voiceMode: true });
    if (!conversation) {
      if (id === "nonstop") return startNonstop();
      setPersona(id);
      return undefined;
    }
    if (conversation.persona === id) return undefined;
    const target = conversation;
    const mySeq = ++modeSeq.current;
    const apply = (c) => {
      setConversations((cs) => cs.map((x) => (x.id === c.id ? c : x)));
      setConversation((cur) => (cur?.id === c.id ? c : cur));
    };
    apply({ ...target, persona: id }); // optimistic
    setPersona(id);
    return api
      .updateConversation(target.id, { persona: id })
      .then((uc) => {
        // Only the LAST pick may touch the screen (quick clicks A -> B -> C must end on C).
        if (modeSeq.current === mySeq) apply({ ...uc, persona: id });
      })
      .catch((e) => {
        if (modeSeq.current !== mySeq) return;
        if (e?.status === 404 || e?.status === 400) {
          apply(target); // the session is gone / the mode is not valid: put the old mode back
          setPersona(target.persona);
          flashModeNote("Could not switch mode — please try again.");
        }
        // Any other failure (a network blip) keeps the new mode on screen: the next message
        // carries it to the server anyway.
      });
  }
  function renameConversation(c) {
    setDialog({
      type: "input",
      title: "Rename session",
      value: c.title,
      confirmLabel: "Save",
      onConfirm: async (title) => {
        const uc = await api.updateConversation(c.id, { title });
        setConversations((cs) => cs.map((x) => (x.id === c.id ? uc : x)));
        if (conversation?.id === c.id) setConversation(uc);
      },
    });
  }
  function deleteConversation(c) {
    setDialog({
      type: "confirm",
      title: "Delete session",
      message: `Delete "${c.title}"? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        await api.deleteConversation(c.id);
        setConversations((cs) => cs.filter((x) => x.id !== c.id));
        if (conversation?.id === c.id) setConversation(null);
      },
    });
  }

  // ---- main-screen controls ----------------------------------------------------------
  const voiceOn = settings.voiceMode && settings.micEnabled;
  const dockState = activity.speaking
    ? "speaking"
    : activity.listening
      ? "capturing"
      : activity.thinking
        ? "thinking"
        : voiceOn
          ? "listening"
          : "idle";

  function flash(text) {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(""), 6000);
  }

  // The big mic: start / stop hands-free voice (opening a session first when none is open).
  async function toggleMic() {
    if (settings.voiceMode) {
      updateSettings({ voiceMode: false });
      return;
    }
    setStarting(true);
    setAutoVoice(true);
    try {
      await ensureSession(activePersona);
      updateSettings({ voiceMode: true });
    } catch {
      flash("Can't reach the server — please check your connection and try again.");
    } finally {
      setStarting(false);
    }
  }

  // "Open text chat": show the rail, make sure there is a session to type into, focus the composer.
  const openChat = useCallback(() => {
    setAutoVoice(false); // text chat must not switch the microphone on by itself
    setChatOpen(true);
    setFocusKey((k) => k + 1);
    if (!conversation) ensureSession(activePersona).catch(() => flash("Can't reach the server — please check your connection and try again."));
  }, [conversation, activePersona, project, projects, conversations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: H = History, C = Chat (only while not typing), Esc closes the open panels.
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || settingsOpen || dialog) return;
      if (e.key === "Escape" && !isTyping(e.target)) {
        setHistoryOpen(false);
        setChatOpen(false);
        return;
      }
      if (isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "h") setHistoryOpen((v) => !v);
      else if (k === "c") (chatOpen ? setChatOpen(false) : openChat());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, dialog, chatOpen, openChat]);

  // The app is one fixed screen (the landing page scrolls).
  useEffect(() => {
    document.body.classList.add("app-locked");
    return () => document.body.classList.remove("app-locked");
  }, []);

  const desktop = typeof window !== "undefined" && !!window.avatar?.win;
  const notice = toast || (chatNote.text && !chatOpen ? chatNote.text : "");
  const noticeIsError = !!toast || chatNote.kind === "error";

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-void-900 text-frost">
      {/* ── The avatar: whole-screen video (idle ⇄ talk) ── */}
      <VideoStage avatar={avatar} activity={activity} />

      {/* Soft scrims keep the text readable over any frame of the video. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(6,8,24,0.78)_0%,rgba(6,8,24,0.42)_30%,rgba(6,8,24,0)_58%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-void-900 via-void-900/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-void-900/80 to-transparent" />

      {/* ── Top bar: logo · mode · settings · window controls ── */}
      <header className={"absolute inset-x-0 top-0 z-30 flex h-[72px] items-center justify-between pl-5 pr-2 " + (desktop ? "app-drag" : "")}>
        <div className="flex items-center gap-3.5">
          <img
            src={BRAND.mark}
            alt="A.I.D.A logo"
            width={46}
            height={46}
            className="h-[46px] w-[46px] rounded-xl border border-violet/40 object-cover shadow-glow"
            draggable={false}
          />
          <div className="leading-none">
            <div className="text-[26px] font-bold tracking-[0.2em] text-white">A.I.D.A</div>
            <div className="mt-1.5 hidden text-[10px] font-medium uppercase tracking-[0.22em] text-steel sm:block">
              Artificial Intelligence · Desktop Assistant
            </div>
          </div>
        </div>
        <div className="app-no-drag flex items-center gap-4">
          <span className="hidden text-[12px] text-steel md:inline">
            Avatar &amp; Knowledge base :<span className="ml-2 font-semibold text-violet-soft">{avatar.label}</span>
          </span>
          {!status.online && (
            <span className="flex items-center gap-1.5 rounded-full border border-crimson/40 bg-crimson/10 px-2.5 py-1 text-[11px] text-crimson" role="status">
              <span className="h-1.5 w-1.5 rounded-full bg-crimson" /> Offline
            </span>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-void-700/50 text-frost/90 transition hover:border-violet/60 hover:text-white hover:shadow-glow"
          >
            <GearIcon size={20} />
          </button>
          <WindowControls />
        </div>
      </header>

      {/* ── Hero text ── */}
      <div
        className={
          "pointer-events-none absolute left-[104px] top-[112px] z-10 w-[min(500px,36vw)] transition-opacity duration-300 " +
          (historyOpen ? "opacity-0" : "opacity-100")
        }
        aria-hidden={historyOpen}
      >
        <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full [@media(max-height:760px)]:hidden border border-violet/50 bg-violet/15 px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white">
          <SparkleIcon size={15} className="text-violet-soft" /> Welcome to A.I.D.A
        </span>
        <h1 className="mt-5 text-[clamp(40px,5vw,66px)] [@media(max-height:760px)]:mt-0 font-bold leading-[1.02] tracking-tight text-white">
          I’m A.<span className="bg-gradient-to-r from-violet-soft to-violet bg-clip-text text-transparent">I.D.A</span>
        </h1>
        <p className="mt-1 text-[clamp(22px,2.6vw,36px)] font-light leading-tight text-frost">Your Virtual AI Team.</p>
        <p className="mt-4 max-w-[400px] text-[14.5px] leading-relaxed text-frost/75 [@media(max-height:820px)]:hidden">
          A unified AI platform with specialized experts to help you plan, build, analyze, create and protect — all in one place.
        </p>
        <div className="mt-5 h-[3px] w-14 rounded-full bg-gradient-to-r from-violet to-violet/0 [@media(max-height:820px)]:hidden" />
      </div>

      {/* ── Notices (mic denied, voice quota…) — also visible while the chat rail is collapsed ── */}
      {notice && (
        <div
          role="status"
          className={
            "glass absolute left-1/2 top-[84px] z-30 max-w-[min(560px,80vw)] -translate-x-1/2 rounded-xl px-4 py-2 text-center text-[12.5px] " +
            (noticeIsError ? "!border-crimson/50 text-crimson" : "text-frost")
          }
        >
          {notice}
        </div>
      )}

      {/* ── Centre: waveform + the three controls ── */}
      <div className="absolute inset-x-0 bottom-[262px] z-10 flex justify-center [@media(max-height:760px)]:bottom-[236px]">
        <ControlDock
          state={dockState}
          voiceOn={voiceOn}
          micAllowed={settings.micEnabled}
          speakOn={settings.ttsEnabled}
          starting={starting}
          onMic={toggleMic}
          onChat={openChat}
          onSpeakToggle={() => updateSettings({ ttsEnabled: !settings.ttsEnabled })}
        />
      </div>

      {/* ── Bottom: Meet your AI specialists ── */}
      <div
        className="absolute bottom-4 z-10 transition-[right,left] duration-300"
        style={{ left: historyOpen ? 332 : 92, right: chatOpen ? "min(472px, 94vw)" : 92 }}
      >
        <SpecialistCarousel active={activePersona} onSelect={selectMode} note={modeNote} />
      </div>

      {/* ── Left rail: History ── */}
      <HistoryPanel
        open={historyOpen}
        onToggle={() => setHistoryOpen((v) => !v)}
        projects={projects}
        project={project}
        conversations={conversations}
        conversation={conversation}
        onPickProject={(p) => {
          setProject(p);
          setConversation(null);
        }}
        onNewProject={newProject}
        onRenameProject={renameProject}
        onDeleteProject={deleteProject}
        onPickSession={(c) => {
          setAutoVoice(true);
          setConversation(c);
        }}
        onNewSession={newConversation}
        onRenameSession={renameConversation}
        onDeleteSession={deleteConversation}
      />

      {/* ── Right rail: Chat. The panel stays mounted while collapsed so the voice loop keeps running. ── */}
      <aside
        aria-label="Chat"
        className={
          "glass absolute bottom-3 right-3 top-[84px] z-20 overflow-hidden rounded-2xl transition-[width] duration-300 " +
          (chatOpen ? "w-[min(460px,94vw)]" : "w-16")
        }
      >
        {!chatOpen && (
          <div className="flex h-full flex-col items-center gap-2 py-4">
            <button
              type="button"
              onClick={openChat}
              title="Chat (C)"
              aria-label="Open chat"
              className="flex w-12 flex-col items-center gap-1 rounded-xl py-2 text-frost/90 transition hover:bg-white/10 hover:text-white"
            >
              <ChatIcon size={22} />
              <span className="text-[10px] font-medium text-steel">Chat</span>
              <span className="text-[10px] text-steel/70">(C)</span>
            </button>
            <button
              type="button"
              onClick={openChat}
              aria-label="Expand chat"
              className="mt-auto flex h-9 w-9 items-center justify-center rounded-lg text-steel transition hover:bg-white/10 hover:text-white"
            >
              <ChevronRightIcon size={18} className="rotate-180" />
            </button>
          </div>
        )}
        <div
          className={chatOpen ? "flex h-full w-[min(460px,94vw)] flex-col" : "hidden"}
          inert={!chatOpen}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-[14px] font-semibold text-white">{conversation?.title ?? "Chat"}</h2>
              <span className="label !text-[9.5px]">
                {project ? project.name : "no project"} · {MODE_LABEL[activePersona] ?? activePersona}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              aria-label="Collapse chat"
              title="Collapse (C)"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-steel transition hover:bg-white/10 hover:text-white"
            >
              <CloseIcon size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel
              conversation={conversation}
              avatar={avatar}
              onActivity={handleActivity}
              onNotice={setChatNote}
              visible={chatOpen}
              focusKey={focusKey}
              autoVoice={autoVoice}
            />
          </div>
        </div>
      </aside>

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} model={status.model} online={status.online} />
      <Dialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
