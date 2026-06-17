import { useEffect, useState } from "react";
import AvatarStage from "./components/AvatarStage.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import Settings from "./components/Settings.jsx";
import Dialog from "./components/Dialog.jsx";
import { api } from "./lib/api.js";
import { useSettings } from "./lib/settings.js";
import { getAvatar, resolveAvatarUrl } from "./lib/avatars.js";

const PERSONAS = [
  ["executive", "Executive"],
  ["developer", "Developer"],
  ["coder", "Coder"],
  ["architect", "Architect"],
  ["security", "Security"],
  ["ccna_trainer", "CCNA"],
  ["researcher", "Research"],
  ["writer", "Writer"],
];

export default function App() {
  const settings = useSettings();
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [persona, setPersona] = useState("executive");
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState({ online: false, model: "—" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialog, setDialog] = useState(null);

  const avatar = getAvatar(settings.avatar);
  const avatarUrl = resolveAvatarUrl(settings, avatar);

  useEffect(() => {
    api
      .health()
      .then((h) => setStatus({ online: true, model: h.model || "—" }))
      .catch(() => setStatus({ online: false, model: "—" }));
    api.listProjects().then(setProjects).catch(() => {});
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
    const c = await api.createConversation(project.id, "New session", persona);
    setConversations((cs) => [c, ...cs]);
    setConversation(c);
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
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-hud text-2xl font-bold tracking-[0.3em] text-frost">A.I.D.A</span>
          <span className="label">artificial intelligence · desktop assistant</span>
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
            <AvatarStage avatarUrl={avatarUrl} speaking={speaking} />
          </div>
          <div className="brackets m-4 panel p-3">
            <span className="label">Mode</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PERSONAS.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setPersona(id)}
                  className={
                    "rounded-md border px-2.5 py-1 font-hud text-[11px] uppercase tracking-wider transition " +
                    (persona === id
                      ? "border-cyan/60 bg-cyan/15 text-cyan"
                      : "border-line text-steel hover:border-cyan/40 hover:text-frost")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 font-mono text-[10px] text-steel/60">New sessions use this mode.</p>
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
                {project ? project.name : "no project"} · {conversation?.persona ?? persona}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel conversation={conversation} setSpeaking={setSpeaking} />
          </div>
        </main>
      </div>

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Dialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}