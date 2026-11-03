import { HistoryIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, EditIcon, CloseIcon } from "./icons.jsx";

/*
  HistoryPanel — the left rail. Collapsed: one History button and an expand arrow.
  Expanded: the projects and the sessions of the selected project (same actions as before:
  create, open, rename, delete). The panel stays mounted when collapsed only as a rail;
  the lists are not rendered then.
*/
export default function HistoryPanel({
  open,
  onToggle,
  projects,
  project,
  conversations,
  conversation,
  onPickProject,
  onNewProject,
  onRenameProject,
  onDeleteProject,
  onPickSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
}) {
  const iconBtn = "flex h-9 w-9 items-center justify-center rounded-lg text-steel transition hover:bg-frost/10 hover:text-frost";
  return (
    <aside
      aria-label="History"
      className={
        "glass absolute bottom-3 left-3 top-[84px] z-20 flex flex-col overflow-hidden rounded-2xl transition-[width] duration-300 " +
        (open ? "w-[min(300px,86vw)]" : "w-16")
      }
    >
      {!open ? (
        <div className="flex flex-1 flex-col items-center gap-2 py-4">
          <button
            type="button"
            onClick={onToggle}
            title="History (H)"
            aria-label="Open history"
            className="flex w-12 flex-col items-center gap-1 rounded-xl py-2 text-frost/90 transition hover:bg-frost/10 hover:text-frost"
          >
            <HistoryIcon size={22} />
            <span className="text-[10px] font-medium text-steel">History</span>
            <span className="text-[10px] text-steel/70">(H)</span>
          </button>
          <button type="button" onClick={onToggle} aria-label="Expand history" className={iconBtn + " mt-auto"}>
            <ChevronRightIcon size={18} />
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 text-frost">
              <HistoryIcon size={19} className="text-accent-soft" />
              <h2 className="text-[14px] font-semibold">History</h2>
              <span className="text-[11px] text-steel">(H)</span>
            </div>
            <button type="button" onClick={onToggle} aria-label="Collapse history" className={iconBtn}>
              <ChevronLeftIcon size={18} />
            </button>
          </div>

          <div className="flex items-center justify-between px-4 pb-1.5">
            <span className="label">Projects</span>
            <button type="button" onClick={onNewProject} title="New project" aria-label="New project" className="text-accent-soft hover:text-frost">
              <PlusIcon size={17} />
            </button>
          </div>
          <div className="max-h-[38%] space-y-1 overflow-y-auto px-2">
            {projects.map((p) => (
              <Row
                key={p.id}
                active={project?.id === p.id}
                label={p.name}
                onPick={() => onPickProject(p)}
                onRename={() => onRenameProject(p)}
                onDelete={() => onDeleteProject(p)}
              />
            ))}
            {projects.length === 0 && <p className="px-3 py-2 text-[12px] text-steel/70">No projects yet.</p>}
          </div>

          {project && (
            <>
              <div className="mt-3 flex items-center justify-between border-t border-line px-4 pb-1.5 pt-3">
                <span className="label">Sessions</span>
                <button type="button" onClick={onNewSession} title="New session" aria-label="New session" className="text-accent-soft hover:text-frost">
                  <PlusIcon size={17} />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
                {conversations.map((c) => (
                  <Row
                    key={c.id}
                    active={conversation?.id === c.id}
                    label={c.title}
                    small
                    onPick={() => onPickSession(c)}
                    onRename={() => onRenameSession(c)}
                    onDelete={() => onDeleteSession(c)}
                  />
                ))}
                {conversations.length === 0 && <p className="px-3 py-2 text-[12px] text-steel/70">No sessions yet.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function Row({ active, label, small, onPick, onRename, onDelete }) {
  return (
    <div
      className={
        "group flex items-center rounded-lg transition " + (active ? "bg-accent/18 ring-1 ring-accent/30" : "hover:bg-frost/5")
      }
    >
      <button
        type="button"
        onClick={onPick}
        className={
          "min-w-0 flex-1 truncate px-3 py-2 text-left " +
          (small ? "text-[12px] " : "text-[13px] ") +
          (active ? "text-frost" : "text-steel group-hover:text-frost")
        }
      >
        {label}
      </button>
      <div className="hidden gap-1 pr-2 group-focus-within:flex group-hover:flex">
        <button type="button" onClick={onRename} title="Rename" aria-label="Rename" className="text-steel hover:text-accent-soft">
          <EditIcon size={14} />
        </button>
        <button type="button" onClick={onDelete} title="Delete" aria-label="Delete" className="text-steel hover:text-crimson">
          <CloseIcon size={14} />
        </button>
      </div>
    </div>
  );
}
