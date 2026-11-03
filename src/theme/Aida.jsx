import "./brand.css";

/** The brand name in the brand typeface:  <Aida />  →  Aida */
export default function Aida({ children = "Aida", className = "" }) {
  return <span className={"aida " + className}>{children}</span>;
}
