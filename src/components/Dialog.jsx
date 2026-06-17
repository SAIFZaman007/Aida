import { useEffect, useRef, useState } from "react";

/*
  Dialog — replaces window.prompt()/confirm(), which Electron does not support
  (that was the actual reason "Create new Project" did nothing).

  Driven by a plain object so the parent stays simple:
    { type: "input",   title, placeholder, value, confirmLabel, onConfirm(value) }
    { type: "confirm", title, message,                 confirmLabel, onConfirm() }
  Pass `state` (or null to hide) and an `onClose` handler.
*/
export default function Dialog({ state, onClose }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (state?.type === "input") {
      setValue(state.value || "");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [state]);

  if (!state) return null;

  const confirm = () => {
    if (state.type === "input") {
      const v = value.trim();
      if (!v) return;
      state.onConfirm(v);
    } else {
      state.onConfirm();
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="brackets panel w-[420px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 font-hud text-base uppercase tracking-[0.2em] text-frost">
          {state.title}
        </h3>

        {state.type === "input" ? (
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm();
              if (e.key === "Escape") onClose();
            }}
            placeholder={state.placeholder || ""}
            className="w-full rounded-lg border border-line bg-void-700 px-3 py-2.5 font-mono text-[13px] text-frost placeholder:text-steel/50 focus:border-cyan/50 focus:outline-none"
          />
        ) : (
          <p className="font-mono text-[13px] leading-relaxed text-frost/80">
            {state.message}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 font-hud text-[12px] uppercase tracking-wider text-steel transition hover:text-frost"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            className={
              "rounded-lg border px-4 py-2 font-hud text-[12px] font-semibold uppercase tracking-wider transition " +
              (state.danger
                ? "border-crimson/50 bg-crimson/15 text-crimson hover:bg-crimson/25"
                : "border-cyan/40 bg-cyan/15 text-cyan hover:bg-cyan/25")
            }
          >
            {state.confirmLabel || "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}