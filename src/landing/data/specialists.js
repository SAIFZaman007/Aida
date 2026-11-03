import { AVATARS } from '../../lib/avatars.js';
import { BASE } from '../config.js';
/**
 * Media comes from the app itself: the same encoded clips the assistant plays
 * (public/avatars/video) plus one 16:9 still per specialist (public/landing).
 *   face        16:9 still: thumbnails, round face crops, wide framings (framed with `geo`)
 *   poster      first frame of the idle clip (portrait for Non-stop)
 *   idle/talk   the loops; idleShape/talkShape say whether a clip is 16:9 ("wide") or 9:16 ("tall")
 *   geo         [face centre x, head top y] as fractions of the 16:9 frame
 */
const media = (key, geo) => {
  const v = AVATARS[key].video;
  return {
    face: `${BASE}landing/face-${key}.jpg`,
    /** Square head-and-shoulders crop, centred on the face, for the round avatars. */
    crop: `${BASE}landing/faces/${key}.webp`,
    poster: v.poster,
    idle: v.idle,
    talk: v.talk,
    idleShape: v.shape,
    talkShape: v.talkShape,
    geo,
  };
};
export const SPECIALISTS = [
    {
        key: 'researcher', name: 'Researcher', role: 'Research & Analysis', icon: 'search', voice: 'Female voice',
        description: 'Finds, compares and summarises. Separates what is known from what is guessed, and tells you which is which.',
        checks: ['Literature and market scans', 'Side-by-side comparisons', 'Flags weak or missing sources'],
        tryPrompt: 'Compare the top three payment gateways for a Bangladeshi SaaS.',
        headline: 'Researcher finds, compares and summarises, and tells you what is known and what is still a guess.',
        chips: ['Market and literature scans', 'Side-by-side comparisons', 'Flags weak or missing sources', 'Clear summaries you can share'],
        chat: [
            { from: 'you', text: 'বাংলাদেশি SaaS-এর জন্য সেরা তিনটা পেমেন্ট গেটওয়ে তুলনা করো।', tr: 'Compare the top three payment gateways for a Bangladeshi SaaS.' },
            { from: 'ai', text: 'Here’s a side-by-side on fees, settlement time and recurring billing. One source looks outdated, so I’ve flagged it.' },
            { from: 'you', text: 'Which one should I start with?' },
        ],
        media: media('researcher', [0.37, 0.07]),
    },
    {
        key: 'architect', name: 'Architect', role: 'System Design', icon: 'layers', voice: 'Male voice',
        description: 'Thinks in systems. Sketches architectures, data models and trade-offs before a line of code is written.',
        checks: ['Service and data-model design', 'Scaling and cost trade-offs', 'Reviews existing architectures'],
        tryPrompt: 'Design the backend for a ride-sharing MVP that can reach 50k users.',
        headline: 'Architect sketches the system, the data model and the trade-offs before anyone writes a line of code.',
        chips: ['Service and data-model design', 'Scaling and cost trade-offs', 'Reviews existing architectures', 'Diagrams you can share'],
        chat: [
            { from: 'you', text: 'Design the backend for a ride-sharing MVP that can reach 50k users.' },
            { from: 'ai', text: 'Start with a modular monolith: Postgres, Redis for live locations and a queue for trip matching. Split services only when load demands it.' },
            { from: 'you', text: 'খরচ কেমন পড়বে?', tr: 'What will it cost?' },
        ],
        media: media('architect', [0.48, 0.10]),
    },
    {
        key: 'executive', name: 'Executive', role: 'Strategy & Management', icon: 'chart', voice: 'Female voice',
        description: 'Turns goals into plans. Weighs options, prepares meetings and drafts the update for your team.',
        checks: ['Strategy and quarterly planning', 'Decision memos and briefs', 'Prioritised day and week plans'],
        tryPrompt: 'Help me prepare talking points for tomorrow’s board meeting.',
        headline: 'Executive turns your goals into a plan, prepares the meeting and drafts the update for your team.',
        chips: ['Quarterly and weekly planning', 'Decision memos and briefs', 'Meeting prep and talking points', 'Prioritised to-do lists'],
        chat: [
            { from: 'you', text: 'কালকের বোর্ড মিটিংয়ের জন্য পয়েন্টগুলো সাজিয়ে দাও।', tr: 'Line up talking points for tomorrow’s board meeting.' },
            { from: 'ai', text: 'Here are five: Q3 revenue, the hiring plan, the product launch, key risks and one clear ask. Shall I draft the notes?' },
            { from: 'you', text: 'Yes, keep it to one page.' },
        ],
        media: media('executive', [0.5, 0.11]),
    },
    {
        key: 'nonstop', name: 'Non-stop', role: 'General AI Assistant', icon: 'infinity', voice: 'Female voice',
        description: 'Your open conversation. Ask anything on any topic. The mic stays on and replies are spoken, hands-free.',
        checks: ['Expert on everything, no topic limit', 'Hands-free spoken conversation', 'Recalls context across all modes'],
        tryPrompt: 'Plan my day: a client call at 11, then the report.',
        headline: 'Non-stop keeps one open conversation going all day, so you can ask anything and hear the answer without touching the keyboard.',
        chips: ['Answers questions on any topic', 'Keeps the mic open, hands-free', 'Remembers context across every mode', 'Brings in a specialist when it helps'],
        chat: [
            { from: 'you', text: 'আজকের দিনটা একটু গুছিয়ে দাও।', tr: 'Help me plan my day.' },
            { from: 'ai', text: 'Sure. Client call at 11, the report after lunch and a short break at 4. Want reminders?' },
            { from: 'you', text: 'Yes, ten minutes before each one.' },
        ],
        media: media('nonstop', [0.495, 0.17]),
    },
    {
        key: 'coder', name: 'Coder', role: 'Programming & Development', icon: 'code', voice: 'Male voice',
        description: 'Writes, reviews and explains code. Keeps its own memory of your stack so you never repeat it.',
        checks: ['Debugging and code review', 'Explains errors in plain words', 'Code stays in English in Bengali chats'],
        tryPrompt: 'Why does my React useEffect run twice in development?',
        headline: 'Coder reads the error with you, explains what went wrong in plain words and suggests the fix.',
        chips: ['Debugs and reviews code', 'Explains errors in plain words', 'Remembers your stack', 'Keeps code in English in Bengali chats'],
        chat: [
            { from: 'you', text: 'Why does my useEffect run twice in development?' },
            { from: 'ai', text: 'That’s React Strict Mode. It mounts components twice in development to catch side effects. Add a cleanup function and you’re safe.' },
            { from: 'you', text: 'ক্লিনআপ ফাংশনের একটা উদাহরণ দাও।', tr: 'Show me a cleanup example.' },
        ],
        media: media('coder', [0.42, 0.03]),
    },
    {
        key: 'security', name: 'Security', role: 'Cybersecurity & Protection', icon: 'shield', voice: 'Male voice',
        description: 'Looks at your setup the way an attacker would, then tells you what to fix first.',
        checks: ['Threat and risk reviews', 'Hardening checklists', 'Explains vulnerabilities clearly'],
        tryPrompt: 'Review the login flow of my Laravel app for common risks.',
        headline: 'Security looks at your setup the way an attacker would, then tells you what to fix first.',
        chips: ['Threat and risk reviews', 'Hardening checklists', 'Explains vulnerabilities clearly', 'Never asks for your passwords'],
        chat: [
            { from: 'you', text: 'Review the login flow of my Laravel app.' },
            { from: 'ai', text: 'Fix three things first: rate-limit the login route, turn on 2FA for admins and regenerate the session after sign-in.' },
            { from: 'you', text: 'রেট লিমিট কীভাবে যোগ করব?', tr: 'How do I add rate limiting?' },
        ],
        media: media('security', [0.47, 0.06]),
    },
    {
        key: 'writer', name: 'Writer', role: 'Content & Communication', icon: 'pen', voice: 'Female voice',
        description: 'Drafts, edits and adapts tone. Emails, posts, proposals and scripts in English or Bengali.',
        checks: ['Emails, posts and proposals', 'Tone and length rewrites', 'Bengali and English copy'],
        tryPrompt: 'Rewrite this client email so it sounds firm but friendly.',
        headline: 'Writer drafts, edits and adjusts the tone of your emails, posts and proposals, in English or Bengali.',
        chips: ['Emails, posts and proposals', 'Tone and length rewrites', 'Bengali and English copy', 'Scripts and captions'],
        chat: [
            { from: 'you', text: 'Rewrite this client email so it sounds firm but friendly.' },
            { from: 'ai', text: 'Done. The deadline stays clear, the opening is softer and it ends with a next step they can say yes to.' },
            { from: 'you', text: 'এবার বাংলায় একটা ছোট ভার্সন দাও।', tr: 'Now give me a short version in Bengali.' },
        ],
        media: media('writer', [0.5, 0.047]),
    },
];
/** Display order used by tabs, orbits and face rows. */
export const ORDER = ['nonstop', 'executive', 'coder', 'architect', 'security', 'researcher', 'writer'];
export const byKey = (k) => SPECIALISTS.find((s) => s.key === k);
