import React, { useEffect } from 'react';

export default function Marketing() {
  useEffect(() => {
    const topbar = document.getElementById('topbar');
    const onScroll = () => { if (topbar) topbar.classList.toggle('solid', window.scrollY > 40); };
    window.addEventListener('scroll', onScroll);
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
    return () => { window.removeEventListener('scroll', onScroll); io.disconnect(); };
  }, []);

  return (
    <>
      <style>{`
  :root {
    --navy: #0d1520;
    --navy-soft: #17222f;
    --card: #1a2332;
    --gold: #c9a96e;
    --gold-bright: #e0c48a;
    --cream: #f0e6d3;
    --cream-dim: #b8ad98;
    --line: rgba(201,169,110,0.22);
    --sea: #4a6b7c;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    background: var(--navy);
    color: var(--cream);
    font-family: 'Spectral', Georgia, serif;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }
  ::selection { background: var(--gold); color: var(--navy); }

  .wrap { max-width: 1080px; margin: 0 auto; padding: 0 28px; }

  /* ── Top bar ── */
  .topbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 50;
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 28px;
    background: linear-gradient(180deg, rgba(13,21,32,0.95), rgba(13,21,32,0));
    backdrop-filter: blur(6px);
    transition: background 0.3s;
  }
  .topbar.solid { background: rgba(13,21,32,0.96); border-bottom: 1px solid var(--line); }
  .brand-mark {
    font-family: 'Fraunces', serif; font-weight: 600; font-size: 19px;
    color: var(--cream); letter-spacing: 0.5px; text-decoration: none;
    display: flex; align-items: center; gap: 10px;
  }
  .brand-mark .amp { color: var(--gold); font-style: italic; }
  .app-link {
    font-family: 'Work Sans', sans-serif; font-size: 13px; font-weight: 500;
    color: var(--navy); background: var(--gold);
    padding: 9px 18px; border-radius: 30px; text-decoration: none;
    letter-spacing: 0.3px; transition: transform 0.2s, background 0.2s;
    white-space: nowrap;
  }
  .app-link:hover { background: var(--gold-bright); transform: translateY(-1px); }
  .topbar-links { display: flex; align-items: center; gap: 18px; }
  .topbar-guest { font-family: 'Work Sans', sans-serif; font-size: 13px; color: var(--cream-dim); text-decoration: none; transition: color 0.2s; white-space: nowrap; }
  .topbar-guest:hover { color: var(--gold); }

  /* ── Hero ── */
  .hero {
    min-height: 100vh; display: flex; flex-direction: column; justify-content: center;
    position: relative; padding: 120px 0 80px;
    background:
      radial-gradient(1200px 600px at 75% 15%, rgba(74,107,124,0.18), transparent 60%),
      radial-gradient(900px 500px at 15% 85%, rgba(201,169,110,0.10), transparent 55%),
      var(--navy);
  }
  .hero-eyebrow {
    font-family: 'Work Sans', sans-serif; font-size: 12px; font-weight: 600;
    letter-spacing: 3.5px; text-transform: uppercase; color: var(--gold);
    margin-bottom: 26px; opacity: 0; animation: rise 0.9s 0.1s forwards;
  }
  .hero h1 {
    font-family: 'Fraunces', serif; font-weight: 500;
    font-size: clamp(2.6rem, 6.5vw, 5.2rem); line-height: 1.04;
    letter-spacing: -0.5px; color: var(--cream); max-width: 15ch;
    margin-bottom: 30px;
  }
  .hero h1 .thread { color: var(--gold); font-style: italic; }
  .hero h1 .word { display: inline-block; opacity: 0; animation: rise 0.9s forwards; }
  .hero-sub {
    font-size: clamp(1.05rem, 2vw, 1.3rem); color: var(--cream-dim);
    max-width: 46ch; font-weight: 400; margin-bottom: 40px;
    opacity: 0; animation: rise 0.9s 0.7s forwards;
  }
  .hero-cta { display: flex; gap: 16px; flex-wrap: wrap; opacity: 0; animation: rise 0.9s 0.9s forwards; }
  .btn-primary, .btn-ghost {
    font-family: 'Work Sans', sans-serif; font-size: 15px; font-weight: 500;
    padding: 14px 28px; border-radius: 4px; text-decoration: none;
    letter-spacing: 0.3px; transition: all 0.25s; cursor: pointer;
  }
  .btn-primary { background: var(--gold); color: var(--navy); border: 1px solid var(--gold); }
  .btn-primary:hover { background: var(--gold-bright); border-color: var(--gold-bright); }
  .btn-ghost { background: transparent; color: var(--cream); border: 1px solid var(--line); }
  .btn-ghost:hover { border-color: var(--gold); color: var(--gold); }

  .scroll-hint {
    position: absolute; bottom: 34px; left: 50%; transform: translateX(-50%);
    font-family: 'Work Sans', sans-serif; font-size: 11px; letter-spacing: 2px;
    text-transform: uppercase; color: var(--cream-dim); opacity: 0;
    animation: fadein 1s 1.4s forwards; display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .scroll-hint .rule { width: 1px; height: 34px; background: linear-gradient(var(--gold), transparent); }

  @keyframes rise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadein { to { opacity: 1; } }

  /* ── Section framing ── */
  section { padding: 100px 0; position: relative; }
  .section-eyebrow {
    font-family: 'Work Sans', sans-serif; font-size: 12px; font-weight: 600;
    letter-spacing: 3px; text-transform: uppercase; color: var(--gold);
    margin-bottom: 18px; display: flex; align-items: center; gap: 14px;
  }
  .section-eyebrow::before { content: ""; width: 30px; height: 1px; background: var(--gold); display: inline-block; }
  .section-title {
    font-family: 'Fraunces', serif; font-weight: 500;
    font-size: clamp(2rem, 4.5vw, 3.2rem); line-height: 1.1; color: var(--cream);
    margin-bottom: 28px; max-width: 20ch;
  }

  /* ── About ── */
  .about { background: var(--navy-soft); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .about-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 60px; align-items: center; }
  .about-body p { color: var(--cream-dim); font-size: 1.12rem; margin-bottom: 20px; }
  .about-body p .lead { color: var(--cream); }
  .about-signature {
    font-family: 'Fraunces', serif; font-style: italic; font-size: 1.4rem;
    color: var(--gold); margin-top: 12px;
  }
  .crest-logo {
    display: flex; align-items: center; justify-content: center;
  }
  .crest-logo img {
    width: 100%; max-width: 340px; height: auto; display: block;
    border-radius: 12px;
    filter: drop-shadow(0 20px 40px rgba(0,0,0,0.35));
  }

  /* ── Tours ── */
  .tours-intro { max-width: 52ch; color: var(--cream-dim); font-size: 1.12rem; margin-bottom: 56px; }
  .tour-list { display: flex; flex-direction: column; gap: 0; }
  .tour {
    display: grid; grid-template-columns: auto 1fr auto; gap: 30px; align-items: baseline;
    padding: 34px 0; border-top: 1px solid var(--line);
    transition: padding-left 0.3s;
  }
  .tour:last-child { border-bottom: 1px solid var(--line); }
  .tour:hover { padding-left: 12px; }
  .tour-num { font-family: 'Work Sans', sans-serif; font-size: 13px; color: var(--gold); letter-spacing: 1px; padding-top: 8px; }
  .tour-name { font-family: 'Fraunces', serif; font-size: clamp(1.4rem, 3vw, 2rem); color: var(--cream); font-weight: 500; }
  .tour-desc { color: var(--cream-dim); font-size: 1.02rem; margin-top: 8px; max-width: 48ch; }
  .tour-tag {
    font-family: 'Work Sans', sans-serif; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase;
    color: var(--gold); border: 1px solid var(--line); border-radius: 30px; padding: 7px 14px; white-space: nowrap; align-self: center;
  }
  .places { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px; }
  .place-chip {
    font-family: 'Work Sans', sans-serif; font-size: 12px; color: var(--cream-dim);
    background: var(--card); border: 1px solid var(--line); border-radius: 4px; padding: 5px 11px;
  }
  .idea-grid { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .idea {
    background: var(--card); border: 1px solid var(--line); border-radius: 8px;
    padding: 15px 16px; transition: border-color 0.25s, transform 0.25s;
  }
  .idea:hover { border-color: var(--gold); transform: translateY(-2px); }
  .idea-name { font-family: 'Fraunces', serif; font-size: 1.05rem; color: var(--cream); margin-bottom: 5px; }
  .idea-tag { font-size: 0.92rem; color: var(--cream-dim); line-height: 1.5; }
  @media (max-width: 640px) { .idea-grid { grid-template-columns: 1fr; } }

  /* ── App section ── */
  .app-section { text-align: center; }
  .app-callout { max-width: 620px; margin: 0 auto; }
  .app-callout .section-eyebrow { justify-content: center; }
  .app-callout .section-title { margin-left: auto; margin-right: auto; }
  .app-blurb { color: var(--cream-dim); font-size: 1.12rem; max-width: 48ch; margin: 0 auto 36px; }
  .appstore-badge {
    display: inline-flex; align-items: center; gap: 12px;
    background: var(--cream); color: var(--navy);
    padding: 12px 24px; border-radius: 10px; text-decoration: none;
    transition: transform 0.2s, background 0.2s;
  }
  .appstore-badge:hover { transform: translateY(-2px); background: #fff; }
  .appstore-badge span { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.1; font-family: 'Work Sans', sans-serif; font-weight: 600; font-size: 19px; }
  .appstore-badge span small { font-size: 10px; font-weight: 400; letter-spacing: 0.5px; text-transform: uppercase; }
  .already-tour { margin-top: 22px; font-family: 'Spectral', serif; font-size: 1rem; color: var(--cream-dim); }
  .already-tour a { color: var(--gold); text-decoration: none; border-bottom: 1px solid var(--line); padding-bottom: 1px; transition: color 0.2s, border-color 0.2s; }
  .already-tour a:hover { color: var(--gold-bright); border-color: var(--gold-bright); }

  /* ── Contact ── */
  .contact { background: var(--navy-soft); border-top: 1px solid var(--line); }
  .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; }
  .contact-body p { color: var(--cream-dim); font-size: 1.12rem; margin-bottom: 24px; max-width: 40ch; }
  .contact-direct { margin-top: 34px; }
  .contact-direct a { color: var(--gold); text-decoration: none; font-size: 1.1rem; display: block; margin-bottom: 10px; transition: color 0.2s; }
  .contact-direct a:hover { color: var(--gold-bright); }
  .contact-direct .label { font-family: 'Work Sans', sans-serif; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--cream-dim); display: block; margin-bottom: 4px; }

  form { display: flex; flex-direction: column; gap: 16px; }
  .field label { font-family: 'Work Sans', sans-serif; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--gold); display: block; margin-bottom: 7px; }
  .field input, .field textarea {
    width: 100%; background: var(--navy); border: 1px solid var(--line); border-radius: 4px;
    padding: 13px 15px; color: var(--cream); font-family: 'Spectral', serif; font-size: 1rem; outline: none;
    transition: border-color 0.2s;
  }
  .field input:focus, .field textarea:focus { border-color: var(--gold); }
  .field textarea { resize: vertical; min-height: 120px; }
  .submit-btn {
    font-family: 'Work Sans', sans-serif; font-size: 15px; font-weight: 500; letter-spacing: 0.3px;
    background: var(--gold); color: var(--navy); border: none; border-radius: 4px; padding: 15px;
    cursor: pointer; transition: background 0.2s; margin-top: 6px;
  }
  .submit-btn:hover { background: var(--gold-bright); }

  /* ── Footer ── */
  footer { padding: 50px 0 40px; border-top: 1px solid var(--line); text-align: center; }
  .foot-brand { font-family: 'Fraunces', serif; font-size: 1.3rem; color: var(--cream); margin-bottom: 10px; }
  .foot-brand .amp { color: var(--gold); font-style: italic; }
  .foot-note { font-family: 'Work Sans', sans-serif; font-size: 12px; color: var(--cream-dim); letter-spacing: 0.5px; }
  .foot-note a { color: var(--gold); text-decoration: none; }

  /* ── Reveal on scroll ── */
  .reveal { opacity: 0; transform: translateY(28px); transition: opacity 0.8s, transform 0.8s; }
  .reveal.in { opacity: 1; transform: translateY(0); }

  /* ── Responsive ── */
  @media (max-width: 820px) {
    .about-grid, .contact-grid { grid-template-columns: 1fr; gap: 40px; }
    .crest-logo { max-width: 280px; margin: 0 auto; order: -1; }
    .tour { grid-template-columns: auto 1fr; gap: 18px; }
    .tour-tag { grid-column: 2; justify-self: start; margin-top: 10px; }
    section { padding: 72px 0; }
    .app-link { padding: 8px 14px; font-size: 12px; }
    .topbar-links { gap: 12px; }
    .topbar-guest { font-size: 12px; }
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; transition: none !important; }
    .reveal { opacity: 1; transform: none; }
    .hero-eyebrow, .hero h1 .word, .hero-sub, .hero-cta, .scroll-hint { opacity: 1; animation: none; }
  }
`}</style>
      <div dangerouslySetInnerHTML={{ __html: `<div class="topbar" id="topbar">
  <a href="#top" class="brand-mark">Castle <span class="amp">&amp;</span> Coastline</a>
  <div class="topbar-links">
    <a href="/app" class="topbar-guest">Guest login</a>
    <a href="https://apps.apple.com/app/id6775566097" target="_blank" rel="noopener" class="app-link">Download the app →</a>
  </div>
</div>

<!-- ── HERO ── -->
<header class="hero" id="top">
  <div class="wrap">
    <div class="hero-eyebrow">Storytelling tours · Britain &amp; Ireland</div>
    <h1>
      <span class="word" style="animation-delay:.15s">The</span>
      <span class="word" style="animation-delay:.25s">history</span>
      <span class="word" style="animation-delay:.35s">of</span>
      <span class="word" style="animation-delay:.45s">these</span>
      <span class="word thread" style="animation-delay:.55s">islands,</span>
      <span class="word" style="animation-delay:.65s">told</span>
      <span class="word" style="animation-delay:.72s">by</span>
      <span class="word" style="animation-delay:.79s">someone</span>
      <span class="word" style="animation-delay:.86s">who</span>
      <span class="word" style="animation-delay:.93s">grew</span>
      <span class="word" style="animation-delay:1s">up</span>
      <span class="word" style="animation-delay:1.07s">in</span>
      <span class="word" style="animation-delay:1.14s">it.</span>
    </h1>
    <p class="hero-sub">Group journeys across the UK and Ireland, and private day trips from London — each one a story of the places, the people, and the past that shaped them.</p>
    <div class="hero-cta">
      <a href="#tours" class="btn-primary">See the tours</a>
      <a href="#contact" class="btn-ghost">Plan a private trip</a>
    </div>
  </div>
  <div class="scroll-hint"><span>Scroll</span><span class="rule"></span></div>
</header>

<!-- ── ABOUT ── -->
<section class="about" id="about">
  <div class="wrap">
    <div class="about-grid">
      <div class="about-body reveal">
        <div class="section-eyebrow">The guide</div>
        <h2 class="section-title">A few years on the road, a lifetime in the stories.</h2>
        <p><span class="lead">I've spent several years guiding, both group and private,</span> and what I love most is bringing the tales of the British Isles to life — through their history, their legends, and the landscapes I was lucky enough to grow up around.</p>
        <p>From castles and coastlines to the quiet corners most visitors never hear about, I try to tell the story of these islands the way a local would: honestly, warmly, and with the kind of detail you only get from a lifetime of learning about a place.</p>
        <p class="about-signature">— Dan, Castle &amp; Coastline</p>
      </div>
      <div class="crest-logo reveal">
        <img src="/logo.png" alt="Castle &amp; Coastline Tours" />
      </div>
    </div>
  </div>
</section>

<!-- ── TOURS ── -->
<section class="tours" id="tours">
  <div class="wrap">
    <div class="section-eyebrow reveal">The tours</div>
    <h2 class="section-title reveal">Two ways to travel with me.</h2>
    <p class="tours-intro reveal">Whether you're joining a full multi-day journey or slipping out of London for a day, the approach is the same — real stories, real places, at a pace that lets them land.</p>

    <div class="tour-list">
      <div class="tour reveal">
        <div class="tour-num">01</div>
        <div>
          <div class="tour-name">Group tours across Britain &amp; Ireland</div>
          <div class="tour-desc">Multi-day journeys through the UK and Ireland, guided in partnership with Globus — from the Highlands to the west coast of Ireland, castles to coastlines, with the history woven through every mile.</div>
        </div>
        <div class="tour-tag">With Globus</div>
      </div>

      <div class="tour reveal">
        <div class="tour-num">02</div>
        <div>
          <div class="tour-name">Private day trips from London</div>
          <div class="tour-desc">Smaller, personal day tours to some of England's most storied places — designed around you, at your pace, with the tales told the way only a local guide can. The ideas below are just starting points: mix, match, or suggest your own, and we'll build the perfect day.</div>
          <div class="idea-grid">
            <div class="idea"><div class="idea-name">Stonehenge &amp; Bath</div><div class="idea-tag">Two World Heritage sites in a day — prehistoric mystery and Georgian elegance.</div></div>
            <div class="idea"><div class="idea-name">Oxford &amp; Stratford-upon-Avon</div><div class="idea-tag">Dreaming spires and Shakespeare's birthplace — England's literary heart.</div></div>
            <div class="idea"><div class="idea-name">South East England</div><div class="idea-tag">Hastings, 1066, and the coast where English history turned.</div></div>
            <div class="idea"><div class="idea-name">The Cotswolds</div><div class="idea-tag">Honey-stone villages and rolling hills, at a storyteller's pace.</div></div>
            <div class="idea"><div class="idea-name">Windsor Castle</div><div class="idea-tag">A thousand years of royal history at the oldest occupied castle on earth.</div></div>
            <div class="idea"><div class="idea-name">Kent Castles</div><div class="idea-tag">Fairytale Leeds Castle and Dover's wartime secret tunnels.</div></div>
            <div class="idea"><div class="idea-name">Blenheim Palace</div><div class="idea-tag">Churchill's birthplace and one of England's grandest houses.</div></div>
            <div class="idea"><div class="idea-name">Cambridge</div><div class="idea-tag">Centuries of learning, punting on the Cam, and stories in every college.</div></div>
            <div class="idea"><div class="idea-name">Highclere Castle</div><div class="idea-tag">The real Downton Abbey — a grand estate with stories above and below stairs.</div></div>
          </div>
        </div>
        <div class="tour-tag">Private</div>
      </div>
    </div>
  </div>
</section>

<!-- ── APP ── -->
<section class="app-section" id="app">
  <div class="wrap">
    <div class="app-callout reveal">
      <div class="section-eyebrow">The guest app</div>
      <h2 class="section-title">Travelling with me?<br />Take the tour in your pocket.</h2>
      <p class="app-blurb">Guests on my tours get a free companion app — your day-by-day itinerary, live updates, weather for each stop, a shared photo gallery, and reminders so you never miss a departure. Download it before you set off.</p>
      <a href="https://apps.apple.com/app/id6775566097" target="_blank" rel="noopener" class="appstore-badge">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M17.05 12.04c-.03-2.82 2.3-4.17 2.4-4.24-1.31-1.92-3.35-2.18-4.07-2.21-1.73-.17-3.38 1.02-4.26 1.02-.88 0-2.23-1-3.67-.97-1.89.03-3.63 1.1-4.6 2.79-1.96 3.4-.5 8.43 1.4 11.19.93 1.35 2.04 2.87 3.49 2.81 1.4-.06 1.93-.9 3.62-.9 1.69 0 2.17.9 3.65.87 1.51-.03 2.46-1.38 3.38-2.74 1.07-1.57 1.51-3.09 1.53-3.17-.03-.01-2.94-1.13-2.97-4.47zM14.28 3.95c.77-.94 1.29-2.24 1.15-3.54-1.11.045-2.46.74-3.26 1.68-.72.83-1.35 2.16-1.18 3.43 1.24.096 2.51-.63 3.29-1.57z"/></svg>
        <span><small>Download on the</small>App Store</span>
      </a>
      <div class="already-tour">
        Already on a tour? <a href="/app">Open the app here →</a>
      </div>
    </div>
  </div>
</section>

<!-- ── CONTACT ── -->
<section class="contact" id="contact">
  <div class="wrap">
    <div class="contact-grid">
      <div class="contact-body reveal">
        <div class="section-eyebrow">Get in touch</div>
        <h2 class="section-title">Planning a trip?<br />Let's talk.</h2>
        <p>Tell me a little about what you're after — a private day trip, a question about a group tour, or just an idea you're toying with — and I'll get back to you personally.</p>
        <div class="contact-direct">
          <a href="mailto:danriding26@gmail.com"><span class="label">Email</span>danriding26@gmail.com</a>
          <a href="tel:+447702804943"><span class="label">Phone</span>+44 7702 804943</a>
        </div>
      </div>
      <div class="reveal">
        <form action="https://formsubmit.co/danriding26@gmail.com" method="POST">
          <input type="hidden" name="_subject" value="New enquiry from Castle & Coastline website" />
          <input type="hidden" name="_captcha" value="false" />
          <div class="field">
            <label for="name">Your name</label>
            <input type="text" id="name" name="name" required />
          </div>
          <div class="field">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required />
          </div>
          <div class="field">
            <label for="message">What can I help with?</label>
            <textarea id="message" name="message" placeholder="A private day trip to Oxford, a question about a group tour…" required></textarea>
          </div>
          <button type="submit" class="submit-btn">Send enquiry</button>
        </form>
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-brand">Castle <span class="amp">&amp;</span> Coastline</div>
    <div class="foot-note">Storytelling tours of Britain &amp; Ireland &nbsp;·&nbsp; <a href="https://apps.apple.com/app/id6775566097" target="_blank" rel="noopener">Download the app</a> &nbsp;·&nbsp; <a href="/privacy">Privacy</a></div>
  </div>
</footer>` }} />
    </>
  );
}
