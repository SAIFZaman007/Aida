/*
  Landing-page copy, kept in one place. Everything here describes what A.I.D.A really does
  (see the app and backend); Maktech's lines come from its own website. Nothing is invented:
  no statistics, customers, prices or testimonials.
*/
export const MAKTECH_URL = "https://maktechgroup.com/";

export const NAV = [
  ["Problem", "#problem"],
  ["Specialists", "#specialists"],
  ["Features", "#features"],
  ["Languages", "#languages"],
  ["Maktech", "#maktech"],
];

export const PROBLEM =
  "Relying on multiple AI platforms for coding, research, security, writing, and daily productivity creates fragmented workflows, inconsistent context, and unnecessary tool switching. Generic AI assistants often lack the specialized knowledge and task-specific capabilities required for different professional needs.";

export const SOLUTION =
  "We engineered A.I.D.A., an all-in-one desktop AI assistant featuring seven specialized modes, each with dedicated intent, knowledge bases, and API integrations. From coding and research to security and executive assistance, it unifies diverse AI workflows with intelligent bilingual voice interaction in English and Bengali.";

export const SCATTERED = ["A coding assistant", "A research tool", "A security helper", "A writing app", "A planner", "A general chatbot"];

// One entry per mode, in the order of the app's picker. `can` lists what it is for.
export const SPECIALISTS = [
  {
    id: "nonstop",
    name: "Non-stop",
    role: "General AI Assistant",
    blurb: "Your open conversation. Ask anything on any topic — the mic stays on and replies are spoken, hands-free.",
    can: ["Expert on everything, no topic limit", "Hands-free spoken conversation", "Recalls context across all modes"],
    voice: "Female voice",
  },
  {
    id: "executive",
    name: "Executive",
    role: "Strategy & Management",
    blurb: "A chief of staff for the work that has to get done: clear priorities, sound decisions and delivery.",
    can: ["Planning and priorities", "Decisions and trade-offs", "Delivery and communication"],
    voice: "Female voice",
  },
  {
    id: "coder",
    name: "Coder",
    role: "Programming & Development",
    blurb: "Hands-on programming help: write, debug, review, refactor and test code, from the error to the fix.",
    can: ["Write and fix code", "Review and refactor", "Tests and debugging"],
    voice: "Male voice",
  },
  {
    id: "architect",
    name: "Architect",
    role: "System Design & Architecture",
    blurb: "Designs systems that hold up: structure, data, APIs, scaling and infrastructure, with the trade-offs spelled out.",
    can: ["Structure and data design", "APIs and infrastructure", "Scaling and trade-offs"],
    voice: "Male voice",
  },
  {
    id: "security",
    name: "Security",
    role: "Cybersecurity & Protection",
    blurb: "Defensive security and networking fundamentals — understand the risk and close the gap.",
    can: ["Defensive security", "Networking fundamentals", "Risk explained plainly"],
    voice: "Male voice",
  },
  {
    id: "researcher",
    name: "Researcher",
    role: "Research & Analysis",
    blurb: "Investigates a question, compares the options, weighs the sources and keeps fact apart from inference.",
    can: ["Investigate and compare", "Weigh the evidence", "Fact versus inference"],
    voice: "Female voice",
  },
  {
    id: "writer",
    name: "Writer",
    role: "Content & Communication",
    blurb: "Drafts and polishes text in Bengali and English: tone, clarity, documentation and translation.",
    can: ["Draft and edit", "Tone and documentation", "Bengali ⇄ English polish"],
    voice: "Female voice",
  },
];

export const FEATURES = [
  { icon: "film", title: "Talking video avatars", text: "Every specialist has a face. It waits for you, smiles, and speaks back — an idle clip and a talking clip that swap seamlessly." },
  { icon: "globe", title: "Bilingual voice", text: "Speak or type in English or Bengali. A.I.D.A. answers in the language you used, in the script you used, and reads it aloud." },
  { icon: "mic", title: "Hands-free, interruptible", text: "Turn the mic on and just talk. Speak over A.I.D.A. at any moment and it stops to listen — like a real conversation." },
  { icon: "captions", title: "Live captions", text: "See your words appear while you are still speaking, then watch the reply arrive one sentence at a time, in step with the voice." },
  { icon: "memory", title: "Memory per specialist", text: "Each mode keeps its own memory, so the Coder's context never muddles the Writer's. Non-stop can recall across all of them." },
  { icon: "folder", title: "Projects & history", text: "Organise work into projects and sessions, reopen any conversation later, rename or clean up — all from the History rail." },
  { icon: "shield", title: "Built to say “I don't know”", text: "A.I.D.A. is instructed not to invent facts, numbers or sources. When it is unsure, it says so and asks, instead of guessing." },
  { icon: "monitor", title: "Web and desktop", text: "Use it in your browser or as a desktop app for Windows, macOS and Linux, with the same voice, history and specialists." },
];

export const STEPS = [
  ["Choose a specialist", "Pick the expert for the job — or stay with Non-stop for anything at all."],
  ["Talk or type", "Click the mic and speak in English or Bengali, or open the text chat."],
  ["Get a spoken answer", "Your specialist replies on screen and out loud, in your language, sentence by sentence."],
  ["Pick up where you left off", "Every session is saved in History, ready to continue in the same mode."],
];

export const MAKTECH_SERVICES = [
  "UI/UX design",
  "MERN stack",
  "Flutter apps",
  "Laravel",
  "Shopify",
  "Wix",
  "WordPress",
  "Digital marketing",
  "Graphic design",
  "AI & ML",
  "SaaS products",
];

export const MAKTECH_TEXT =
  "Maktech builds scalable digital products — web apps, mobile apps, SaaS, and e-commerce solutions for ambitious businesses. A.I.D.A. is one of the products it engineers.";
