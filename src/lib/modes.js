/*
  The modes offered in the picker. "developer" and "ccna_trainer" still exist on the
  backend so older sessions keep working; they are just not offered for new ones.
*/
export const MODES = [
  ["nonstop", "Aida"],
  ["executive", "Executive"],
  ["coder", "Coder"],
  ["architect", "Architect"],
  ["security", "Security"],
  ["researcher", "Researcher"],
  ["writer", "Writer"],
];

export const MODE_LABEL = {
  ...Object.fromEntries(MODES),
  developer: "Developer",
  ccna_trainer: "CCNA",
};

// What each mode is FOR (also what it is not for: a specialist sends you to the right
// mode for anything outside its field; only Aida answers everything).
export const MODE_HINT = {
  nonstop: "Aida — expert on everything. Just talk: the mic stays on and replies are spoken.",
  executive: "Executive — planning, priorities, decisions and delivery.",
  coder: "Coder — write, debug, review and test code.",
  architect: "Architect — system design: structure, data, APIs and infrastructure.",
  security: "Security — defensive security and networking.",
  researcher: "Researcher — investigate questions and weigh the evidence.",
  writer: "Writer — draft and edit text in Bengali and English.",
};

// The short line under each mode's name on the "Meet your AI specialists" cards.
export const MODE_TAGLINE = {
  nonstop: "General AI Assistant",
  executive: "Strategy & Management",
  coder: "Programming & Development",
  architect: "System Design & Architecture",
  security: "Cybersecurity & Protection",
  researcher: "Research & Analysis",
  writer: "Content & Communication",
};
