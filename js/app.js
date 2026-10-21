/**
 * LOGIC LAND — Game Engine (2D)
 * สถานะกลางเดียว (D = ความคืบหน้าผู้เล่น, ui = สถานะหน้าจอ) ใช้กับทั้ง 4 ด่าน
 * ระบบ: คำถาม/ตัวเลือก, ตรวจคำตอบ, คะแนน, หัวใจ, จับเวลา 180 วิ./ข้อ, ดาวความเร็ว,
 *       คำใบ้ (-5), เริ่มภารกิจใหม่ (-5 คะแนน, -10 ดาว), ผ่านด่าน ≥ 70, ปลดล็อก, Execute, บันทึกความคืบหน้า, สรุปผล
 */
(function () {
  'use strict';
  const { STAGES, RULES } = window.LL_CONTENT;
  const audio = window.logicAudio || { click() {}, select() {}, correct() {}, wrong() {}, coin() {}, hint() {}, victory() {}, laserTick() {}, laserZap() {}, laserPass() {}, dial() {}, step() {}, setMuted() {} };
  const $app = document.getElementById('app');
  const $bg = document.getElementById('bg');
  const STORE = 'logicland.v2';
  const THEMES = ['leaf', 'grape', 'sun', 'sky'];
  const STAGE_PIC = ['assets/garden.jpg', 'assets/stage2/scene3.png', 'assets/stage3/scene3.jpg', 'assets/stage4/2.jpg'];
  const AVATARS = [
    { name: 'เด็กผู้หญิง', img: 'assets/characters/girl_portrait.png' },
    { name: 'เด็กผู้ชาย', img: 'assets/characters/boy_portrait.png' },
    { name: 'หุ่นยนต์ Byte', img: 'assets/characters/robot_portrait.png' }
  ];
  const BYTE = pose => `assets/characters/byte_${pose}.svg`;
  const PAIR_COLORS = ['#ff6fa8', '#38bdf8', '#ffb020', '#34c759', '#8b5cf6'];
  const DIRS = [{ k: 'up', a: '↑', dx: 0, dy: -1, t: 'ขึ้น' }, { k: 'down', a: '↓', dx: 0, dy: 1, t: 'ลง' }, { k: 'left', a: '←', dx: -1, dy: 0, t: 'ซ้าย' }, { k: 'right', a: '→', dx: 1, dy: 0, t: 'ขวา' }];

  // ------------------------------------------------------------------ storage
  const memory = {};
  const lsGet = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : (memory[k] ?? null); } catch (e) { return memory[k] ?? null; } };
  const lsSet = (k, v) => { memory[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: keep in memory */ } };
  const idOf = (n, c) => encodeURIComponent(n.trim().toLowerCase() + '|' + c.trim().toLowerCase());
  const freshStage = () => ({ score: 0, stars: 0, hearts: RULES.hearts, hints: RULES.hints, hintsUsed: 0, done: {}, missions: [false, false, false, false, false], times: [0, 0, 0, 0, 0], restarts: 0 });
  const freshData = (name, code) => ({ v: 2, name, code, avatar: null, rulesSeen: false, stages: STAGES.map(freshStage), resume: null, created: Date.now() });

  let settings = Object.assign({ muted: false, music: true, calm: false, last: null }, lsGet(STORE + '.settings') || {});
  let D = null;
  audio.setMuted(settings.muted);

  // ---------- เพลงพื้นหลัง (เล่นหลังผู้เล่นแตะหน้าจอครั้งแรก ตามกฎเบราว์เซอร์)
  const MUSIC_VOL = 0.32;
  const music = (() => {
    let el = null, raf = 0, unlocked = false;
    const ensure = () => {
      if (!el) {
        el = new Audio('assets/audio/soundbg.mp3');
        el.loop = true; el.preload = 'auto'; el.volume = 0;
        el.addEventListener('error', () => { el = null; });
      }
      return el;
    };
    function fadeTo(v, ms = 700) {
      const a = ensure(); if (!a) return;
      cancelAnimationFrame(raf);
      const from = a.volume, t0 = performance.now();
      const step = t => {
        const k = Math.min(1, (t - t0) / ms);
        try { a.volume = Math.max(0, Math.min(1, from + (v - from) * k)); } catch (e) {}
        if (k < 1) raf = requestAnimationFrame(step);
        else if (v === 0) a.pause();
      };
      raf = requestAnimationFrame(step);
    }
    function play() {
      if (!settings.music || !unlocked || document.hidden) return;
      const a = ensure(); if (!a) return;
      const pr = a.play(); if (pr && pr.catch) pr.catch(() => {});
      fadeTo(MUSIC_VOL);
    }
    return {
      unlock() { if (unlocked) return; unlocked = true; play(); },
      play,
      stop() { if (el && !el.paused) fadeTo(0, 400); },
      pauseNow() { if (el) { cancelAnimationFrame(raf); el.pause(); } },
      duck(ms = 1600) {
        if (!el || el.paused || !settings.music) return;
        fadeTo(MUSIC_VOL * 0.25, 200);
        clearTimeout(this._t); this._t = setTimeout(() => { if (settings.music && !el.paused) fadeTo(MUSIC_VOL, 600); }, ms);
      },
      get on() { return settings.music; },
      status() { return { playing: !!(el && !el.paused), volume: el ? +el.volume.toFixed(2) : 0, time: el ? +el.currentTime.toFixed(1) : 0 }; }
    };
  })();
  const unlockAudio = () => { music.unlock(); };
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  window.addEventListener('keydown', unlockAudio, { capture: true });
  const soundBtns = (sm = true) => `
        <button class="btn ghost icon ${sm ? 'sm' : ''} ${settings.music ? '' : 'off'}" data-a="music" aria-pressed="${settings.music}" aria-label="${settings.music ? 'ปิดเพลงพื้นหลัง' : 'เปิดเพลงพื้นหลัง'}" title="เพลงพื้นหลัง: ${settings.music ? 'เปิด' : 'ปิด'}">🎵</button>
        <button class="btn ghost icon ${sm ? 'sm' : ''} ${settings.muted ? 'off' : ''}" data-a="mute" aria-pressed="${!settings.muted}" aria-label="${settings.muted ? 'เปิดเสียงเอฟเฟกต์' : 'ปิดเสียงเอฟเฟกต์'}" title="เสียงเอฟเฟกต์: ${settings.muted ? 'ปิด' : 'เปิด'}">${settings.muted ? '🔇' : '🔊'}</button>`;

  function save() {
    lsSet(STORE + '.settings', settings);
    if (D) lsSet(STORE + '.p.' + idOf(D.name, D.code), D);
  }
  function loadLast() {
    if (!settings.last) return null;
    const d = lsGet(STORE + '.p.' + settings.last);
    return d && d.v === 2 ? normalize(d) : null;
  }
  function normalize(d) {
    d.stages = STAGES.map((_, i) => Object.assign(freshStage(), d.stages && d.stages[i] || {}));
    return d;
  }

  // ------------------------------------------------------------------ ui state
  const ui = {
    screen: 'start', s: 0, m: 0, q: 0,
    w: null, fb: null, hint: null, hintLevel: 0, checked: false, busy: false,
    qsec: 0, runTok: 0, modal: null, lostHeart: false, byte: 'think', err: '', firstRun: false
  };
  const ST = () => STAGES[ui.s];
  const MI = () => ST().missions[ui.m];
  const Q = () => MI().questions[ui.q];
  const P = (i = ui.s) => D.stages[i];
  const alive = tok => tok === ui.runTok && ui.screen === 'play';
  const graded = q => !q.review || q.review.status === 'CONFIRMED';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => { n = Math.max(0, Math.floor(n || 0)); return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };
  const starsFor = secs => (RULES.stars.find(([lim]) => secs <= lim) || [0, 1])[1];
  const sum = a => a.reduce((x, y) => x + (Number(y) || 0), 0);

  const missionDone = (s, m) => P(s).missions[m];
  const missionUnlocked = (s, m) => m === 0 || P(s).missions[m - 1];
  const stageComplete = s => P(s).missions.every(Boolean);
  const stagePassed = s => stageComplete(s) && P(s).score >= RULES.passScore;
  const stageUnlocked = s => s === 0 || stagePassed(s - 1);
  const missionStars = (s, m) => sum(STAGES[s].missions[m].questions.map(q => (P(s).done[q.uid] || {}).stars || 0));
  const missionPts = (s, m) => { const qs = STAGES[s].missions[m].questions; return { got: sum(qs.map(q => P(s).done[q.uid] ? q.points : 0)), max: sum(qs.map(q => q.points)), done: qs.filter(q => P(s).done[q.uid]).length, n: qs.length }; };
  function missionTable(s) {
    const st = STAGES[s], p = P(s);
    const rows = st.missions.map((mi, j) => ({ mi, j, ...missionPts(s, j) }));
    const earned = sum(rows.map(r => r.got)), ded = earned - p.score;
    return `<div style="overflow-x:auto;width:100%"><table class="table mt"><thead><tr><th>ภารกิจ</th><th>คะแนน</th><th>ข้อที่ผ่าน</th><th>ดาว</th><th>เวลา</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${r.mi.icon} ${r.mi.id} ${esc(r.mi.title)}</td><td><b>${r.got}</b>/${r.max}</td><td>${r.done}/${r.n} ${r.done === r.n ? '✅' : ''}</td><td>⭐ ${missionStars(s, r.j)}</td><td>${fmt(p.times[r.j])}</td></tr>`).join('')}
      ${ded > 0 ? `<tr class="ded"><td>➖ หักจากคำใบ้ / เริ่มภารกิจใหม่</td><td><b>−${ded}</b></td><td colspan="3" class="small muted">คำใบ้ ${p.hintsUsed} ครั้ง · เริ่มใหม่ ${p.restarts} ครั้ง</td></tr>` : ''}
      <tr class="tot"><td><b>รวมคะแนนด่าน</b></td><td><b>${p.score}</b>/100</td><td>${rows.reduce((a, r) => a + r.done, 0)}/${rows.reduce((a, r) => a + r.n, 0)}</td><td>⭐ ${p.stars}</td><td>${fmt(sum(p.times))}</td></tr>
    </tbody></table></div>`;
  }
  const totalStars = () => sum(D.stages.map(x => x.stars));

  // ------------------------------------------------------------------ helpers
  function toast(msg) {
    document.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }
  function confetti(n = 60) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div'); box.className = 'confetti';
    const cols = ['#ff6fa8', '#38bdf8', '#ffc83d', '#34c759', '#8b5cf6', '#ff8a3d'];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = cols[i % cols.length];
      c.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
      c.style.animationDelay = Math.random() * .4 + 's';
      box.appendChild(c);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3800);
  }
  const guide = (pose, text, size = '', anim = false) => `
    <div class="guide ${size}"><img class="byte ${anim ? 'byte-anim-' + pose : ''}" src="${BYTE(pose)}" alt="ไบต์ หุ่นยนต์ผู้ช่วย">${text ? `<div class="bubble">${text}</div>` : ''}</div>`;

  function setBg(kind) {
    $bg.className = 'bg ' + kind;
    $bg.innerHTML = kind === 'world' ? '' : `
      <div class="cloud" style="top:8vh;width:160px;height:46px;animation-duration:70s"></div>
      <div class="cloud" style="top:22vh;width:110px;height:34px;animation-duration:90s;animation-delay:-40s"></div>
      <div class="cloud" style="top:14vh;width:130px;height:40px;animation-duration:80s;animation-delay:-20s"></div>
      <div class="hill h1"></div><div class="hill h2"></div><div class="hill h3"></div>`;
  }

  // ------------------------------------------------------------------ question lifecycle
  function newWork(q) {
    switch (q.type) {
      case 'single': return { sel: null, elim: [] };
      case 'multi': return { sel: [] };
      case 'group': return { place: {}, pick: null };
      case 'match': return { pairs: {}, pick: null };
      case 'sequence': return { fill: q.slots.map(() => null), active: 0 };
      case 'dial': return { digits: q.sets.map(() => null) };
      case 'colors': return { seq: [] };
      case 'laser': return { gate: 0, beat: 0, hits: 0 };
      case 'steps': return { step: 0, sel: null, elim: [], stepDone: false };
      case 'sort': return { dec: {}, active: 0 };
      case 'budget': return { sel: [] };
      case 'erase': return { erased: [] };
      case 'order': return { seq: [], run: -1, result: null };
      case 'path': return { cmds: [], pos: q.start, trail: [], crash: null, run: -1 };
      case 'vending': return { cond: null, then: null, els: null, coins: 0, tests: 0, out: null, outKind: '' };
    }
    return {};
  }
  function loadQ() {
    ui.w = newWork(Q());
    ui.fb = null; ui.hint = null; ui.hintLevel = 0; ui.checked = false; ui.busy = false;
    ui.qsec = 0; ui.byte = 'think'; ui.timedOut = false;
    D.resume = { s: ui.s, m: ui.m, q: ui.q };
    save();
  }
  function go(screen) {
    ui.runTok++; ui.busy = false;
    ui.screen = screen; ui.modal = null;
    render();
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ HUD
  function hud(play = false) {
    const p = P(), av = AVATARS[D.avatar ?? 0];
    const left = Math.max(0, RULES.timeLimit - ui.qsec);
    const hearts = Array.from({ length: RULES.hearts }, (_, i) => `<span class="h ${i < p.hearts ? '' : 'off'} ${ui.lostHeart && i === p.hearts ? 'lost' : ''}" aria-hidden="true">❤️</span>`).join('');
    return `
    <header class="hud theme-${THEMES[ui.s]}">
      <div class="who"><img src="${av.img}" alt="${esc(av.name)}"><span class="nm">${esc(D.name)}</span><span class="tag">ด่าน ${ui.s + 1}</span></div>
      <div class="stats">
        <span class="pill" title="หัวใจ"><span class="sr-only">หัวใจ ${p.hearts} ดวง</span><span class="hearts">${hearts}</span></span>
        <span class="pill" title="คำใบ้คงเหลือ">💡 ${p.hints} <span class="lbl">คำใบ้</span></span>
        <span class="pill" title="คะแนนด่านนี้">🏅 ${p.score}<span class="lbl">/100</span></span>
        <span class="pill" title="ดาวความเร็ว">⭐ ${p.stars}</span>
        ${play ? `<span class="pill timer ${left <= 20 ? 'danger' : left <= 60 ? 'warn' : ''}" id="timer" title="เวลาข้อนี้"><span class="ring" style="--p:${(left / RULES.timeLimit) * 100}"></span><b>${fmt(left)}</b></span>` : ''}
        ${soundBtns()}
        <button class="btn ghost icon sm" data-a="toMap" aria-label="กลับแผนที่โลก" title="แผนที่โลก">🗺️</button>
      </div>
    </header>`;
  }

  // ------------------------------------------------------------------ SCREENS
  function scrStart() {
    setBg('world');
    const last = loadLast();
    return `<main class="screen start">
      <section class="center">
        <img class="logo" src="assets/ui/logo.png" alt="Logic Land ดินแดนแห่งเหตุผล">
        <img class="hero" src="assets/characters/hero_group.png" alt="เพื่อนนักผจญภัยและหุ่นยนต์ไบต์ คิดเป็น แก้ปัญหาเก่ง เก่งได้ทุกวัน">
      </section>
      <section class="card menu">
        <p class="tagline">ผจญภัย 4 ด่าน ฝึกคิดแบบนักแก้ปัญหา 🧠✨</p>
        ${last ? `<div class="cont-card"><img src="${AVATARS[last.avatar ?? 0].img}" alt=""><div><b>${esc(last.name)}</b><div class="small muted">ด่านที่ผ่านแล้ว ${last.stages.filter((_, i) => last.stages[i].missions.every(Boolean) && last.stages[i].score >= RULES.passScore).length}/4 · ⭐ ${sum(last.stages.map(x => x.stars))}</div></div></div>
          <button class="btn go big" data-a="continue">▶ เล่นต่อ</button>
          <button class="btn sky" data-a="newPlayer">👤 เริ่มเล่นด้วยชื่อใหม่</button>`
        : `<button class="btn go big" data-a="newPlayer">▶ เริ่มเกม</button>`}
        <div class="row" style="justify-content:center">
          <button class="btn sun sm" data-a="howto">📜 วิธีเล่น</button>
          <button class="btn ghost sm ${settings.music ? '' : 'off'}" data-a="music" aria-pressed="${settings.music}">🎵 เพลง: ${settings.music ? 'เปิด' : 'ปิด'}</button>
          <button class="btn ghost sm ${settings.muted ? 'off' : ''}" data-a="mute" aria-pressed="${!settings.muted}">${settings.muted ? '🔇' : '🔊'} เอฟเฟกต์: ${settings.muted ? 'ปิด' : 'เปิด'}</button>
          <button class="btn ghost sm" data-a="calm" aria-pressed="${!!settings.calm}">🌀 ลดการเคลื่อนไหว: ${settings.calm ? 'เปิด' : 'ปิด'}</button>
        </div>
      </section>
    </main>`;
  }

  function scrLogin() {
    setBg('world');
    return `<main class="screen" style="max-width:760px">
      <section class="card panel" style="display:grid;gap:16px;margin-top:4vh">
        ${guide('wave', 'สวัสดี! ฉันชื่อ <b>ไบต์</b> 🤖 บอกชื่อและรหัสนักเรียนของเธอหน่อยนะ ระบบจะบันทึกความคืบหน้าให้')}
        <form id="loginForm" style="display:grid;gap:14px" autocomplete="off" novalidate>
          <div class="field"><label for="name">ชื่อผู้เล่น</label><input id="name" maxlength="40" placeholder="เช่น มะลิ" value="${esc(ui.prefName || '')}"></div>
          <div class="field"><label for="code">รหัสนักเรียน</label><input id="code" maxlength="20" placeholder="เช่น 12345" inputmode="numeric"></div>
          <div class="err" role="alert">${esc(ui.err)}</div>
          <div class="row"><button type="button" class="btn ghost" data-a="toStart">← กลับ</button><span class="spacer"></span><button type="submit" class="btn go big">เข้าสู่โลกผจญภัย ➜</button></div>
        </form>
      </section>
    </main>`;
  }

  function scrAvatar() {
    setBg('world');
    return `<main class="screen" style="max-width:900px">
      <section class="card panel" style="display:grid;gap:18px">
        <div class="center"><h2>เลือกตัวละครของเธอ</h2><p class="muted">ตัวละครจะอยู่กับเธอตลอดการผจญภัยทั้ง 4 ด่าน</p></div>
        <div class="avatars">
          ${AVATARS.map((a, i) => `<button class="card avatar-card ${D.avatar === i ? 'sel' : ''}" data-a="avatar" data-v="${i}" aria-pressed="${D.avatar === i}">
            <img src="${a.img}" alt=""><h3>${a.name}</h3></button>`).join('')}
        </div>
        <div class="row"><button class="btn ghost" data-a="${D.avatar === null || D.avatar === undefined ? 'logout' : 'toMap'}">← กลับ</button></div>
      </section>
    </main>`;
  }

  function scrRules() {
    setBg('world');
    const items = [
      ['🗺️', 'ภารกิจทั้ง 4 ด่าน', 'เริ่มจากด่านที่ 1 และปลดล็อกด่านถัดไปเมื่อผ่านด่านก่อนหน้า'],
      ['⏱️', 'เวลาข้อละ 3 นาที', 'นับถอยหลังใหม่ทุกข้อ ถ้าหมดเวลาจะเสียหัวใจ 1 ดวง'],
      ['🏅', 'คะแนนความถูกต้อง', 'ตอบถูกได้คะแนน รวมเต็ม 100 คะแนนต่อด่าน ตอบผิดไม่ได้คะแนน'],
      ['⭐', 'ดาวโบนัสความเร็ว', '0–60 วิ. ได้ ⭐⭐⭐ · 61–120 วิ. ได้ ⭐⭐ · 121–180 วิ. ได้ ⭐'],
      ['❤️', '3 หัวใจ', 'ตอบผิดหรือหมดเวลาเสีย 1 หัวใจ หัวใจหมดต้องเริ่มภารกิจใหม่'],
      ['🔄', 'เริ่มภารกิจใหม่', 'เมื่อหัวใจหมด เริ่มใหม่ได้ โดยหัก 5 คะแนน และ 10 ดาว'],
      ['💡', '3 คำใบ้ต่อด่าน', 'ใช้เมื่อเจอข้อยาก หัก 5 คะแนนต่อครั้ง'],
      ['🔓', 'ผ่านด่าน', 'ทำครบ 5 ภารกิจ และได้อย่างน้อย 70 คะแนน']
    ];
    return `<main class="screen">
      <section class="card panel" style="display:grid;gap:18px">
        <div class="row">${guide('idle', 'ก่อนออกผจญภัย มาดูกติกากันก่อนนะ!', 'sm')}</div>
        <h2>📜 กติกาการเล่น Logic Land</h2>
        <div class="rules">${items.map(([e, b, t]) => `<div class="rule"><span class="ic">${e}</span><div><b>${b}</b><span>${t}</span></div></div>`).join('')}</div>
        <div class="row"><button class="btn ghost" data-a="${D ? 'toMap' : 'toStart'}">← กลับ</button><span class="spacer"></span>
        ${D ? `<button class="btn go big" data-a="rulesOk">เข้าใจแล้ว ไปแผนที่โลก ➜</button>` : ''}</div>
      </section>
    </main>`;
  }

  function scrMap() {
    setBg('world');
    const av = AVATARS[D.avatar ?? 0];
    const passed = STAGES.filter((_, i) => stagePassed(i)).length;
    return `<main class="screen">
      <div class="titlebar">
        <div class="ttl row"><img src="${av.img}" alt="" style="width:44px;height:44px;border-radius:50%;border:3px solid var(--line)"><b>${esc(D.name)}</b><span class="muted small">ผ่านแล้ว ${passed}/4 ด่าน · ⭐ ${totalStars()}</span></div>
        <span class="spacer"></span>
        <button class="btn sun sm" data-a="summary">🏆 สรุปคะแนน</button>
        <button class="btn ghost sm" data-a="calm" aria-pressed="${!!settings.calm}" title="ลดการเคลื่อนไหวบนหน้าจอ">🌀 ${settings.calm ? 'ลดการเคลื่อนไหว: เปิด' : 'ลดการเคลื่อนไหว'}</button>
        <button class="btn ghost sm" data-a="howto">📜 กติกา</button>
        ${soundBtns()}
        <button class="btn ghost sm" data-a="logout">🚪 ออก</button>
      </div>
      <div class="card panel" style="display:grid;gap:16px;background:rgba(255,253,246,.93)">
        <div class="row">${guide('wave', passed === 4 ? 'เธอพิชิต Logic Land ครบทุกด่านแล้ว! 🎉 กลับมาเล่นซ้ำเพื่อสะสมดาวได้นะ' : 'เลือกด่านที่เปิดอยู่ได้เลย! ทำครบ 5 ภารกิจ และได้ 70 คะแนนขึ้นไป เพื่อเปิดด่านต่อไป', 'sm')}</div>
        <div class="worlds">
          ${STAGES.map((st, i) => {
            const un = stageUnlocked(i), p = P(i), md = p.missions.filter(Boolean).length;
            return `<article class="card world-card theme-${THEMES[i]} ${un ? '' : 'locked'}">
              <div class="pic"><img src="${STAGE_PIC[i]}" alt="ภาพด่านที่ ${i + 1}"><span class="num">${i + 1}</span>
                ${stagePassed(i) ? '<span class="badge-pass">✓ ผ่านแล้ว</span>' : ''}${un ? '' : '<span class="lock" aria-hidden="true">🔒</span>'}</div>
              <div class="body">
                <h3>${st.icon} ${st.title}</h3>
                <p class="small muted">${st.blurb}</p>
                <div class="bar" role="progressbar" aria-valuenow="${md}" aria-valuemin="0" aria-valuemax="5" aria-label="ภารกิจที่ทำแล้ว"><span style="width:${md * 20}%"></span></div>
                <div class="kv"><span>ภารกิจ ${md}/5</span><span>🏅 ${p.score} · ⭐ ${p.stars}</span></div>
                <button class="btn ${un ? '' : 'ghost'}" data-a="openStage" data-v="${i}" ${un ? '' : 'disabled'}>${un ? (md ? 'เล่นต่อ ➜' : 'เข้าเล่น ➜') : `🔒 ผ่านด่าน ${i} ก่อน`}</button>
              </div>
            </article>`;
          }).join('')}
        </div>
      </div>
    </main>`;
  }

  function scrStage() {
    setBg('sky');
    const st = ST(), p = P();
    return hud() + `<main class="screen theme-${THEMES[ui.s]}">
      <section class="card stage-head">
        <div style="display:grid;gap:6px">
          <span class="small muted">ด่านที่ ${st.id} · ${st.skill}</span>
          <h2>${st.icon} ${st.title}</h2>
          <p class="muted">${st.blurb}</p>
          <div class="row small"><span>🏅 ${p.score}/100</span><span>⭐ ${p.stars}</span><span>🔄 เริ่มใหม่ ${p.restarts} ครั้ง</span><span>เกณฑ์ผ่าน ${RULES.passScore} คะแนน</span></div>
        </div>
        ${guide('think', '', 'sm')}
      </section>
      <div class="missions">
        ${st.missions.map((mi, j) => {
          const un = missionUnlocked(ui.s, j), dn = missionDone(ui.s, j), stars = missionStars(ui.s, j), max = mi.questions.length * 3;
          return `<article class="card mission ${un ? '' : 'locked'} ${dn ? 'done' : ''}">
            ${dn ? '<span class="tick" aria-label="ผ่านแล้ว">✅</span>' : ''}
            <div class="node" aria-hidden="true">${un ? mi.icon : '🔒'}</div>
            <span class="small muted">ภารกิจ ${mi.id}</span>
            <h3>${mi.title}</h3>
            <span class="small">${mi.subtitle}</span>
            <div class="stars" aria-label="ดาว ${stars} จาก ${max}">${stars ? '⭐ ' + stars + '/' + max : '<span class="small muted">' + mi.questions.length + ' ข้อ</span>'}</div>
            <span class="small muted">⏱️ ${fmt(p.times[j])}</span>
            <button class="btn sm ${un ? (dn ? 'sun' : 'go') : 'ghost'}" data-a="openMission" data-v="${j}" ${un ? '' : 'disabled'}>${un ? (dn ? '↻ เล่นอีกครั้ง' : 'เข้าเล่น') : 'ล็อก'}</button>
          </article>`;
        }).join('')}
      </div>
      <div class="row" style="margin-top:18px"><button class="btn ghost" data-a="toMap">← กลับแผนที่โลก</button><span class="spacer"></span>
        ${stageComplete(ui.s) ? `<button class="btn sun" data-a="stageResult">🏆 ดูผลด่าน</button>` : '<span class="small muted">ผ่านภารกิจก่อนหน้าเพื่อปลดล็อกภารกิจถัดไป</span>'}</div>
    </main>`;
  }

  const HOWTO = {
    single: [['📖', 'อ่านสถานการณ์และคำถาม'], ['👆', 'แตะเลือกคำตอบที่ถูกต้อง 1 ข้อ'], ['✅', 'กดปุ่ม “ตรวจคำตอบ”']],
    multi: [['📖', 'อ่านโจทย์ให้ดี'], ['☑️', 'แตะเลือกให้ครบตามจำนวนที่โจทย์บอก'], ['✅', 'กดปุ่ม “ตรวจคำตอบ”']],
    group: [['🃏', 'แตะการ์ด (หรือลากการ์ดด้วยเมาส์)'], ['📦', 'แตะกล่องกลุ่มที่ต้องการวาง'], ['✅', 'วางครบทุกใบแล้วกด “ตรวจคำตอบ”']],
    match: [['👈', 'แตะการ์ดฝั่งซ้าย'], ['👉', 'แตะคำตอบฝั่งขวาที่คู่กัน เส้นจะเชื่อมให้'], ['✅', 'จับคู่ครบแล้วกด “ตรวจคำตอบ”']],
    sequence: [['👀', 'สังเกตแบบรูปที่เรียงอยู่'], ['❔', 'แตะช่อง ? แล้วเลือกสิ่งที่หายไป'], ['✅', 'เติมครบแล้วกด “ตรวจคำตอบ”']],
    dial: [['🔢', 'หากฎของตัวเลขแต่ละชุด'], ['🔐', 'กด ▲ ▼ หมุนกุญแจแต่ละหลัก'], ['✅', 'กด “ตรวจคำตอบ” เพื่อปลดล็อก']],
    colors: [['📜', 'ศึกษาบันทึกลำดับสี'], ['🔴', 'กดปุ่มสีต่อให้ครบ 5 สี'], ['🚪', 'กด “ตรวจคำตอบ” เพื่อเปิดประตู']],
    laser: [['⏩', 'กด “รอจังหวะถัดไป” ดูเลเซอร์เปลี่ยน'], ['🟢', 'เมื่อเลเซอร์ประตูข้างหน้าปิด กด “เดินผ่าน”'], ['🏁', 'ผ่านครบประตู A B C']],
    steps: [['📖', 'อ่านสถานการณ์'], ['👆', 'ตอบคำถามย่อยทีละข้อ'], ['✅', 'ตอบถูกครบทุกข้อเพื่อผ่าน']],
    sort: [['🔍', 'แตะการ์ดข้อมูลทีละใบ'], ['📁', 'เลือก “เก็บ” หรือ “ไม่จำเป็น”'], ['✅', 'ตัดสินครบ 8 ใบแล้วกด “ตรวจคำตอบ”']],
    budget: [['🎯', 'ดูข้อจำกัด (เวลา หรือ จำนวนชิ้น)'], ['☑️', 'เลือกเฉพาะสิ่งที่จำเป็น'], ['✅', 'กด “ตรวจคำตอบ”']],
    erase: [['🧽', 'แตะข้อความที่ไม่เกี่ยวข้องเพื่อลบ'], ['📌', 'เหลือไว้เฉพาะข้อมูลที่ใช้แก้ปัญหา'], ['✅', 'กด “ตรวจคำตอบ”']],
    order: [['🃏', 'แตะการ์ดขั้นตอนตามลำดับ'], ['↕️', 'กด ▲ ▼ เพื่อสลับลำดับ'], ['▶️', 'กด “ทดลองทำงาน” ให้ตัวละครทำตาม']],
    path: [['➡️', 'กดลูกศรเพื่อวางคำสั่งทีละช่อง'], ['🧱', 'วางเส้นทางหลบสิ่งกีดขวาง'], ['▶️', 'กด Execute ให้ตัวละครเดินตามคำสั่ง']],
    vending: [['🧩', 'สร้างกฎ ถ้า...แล้ว...มิฉะนั้น'], ['🪙', 'หยอดเหรียญ แล้วกด Execute ทดสอบกฎ'], ['✅', 'กด “ตรวจคำตอบ”']]
  };

  function scrIntro() {
    setBg('sky');
    const mi = MI(), st = ST();
    const types = [...new Set(mi.questions.map(q => q.type))];
    return hud() + `<main class="screen theme-${THEMES[ui.s]}" style="max-width:980px">
      <section class="card intro">
        <div class="center"><img src="${BYTE('think')}" alt="ไบต์กำลังคิด" style="width:220px;margin:0 auto" class="byte-anim-happy"></div>
        <div>
          <span class="qbadge">ด่าน ${st.id} · ภารกิจ ${mi.id}</span>
          <h1 style="margin:8px 0 2px">${mi.icon} ${mi.title}</h1>
          <p class="muted">${mi.subtitle} · ${mi.questions.length} ข้อ · ข้อละไม่เกิน 3 นาที</p>
          ${types.map(t => `<ol class="howto">${HOWTO[t].map(([e, x]) => `<li><span class="e">${e}</span>${x}</li>`).join('')}</ol>`).join('')}
          ${P().hearts <= 0 ? '<p class="err">หัวใจหมดแล้ว ต้องเริ่มภารกิจใหม่ก่อน</p>' : ''}
          <div class="row"><button class="btn ghost" data-a="toStage">← เลือกภารกิจ</button><span class="spacer"></span>
            <button class="btn go big" data-a="beginMission">เริ่มภารกิจ ▶</button></div>
        </div>
      </section>
    </main>`;
  }

  // ---------- PLAY
  function scrPlay() {
    setBg('sky');
    const st = ST(), mi = MI(), q = Q();
    const dots = mi.questions.map((qq, i) => `<i class="${i < ui.q || (i === ui.q && ui.checked) ? 'ok' : i === ui.q ? 'on' : ''}" title="ข้อ ${i + 1}"></i>`).join('');
    const storyText = q.story ? `<div class="text"><span class="tag">📖 สถานการณ์</span><div>${esc(q.story)}</div></div>` : '';
    const byteMsg = { think: 'อ่านสถานการณ์ให้ดี แล้วค่อยลงมือนะ', happy: 'เยี่ยมมาก! 🎉', oops: 'ไม่เป็นไรนะ ลองคิดอีกครั้ง หรือใช้คำใบ้ก็ได้', hint: 'ลองดูคำใบ้ข้างขวานะ', cheer: 'สุดยอด!' }[ui.byte] || '';
    return hud(true) + `<main class="screen theme-${THEMES[ui.s]}">
      <div class="play">
        <aside class="card story">
          <div class="scene"><img src="${q.scene}" alt="ภาพสถานการณ์ ${esc(mi.title)}"></div>
          <div style="display:grid;gap:12px">${storyText}${guide(ui.byte, byteMsg, 'sm', ui.fx)}</div>
        </aside>
        <section class="card task" aria-live="polite">
          <div class="task-head">
            <span class="qbadge">ภารกิจ ${mi.id} ${esc(mi.title)}</span>
            <span class="small muted">${esc(q.label)}</span>
            <div class="dots" aria-label="ข้อ ${ui.q + 1} จาก ${mi.questions.length}">${dots}</div>
          </div>
          ${q.review && !graded(q) ? `<div class="review-flag">📝 <span>ข้อนี้อยู่ระหว่างรอคุณครูยืนยันเฉลย ระบบจะบันทึกคำตอบไว้ให้ครูตรวจ และ<b>ไม่หักหัวใจ</b></span></div>` : ''}
          ${activity(q)}
          ${ui.hint ? `<div class="hintbox ${ui.fx ? 'pop' : ''}"><img src="${BYTE('hint')}" alt=""><div><b>💡 คำใบ้</b><div>${ui.hint}</div></div></div>` : ''}
          ${ui.fb ? feedbackHTML() : ''}
          ${ui.checked ? solutionHTML(q) : ''}
          ${actionsHTML(q)}
        </section>
      </div>
    </main>`;
  }

  function feedbackHTML() {
    const f = ui.fb;
    const pose = { good: 'happy', review: 'happy', bad: 'oops', info: 'idle' }[f.kind];
    return `<div class="feedback ${f.kind} ${ui.fx ? 'pop' : ''}" role="status"><img src="${BYTE(pose)}" alt=""><div><b>${f.title}</b><div>${f.text || ''}</div>${f.earn ? `<div class="earn">${f.earn.map(x => `<span>${x}</span>`).join('')}</div>` : ''}</div></div>`;
  }

  // ---------- เฉลย (แสดงหลังทำข้อนั้นเสร็จ)
  function shortestPath(q) {
    const N = q.size, prev = {}, seen = new Set([q.start]), qu = [q.start];
    while (qu.length) {
      const c = qu.shift(); if (c === q.goal) break;
      DIRS.forEach((d, k) => {
        const x = c % N + d.dx, y = Math.floor(c / N) + d.dy, n = y * N + x;
        if (x >= 0 && y >= 0 && x < N && y < N && !q.walls.includes(n) && !seen.has(n)) { seen.add(n); prev[n] = [c, k]; qu.push(n); }
      });
    }
    const cmds = [], cells = [q.goal]; let c = q.goal;
    while (c !== q.start && prev[c]) { cmds.unshift(prev[c][1]); c = prev[c][0]; cells.unshift(c); }
    return { cmds, cells };
  }
  function solutionHTML(q) {
    const li = a => `<ul class="sol-list">${a.map(x => `<li>${x}</li>`).join('')}</ul>`;
    const ok = x => `✅ ${esc(x)}`, no = x => `✖️ ${esc(x)}`;
    let body = '';
    switch (q.type) {
      case 'single': body = li([ok(q.options[q.answer]) + (q.details ? ` <span class="muted">(${esc(q.details[q.answer])})</span>` : '')]); break;
      case 'multi': body = li(q.answers.map(i => ok(q.options[i]))); break;
      case 'group': body = `<div class="sol-groups">${q.groups.map((g, j) => `<div><b>${g.icon} ${esc(g.name)}</b>${li(q.items.filter(it => it[1] === j).map(it => esc(it[0])))}</div>`).join('')}</div>`; break;
      case 'match': body = li(q.left.map((l, i) => `${esc(l)} <b>→</b> ${esc(q.right[q.answers[i]])}`))
        + (q.alts ? q.alts.map(k => `<p class="small">คำตอบนี้ก็ถูกต้องเช่นกัน: ${q.left.map((l, i) => `${esc(l)} → ${esc(q.right[k[i]])}`).filter((_, i) => k[i] !== q.answers[i]).join(' · ')}</p>`).join('') : ''); break;
      case 'sequence': {
        let k = -1;
        body = `<div class="sol-strip">${q.line.map(t => { if (t !== '?') return `<span>${esc(t)}</span>`; k++; return `<span class="fill">${esc(q.slots[k].tokens[q.slots[k].answer])}</span>`; }).join(q.arrows ? ' → ' : ' ')}</div>`;
        break;
      }
      case 'dial': body = li(q.sets.map((st, i) => `${esc(st.title)}: ${st.seq.map(esc).join(' → ')} → <b class="fillb">${q.answers[i]}</b>`)); break;
      case 'colors': body = `<div class="sol-strip">${q.line.join(' ')} <b>→</b> ${q.answers.map(i => `<span class="fill">${q.palette[i].token}</span>`).join(' ')}</div>`; break;
      case 'laser': body = li(q.gates.map((g, i) => `ประตู ${g.name}: ${esc(g.rule)} → เดินผ่านเมื่อจังหวะเป็น${['เลขคี่ (1, 3, 5 …)', 'จังหวะที่หาร 3 ลงตัว (0, 3, 6 …)', 'เลขคู่ (0, 2, 4 …)'][i]}`)); break;
      case 'steps': body = li(q.steps.map(st => `<b>${esc(st.title)}</b> ${esc(st.prompt)}<br>${ok(st.options[st.answer])}`)); break;
      case 'sort': body = `<div class="sol-groups"><div><b>📁 ${esc(q.keepLabel)}</b>${li(q.keep.map(i => `${q.cards[i][0]} ${esc(q.cards[i][1])}`))}</div><div><b>🗑️ ${esc(q.dropLabel)}</b>${li(q.cards.map((c, i) => q.keep.includes(i) ? '' : `${c[0]} ${esc(c[1])}`).filter(Boolean))}</div></div>`; break;
      case 'budget': {
        const tot = q.countMode ? q.good.length : sum(q.good.map(i => q.cards[i][2]));
        body = li(q.good.map(i => ok(`${q.cards[i][1]}${q.countMode ? '' : ` (${q.cards[i][2]} ${q.unit})`}`))) + `<p>รวม <b>${tot} ${q.unit}</b> ไม่เกิน ${q.limit} ${q.unit}</p>`;
        break;
      }
      case 'erase': body = `<div class="sol-groups"><div><b>📌 เก็บไว้</b>${li(q.keep.map(i => ok(q.cards[i])))}</div><div><b>🧽 ลบออก</b>${li(q.cards.map((c, i) => q.keep.includes(i) ? '' : no(c)).filter(Boolean))}</div></div>`; break;
      case 'order': body = `<ol class="sol-list num">${q.correct.map(i => `<li>${q.icons[i]} ${esc(q.cards[i])}</li>`).join('')}</ol>`; break;
      case 'path': {
        const sp = shortestPath(q);
        body = `<p>เส้นทางที่สั้นที่สุด ${sp.cmds.length} คำสั่ง (ทางอื่นที่ไปถึงเป้าหมายโดยไม่ชนก็ถูกต้อง)</p><div class="sol-strip">${sp.cmds.map(k => `<span class="fill">${DIRS[k].a}</span>`).join(' ')}</div>`;
        break;
      }
      case 'vending': body = `<p><span class="kwi">ถ้า</span> เงินตั้งแต่ 10 บาทขึ้นไป <span class="kwi">แล้ว</span> จ่ายน้ำ 1 ขวด <span class="kwi else">มิฉะนั้น</span> แจ้งหยอดเงินเพิ่ม</p>`; break;
    }
    const pending = q.review && !graded(q);
    return `<div class="solution ${pending ? 'pending' : ''} ${ui.fx ? 'pop' : ''}">
      <b class="sol-h">${pending ? '📝 เฉลยที่เสนอ (รอคุณครูยืนยัน)' : '📘 เฉลย'}</b>
      ${body}
      ${pending ? `<p class="small">หมายเหตุ: ${esc(q.review.proposed)} — ข้อนี้รอคุณครูยืนยัน ระบบจึงไม่ตัดสินถูก/ผิด</p>` : ''}
    </div>`;
  }

  function actionsHTML(q) {
    const p = P();
    const execTypes = { order: 'execOrder', path: 'execPath' };
    const last = ui.q === MI().questions.length - 1;
    let main;
    if (q.type === 'steps' && ui.w.stepDone && !ui.checked) main = `<button class="btn go big" data-a="nextStep">ข้อย่อยถัดไป ➜</button>`;
    else if (ui.checked) main = `<button class="btn go big" data-a="next">${last ? 'จบภารกิจ 🏁' : 'ข้อต่อไป ➜'}</button>`;
    else if (execTypes[q.type]) main = `<button class="btn exec ${ui.busy ? 'busy' : ''}" data-a="${execTypes[q.type]}" ${ui.busy ? 'disabled' : ''}>${q.type === 'order' ? '▶ ทดลองทำงาน' : '▶ Execute'}</button>`;
    else if (q.type === 'laser') main = '';
    else main = `<button class="btn go big ${ui.busy ? 'busy' : ''}" data-a="check" ${ui.busy ? 'disabled' : ''}>ตรวจคำตอบ ✓</button>`;
    const hintOk = p.hints > 0 && !ui.checked && !ui.w.stepDone && ui.hintLevel < 2 && !ui.busy;
    return `<div class="actions">
      <button class="btn ghost sm" data-a="toStage">← ออกจากภารกิจ</button>
      <button class="btn sun sm" data-a="hint" ${hintOk ? '' : 'disabled'} title="ใช้คำใบ้ หัก 5 คะแนน">💡 คำใบ้ (−5)</button>
      <span class="spacer"></span>${main}
    </div>`;
  }

  // ---------- ACTIVITY RENDERERS
  function promptHTML(text, sub) {
    return text ? `<div class="prompt">${esc(text)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>` : '';
  }
  function optBtn(i, label, opts = {}) {
    const cls = ['opt', opts.multi ? 'multi' : '', opts.sel ? 'sel' : '', opts.right ? 'right' : '', opts.elim ? 'elim' : '', opts.route ? 'route' : ''].join(' ');
    const mk = opts.multi ? (opts.sel ? '✓' : '') : (opts.sel ? '●' : '');
    return `<button class="${cls}" data-a="${opts.act || 'opt'}" data-v="${i}" ${ui.checked || opts.elim || opts.lock || ui.busy ? 'disabled' : ''} aria-pressed="${!!opts.sel}">
      ${opts.route ? `<span style="display:flex;gap:10px;align-items:center;width:100%"><span class="mk">${mk}</span><b style="font-size:20px">${esc(label)}</b></span><span class="det" style="padding-left:46px">${esc(opts.det)}</span>`
      : `<span class="mk">${mk}</span>${opts.icon ? `<span class="ic">${opts.icon}</span>` : ''}<span>${esc(label)}</span>`}</button>`;
  }

  function activity(q) {
    const w = ui.w;
    switch (q.type) {
      case 'single': {
        let pre = '';
        if (q.log) pre = `<div class="log" aria-label="บันทึกเหตุการณ์">${q.log.map(([t, x]) => `<div><time>${esc(t)}</time><span>${esc(x)}</span></div>`).join('')}</div>`;
        if (q.facts) pre = `<div class="facts">${q.facts.map(([e, b, s]) => `<div class="fact"><div class="e">${e}</div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('')}</div>`;
        return pre + promptHTML(q.prompt) + `<div class="opts">${q.options.map((o, i) => optBtn(i, o, {
          sel: w.sel === i, elim: w.elim.includes(i), right: ui.checked && i === q.answer && graded(q), route: !!q.cards, det: q.details && q.details[i],
          icon: q.boxes ? ['📦', '📦', '📦'][i] : ''
        })).join('')}</div>`;
      }
      case 'multi': {
        const need = q.answers.length;
        return promptHTML(q.prompt) + `<div class="row"><span class="counter">เลือกแล้ว ${w.sel.length}/${need}</span></div>
          <div class="opts ${q.options.length >= 6 ? 'two' : ''}">${q.options.map((o, i) => optBtn(i, o, { act: 'multi', multi: true, sel: w.sel.includes(i), right: ui.checked && q.answers.includes(i), icon: q.icons && q.icons[i] })).join('')}</div>`;
      }
      case 'group': {
        const left = q.items.map((it, i) => w.place[i] === undefined ? `<button class="chip ${w.pick === i ? 'pick' : ''}" draggable="true" data-drag="${i}" data-a="chip" data-v="${i}" ${ui.checked ? 'disabled' : ''}>${esc(it[0])}</button>` : '').join('');
        const placed = Object.keys(w.place).length;
        return promptHTML(q.prompt, q.sub) + `<div class="row"><span class="counter">วางแล้ว ${placed}/${q.items.length} ใบ</span><span class="small muted">${w.pick !== null && w.pick !== undefined ? '👉 แตะกล่องกลุ่มที่ต้องการวางการ์ด' : 'แตะการ์ดเพื่อเลือก หรือลากไปวาง'}</span></div>
          <div class="tray" aria-label="การ์ดที่ยังไม่ได้จัดกลุ่ม">${left || '<span class="small muted">วางการ์ดครบแล้ว 👍</span>'}</div>
          <div class="zones">${q.groups.map((g, j) => `<div class="zone ${w.pick !== null && w.pick !== undefined ? 'ready' : ''}" data-zone="${j}" data-a="zone" data-v="${j}" role="button" tabindex="0" aria-label="${esc(g.name)}">
            <div class="zh"><span class="e">${g.icon}</span>${esc(g.name)}</div>
            ${q.items.map((it, i) => w.place[i] === j ? `<button class="chip" data-a="unplace" data-v="${i}" ${ui.checked ? 'disabled' : ''} aria-label="นำ ${esc(it[0])} ออก">${esc(it[0])} <span class="x">✕</span></button>` : '').join('')}
            <div class="zhint">${w.pick !== null && w.pick !== undefined ? 'แตะเพื่อวาง' : ''}</div></div>`).join('')}</div>`;
      }
      case 'match': {
        const used = Object.values(w.pairs);
        return promptHTML(q.prompt) + `<div class="row"><span class="counter">จับคู่แล้ว ${Object.keys(w.pairs).length}/${q.left.length}</span><button class="btn ghost sm" data-a="matchClear" ${ui.checked ? 'disabled' : ''}>ล้างการจับคู่</button></div>
          <div class="match" id="matchBox"><svg class="lines" id="matchLines" aria-hidden="true"></svg>
            <div class="col"><h4>${esc(q.leftTitle)}</h4>${q.left.map((t, i) => {
              const pi = w.pairs[i];
              return `<button class="opt ${w.pick === i ? 'sel' : ''}" data-l="${i}" data-a="mL" data-v="${i}" ${ui.checked ? 'disabled' : ''}><span>${esc(t)}</span>${pi !== undefined ? `<span class="pair" style="background:${PAIR_COLORS[i]}">${i + 1}</span>` : ''}</button>`;
            }).join('')}</div>
            <div class="col"><h4>${esc(q.rightTitle)}</h4>${q.right.map((t, j) => {
              const li = Object.keys(w.pairs).find(k => w.pairs[k] === j);
              return `<button class="opt" data-r="${j}" data-a="mR" data-v="${j}" ${ui.checked ? 'disabled' : ''}><span>${esc(t)}</span>${li !== undefined ? `<span class="pair" style="background:${PAIR_COLORS[li]}">${Number(li) + 1}</span>` : ''}</button>`;
            }).join('')}</div>
          </div>${used.length ? '' : ''}`;
      }
      case 'sequence': {
        let k = -1;
        const strip = q.line.map((t, i) => {
          if (t !== '?') return `<span class="tok">${esc(t)}${q.numbered ? `<small>${i + 1}</small>` : ''}</span>`;
          k++;
          const f = w.fill[k], slot = q.slots[k];
          return `<button class="tok slot ${w.active === k && !ui.checked ? 'active' : ''} ${f !== null ? 'filled' : ''}" data-a="slot" data-v="${k}" ${ui.checked ? 'disabled' : ''} aria-label="ช่องว่าง ${slot.title || k + 1}">${f !== null ? esc(slot.tokens[f]) : '?'}${q.numbered ? `<small>${i + 1}</small>` : ''}</button>`;
        }).join(q.arrows ? '<span class="arrow">→</span>' : '');
        const slot = q.slots[w.active] || q.slots[0];
        return promptHTML(q.prompt) + `<div class="strip">${strip}</div>
          ${ui.checked ? '' : `<div class="slot-picker"><h4>${q.slots.length > 1 ? `เลือกคำตอบสำหรับ <u>${esc(slot.title)}</u>` : 'เลือกคำตอบ'}</h4>
          <div class="opts ${slot.options.length > 3 ? 'two' : ''}">${slot.options.map((o, i) => optBtn(i, o, { act: 'tok', sel: w.fill[w.active] === i })).join('')}</div></div>`}`;
      }
      case 'dial': {
        return promptHTML(q.prompt) + `<div class="seqs">${q.sets.map((s, i) => `<div class="s"><span>🗝️ ${esc(s.title)}</span><span class="n">${s.seq.map(esc).join(' → ')} → ?</span></div>`).join('')}</div>
          <div class="dials">${q.sets.map((s, i) => `<div class="dial"><span class="small">หลักที่ ${i + 1}</span>
            <button class="btn sky sm" data-a="spin" data-v="${i},1" ${ui.checked ? 'disabled' : ''} aria-label="เพิ่มหลักที่ ${i + 1}">▲</button>
            <div class="win" aria-live="polite">${w.digits[i] === null ? '?' : w.digits[i]}</div>
            <button class="btn sky sm" data-a="spin" data-v="${i},-1" ${ui.checked ? 'disabled' : ''} aria-label="ลดหลักที่ ${i + 1}">▼</button></div>`).join('')}</div>`;
      }
      case 'colors': {
        const cls = ['r', 'b', 'y'];
        return promptHTML(q.prompt) + `<div class="strip">${q.line.map(t => `<span class="tok">${t}</span>`).join('')}<span class="arrow">→</span>
          ${Array.from({ length: q.count }, (_, i) => `<span class="tok ${w.seq[i] !== undefined ? 'slot filled' : 'slot'}">${w.seq[i] !== undefined ? q.palette[w.seq[i]].token : '?'}</span>`).join('')}</div>
          <div class="palette">${q.palette.map((p, i) => `<button class="colorbtn ${cls[i]}" data-a="color" data-v="${i}" ${ui.checked || w.seq.length >= q.count ? 'disabled' : ''}>${p.name}</button>`).join('')}</div>
          <div class="row" style="justify-content:center"><span class="counter">ป้อนแล้ว ${w.seq.length}/${q.count} สี</span>
          <button class="btn ghost sm" data-a="colorUndo" ${ui.checked || !w.seq.length ? 'disabled' : ''}>↩ ลบสีล่าสุด</button>
          <button class="btn ghost sm" data-a="colorClear" ${ui.checked || !w.seq.length ? 'disabled' : ''}>เริ่มรหัสใหม่</button></div>`;
      }
      case 'laser': {
        const offNow = laserOff(w.gate, w.beat);
        return promptHTML(q.prompt) + `<div class="corridor" aria-label="ทางเดินเลเซอร์">
            <div class="end">${w.gate === 0 ? AVA_EMOJI() : '🚩'}</div>
            ${q.gates.map((g, i) => {
              const passed = i < w.gate, cur = i === w.gate, off = laserOff(i, cur ? w.beat : 0);
              const state = passed ? 'passed off' : cur ? (off ? 'off' : 'on') : 'on';
              return `<div class="gate ${state} ${cur ? 'cur' : ''}"><b>ประตู ${g.name}</b><div class="beam"></div>
                <div class="who">${i === w.gate - 1 && w.gate < q.gates.length ? AVA_EMOJI() : ''}</div>
                <span class="st">${passed ? '✅ ผ่านแล้ว' : cur ? (off ? '🟢 ปิด ปลอดภัย' : '🔴 เปิด อันตราย') : '⏳ รอ'}</span>
                <span class="small" style="opacity:.8">${esc(g.rule)}</span></div>`;
            }).join('')}
            <div class="end">${w.gate >= 3 ? AVA_EMOJI() : '🚪'}</div>
          </div>
          <div class="beatbar">จังหวะ: ${Array.from({ length: 6 }, (_, i) => `<i class="${i === w.beat ? 'now' : ''}">${i}</i>`).join('')} ${w.beat > 5 ? `<i class="now">${w.beat}</i>` : ''}</div>
          ${ui.checked ? '' : `<div class="row" style="justify-content:center">
            <button class="btn sky" data-a="beat" ${ui.busy ? 'disabled' : ''}>⏩ รอจังหวะถัดไป</button>
            <button class="btn go" data-a="cross" ${ui.busy ? 'disabled' : ''}>🚶 เดินผ่านประตู ${q.gates[w.gate] ? q.gates[w.gate].name : ''}</button></div>`}
          <p class="small muted center">${offNow ? 'ตอนนี้เลเซอร์ประตูข้างหน้าปิดอยู่' : 'ตอนนี้เลเซอร์ประตูข้างหน้ายังเปิดอยู่'}</p>`;
      }
      case 'steps': {
        const s = q.steps[w.step];
        const head = q.skin === 'news' ? `<div class="news"><span class="live">LIVE</span>📺 ห้องข่าวสรุปสาระ</div>`
          : q.skin === 'ifthen' ? `<div class="ifcard"><span class="kw">ถ้า</span>${esc(s.cond)}<span class="kw">แล้ว</span>❔</div>` : '';
        const phase = q.phase ? `ช่วงที่ ${w.step + 1}/${q.steps.length}${w.step === 0 ? ' — ' + q.phase : ''}` : '';
        const solved = ui.checked || w.stepDone;
        return `<div class="stepper">${q.steps.map((x, i) => `<span class="${i < w.step || ui.checked || (w.stepDone && i === w.step) ? 'ok' : i === w.step ? 'on' : ''}">${esc(x.title)}</span>`).join('')}</div>
          ${phase ? `<div class="small muted"><b>${esc(phase)}</b></div>` : ''}
          ${head}${promptHTML(s.prompt)}
          <div class="opts">${s.options.map((o, i) => optBtn(i, o, { sel: w.sel === i, elim: w.elim.includes(i), right: solved && i === s.answer, lock: solved })).join('')}</div>`;
      }
      case 'sort': {
        const n = Object.keys(w.dec).length, a = w.active;
        const cardHTML = (c, i) => `<button class="sortcard ${a === i && !ui.checked ? 'active' : ''} ${w.dec[i] || ''}" data-a="sortFocus" data-v="${i}" ${ui.checked ? 'disabled' : ''}>
            <span class="e">${c[0]}</span><span>${esc(c[1])}</span><span class="st">${w.dec[i] === 'keep' ? '📁 ' + esc(q.keepLabel) : w.dec[i] === 'drop' ? '🗑️ ' + esc(q.dropLabel) : '&nbsp;'}</span></button>`;
        const kept = q.cards.filter((_, i) => w.dec[i] === 'keep'), dropped = q.cards.filter((_, i) => w.dec[i] === 'drop');
        return promptHTML(q.prompt) + `<div class="row"><span class="counter">ตรวจแล้ว ${n}/${q.cards.length}</span></div>
          ${q.skin === 'belt' ? `<div class="belt">${q.cards.map(cardHTML).join('')}</div>` : `<div class="sortgrid">${q.cards.map(cardHTML).join('')}</div>`}
          ${ui.checked ? '' : `<div class="focus-card"><span class="e">${q.cards[a][0]}</span><b>${esc(q.cards[a][1])}</b><span class="small muted">ข้อมูลนี้จำเป็นต่อภารกิจหรือไม่?</span></div>
          <div class="decide"><button class="btn go" data-a="sortSet" data-v="keep">📁 ${esc(q.keepLabel)}</button><button class="btn ghost" data-a="sortSet" data-v="drop">🗑️ ${esc(q.dropLabel)}</button></div>`}
          <div class="bins"><div class="bin"><h4>📁 ${esc(q.keepLabel)} (${kept.length})</h4><div class="mini">${kept.map(c => `<span>${c[0]} ${esc(c[1])}</span>`).join('')}</div></div>
          <div class="bin"><h4>🗑️ ${esc(q.dropLabel)} (${dropped.length})</h4><div class="mini">${dropped.map(c => `<span>${c[0]} ${esc(c[1])}</span>`).join('')}</div></div></div>`;
      }
      case 'budget': {
        const used = q.countMode ? w.sel.length : sum(w.sel.map(i => q.cards[i][2]));
        const over = used > q.limit;
        return promptHTML(q.prompt) + `<div class="meter ${over ? 'over' : ''}"><div class="row"><span>${q.meter}</span><span class="spacer"></span><b>${used}/${q.limit} ${q.unit}</b></div>
            <div class="bar"><span style="width:${Math.min(100, used / q.limit * 100)}%"></span></div>${over ? `<span class="small" style="color:#c2410c;font-weight:700">⚠️ เกิน ${q.limit} ${q.unit} แล้ว</span>` : ''}</div>
          <div class="opts two">${q.cards.map((c, i) => `<button class="opt multi ${w.sel.includes(i) ? 'sel' : ''}" data-a="budget" data-v="${i}" ${ui.checked ? 'disabled' : ''} aria-pressed="${w.sel.includes(i)}">
            <span class="mk">${w.sel.includes(i) ? '✓' : ''}</span><span class="ic">${c[0]}</span><span>${esc(c[1])}</span>${q.countMode ? '' : `<span class="cost">${c[2]} ${q.unit}</span>`}</button>`).join('')}</div>`;
      }
      case 'erase': {
        return promptHTML(q.prompt) + `<div class="row"><span class="counter">🧽 ลบแล้ว ${w.erased.length} ข้อความ</span></div>
          <div class="notes">${q.cards.map((c, i) => `<button class="note ${w.erased.includes(i) ? 'erased' : ''}" data-a="erase" data-v="${i}" ${ui.checked ? 'disabled' : ''} aria-pressed="${w.erased.includes(i)}">
            <span class="e">${w.erased.includes(i) ? '🧽' : '📌'}</span>${esc(c)}</button>`).join('')}</div>
          <p class="small muted">แตะข้อความอีกครั้งเพื่อนำกลับมา</p>`;
      }
      case 'order': {
        const res = w.result;
        return promptHTML(q.prompt) + `<div class="stage-run"><span class="actor ${w.run >= 0 ? 'go' : ''}" id="worker">${AVA_EMOJI()}</span>
            <span class="msg">${w.run >= 0 ? `ขั้นที่ ${w.run + 1}: ${esc(q.cards[w.seq[w.run]])} ${q.icons[w.seq[w.run]]}` : res ? (res.ok ? 'ทำงานครบทุกขั้นตอน! ' + q.worker : `ทำงานไม่สำเร็จที่ขั้นที่ ${res.bad + 1}`) : 'เรียงการ์ดให้ครบ แล้วกด ▶ ทดลองทำงาน'}</span></div>
          <div class="build">
            <div class="box"><h4>🃏 การ์ดขั้นตอน</h4>${q.cards.map((c, i) => w.seq.includes(i) ? '' : `<button class="opt" data-a="ordAdd" data-v="${i}" ${ui.checked || ui.busy ? 'disabled' : ''}><span class="mk">＋</span><span class="ic">${q.icons[i]}</span><span>${esc(c)}</span></button>`).join('') || '<span class="small muted">ใช้การ์ดครบแล้ว</span>'}</div>
            <div class="box prog"><h4>📋 ลำดับขั้นตอน (${w.seq.length}/${q.cards.length})</h4>
              ${w.seq.map((ci, j) => `<div class="stepcard ${w.run === j ? 'run' : ''} ${res && j < res.bad ? 'okk' : ''} ${res && !res.ok && j === res.bad ? 'bad' : ''} ${res && res.ok ? 'okk' : ''}">
                <span class="n">${j + 1}</span><span>${q.icons[ci]} ${esc(q.cards[ci])}</span>
                ${ui.checked || ui.busy ? '' : `<span class="ctrl"><button data-a="ordUp" data-v="${j}" aria-label="เลื่อนขึ้น" ${j === 0 ? 'disabled' : ''}>▲</button><button data-a="ordDown" data-v="${j}" aria-label="เลื่อนลง" ${j === w.seq.length - 1 ? 'disabled' : ''}>▼</button><button data-a="ordDel" data-v="${j}" aria-label="นำออก">✕</button></span>`}</div>`).join('') || '<span class="small muted">แตะการ์ดด้านซ้ายเพื่อเริ่มเรียงลำดับ</span>'}
            </div>
          </div>`;
      }
      case 'path': {
        const N = q.size, solCells = ui.checked ? shortestPath(q).cells : [];
        const cells = Array.from({ length: N * N }, (_, i) => {
          const wall = q.walls.includes(i), here = w.pos === i, goal = i === q.goal;
          return `<div class="cell ${wall ? 'wall' : ''} ${solCells.includes(i) ? 'sol' : ''} ${w.trail.includes(i) && !here ? 'trail' : ''} ${w.crash === i ? 'crash' : ''}" aria-label="ช่อง ${Math.floor(i / N) + 1},${i % N + 1}${wall ? ' สิ่งกีดขวาง' : ''}${goal ? ' เป้าหมาย' : ''}">
            ${here ? `<span class="actor">${q.actor}</span>` : wall ? q.block : goal ? q.target : w.crash === i ? '💥' : ''}</div>`;
        }).join('');
        return promptHTML(q.prompt) + `<div class="pathwrap">
          <div><div class="grid5" role="img" aria-label="แผนที่ ${N} คูณ ${N}">${cells}</div><p class="legend">${esc(q.legend)}</p></div>
          <div style="display:grid;gap:12px;align-content:start">
            <b>🎮 แผงคำสั่ง</b>
            <div class="pad">${DIRS.map((d, i) => `<button class="btn sky ${d.k}" data-a="cmd" data-v="${i}" ${ui.checked || ui.busy ? 'disabled' : ''} aria-label="${d.t}">${d.a}</button>`).join('')}</div>
            <div><span class="small"><b>ชุดคำสั่ง (${w.cmds.length} ขั้น)</b></span>
              <div class="queue" aria-live="polite">${w.cmds.map((c, i) => `<span class="q ${w.run === i ? 'now' : ''}">${DIRS[c].a}</span>`).join('') || '<span class="small muted">ยังไม่มีคำสั่ง</span>'}</div></div>
            <div class="row"><button class="btn ghost sm" data-a="cmdUndo" ${ui.checked || ui.busy || !w.cmds.length ? 'disabled' : ''}>↩ ลบล่าสุด</button>
              <button class="btn ghost sm" data-a="cmdClear" ${ui.checked || ui.busy || !w.cmds.length ? 'disabled' : ''}>🗑️ ล้างคำสั่ง</button></div>
          </div></div>`;
      }
      case 'vending': {
        const chip = (act, list, cur) => `<div class="choicechips">${list.map((x, i) => `<button class="${cur === i ? 'sel' : ''}" data-a="${act}" data-v="${i}" ${ui.checked || ui.busy ? 'disabled' : ''} aria-pressed="${cur === i}">${esc(x)}</button>`).join('')}</div>`;
        return promptHTML(q.prompt) + `<div class="vend">
          <div class="machine" aria-label="เครื่องขายน้ำ">
            <b class="center">🥤 น้ำดื่ม ${q.price} บาท</b>
            <div class="glass"><span>🥤</span><span>🥤</span><span>🥤</span><span>🥤</span><span>🥤</span><span>🥤</span></div>
            <div class="screen" aria-live="polite">${w.out ? esc(w.out) : `ยอดเงิน ${w.coins} บาท`}</div>
            <div class="tray">${w.outKind === 'drink' ? '🥤' : ''}</div>
          </div>
          <div style="display:grid;gap:12px">
            <div class="rulebuilder"><b>🧩 สร้างกฎของเครื่อง</b>
              <div class="ln"><span class="kw">ถ้า</span>${chip('vcond', q.conds, w.cond)}</div>
              <div class="ln"><span class="kw">แล้ว</span>${chip('vthen', q.actions, w.then)}</div>
              <div class="ln"><span class="kw else">มิฉะนั้น</span>${chip('velse', q.actions, w.els)}</div>
            </div>
            <div class="rulebuilder"><b>🪙 ทดลองหยอดเงิน</b>
              <div class="coins"><button class="coin" data-a="coin" data-v="5" ${ui.checked || ui.busy ? 'disabled' : ''}>5฿</button><button class="coin" data-a="coin" data-v="10" ${ui.checked || ui.busy ? 'disabled' : ''}>10฿</button>
                <span class="pill">ยอด ${w.coins} บาท</span><button class="btn ghost sm" data-a="coinReset" ${ui.checked || ui.busy ? 'disabled' : ''}>คืนเหรียญ</button></div>
              <div class="row"><button class="btn exec ${ui.busy ? 'busy' : ''}" data-a="execVend" ${ui.checked || ui.busy ? 'disabled' : ''}>▶ Execute ทดสอบกฎ</button><span class="small muted">ทดสอบแล้ว ${w.tests} ครั้ง</span></div>
            </div>
          </div></div>`;
      }
    }
    return '';
  }
  const AVA_EMOJI = () => D ? ['👧', '👦', '🤖'][D.avatar ?? 0] : '🙂';
  const laserOff = (g, beat) => g === 0 ? beat % 2 === 1 : g === 1 ? beat % 3 === 0 : beat % 2 === 0;

  // ---------- result screens
  function scrMissionDone() {
    setBg('sky');
    const mi = MI(), p = P(), s = missionStars(ui.s, ui.m), max = mi.questions.length * 3;
    const mp = missionPts(ui.s, ui.m), pts = `${mp.got}/${mp.max}`;
    const lastMission = ui.m === ST().missions.length - 1;
    const filled = Math.round((s / max) * 3);
    return hud() + `<main class="screen theme-${THEMES[ui.s]}">
      <section class="card result">
        <img src="${BYTE('cheer')}" alt="ไบต์ฉลอง" style="width:180px">
        <h1>ภารกิจ ${mi.id} สำเร็จ! 🎉</h1>
        <div class="big-stars" aria-label="ระดับดาว ${filled} จาก 3">${[0, 1, 2].map(i => `<span class="${i < filled ? '' : 'dim'}">⭐</span>`).join('')}</div>
        <div class="statgrid">
          <div class="stat"><div class="e">🏅</div><b>${pts}</b><span>คะแนนจากภารกิจนี้</span></div>
          <div class="stat"><div class="e">⭐</div><b>${s}/${max}</b><span>ดาวความเร็ว</span></div>
          <div class="stat"><div class="e">⏱️</div><b>${fmt(p.times[ui.m])}</b><span>เวลาที่ใช้</span></div>
          <div class="stat"><div class="e">❤️</div><b>${p.hearts}</b><span>หัวใจคงเหลือ</span></div>
        </div>
        <div class="row" style="justify-content:center">
          <button class="btn ghost" data-a="toStage">เลือกภารกิจ</button>
          ${lastMission ? `<button class="btn go big" data-a="stageResult">ดูผลด่าน 🏆</button>`
            : `<button class="btn go big" data-a="openMission" data-v="${ui.m + 1}">ภารกิจถัดไป ➜</button>`}
        </div>
      </section></main>`;
  }

  function scrStageResult() {
    setBg('world');
    const st = ST(), p = P(), passed = stagePassed(ui.s);
    return hud() + `<main class="screen theme-${THEMES[ui.s]}">
      <section class="card result">
        <img src="${BYTE(passed ? 'cheer' : 'oops')}" alt="" style="width:180px">
        <h1>${passed ? (ui.s === 3 ? 'ยินดีด้วย! พิชิต Logic Land สำเร็จ 🏆' : `เยี่ยมมาก! ผ่านด่านที่ ${st.id} แล้ว`) : 'ทำครบทุกภารกิจแล้ว!'}</h1>
        <p class="muted">${st.icon} ${st.title}</p>
        <div class="statgrid">
          <div class="stat"><div class="e">🏅</div><b>${p.score}/100</b><span>คะแนนด่าน</span></div>
          <div class="stat"><div class="e">⭐</div><b>${p.stars}</b><span>ดาวสะสม</span></div>
          <div class="stat"><div class="e">⏱️</div><b>${fmt(sum(p.times))}</b><span>เวลารวม</span></div>
          <div class="stat"><div class="e">💡</div><b>${p.hintsUsed}</b><span>ใช้คำใบ้</span></div>
        </div>
        ${missionTable(ui.s)}
        <p style="font-weight:700;color:${passed ? 'var(--leaf-d)' : '#c2410c'}">${passed ? (ui.s < 3 ? `✓ ผ่านเกณฑ์ ${RULES.passScore} คะแนน ปลดล็อกด่านที่ ${st.id + 1} แล้ว!` : '✓ ผ่านครบทั้ง 4 ด่าน!')
          : `ยังไม่ถึง ${RULES.passScore} คะแนน ลองเริ่มด่านนี้ใหม่เพื่อทำคะแนนให้ดีขึ้นนะ`}</p>
        <div class="row" style="justify-content:center">
          <button class="btn ghost" data-a="toMap">แผนที่โลก</button>
          ${passed && ui.s < 3 ? `<button class="btn go big" data-a="openStage" data-v="${ui.s + 1}">ไปด่านที่ ${st.id + 1} ➜</button>` : ''}
          ${passed && ui.s === 3 ? `<button class="btn sun big" data-a="summary">🏆 ดูสรุปผลทั้งหมด</button>` : ''}
          ${!passed ? `<button class="btn orange" data-a="askReset">🔄 เริ่มด่านนี้ใหม่</button>` : ''}
        </div>
      </section></main>`;
  }

  function scrGameOver() {
    setBg('sky');
    return hud() + `<main class="screen theme-${THEMES[ui.s]}">
      <section class="card result">
        <img src="${BYTE('oops')}" alt="" style="width:170px">
        <h1>หัวใจหมดแล้ว 💔</h1>
        <p>ไม่เป็นไรนะ! อ่านสถานการณ์ให้ดี แล้วลองใหม่อีกครั้ง เธอทำได้แน่นอน 💪</p>
        <p class="small muted">เริ่มภารกิจใหม่: หัก ${RULES.retryScoreCost} คะแนน และ ${RULES.retryStarCost} ดาว · ได้หัวใจคืน ${RULES.hearts} ดวง</p>
        <div class="row" style="justify-content:center">
          <button class="btn ghost" data-a="toStage">เลือกภารกิจ</button>
          <button class="btn go big" data-a="retry">🔄 เริ่มภารกิจ ${MI().id} ใหม่</button>
        </div>
      </section></main>`;
  }

  function answerText(q, w) {
    switch (q.type) {
      case 'sequence': return w.fill.map((f, i) => (q.slots[i].title ? q.slots[i].title + ': ' : '') + (f === null ? '-' : q.slots[i].tokens[f])).join(', ');
      case 'dial': return w.digits.join(', ');
      case 'colors': return w.seq.map(i => q.palette[i].token).join(' ');
      case 'sort': return 'เก็บ: ' + q.cards.filter((_, i) => w.dec[i] === 'keep').map(c => c[1]).join(', ');
      case 'laser': return `ผ่านครบ 3 ประตู (โดนเลเซอร์ ${w.hits} ครั้ง)`;
      default: return '';
    }
  }

  function scrSummary() {
    setBg('world');
    const rows = STAGES.map((st, i) => {
      const p = P(i), total = st.missions.reduce((a, m) => a + m.questions.length, 0);
      return { st, p, total, doneQ: Object.keys(p.done).length, passed: stagePassed(i) };
    });
    const reviews = [];
    STAGES.forEach((st, i) => st.missions.forEach(mi => mi.questions.forEach(q => {
      if (q.review && !graded(q) && P(i).done[q.uid]) reviews.push({ id: mi.id, label: q.label, ans: P(i).done[q.uid].answer || '-' });
    })));
    return `<main class="screen">
      <section class="card panel" style="display:grid;gap:16px">
        <div class="row">${guide('cheer', `สรุปการผจญภัยของ <b>${esc(D.name)}</b> (รหัส ${esc(D.code)})`, 'sm')}</div>
        <div class="statgrid">
          <div class="stat"><div class="e">🏅</div><b>${sum(rows.map(r => r.p.score))}/400</b><span>คะแนนรวม</span></div>
          <div class="stat"><div class="e">⭐</div><b>${totalStars()}</b><span>ดาวรวม</span></div>
          <div class="stat"><div class="e">🗺️</div><b>${rows.filter(r => r.passed).length}/4</b><span>ด่านที่ผ่าน</span></div>
          <div class="stat"><div class="e">⏱️</div><b>${fmt(sum(rows.map(r => sum(r.p.times))))}</b><span>เวลารวม</span></div>
        </div>
        <div style="overflow-x:auto"><table class="table"><thead><tr><th>ด่าน</th><th>คะแนน</th><th>ข้อที่ทำได้</th><th>ดาว</th><th>เวลา</th><th>คำใบ้</th><th>เริ่มใหม่</th><th>สถานะ</th></tr></thead><tbody>
          ${rows.map((r, i) => `<tr><td>${i + 1}. ${r.st.title}</td><td><b>${r.p.score}</b>/100</td><td>${r.doneQ}/${r.total}</td><td>⭐ ${r.p.stars}</td><td>${fmt(sum(r.p.times))}</td><td>${r.p.hintsUsed}</td><td>${r.p.restarts}</td>
            <td>${r.passed ? '<span class="ok-badge">✓ ผ่าน</span>' : '<span class="no-badge">ยังไม่ผ่าน</span>'}</td></tr>`).join('')}
        </tbody></table></div>
        ${rows.map((r, i) => `<details class="card" style="padding:12px 16px;box-shadow:none"><summary><b>${r.st.icon} คะแนนรายภารกิจ ด่านที่ ${i + 1} ${esc(r.st.title)}</b> <span class="small muted">(${r.p.score}/100)</span></summary><div style="margin-top:10px">${missionTable(i)}</div></details>`).join('')}
        <details class="card" style="padding:12px 16px;box-shadow:none"><summary><b>📝 สำหรับคุณครู: คำตอบในข้อที่รอยืนยันเฉลย (${reviews.length})</b></summary>
          ${reviews.length ? `<table class="table" style="margin-top:10px"><thead><tr><th>ภารกิจ</th><th>ข้อ</th><th>คำตอบของนักเรียน</th></tr></thead><tbody>${reviews.map(r => `<tr><td>${r.id}</td><td>${esc(r.label)}</td><td>${esc(r.ans)}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted" style="margin-top:8px">ยังไม่มีคำตอบที่ต้องตรวจ</p>'}
        </details>
        <div class="row"><button class="btn ghost" data-a="toMap">← กลับแผนที่โลก</button><span class="spacer"></span></div>
      </section></main>`;
  }

  function modalHTML() {
    const m = ui.modal; if (!m) return '';
    if (m.kind === 'timeout') return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="card">
      <img src="${BYTE('oops')}" alt=""><h2 id="mt">⌛ หมดเวลา 3 นาที</h2><p>เสียหัวใจ 1 ดวง และข้อนี้จะไม่ได้ดาวความเร็ว<br>แต่ยังลองทำข้อเดิมต่อได้นะ สู้ ๆ!</p>
      <button class="btn go big" data-a="modalOk">ตกลง</button></div></div>`;
    if (m.kind === 'leave') return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="ml"><div class="card">
      <img src="${BYTE('think')}" alt=""><h2 id="ml">ออกจากข้อนี้หรือยัง?</h2><p>สิ่งที่ทำไว้ในข้อนี้จะหายไป<br>ส่วนข้อที่ทำผ่านแล้วถูกบันทึกไว้เรียบร้อย</p>
      <div class="row"><button class="btn go" data-a="modalClose">ทำต่อ</button><button class="btn ghost" data-a="${m.to}">ออกเลย</button></div></div></div>`;
    if (m.kind === 'reset') return `<div class="modal" role="dialog" aria-modal="true"><div class="card">
      <img src="${BYTE('think')}" alt=""><h2>เริ่มด่านที่ ${ui.s + 1} ใหม่?</h2><p>คะแนน ดาว และภารกิจของด่านนี้จะเริ่มนับใหม่ทั้งหมด</p>
      <div class="row"><button class="btn ghost" data-a="modalClose">ยกเลิก</button><button class="btn orange" data-a="resetStage">เริ่มใหม่</button></div></div></div>`;
    return '';
  }

  // ------------------------------------------------------------------ RENDER
  function render() {
    let html = '';
    switch (ui.screen) {
      case 'start': html = scrStart(); break;
      case 'login': html = scrLogin(); break;
      case 'avatar': html = scrAvatar(); break;
      case 'rules': html = scrRules(); break;
      case 'map': html = scrMap(); break;
      case 'stage': html = scrStage(); break;
      case 'intro': html = scrIntro(); break;
      case 'play': html = scrPlay(); break;
      case 'missionDone': html = scrMissionDone(); break;
      case 'stageResult': html = scrStageResult(); break;
      case 'gameover': html = scrGameOver(); break;
      case 'summary': html = scrSummary(); break;
    }
    const key = [ui.screen, ui.s, ui.m, ui.q].join(':');
    const enter = key !== ui.lastKey; ui.lastKey = key;
    $app.innerHTML = html + modalHTML();
    if (enter) $app.querySelector('main.screen')?.classList.add('enter');
    if (ui.tap && !enter) {
      const t = [...$app.querySelectorAll(`[data-a="${ui.tap.a}"]`)].find(el => (el.dataset.v ?? '') === ui.tap.v);
      t && t.classList.add('just');
    }
    ui.tap = null; ui.fx = false; ui.lostHeart = false;
    document.body.classList.toggle('reduce-motion', !!settings.calm);
    if (ui.screen === 'play') requestAnimationFrame(drawMatchLines);
    if (ui.screen === 'login') { const f = document.getElementById('loginForm'); f && f.addEventListener('submit', e => { e.preventDefault(); act.login(); }); document.getElementById(ui.prefName ? 'code' : 'name')?.focus(); }
    const mb = $app.querySelector('.modal .btn'); if (mb) mb.focus();
  }

  function drawMatchLines() {
    const box = document.getElementById('matchBox'), svg = document.getElementById('matchLines');
    if (!box || !svg || !ui.w || !ui.w.pairs) return;
    const r = box.getBoundingClientRect();
    let out = '';
    Object.entries(ui.w.pairs).forEach(([l, rr]) => {
      const a = box.querySelector(`[data-l="${l}"]`), b = box.querySelector(`[data-r="${rr}"]`);
      if (!a || !b) return;
      const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
      const x1 = A.right - r.left, y1 = A.top + A.height / 2 - r.top, x2 = B.left - r.left, y2 = B.top + B.height / 2 - r.top;
      const c = PAIR_COLORS[l];
      out += `<path d="M${x1} ${y1} C ${x1 + 30} ${y1}, ${x2 - 30} ${y2}, ${x2} ${y2}" stroke="#1d2b53" stroke-width="9" fill="none" stroke-linecap="round"/>
              <path d="M${x1} ${y1} C ${x1 + 30} ${y1}, ${x2 - 30} ${y2}, ${x2} ${y2}" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    });
    svg.innerHTML = out;
  }
  window.addEventListener('resize', () => requestAnimationFrame(drawMatchLines));

  // ------------------------------------------------------------------ GAME FLOW
  function loseHeart() {
    const p = P();
    p.hearts = Math.max(0, p.hearts - 1);
    ui.lostHeart = true;
    audio.wrong();
  }
  function gameOverIfNeeded() {
    if (P().hearts <= 0) {
      save();
      ui.busy = true; const tok = ui.runTok;
      setTimeout(() => { if (alive(tok)) go('gameover'); }, 900);
      return true;
    }
    return false;
  }
  function wrong(msg) {
    loseHeart();
    ui.byte = 'oops';
    ui.fx = true;
    ui.fb = { kind: 'bad', title: 'ยังไม่ถูกนะ ลองอีกครั้ง! 💪', text: msg || 'ลองอ่านโจทย์อีกครั้ง หรือกด 💡 คำใบ้' };
    save(); render();
    gameOverIfNeeded();
  }
  function incomplete(msg) {
    ui.fb = { kind: 'info', title: 'ยังทำไม่ครบนะ', text: msg }; ui.fx = true;
    audio.click(); render();
  }
  function complete(isReview) {
    const q = Q(), p = P();
    ui.checked = true; ui.byte = 'happy'; ui.hint = null;
    const secs = Math.min(ui.qsec, RULES.timeLimit), st = ui.timedOut ? 0 : starsFor(secs);
    const first = !p.done[q.uid];
    const ans = isReview ? answerText(q, ui.w) : undefined;
    if (first) {
      p.done[q.uid] = { stars: st, secs, at: Date.now(), review: !!isReview, answer: ans };
      p.score = Math.min(100, p.score + q.points);
      p.stars += st;
    } else if (isReview) { p.done[q.uid].answer = ans; }
    const earn = first ? [`🏅 +${q.points} คะแนน`, st ? `${'⭐'.repeat(st)} ดาวความเร็ว` : 'หมดเวลาไปแล้ว จึงไม่ได้ดาว', `⏱️ ${fmt(secs)}`] : ['ข้อนี้เคยทำแล้ว จึงไม่ได้คะแนนเพิ่ม'];
    ui.fb = isReview
      ? { kind: 'review', title: 'บันทึกคำตอบแล้ว 📝', text: 'ข้อนี้รอคุณครูยืนยันเฉลย คำตอบของเธอถูกบันทึกไว้ให้ครูตรวจแล้ว', earn }
      : { kind: 'good', title: ['เก่งมาก! ถูกต้อง 🎉', 'สุดยอด! ✨', 'เยี่ยมไปเลย! 🌟'][Math.floor(Math.random() * 3)], text: q.why || 'วิเคราะห์ได้ตรงกับเป้าหมาย', earn };
    music.duck(1400); audio.correct(); if (first) setTimeout(() => audio.coin(), 350);
    ui.fx = true; save(); render();
  }

  function evaluate() {
    const q = Q(), w = ui.w;
    switch (q.type) {
      case 'single':
        if (w.sel === null) return ['inc', 'แตะเลือกคำตอบ 1 ข้อก่อนนะ'];
        return [w.sel === q.answer ? 'ok' : 'bad'];
      case 'multi':
        if (w.sel.length !== q.answers.length) return ['inc', `ต้องเลือกให้ครบ ${q.answers.length} รายการ (ตอนนี้เลือก ${w.sel.length} รายการ)`];
        return [q.answers.every(x => w.sel.includes(x)) ? 'ok' : 'bad', 'ยังมีบางรายการที่ไม่เกี่ยวข้อง ลองพิจารณาอีกครั้ง'];
      case 'group': {
        if (Object.keys(w.place).length < q.items.length) return ['inc', `ยังมีการ์ดที่ยังไม่ได้วาง ${q.items.length - Object.keys(w.place).length} ใบ`];
        const bad = q.items.filter((it, i) => w.place[i] !== it[1]).length;
        return [bad ? 'bad' : 'ok', `ยังมีการ์ด ${bad} ใบที่อยู่ผิดกลุ่ม ลองย้ายดูนะ`];
      }
      case 'match': {
        if (Object.keys(w.pairs).length < q.left.length) return ['inc', `จับคู่ให้ครบ ${q.left.length} คู่ก่อนนะ`];
        const keys = [q.answers, ...(q.alts || [])];
        const bad = Math.min(...keys.map(k => k.filter((a, i) => w.pairs[i] !== a).length));
        return [bad ? 'bad' : 'ok', `ยังมี ${bad} คู่ที่ไม่สัมพันธ์กัน ลองจับคู่ใหม่`];
      }
      case 'sequence':
        if (w.fill.some(f => f === null)) return ['inc', 'เติมช่อง ? ให้ครบทุกช่องก่อนนะ'];
        return [q.slots.every((s, i) => w.fill[i] === s.answer) ? 'ok' : 'bad', 'ลองหาส่วนที่ซ้ำกัน หรือดูผลต่างของตัวเลขอีกครั้ง'];
      case 'dial':
        if (w.digits.some(d => d === null)) return ['inc', 'หมุนกุญแจให้ครบทั้ง 3 หลักก่อนนะ'];
        return [q.answers.every((a, i) => w.digits[i] === a) ? 'ok' : 'bad', 'กุญแจยังไม่เปิด ลองตรวจกฎของแต่ละชุดอีกครั้ง'];
      case 'colors':
        if (w.seq.length < q.count) return ['inc', `กดสีให้ครบ ${q.count} สีก่อนนะ`];
        return [q.answers.every((a, i) => w.seq[i] === a) ? 'ok' : 'bad', 'ประตูยังไม่เปิด ลองดูชุดสีที่วนซ้ำ'];
      case 'steps': {
        const s = q.steps[w.step];
        if (w.sel === null) return ['inc', 'แตะเลือกคำตอบ 1 ข้อก่อนนะ'];
        return [w.sel === s.answer ? 'ok' : 'bad'];
      }
      case 'sort':
        if (Object.keys(w.dec).length < q.cards.length) return ['inc', `ตัดสินให้ครบทั้ง ${q.cards.length} รายการก่อนส่งแฟ้มนะ`];
        return [q.cards.every((_, i) => w.dec[i] === (q.keep.includes(i) ? 'keep' : 'drop')) ? 'ok' : 'bad', 'ยังมีข้อมูลบางรายการอยู่ผิดที่'];
      case 'budget': {
        if (!w.sel.length) return ['inc', 'เลือกอย่างน้อย 1 รายการก่อนนะ'];
        const used = q.countMode ? w.sel.length : sum(w.sel.map(i => q.cards[i][2]));
        if (used > q.limit) return ['bad', `เกินข้อจำกัด ${q.limit} ${q.unit} แล้ว ลองตัดสิ่งที่ไม่จำเป็นออก`];
        return [w.sel.length === q.good.length && q.good.every(x => w.sel.includes(x)) ? 'ok' : 'bad', 'ลองคิดว่าอะไรจำเป็นจริง ๆ ต่อเป้าหมาย'];
      }
      case 'erase': {
        if (!w.erased.length) return ['inc', 'แตะข้อความที่ไม่เกี่ยวข้องเพื่อลบก่อนนะ'];
        const ok = q.cards.every((_, i) => q.keep.includes(i) !== w.erased.includes(i));
        return [ok ? 'ok' : 'bad', 'ยังลบไม่ถูกต้องทั้งหมด ข้อมูลที่ช่วยแก้ปัญหาต้องเก็บไว้'];
      }
      case 'vending': {
        if (w.cond === null || w.then === null || w.els === null) return ['inc', 'เลือกเงื่อนไข “ถ้า” “แล้ว” และ “มิฉะนั้น” ให้ครบก่อนนะ'];
        if (!w.tests) return ['inc', 'ลองหยอดเหรียญแล้วกด ▶ Execute ทดสอบกฎอย่างน้อย 1 ครั้งก่อนนะ'];
        const ok = (w.cond === 0 && w.then === 0 && w.els === 1) || (w.cond === 1 && w.then === 1 && w.els === 0);
        return [ok ? 'ok' : 'bad', 'กฎยังทำงานไม่ถูกต้อง ลองทดสอบด้วยเงิน 5 บาทและ 10 บาทดูนะ'];
      }
    }
    return ['inc', ''];
  }

  // ------------------------------------------------------------------ ACTIONS
  const act = {
    music() {
      settings.music = !settings.music; save();
      if (settings.music) { music.unlock(); music.play(); } else music.stop();
      toast(settings.music ? '🎵 เปิดเพลงพื้นหลังแล้ว' : '🎵 ปิดเพลงพื้นหลังแล้ว');
      render();
    },
    calm() {
      settings.calm = !settings.calm; save();
      toast(settings.calm ? '🌀 ลดการเคลื่อนไหวแล้ว' : '🌀 เปิดการเคลื่อนไหวตามปกติ');
      render();
    },
    mute() { settings.muted = !settings.muted; audio.setMuted(settings.muted); save(); if (!settings.muted) audio.click(); render(); },
    toStart() { ui.err = ''; go('start'); },
    newPlayer() { ui.prefName = ''; ui.err = ''; audio.click(); go('login'); },
    continue() {
      D = loadLast(); if (!D) return go('login');
      audio.click();
      if (D.avatar === null || D.avatar === undefined) return go('avatar');
      if (D.resume && stageUnlocked(D.resume.s)) { ui.s = D.resume.s; return go('stage'); }
      go('map');
    },
    howto() { audio.click(); go('rules'); },
    login() {
      const n = (document.getElementById('name').value || '').trim(), c = (document.getElementById('code').value || '').trim();
      if (!n || !c) { ui.err = 'กรุณากรอกชื่อและรหัสนักเรียนให้ครบนะ'; ui.prefName = n; audio.wrong(); return render(); }
      const id = idOf(n, c);
      const ex = lsGet(STORE + '.p.' + id);
      D = ex && ex.v === 2 ? normalize(ex) : freshData(n, c);
      settings.last = id; ui.err = '';
      save(); audio.correct();
      go(D.avatar === null || D.avatar === undefined ? 'avatar' : 'map');
    },
    avatar(v) { D.avatar = Number(v); save(); audio.select(); go(D.rulesSeen ? 'map' : 'rules'); },
    rulesOk() { D.rulesSeen = true; save(); audio.click(); go('map'); },
    logout() { D = null; go('start'); },
    toMap() { if (!D) return go('start'); if (leaveGuard('toMapNow')) return; go('map'); },
    toMapNow() { go('map'); },
    toStageNow() { go('stage'); },
    summary() { audio.click(); go('summary'); },
    print() { window.print(); },
    openStage(v) { const i = Number(v); if (!stageUnlocked(i)) return; ui.s = i; audio.select(); go('stage'); },
    toStage() { if (leaveGuard('toStageNow')) return; go('stage'); },
    openMission(v) {
      const j = Number(v); if (!missionUnlocked(ui.s, j)) return;
      ui.m = j; audio.select(); go('intro');
    },
    beginMission() {
      if (P().hearts <= 0) return go('gameover');
      ui.q = firstOpenQ();
      loadQ(); audio.select(); go('play');
    },
    stageResult() { go('stageResult'); if (stagePassed(ui.s)) { audio.victory(); confetti(90); } },
    askReset() { ui.modal = { kind: 'reset' }; render(); },
    modalClose() { ui.modal = null; render(); },
    resetStage() { D.stages[ui.s] = freshStage(); D.stages[ui.s].restarts = 0; save(); ui.modal = null; toast('เริ่มด่านใหม่แล้ว'); go('stage'); },
    modalOk() {
      ui.modal = null; ui.qsec = 0; ui.fb = null;
      if (P().hearts <= 0) return go('gameover');
      render();
    },
    retry() {
      const p = P();
      p.score = Math.max(0, p.score - RULES.retryScoreCost);
      p.stars = Math.max(0, p.stars - RULES.retryStarCost);
      p.hearts = RULES.hearts; p.restarts++;
      ui.q = firstOpenQ(); loadQ(); save();
      toast(`💔 เริ่มภารกิจใหม่: หัก ${RULES.retryScoreCost} คะแนน และ ${RULES.retryStarCost} ดาว`);
      go('play');
    },
    hint() {
      const p = P(), q = Q();
      if (p.hints <= 0 || ui.checked || ui.w.stepDone || ui.hintLevel >= 2 || ui.busy) return;
      p.hints--; p.hintsUsed++; p.score = Math.max(0, p.score - RULES.hintCost);
      ui.hintLevel++;
      ui.hint = hintText(q, ui.hintLevel);
      ui.byte = 'hint'; ui.fx = true; audio.hint(); save(); render();
    },
    check() {
      if (ui.busy || ui.checked || (ui.w && ui.w.stepDone)) return;
      const q = Q();
      const [res, msg] = evaluate();
      if (res === 'inc') return incomplete(msg);
      ui.busy = true; const tok = ui.runTok;
      setTimeout(() => {
        if (!alive(tok)) return;
        ui.busy = false;
        if (!graded(q)) {
          if (q.type === 'steps') return stepAdvance(q);
          return complete(true);
        }
        if (res === 'ok') {
          if (q.type === 'steps') return stepAdvance(q);
          return complete(false);
        }
        wrong(msg);
      }, 250);
    },
    next() {
      const mi = MI();
      if (ui.q < mi.questions.length - 1) { ui.q++; loadQ(); audio.select(); return go('play'); }
      P().missions[ui.m] = true; D.resume = { s: ui.s, m: ui.m, q: 0 }; save();
      music.duck(2200); audio.victory(); confetti(80);
      go('missionDone');
    },

    nextStep() {
      const q = Q(), w = ui.w;
      if (q.type !== 'steps' || !w.stepDone || ui.checked) return;
      w.step++; w.sel = null; w.elim = []; w.stepDone = false;
      ui.fb = null; ui.hint = null; ui.hintLevel = 0; ui.byte = 'think';
      audio.select(); render();
    },
    // single / steps
    opt(v) {
      const q = Q(), w = ui.w; if (ui.checked || w.stepDone) return;
      w.sel = Number(v); ui.fb = null; audio.select(); render();
    },
    multi(v) {
      const i = Number(v), w = ui.w; if (ui.checked) return;
      w.sel = w.sel.includes(i) ? w.sel.filter(x => x !== i) : [...w.sel, i];
      ui.fb = null; audio.select(); render();
    },
    // group
    chip(v) { const w = ui.w; const i = Number(v); w.pick = w.pick === i ? null : i; audio.click(); render(); },
    zone(v) {
      const w = ui.w; if (ui.checked || w.pick === null || w.pick === undefined) return;
      w.place[w.pick] = Number(v); w.pick = null; ui.fb = null; audio.select(); render();
    },
    unplace(v, el, e) { e.stopPropagation(); if (ui.checked) return; delete ui.w.place[Number(v)]; audio.click(); render(); },
    // match
    mL(v) { const w = ui.w; const i = Number(v); w.pick = w.pick === i ? null : i; audio.click(); render(); },
    mR(v) {
      const w = ui.w, j = Number(v); if (ui.checked) return;
      if (w.pick === null || w.pick === undefined) { toast('แตะการ์ดฝั่งซ้ายก่อนนะ 👈'); return; }
      Object.keys(w.pairs).forEach(k => { if (w.pairs[k] === j) delete w.pairs[k]; });
      w.pairs[w.pick] = j; w.pick = null; ui.fb = null; audio.select(); render();
    },
    matchClear() { ui.w.pairs = {}; ui.w.pick = null; render(); },
    // sequence
    slot(v) { ui.w.active = Number(v); audio.click(); render(); },
    tok(v) {
      const w = ui.w, q = Q(); if (ui.checked) return;
      w.fill[w.active] = Number(v);
      const nextEmpty = w.fill.findIndex(f => f === null);
      if (nextEmpty >= 0) w.active = nextEmpty;
      ui.fb = null; audio.select(); render();
    },
    // dial
    spin(v) {
      const [i, d] = v.split(',').map(Number), w = ui.w; if (ui.checked) return;
      const cur = w.digits[i] === null ? (d > 0 ? -1 : 10) : w.digits[i];
      w.digits[i] = (cur + d + 10) % 10; ui.fb = null; audio.dial(); render();
    },
    // colors
    color(v) { const w = ui.w, q = Q(); if (ui.checked || w.seq.length >= q.count) return; w.seq.push(Number(v)); ui.fb = null; audio.select(); render(); },
    colorUndo() { ui.w.seq.pop(); audio.click(); render(); },
    colorClear() { ui.w.seq = []; audio.click(); render(); },
    // laser
    beat() { if (ui.checked || ui.busy) return; ui.w.beat++; ui.fb = null; audio.laserTick(); render(); },
    cross() {
      const w = ui.w, q = Q(); if (ui.checked || ui.busy) return;
      if (laserOff(w.gate, w.beat)) {
        w.gate++; w.beat = 0; audio.laserPass();
        if (w.gate >= q.gates.length) return complete(!graded(q));
        ui.fb = { kind: 'info', title: `ผ่านประตู ${q.gates[w.gate - 1].name} แล้ว! ✅`, text: `ต่อไปประตู ${q.gates[w.gate].name}: ${q.gates[w.gate].rule}` };
        return render();
      }
      w.hits++; audio.laserZap();
      if (!graded(q)) { ui.byte = 'oops'; ui.fb = { kind: 'info', title: 'โดนเลเซอร์! ⚡', text: 'รอให้เลเซอร์ประตูข้างหน้าปิดก่อน แล้วค่อยเดินผ่านนะ (ข้อนี้รอครูยืนยัน จึงไม่หักหัวใจ)' }; return render(); }
      wrong('รอให้เลเซอร์ประตูข้างหน้าปิดก่อน แล้วค่อยเดินผ่าน');
    },
    // sort
    sortFocus(v) { ui.w.active = Number(v); audio.click(); render(); },
    sortSet(v) {
      const w = ui.w, q = Q(); if (ui.checked) return;
      w.dec[w.active] = v;
      const nx = q.cards.findIndex((_, i) => !w.dec[i]);
      if (nx >= 0) w.active = nx;
      ui.fb = null; audio.select(); render();
    },
    // budget
    budget(v) {
      const w = ui.w, q = Q(), i = Number(v); if (ui.checked) return;
      if (w.sel.includes(i)) w.sel = w.sel.filter(x => x !== i);
      else {
        if (q.countMode && w.sel.length >= q.limit) { toast(`กระเป๋าใส่ได้เพียง ${q.limit} ชิ้น 🎒`); return; }
        w.sel.push(i);
      }
      ui.fb = null; audio.select(); render();
    },
    // erase
    erase(v) { const w = ui.w, i = Number(v); if (ui.checked) return; w.erased = w.erased.includes(i) ? w.erased.filter(x => x !== i) : [...w.erased, i]; ui.fb = null; audio.click(); render(); },
    // order + execute
    ordAdd(v) { const w = ui.w; if (ui.checked || ui.busy) return; w.seq.push(Number(v)); w.result = null; ui.fb = null; audio.click(); render(); },
    ordDel(v) { const w = ui.w; w.seq.splice(Number(v), 1); w.result = null; audio.click(); render(); },
    ordUp(v) { const w = ui.w, j = Number(v); if (j > 0) [w.seq[j - 1], w.seq[j]] = [w.seq[j], w.seq[j - 1]]; w.result = null; audio.click(); render(); },
    ordDown(v) { const w = ui.w, j = Number(v); if (j < w.seq.length - 1) [w.seq[j + 1], w.seq[j]] = [w.seq[j], w.seq[j + 1]]; w.result = null; audio.click(); render(); },
    execOrder() {
      const w = ui.w, q = Q(); if (ui.busy || ui.checked) return;
      if (w.seq.length < q.cards.length) return incomplete(`เรียงการ์ดให้ครบ ${q.cards.length} ขั้นตอนก่อนกดทดลองทำงานนะ`);
      ui.busy = true; ui.fb = null; w.result = null; let k = 0; const tok = ui.runTok;
      const stepRun = () => {
        if (!alive(tok)) return;
        if (k >= w.seq.length) {
          w.run = -1; ui.busy = false;
          const bad = w.seq.findIndex((c, i) => c !== q.correct[i]);
          w.result = { ok: bad < 0, bad: bad < 0 ? w.seq.length : bad };
          if (bad < 0) return complete(false);
          return wrong(`ตัวละครทำงานได้ถึงขั้นที่ ${bad} แล้วลำดับเริ่มไม่ถูกต้องที่ขั้นที่ ${bad + 1} ลองจัดลำดับใหม่นะ`);
        }
        w.run = k; audio.step(); render(); k++;
        setTimeout(stepRun, 750);
      };
      render(); stepRun();
    },
    // path + execute
    cmd(v) { const w = ui.w, q = Q(); if (ui.checked || ui.busy) return; w.cmds.push(Number(v)); w.pos = q.start; w.trail = []; w.crash = null; ui.fb = null; audio.click(); render(); },
    cmdUndo() { const w = ui.w, q = Q(); w.cmds.pop(); w.pos = q.start; w.trail = []; w.crash = null; ui.fb = null; audio.click(); render(); },
    cmdClear() { const w = ui.w, q = Q(); w.cmds = []; w.pos = q.start; w.trail = []; w.crash = null; ui.fb = null; audio.click(); render(); },
    execPath() {
      const w = ui.w, q = Q(); if (ui.busy || ui.checked) return;
      if (!w.cmds.length) return incomplete('กดลูกศรเพื่อวางคำสั่งอย่างน้อย 1 คำสั่งก่อนนะ');
      ui.busy = true; ui.fb = null; w.pos = q.start; w.trail = [q.start]; w.crash = null; let k = 0;
      const N = q.size, tok = ui.runTok;
      const stepRun = () => {
        if (!alive(tok)) return;
        if (k >= w.cmds.length) {
          w.run = -1; ui.busy = false;
          if (w.pos === q.goal) return complete(false);
          return wrong(`หุ่นยนต์ทำคำสั่งครบ ${w.cmds.length} ขั้นแล้ว แต่ยังไม่ถึง ${q.target} เพิ่มหรือแก้คำสั่งแล้วลองใหม่`);
        }
        const d = DIRS[w.cmds[k]], x = w.pos % N + d.dx, y = Math.floor(w.pos / N) + d.dy, nxt = y * N + x;
        w.run = k;
        if (x < 0 || y < 0 || x >= N || y >= N || q.walls.includes(nxt)) {
          w.crash = (x < 0 || y < 0 || x >= N || y >= N) ? null : nxt; w.run = -1; ui.busy = false; ui.byte = 'oops';
          audio.laserZap();
          ui.fb = { kind: 'info', title: x < 0 || y < 0 || x >= N || y >= N ? 'ออกนอกแผนที่! 🚧' : 'ชนสิ่งกีดขวาง! 💥', text: `คำสั่งที่ ${k + 1} (${d.a} ${d.t}) ทำให้เดินต่อไม่ได้ ลองลบหรือแก้คำสั่งแล้วกด ▶ Execute ใหม่` };
          return render();
        }
        w.pos = nxt; w.trail.push(nxt); audio.step(); render(); k++;
        setTimeout(stepRun, 420);
      };
      render(); setTimeout(stepRun, 250);
    },
    // vending
    vcond(v) { ui.w.cond = Number(v); ui.fb = null; audio.click(); render(); },
    vthen(v) { ui.w.then = Number(v); ui.fb = null; audio.click(); render(); },
    velse(v) { ui.w.els = Number(v); ui.fb = null; audio.click(); render(); },
    coin(v) { const w = ui.w; w.coins += Number(v); w.out = null; w.outKind = ''; audio.coin(); render(); },
    coinReset() { const w = ui.w; w.coins = 0; w.out = 'คืนเหรียญแล้ว'; w.outKind = ''; audio.click(); render(); },
    execVend() {
      const w = ui.w, q = Q(); if (ui.busy || ui.checked) return;
      if (w.cond === null || w.then === null || w.els === null) return incomplete('สร้างกฎให้ครบทั้ง “ถ้า” “แล้ว” และ “มิฉะนั้น” ก่อนกด Execute นะ');
      ui.busy = true; w.out = '⚙️ กำลังตรวจเงิน...'; w.outKind = ''; render(); const tok = ui.runTok;
      setTimeout(() => {
        if (!alive(tok)) return;
        const condTrue = w.cond === 0 ? w.coins >= q.price : w.coins < q.price;
        const action = condTrue ? w.then : w.els;
        w.tests++;
        if (action === 0) { w.out = `จ่ายน้ำ 1 ขวด 🥤 (รับเงิน ${w.coins} บาท)`; w.outKind = 'drink'; w.coins = 0; audio.coin(); }
        else { w.out = `เงินยังไม่ครบ — ต้องหยอดเพิ่ม (ยอด ${w.coins} บาท)`; w.outKind = 'more'; audio.click(); }
        ui.busy = false; render();
      }, 700);
    }
  };

  // ถามก่อนออกจากข้อที่กำลังทำ (กันเด็กกดพลาดแล้วงานหาย)
  function leaveGuard(to) {
    if (ui.screen !== 'play' || ui.checked || ui.modal) return false;
    const w = ui.w || {};
    const started = Object.values(w).some(v => (Array.isArray(v) && v.some(x => x !== null && x !== undefined)) || (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) || (typeof v === 'number' && v > 0 && v !== Q().start) );
    if (!started && !ui.busy) return false;
    ui.modal = { kind: 'leave', to }; render(); return true;
  }

  function firstOpenQ() {
    const i = MI().questions.findIndex(q => !P().done[q.uid]);
    return i < 0 ? 0 : i;
  }

  function stepAdvance(q) {
    const w = ui.w;
    const step = q.steps[w.step];
    if (w.step < q.steps.length - 1) {
      // ค้างที่ข้อย่อยที่เพิ่งตอบ เพื่อให้เฉลยแสดงคู่กับคำถามของข้อนั้นเอง แล้วให้ผู้เล่นกด "ข้อย่อยถัดไป"
      w.stepDone = true; ui.hint = null; ui.byte = 'happy';
      ui.fb = { kind: 'good', title: 'ถูกต้อง! 🎉', text: `📘 เฉลย${esc(step.title)}: <b>${esc(step.options[step.answer])}</b>${step.why ? '<br>' + esc(step.why) : ''}` };
      ui.fx = true;
      audio.correct(); save(); render(); return;
    }
    complete(false);
  }

  function hintText(q, level) {
    const s = ui.s;
    const tips = {
      0: { def: 'มองหาสิ่งที่ทำให้กิจกรรมดำเนินต่อไม่ได้ และแยกสิ่งที่เกี่ยวข้องออกจากสิ่งที่ไม่เกี่ยวข้อง', group: 'ลองพิจารณาว่าการ์ดแต่ละใบมีหน้าที่ตรงกับชื่อกลุ่มหรือไม่', match: 'ลองพิจารณาว่าวิธีแก้ไขแต่ละวิธีตรงกับสาเหตุของปัญหาใด' },
      1: { def: 'ลองมองหาชุดที่ซ้ำกัน หรือผลต่างที่เพิ่ม/ลดอย่างสม่ำเสมอ', match: 'พิจารณาความสัมพันธ์ระหว่างสิ่งสองสิ่งก่อนจับคู่', laser: 'รอจนสัญญาณของประตูเป็นสีเขียว (เลเซอร์ปิด)', colors: 'สังเกตชุดสีที่วนซ้ำ', dial: 'ตรวจสอบผลต่างระหว่างตัวเลขติดกัน', single: 'หาสิ่งที่เหมือนกันในทุกเหตุการณ์ หรือดูว่าลดลงครั้งละเท่าไร' },
      2: { def: 'พิจารณาว่าข้อมูลใดจำเป็นต่อเป้าหมาย', erase: 'เลือกเพื่อลบข้อมูลที่ไม่ช่วยแก้ปัญหา', budget: 'เลือกเฉพาะของหรือกิจกรรมจำเป็นภายในข้อจำกัด', single: q.boxes ? 'รวมน้ำหนักก่อนเลือกกล่องที่พอดี' : 'รวมนักเรียนและครูก่อน แล้วเทียบกับความจุรถ' },
      3: { def: 'พิจารณาปัญหา เป้าหมาย และผลของแต่ละวิธี', order: 'เริ่มจากการเตรียมอุปกรณ์หรือวัตถุดิบ แล้วทำตามลำดับก่อน–หลัง', path: 'มองตำแหน่งสิ่งกีดขวาง แล้ววางคำสั่งทีละช่อง', vending: 'ตรวจยอดเงินก่อนจ่ายน้ำ', single: 'พิจารณาทั้งเวลา ความปลอดภัย และงบประมาณ', steps: q.skin === 'ifthen' ? 'เลือกการกระทำที่เหมาะกับเงื่อนไข' : 'พิจารณาปัญหา เป้าหมาย และผลของแต่ละวิธี' }
    }[s];
    const concept = ['คิดจากปัญหาหลัก → แยกปัญหาย่อย → เลือกวิธีแก้ไขที่ตรงกับสาเหตุ', 'หาส่วนที่ซ้ำ หรือดูว่าเพิ่ม/ลดครั้งละเท่าไร แล้วลองต่อแบบรูปในใจ', 'ถามตัวเองว่า “ข้อมูลนี้ช่วยให้ทำภารกิจสำเร็จไหม?”', 'ทำทีละขั้น ตรวจผลแต่ละขั้น แล้วแก้ไขจุดที่ผิด'][s];
    if (level === 1) return tips[q.type] || tips.def;
    // level 2: eliminate one wrong option (graded single/steps) — otherwise concept
    if (graded(q) && (q.type === 'single' || q.type === 'steps')) {
      const w = ui.w;
      const opts = q.type === 'single' ? q.options : q.steps[w.step].options;
      const ans = q.type === 'single' ? q.answer : q.steps[w.step].answer;
      const cand = opts.map((_, i) => i).filter(i => i !== ans && !w.elim.includes(i) && i !== w.sel);
      const pick = cand[0] ?? opts.map((_, i) => i).find(i => i !== ans && !w.elim.includes(i));
      if (pick !== undefined) { w.elim.push(pick); if (w.sel === pick) w.sel = null; return `ตัดตัวเลือก “${esc(opts[pick])}” ออกแล้ว เพราะไม่ใช่คำตอบที่ถูกต้อง`; }
    }
    return concept;
  }

  // ------------------------------------------------------------------ EVENTS
  $app.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled || !$app.contains(el)) return;
    const fn = act[el.dataset.a];
    if (fn) { e.preventDefault(); ui.tap = { a: el.dataset.a, v: el.dataset.v ?? '' }; fn(el.dataset.v, el, e); }
  });
  $app.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.zone[data-a]')) { e.preventDefault(); act.zone(e.target.dataset.v); }
    if (e.key === 'Escape' && ui.modal && (ui.modal.kind === 'reset' || ui.modal.kind === 'leave')) act.modalClose();
  });
  // drag & drop for group cards
  $app.addEventListener('dragstart', e => {
    const c = e.target.closest('[data-drag]'); if (!c) return;
    e.dataTransfer.setData('text/plain', c.dataset.drag); c.classList.add('dragging');
  });
  $app.addEventListener('dragover', e => { const z = e.target.closest('[data-zone]'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  $app.addEventListener('dragleave', e => { const z = e.target.closest('[data-zone]'); if (z) z.classList.remove('over'); });
  $app.addEventListener('drop', e => {
    const z = e.target.closest('[data-zone]'); if (!z || ui.checked) return;
    e.preventDefault();
    const i = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isNaN(i)) return;
    ui.w.place[i] = Number(z.dataset.zone); ui.w.pick = null; ui.fb = null; audio.select(); render();
  });

  // ------------------------------------------------------------------ TICK (timer)
  setInterval(() => {
    if (ui.screen !== 'play' || ui.modal || document.hidden || !D) return;
    P().times[ui.m]++;
    if (ui.checked || (ui.w && ui.w.stepDone)) return;
    ui.qsec++;
    const left = Math.max(0, RULES.timeLimit - ui.qsec);
    const t = document.getElementById('timer');
    if (t) {
      t.className = `pill timer ${left <= 20 ? 'danger' : left <= 60 ? 'warn' : ''}`;
      t.querySelector('b').textContent = fmt(left);
      t.querySelector('.ring').style.setProperty('--p', (left / RULES.timeLimit) * 100);
    }
    if (ui.qsec % 10 === 0) save();
    if (left <= 0 && !ui.busy) {
      loseHeart(); ui.timedOut = true; save();
      ui.fb = null;
      if (P().hearts <= 0) { ui.modal = null; return go('gameover'); }
      ui.modal = { kind: 'timeout' }; render();
    }
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); music.pauseNow(); } else music.play(); });
  window.addEventListener('beforeunload', save);

  // debug/testing hook (read-only snapshot + navigation helpers)
  window.LogicLand = { music: () => music.status(), state: () => ({ ui: JSON.parse(JSON.stringify({ ...ui })), data: D && JSON.parse(JSON.stringify(D)) }), act };

  render();
})();
