export const FAQ = [
    ['What is A.I.D.A?', 'A.I.D.A (Artificial Intelligence Desktop Assistant) is a voice-first AI assistant with a talking avatar. It brings seven specialist modes into one app, so you can plan, build, analyze, create and protect without switching tools.'],
    ['Can I talk to it in Bengali?', 'Yes. Speak or type in Bengali script, English, or Bengali written in English letters. A.I.D.A replies in the language of your latest message and reads the answer aloud.'],
    ['Can I interrupt it while it’s speaking?', 'Yes. Start talking at any moment and A.I.D.A stops to listen, just like a real conversation.'],
    ['Does each specialist remember my conversations?', 'Each mode keeps its own memory, so the Coder’s context never muddles the Writer’s. Non-stop can recall across all of them.'],
    ['Which platforms does it run on?', 'A.I.D.A runs in your browser today at aida.maktechgroup.com. A desktop app for Windows, macOS and Linux is coming soon, with the same voice, history and specialists.'],
    ['Can A.I.D.A make mistakes?', 'It can. A.I.D.A is instructed not to invent facts, numbers or sources, and to say when it is unsure. Check important information before you rely on it.'],
];
export const MARQUEE = {
    specialists: ['Non-stop', 'Executive', 'Coder', 'Architect', 'Security', 'Researcher', 'Writer'],
    features: ['Talking avatars', 'Hands-free voice', 'English & বাংলা', 'Live captions', 'Memory per specialist', 'Projects & history'],
};
/** Problem section: the separate tools A.I.D.A replaces. [name, problem, tag] */
export const CHAOS = [
    ['Coding assistant', 'Re-explain your project on every switch', 'Context lost'],
    ['Research tool', 'Generic answers, no specialist depth', 'Shallow'],
    ['Writing app', 'English-first. Bengali feels like an afterthought', 'EN only'],
    ['Planner', 'Typing only. No voice, no face, no rhythm', 'Text only'],
    ['Chatbot', 'Confident guesses when it doesn’t know', 'Guessing'],
    ['Security helper', 'Never heard what the others were told', 'No memory'],
];
export const BENEFITS = [
    'One app, seven experts, each with its own memory',
    'Dedicated intent and knowledge base per specialist',
    'Talk hands-free and interrupt at any moment',
    'Fluent in English and Bengali, in text and speech',
    'Says “I don’t know” instead of inventing facts',
];
export const CONVERSATIONS = {
    en: [
        ['me', 'Plan my day: a client call at 11, then the report.'],
        ['ai', 'Happy to. Block 9 to 10:30 for the report draft, take the 11 o’clock call, then review the report after lunch.'],
        ['me', 'Remind me 10 minutes before the call.'],
        ['ai', 'Done. I’ll remind you at 10:50.'],
    ],
    bn: [
        ['me', 'আজকের কাজের একটি পরিকল্পনা বানিয়ে দাও।'],
        ['ai', 'অবশ্যই। সকাল ৯টা থেকে সাড়ে ১০টা রিপোর্টের খসড়া, ১১টায় ক্লায়েন্ট কল, আর দুপুরের পর রিপোর্টটা দেখে নিন।'],
        ['me', 'কলের ১০ মিনিট আগে মনে করিয়ে দিও।'],
        ['ai', 'ঠিক আছে, ১০টা ৫০ মিনিটে মনে করিয়ে দেব।'],
    ],
    bl: [
        ['me', 'ami ekta {git rebase} error pacchi, help koro'],
        ['ai', 'Sure. Prothome {git status} chalan, conflict file gulo thik korun, tarpor {git rebase --continue} din.'],
        ['me', 'conflict ta kivabe bujhbo?'],
        ['ai', 'File e conflict marker dekhben. Je version ta thik, seta rakhun, baki ta muche din.'],
    ],
};
/** How-it-works panels */
export const TYPE_PHRASES = ['Plan my day around the 11 o’clock call', 'আজকের কাজগুলো গুছিয়ে দাও', 'Why does my useEffect run twice?'];
export const HISTORY = [
    ['coder', 'useEffect fix', '2m'], ['writer', 'Client email', '1h'], ['executive', 'Board notes', '3h'],
    ['researcher', 'Gateway comparison', '1d'], ['security', 'Login review', '2d'], ['architect', 'Ride-share backend', '3d'],
];
