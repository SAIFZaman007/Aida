/* The landing page markup (preloader + page). Rendered once by Landing.jsx, then brought to life by boot.js. */
import { TOGGLE_HTML } from '../theme/theme.js';
export const MARKUP = `
<!-- ============ PRELOADER ============ -->
<div id="aida-pre" aria-hidden="true">
  <div class="ap-box">
    <div class="ap-mark"><span class="ap-spin"></span><span class="ap-glow"></span><img data-asset="mark" alt="" /></div>
    <div class="ap-name">A.I.D.A</div>
    <div class="ap-line"><i id="apFill"></i></div>
    <div class="ap-sub"><span id="apTxt">Waking up your AI team</span></div>
  </div>
</div>

<div id="page">

<!-- ============ NAV ============ -->
<header class="topnav">
  <div class="topnav-wrap"><div class="bar">
    <a class="tb" href="/" data-go="top" aria-label="A.I.D.A, Artificial Intelligence Desktop Assistant: back to top">
      <span class="lg" data-logo></span>
      <span class="tbt"><b>A.I.D.A</b><small>Artificial Intelligence Desktop Assistant</small></span>
    </a>
    <nav class="tl" aria-label="Main">
      <a href="/" data-go="problem">Problem</a><a href="/" data-go="specialists">Specialists</a><a href="/" data-go="features">Features</a><a href="/" data-go="languages">Languages</a><a href="/" data-go="maktech">Maktech</a>
    </nav>
    <div class="tr">
      <button class="tt" type="button" role="switch" aria-checked="false" aria-label="Switch theme" data-theme-toggle>${TOGGLE_HTML}</button>
      <a class="tc" data-app href="/app"><span class="tc-in">Launch A.I.D.A</span></a>
    </div>
  </div></div>
</header>

<!-- ============ HERO ============ -->
<section class="hero">
  <div class="hero-bg"></div>
  <div id="stars"></div>
  <div class="wrap hero-copy">
    <span class="pill"><span class="tag">New</span> Seven specialists, one voice. Now in English and বাংলা</span>
    <h1><span class="ft">Your virtual</span> <span class="gt">AI team.</span><span class="line2 ft">Just talk to it.</span></h1>
    <p class="hero-sub">A.I.D.A is a voice-first desktop assistant with a face. Pick an expert, press the mic and get a spoken answer, in English or Bengali.</p>
    <div class="hero-cta">
      <a class="btn btn-primary" data-app href="/app"><svg class="i" data-i="mic"></svg> Start talking to A.I.D.A</a>
      <a class="btn btn-ghost" href="/" data-go="specialists"><svg class="i" data-i="users"></svg> Meet the specialists</a>
    </div>
    <div class="hero-meta">
      <span><svg class="i" data-i="users"></svg>7 specialist modes</span>
      <span><svg class="i" data-i="globe"></svg>English &amp; বাংলা</span>
      <span><svg class="i" data-i="mic"></svg>Hands-free voice</span>
      <span><svg class="i" data-i="globe"></svg>Runs in your browser</span>
      <span class="soon-chip"><svg class="i" data-i="monitor"></svg>Desktop app coming soon</span>
    </div>
  </div>
  <div class="hstage wrap">
    <div class="horizon"></div>
    <div class="harc" id="harc" aria-label="Choose an AI specialist"></div>
    <div class="detail hdet" id="detail" aria-live="polite"></div>
  </div>
</section>

<!-- ============ MARQUEE ============ -->
<div class="marq anim" aria-hidden="true">
  <div class="edge l"></div><div class="edge r"></div>
  <div class="marq-row" id="mq1"></div>
  <div class="marq-row rev" id="mq2"></div>
</div>

<!-- ============ PROBLEM ============ -->
<section class="sec" id="problem">
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">The problem</span>
      <h2>Five AI tabs open.<br><span class="gt">Zero shared context.</span></h2>
      <p>Coding in one tool, research in another, writing in a third. Every switch costs focus, and none of them know what the others heard.</p>
    </div>
    <div class="flow" id="flow"></div>
  </div>
</section>

<!-- ============ SPECIALISTS ============ -->
<section class="spec" id="specialists">
  <div class="wrap">
    <div class="sec-head" style="margin-bottom:40px">
      <span class="eyebrow">Meet your AI specialists</span>
      <h2>Seven experts.<br><span class="gt">Each with a face, a voice and a focus.</span></h2>
      <p>Every mode has its own intent, knowledge and memory. Pick the right expert for the task, or stay with Non-stop.</p>
    </div>
    <div class="spx">
      <div class="sp-tabs" id="sptabs" role="tablist" aria-label="AI specialists"></div>
      <div class="sp-stage" id="spstage">
        <div class="sp-scene">
          <span class="sp-live"><span class="dot"></span>LIVE AVATAR</span>
          <img id="spimg" alt="" />
          <video id="spvid" muted playsinline loop preload="none"></video>
          <span class="sp-state" id="spstate">● IDLE</span>
          <div class="sp-label" id="splabel"></div>
        </div>
        <div class="sp-copy" id="spcopy" aria-live="polite"></div>
      </div>
    </div>
  </div>
</section>

<!-- ============ HOW IT WORKS ============ -->
<section class="sec" id="how">
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">How it works</span>
      <h2>From question to <span class="gt">spoken answer</span><br>in four steps.</h2>
    </div>
    <div class="cross" id="cross">
      <div class="step"><span class="sic"><svg class="i" data-i="users"></svg></span><span class="no">STEP 01</span><h3>Choose a specialist</h3><p>Pick the expert for the job, or stay with Non-stop for anything at all.</p></div>
      <div class="panel v" data-s="0"><div class="pz pz-team"><div class="pz-faces" id="pzFaces"></div><small id="pzPick">Non-stop selected</small></div><span class="pz-sweep"></span></div>
      <div class="step"><span class="sic"><svg class="i" data-i="mic"></svg></span><span class="no">STEP 02</span><h3>Talk or type</h3><p>Click the mic and speak in English or Bengali, or open the text chat.</p></div>
      <div class="panel h" data-s="3"><div class="pz pz-hist"><small class="pz-k">HISTORY</small><div class="pz-rows" id="pzRows"></div></div><span class="pz-sweep"></span></div>
      <div class="core"><div class="in atom" data-atom></div></div>
      <div class="panel h r" data-s="1"><div class="pz pz-mic"><span class="pz-micbtn"><svg class="i" data-i="mic"></svg><i></i><i></i></span><div class="pz-mr"><div class="pz-wave" data-wave="26"></div><p class="pz-type"><span id="pzType"></span><b>|</b></p></div></div><span class="pz-sweep"></span></div>
      <div class="step"><span class="sic"><svg class="i" data-i="wave"></svg></span><span class="no">STEP 03</span><h3>Get a spoken answer</h3><p>Your specialist replies on screen and out loud, sentence by sentence, in your language.</p></div>
      <div class="panel v b" data-s="2"><div class="pz pz-say"><div class="pz-bub"><small>A.I.D.A <span class="bars" data-bars="7"></span></small><span class="l l1"></span><span class="l l2"></span><span class="l l3"></span></div><em class="pz-lang"><span class="on">EN</span> · <span class="bn">বাংলা</span></em></div><span class="pz-sweep"></span></div>
      <div class="step"><span class="sic"><svg class="i" data-i="history"></svg></span><span class="no">STEP 04</span><h3>Pick up where you left off</h3><p>Every session is saved in History, ready to continue in the same mode.</p></div>
    </div>
  </div>
</section>

<!-- ============ FEATURES ============ -->
<section class="sec" id="features" style="padding-top:40px">
  <div class="ft-bg" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">Everything in one place</span>
      <h2>Built for real work.<br><span class="gt">Designed to feel human.</span></h2>
    </div>
    <div class="bento">
      <div class="tile w2 glow">
        <span class="tic"><svg class="i" data-i="video"></svg></span>
        <h3>Talking avatars</h3>
        <p>Every specialist has a face. It waits, smiles and speaks back. Idle and talking clips swap without a seam.</p>
        <div class="vis trio">
          <div class="ph" data-face="executive"><span class="st">IDLE</span></div>
          <div class="ph talking" data-face="nonstop" data-talk><span class="st live">● TALKING</span></div>
          <div class="ph" data-face="writer"><span class="st">IDLE</span></div>
        </div>
      </div>
      <div class="tile w2">
        <span class="tic"><svg class="i" data-i="mic"></svg></span>
        <h3>Hands-free and interruptible</h3>
        <p>Turn the mic on and just talk. Speak over A.I.D.A at any moment and it stops to listen, like a real conversation.</p>
        <div class="vis">
          <div class="wave-big" id="wavebig"><span class="cut" style="left:62%"><b>YOU INTERRUPT</b></span></div>
          <div class="legend"><span><i style="background:var(--accent)"></i>A.I.D.A speaking</span><span><i style="background:var(--cyan)"></i>You speaking</span></div>
        </div>
      </div>
      <div class="tile"><span class="tic"><svg class="i" data-i="globe"></svg></span><h3>Bilingual voice</h3><p>Answers in the language you used, in the script you used, and reads it aloud.</p></div>
      <div class="tile"><span class="tic"><svg class="i" data-i="cc"></svg></span><h3>Live captions</h3><p>See your words while you speak, then the reply one sentence at a time, in step with the voice.</p></div>
      <div class="tile"><span class="tic"><svg class="i" data-i="database"></svg></span><h3>Memory per specialist</h3><p>The Coder’s context never muddles the Writer’s. Non-stop can recall across all of them.</p></div>
      <div class="tile"><span class="tic"><svg class="i" data-i="folder"></svg></span><h3>Projects &amp; history</h3><p>Group sessions into projects. Reopen, rename or clean up from the History rail.</p></div>
      <div class="tile w2">
        <span class="tic"><svg class="i" data-i="shieldcheck"></svg></span>
        <h3>Built to say “I don’t know”</h3>
        <p>A.I.D.A won’t invent facts, numbers or sources. When it’s unsure, it says so and asks.</p>
        <div class="vis saybox"><span class="av"></span><span>I don’t have a reliable figure for last quarter’s CPM in Dhaka. Do you want me to work from your report instead?</span></div>
      </div>
      <div class="tile w2">
        <span class="tic"><svg class="i" data-i="monitor"></svg></span>
        <h3>Web today, desktop next</h3>
        <p>Use A.I.D.A in your browser right now. A desktop app for Windows, macOS and Linux is on the way, with the same voice, history and specialists.</p>
        <div class="vis plat"><span class="live"><svg class="i" data-i="globe"></svg>Web app <b>Live</b></span><span class="soon"><svg class="i" data-i="monitor"></svg>Windows <b>Soon</b></span><span class="soon"><svg class="i" data-i="monitor"></svg>macOS <b>Soon</b></span><span class="soon"><svg class="i" data-i="monitor"></svg>Linux <b>Soon</b></span></div>
      </div>
    </div>
  </div>
</section>

<!-- ============ LANGUAGES ============ -->
<section class="sec" id="languages" style="padding-top:60px">
  <div class="wrap split">
    <div>
      <span class="eyebrow left">English &amp; বাংলা</span>
      <h2>Speak the way<br><span class="gt">you think.</span></h2>
      <p class="lead">Write in Bengali script, in English, or Bengali in English letters. A.I.D.A understands and replies in the language you used. Code, commands and technical terms stay in English.</p>
      <ul class="checks">
        <li><span class="ck"><svg class="i" data-i="check"></svg></span>Replies in the language of your latest message</li>
        <li><span class="ck"><svg class="i" data-i="check"></svg></span>Natural, standard Bengali in Bengali script</li>
        <li><span class="ck"><svg class="i" data-i="check"></svg></span>Both languages read aloud, sentence by sentence</li>
      </ul>
      <div class="lang-toggle" role="tablist" aria-label="Conversation language">
        <button class="on" data-l="en" role="tab">English</button><button class="bn" data-l="bn" role="tab">বাংলা</button><button data-l="bl" role="tab">Banglish</button>
      </div>
    </div>
    <div>
      <div class="chat" id="chat">
        <div class="top"><span class="who" data-face="nonstop"></span><div><b>Non-stop</b><small>General AI Assistant</small></div><span class="live"><span class="dot"></span><span class="lv">VOICE ON</span></span></div>
        <div class="msgs"></div>
        <div class="speaking"></div>
      </div>
    </div>
  </div>
</section>

<!-- ============ MAKTECH ============ -->
<section class="mak" id="maktech">
  <div class="wrap split">
    <div>
      <span class="eyebrow left">Built by</span>
      <h2>Engineered by <a class="o mak-link" href="https://maktechgroup.com/" target="_blank" rel="noopener" aria-label="Maktech (opens maktechgroup.com)">Maktech</a>.</h2>
      <p class="lead">Maktech builds scalable digital products: web apps, mobile apps, SaaS and e-commerce for ambitious businesses. A.I.D.A is one of them.</p>
      <a class="btn btn-ghost" href="https://maktechgroup.com/" target="_blank" rel="noopener">Visit maktechgroup.com <svg class="i" data-i="arrow"></svg></a>
      <p class="quote">Ask any A.I.D.A specialist who built it. It will tell you: Maktech.</p>
    </div>
    <div class="mak-rows" aria-label="What Maktech builds">
      <div class="mak-row s1"><span><i></i>UI/UX design</span><span><i></i>MERN stack</span><span><i></i>Flutter apps</span><span><i></i>Laravel</span><span><i></i>Shopify</span><span><i></i>Wix</span></div>
      <div class="mak-row s2"><span><i></i>WordPress</span><span><i></i>Digital marketing</span><span><i></i>Graphic design</span><span><i></i>AI &amp; ML</span><span><i></i>SaaS products</span></div>
      <div class="mak-row s3"><span><i></i>AI &amp; ML</span><span><i></i>Flutter apps</span><span><i></i>SaaS products</span><span><i></i>UI/UX design</span><span><i></i>Laravel</span><span><i></i>MERN stack</span></div>
    </div>
  </div>
</section>

<!-- ============ FAQ ============ -->
<section class="sec" id="faq">
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">FAQ</span>
      <h2>Questions, <span class="gt">answered.</span></h2>
    </div>
    <div class="faq" id="faqlist"></div>
  </div>
</section>

<!-- ============ CTA ============ -->
<section class="cta">
  <div class="wrap" style="position:relative">
    <div class="orb cta-orb"><span class="co-ring r1"></span><span class="co-ring r2"></span><span class="co-ring r3"></span><div data-atom class="cta-atom-host"></div></div>
    <h2><span class="ft">Meet your</span> <span class="gt">virtual AI team.</span></h2>
    <p>Plan, build, analyze, create and protect. One assistant, seven specialists, your language.</p>
    <div class="hero-cta">
      <a class="btn btn-primary" data-app href="/app"><svg class="i" data-i="mic"></svg> Launch A.I.D.A</a>
      <span class="btn btn-ghost btn-soon" aria-disabled="true"><svg class="i" data-i="monitor"></svg> Desktop app <em>Coming soon</em></span>
    </div>
  </div>
</section>

<!-- ============ FOOTER ============ -->
<footer class="pf">
  <span class="pf-rule" aria-hidden="true"></span>
  <div class="wrap">
    <div class="fgrid">
      <div class="fbrand">
        <a class="brand" href="/" data-go="top" aria-label="A.I.D.A, back to top"><span class="mark" data-logo></span><span class="fb-t"><b>A.I.D.A</b><small>Artificial Intelligence Desktop Assistant</small></span></a>
        <p>Your virtual AI team, in English and Bengali. Seven specialists, one voice.</p>
        <a class="btn btn-ghost btn-sm fcta" data-app href="/app"><svg class="i" data-i="mic"></svg> Launch A.I.D.A</a>
      </div>
      <div><h4>Product</h4><ul><li><a href="/" data-go="specialists">Specialists</a></li><li><a href="/" data-go="features">Features</a></li><li><a href="/" data-go="how">How it works</a></li><li><a data-app href="/app">Launch A.I.D.A</a></li></ul></div>
      <div><h4>Resources</h4><ul><li><a href="/" data-go="languages">Languages</a></li><li><a href="/" data-go="faq">FAQ</a></li><li><span>Privacy policy</span></li><li><span>Terms of service</span></li></ul></div>
      <div><h4>Company</h4><ul><li><a href="https://maktechgroup.com/" target="_blank" rel="noopener">Maktech</a></li><li><a href="https://maktechgroup.com/" target="_blank" rel="noopener">maktechgroup.com</a></li><li><a href="mailto:info@maktechgroup.com">Contact</a></li></ul></div>
    </div>
    <div class="ghost" aria-hidden="true">A.I.D.A</div>
    <div class="legal"><span>© 2026 <a class="fl-mak" href="https://maktechgroup.com/" target="_blank" rel="noopener">Maktech</a>. A.I.D.A is a Maktech product.</span><div class="legal-r"><span>A.I.D.A can make mistakes. Check important information before you rely on it.</span><a class="totop" href="/" data-go="top" aria-label="Back to top"><svg class="i" data-i="arrow"></svg></a></div></div>
  </div>
</footer>
</div>
`;
