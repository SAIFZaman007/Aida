/*
  The modes offered in the picker. "developer" and "ccna_trainer" still exist on the
  backend so older sessions keep working; they are just not offered for new ones.
*/
export const MODES = [
  ["nonstop", "Non-stop"],
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

export const MODE_HINT = {
  nonstop: "Non-stop: just talk — the mic stays on and replies are spoken.",
};
