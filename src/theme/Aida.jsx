import "./brand.css";

/** The brand name in the brand typeface:  <Aida />  →  A.I.D.A   (or <Aida>AIDA</Aida>) */
export default function Aida({ children = "A.I.D.A", className = "" }) {
  return <span className={"aida " + className}>{children}</span>;
}
