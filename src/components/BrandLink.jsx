/**
 * The logo + name in the assistant's top bar. In the browser it is a link back to the landing
 * page's hero (the landing page opens at its top). The desktop app has no landing page, so there
 * it stays a plain, non-interactive mark.
 */
export default function BrandLink({ desktop, children }) {
  const cls = "group flex items-center gap-3.5 rounded-xl";
  if (desktop) return <div className={cls}>{children}</div>;
  return (
    <a
      href="/"
      aria-label="A.I.D.A home — back to the landing page"
      title="Back to home"
      className={cls + " app-no-drag cursor-pointer outline-none transition focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent"}
    >
      {children}
    </a>
  );
}
