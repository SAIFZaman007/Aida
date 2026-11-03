// The assistant screen: its Tailwind stylesheet loads with this chunk only, so the landing page
// (a separate chunk with its own styles) is never affected by it, and the other way round.
import "./index.css";
export { default } from "./App.jsx";
