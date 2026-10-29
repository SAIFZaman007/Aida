import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import ChatPanel from "./components/ChatPanel.jsx";
import Settings from "./components/Settings.jsx";
import Dialog from "./components/Dialog.jsx";
import { api } from "./lib/api.js";
import { useSettings, updateSettings } from "./lib/settings.js";
import { avatarForPersona, DEFAULT_PERSONA } from "./lib/avatars.js";
import { MODES, MODE_LABEL, MODE_HINT } from "./lib/modes.js";
import { BRAND } from "./lib/brand.js";

// The 3D stage (three.js, ~1 MB) loads on its own, so the chat UI is interactive first.
const AvatarStage = lazy(() => import("./components/AvatarStage.jsx"));

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
  // Non-stop = open, hands-free voice conversation. With no session open: make sure a
  // project exists, open (or start) a Non-stop session in it and switch the mic on.
  async function startNonstop() {
    setPersona("nonstop");
    updateSettings({ voiceMode: true });
    try {
      const existing = project && conversations.find((x) => x.persona === "nonstop");
      if (existing) {
        setConversation(existing); // instant: no network round trip
        return;
      }
      let proj = project;
      let created = null;
      if (!proj) {
        created = await api.createProject("Live Session");
        proj = created;
      }
      const c = await api.createConversation(proj.id, "Non-stop conversation", "nonstop");
      if (created) {
        setProjects((ps) => [created, ...ps]);
        setProject(created);
      }
      setConversations((cs) => [c, ...cs.filter((x) => x.id !== c.id)]);
      setConversation(c);
    } catch {
      /* offline: the status badge already says so; the mode stays selected */
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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      {/* ── Top status bar ── */}
      <header className="flex items-center justify-between border-b border-line px-6 py-2.5">
        <div className="flex items-center gap-3">
          <img
            src={BRAND.mark}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-xl shadow-glow"
            draggable={false}
          />
          <span className="font-hud text-2xl font-bold tracking-[0.3em] text-frost">A.I.D.A</span>
          <span className="label hidden lg:inline">artificial intelligence · desktop assistant</span>
        </div>
        <div className="flex items-center gap-5 font-mono text-[11px]">
          <span className="text-steel">
            avatar<span className="ml-2 text-cyan">{avatar.label}</span>
          </span>
          <span className="text-steel">
            brain<span className="ml-2 text-cyan">{status.model}</span>
          </span>
          <span className="flex items-center gap-2">
            <span
              className={"h-2 w-2 rounded-full " + (status.online ? "bg-cyan shadow-glow" : "bg-steel/50")}
            />
            <span className={status.online ? "text-cyan" : "text-steel"}>
              {status.online ? "ONLINE" : "OFFLINE"}
            </span>
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="rounded-md border border-line px-2 py-1 text-steel transition hover:border-cyan/50 hover:text-cyan"
          >
            ⚙
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Left: workspace rail ── */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-line">
          <div className="flex items-center justify-between px-5 py-3">
            <span className="label">Projects</span>
            <button onClick={newProject} className="text-cyan hover:text-frost" title="New project">
              +
            </button>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto px-3">
            {projects.map((p) => (
              <div
                key={p.id}
                className={
                  "group flex items-center rounded-md transition " +
                  (project?.id === p.id ? "bg-cyan/10" : "hover:bg-void-700")
                }
              >
                <button
                  onClick={() => {
                    setProject(p);
                    setConversation(null);
                  }}
                  className={
                    "flex-1 truncate px-3 py-2 text-left font-mono text-[12px] " +
                    (project?.id === p.id ? "text-cyan" : "text-steel group-hover:text-frost")
                  }
                >
                  {p.name}
                </button>
                <div className="hidden gap-1 pr-2 group-hover:flex">
                  <button onClick={() => renameProject(p)} title="Rename" className="text-steel hover:text-cyan">
                    ✎
                  </button>
                  <button onClick={() => deleteProject(p)} title="Delete" className="text-steel hover:text-crimson">
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {projects.length === 0 && (
              <p className="px-3 py-2 font-mono text-[11px] text-steel/60">No projects yet.</p>
            )}
          </div>

          {project && (
            <div className="border-t border-line">
              <div className="flex items-center justify-between px-5 py-3">
                <span className="label">Sessions</span>
                <button onClick={newConversation} className="text-cyan hover:text-frost" title="New session">
                  +
                </button>
              </div>
              <div className="max-h-52 space-y-1 overflow-y-auto px-3 pb-3">
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    className={
                      "group flex items-center rounded-md transition " +
                      (conversation?.id === c.id ? "bg-void-600" : "hover:bg-void-700")
                    }
                  >
                    <button
                      onClick={() => setConversation(c)}
                      className={
                        "flex-1 truncate px-3 py-1.5 text-left font-mono text-[11px] " +
                        (conversation?.id === c.id ? "text-frost" : "text-steel")
                      }
                    >
                      {c.title}
                    </button>
                    <div className="hidden gap-1 pr-2 group-hover:flex">
                      <button onClick={() => renameConversation(c)} title="Rename" className="text-steel hover:text-cyan">
                        ✎
                      </button>
                      <button onClick={() => deleteConversation(c)} title="Delete" className="text-steel hover:text-crimson">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── Center: avatar core ── */}
        <section className="relative flex w-[38%] min-w-[340px] flex-col border-r border-line">
          <div className="min-h-0 flex-1">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase tracking-widest text-steel">
                  loading avatar…
                </div>
              }
            >
              <AvatarStage avatar={avatar} activity={activity} />
            </Suspense>
          </div>
          <div className="brackets m-4 panel p-3">
            <span className="label">Mode</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MODES.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => selectMode(id)}
                  aria-pressed={activePersona === id}
                  title={MODE_HINT[id]}
                  className={
                    "rounded-md border px-2.5 py-1 font-hud text-[11px] uppercase tracking-wider transition " +
                    (activePersona === id
                      ? "border-cyan/60 bg-cyan/15 text-cyan"
                      : "border-line text-steel hover:border-cyan/40 hover:text-frost")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <p
              role="status"
              className={"mt-2 font-mono text-[10px] " + (modeNote ? "text-crimson" : "text-steel/60")}
            >
              {modeNote ||
                MODE_HINT[activePersona] ||
                (conversation
                  ? "Each mode has its own avatar and voice."
                  : "New sessions use this mode. Each mode has its own avatar and voice.")}
            </p>
          </div>
        </section>

        {/* ── Right: chat console ── */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-line px-6 py-3">
            <div>
              <h2 className="font-hud text-base tracking-wide text-frost">
                {conversation?.title ?? "No session"}
              </h2>
              <span className="label">
                {project ? project.name : "no project"} ·{" "}
                {MODE_LABEL[activePersona] ?? activePersona}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel conversation={conversation} avatar={avatar} onActivity={handleActivity} />
          </div>
        </main>
      </div>

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Dialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}