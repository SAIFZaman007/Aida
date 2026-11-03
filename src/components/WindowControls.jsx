import { useEffect, useState } from "react";
import { MinimizeIcon, MaximizeIcon, RestoreIcon, CloseIcon } from "./icons.jsx";

/*
  WindowControls — minimise / maximise / close for the desktop app (its window has no
  native title bar). Shown only inside Electron, where the preload script offers the
  controls (window.avatar.win); in a normal browser tab nothing is rendered.
*/
export default function WindowControls() {
  const win = typeof window !== "undefined" ? window.avatar?.win : null;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!win) return undefined;
    let alive = true;
    win.isMaximized?.().then((v) => alive && setMaximized(!!v)).catch(() => {});
    const off = win.onMaximizeChange?.((v) => setMaximized(!!v));
    return () => {
      alive = false;
      if (typeof off === "function") off();
    };
  }, [win]);

  if (!win) return null;
  const btn =
    "app-no-drag flex h-9 w-10 items-center justify-center text-steel transition hover:bg-frost/10 hover:text-frost";
  return (
    <div className="app-no-drag ml-1 flex items-center">
      <button type="button" className={btn} onClick={() => win.minimize()} title="Minimise" aria-label="Minimise">
        <MinimizeIcon size={16} />
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => win.toggleMaximize()}
        title={maximized ? "Restore" : "Maximise"}
        aria-label={maximized ? "Restore" : "Maximise"}
      >
        {maximized ? <RestoreIcon size={16} /> : <MaximizeIcon size={15} />}
      </button>
      <button
        type="button"
        className={btn + " hover:!bg-crimson/80"}
        onClick={() => win.close()}
        title="Close"
        aria-label="Close"
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
