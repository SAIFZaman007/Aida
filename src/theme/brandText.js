/*
  Sets every "A.I.D.A" (and "AIDA") in a block of rendered text in the brand typeface by wrapping
  it in <span class="aida">. Text nodes only: attributes, scripts, inputs and anything already
  wrapped are left alone. Used once on the landing page (plain DOM, rendered once). The assistant's React screens
  use the <Aida> component instead, so React never sees a DOM it did not render.
*/
const NAME = /\bA\.I\.D\.A(?![\w])|\bAIDA\b/g;
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION", "TITLE", "NOSCRIPT"]);

export function brandify(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || SKIP.has(p.tagName) || p.closest(".aida")) return NodeFilter.FILTER_REJECT;
      NAME.lastIndex = 0;
      return NAME.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    // A flex/grid parent treats every child as its own item (and drops edge spaces), so there the
    // whole text goes into one wrapper span and the layout keeps the same number of items.
    const wrap = /flex|grid/.test(getComputedStyle(n.parentElement).display);
    const text = n.nodeValue;
    const frag = document.createDocumentFragment();
    let last = 0;
    NAME.lastIndex = 0;
    for (let m; (m = NAME.exec(text)); ) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      const s = document.createElement("span");
      s.className = "aida";
      s.textContent = m[0];
      frag.append(s);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.append(text.slice(last));
    if (wrap) {
      const w = document.createElement("span");
      w.append(frag);
      n.replaceWith(w);
    } else n.replaceWith(frag);
  }
}
