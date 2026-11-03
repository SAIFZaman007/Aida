import { useEffect, useRef, useState } from "react";
import "./toggle.css";
import { TOGGLE_HTML, getTheme, onTheme, syncToggle, toggleTheme } from "./theme.js";

/** The premium light / dark switch (assistant top bar). The landing navbar uses the same markup + CSS. */
export default function ThemeToggle({ className = "" }) {
  const ref = useRef(null);
  const [theme, setTheme] = useState(getTheme);
  useEffect(() => onTheme(setTheme), []);
  useEffect(() => { if (ref.current) syncToggle(ref.current, theme); }, [theme]);
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      className={"tt " + className}
      onClick={(e) => toggleTheme(e.currentTarget)}
      dangerouslySetInnerHTML={{ __html: TOGGLE_HTML }}
    />
  );
}
