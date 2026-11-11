// App controller: screens, the typing flow, results, reviews, the daily structure and the body map.

import { Session } from './engine.js';
import { addDays, dayKey, dayStart, describeDue, firstInterval, isDue, nextInterval, DAY_MS } from './srs.js';
import { REGIONS, LEVELS, ITEMS, MESH_INFO, regionById, regionOfLevel, regionOfItem, itemsOfRegion, levelById, allItems, altName, levelOfMesh } from './content.js';
import { loadState, saveState, levelState, STORAGE_KEY } from './store.js';
import { Keyboard } from './keyboard.js';
import { Sound } from './audio.js';
import { POSE_LABEL, loadPack } from './viewer.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (x) => `${Math.round(x * 100)}%`;
const fmtTime = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const hashString = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const ROUND_NAME = { 1: 'copy', 2: 'first letter', 3: 'from memory' };
const ROUND_INTRO = {
  2: { title: 'Round 2 · first letter', text: 'Just the first letter and the blanks now. Type the whole name.' },
  3: { title: 'Round 3 · from memory', text: 'No letters, no clues. Name each one from any angle.' },
};
const FACES = ['serif', 'sans', 'mono'];
const INSET_TINT = [0xebe4d5, 1];

export class App {
  constructor({ viewer, webgl = true }) {
    this.viewer = viewer;
    this.webgl = webgl;
    this.state = loadState();
    this.sound = new Sound(this.state.settings.sound);
    this.kbd = new Keyboard($('#kbd'), (k) => this.press(k));
    this.screen = null;
    this.session = null;
    this.run = null;
    this.timers = {};
    this.packs = new Map();
    this.nav = 0;
    this.mapSelected = null;
    this.applySettings();
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      this.action(el.dataset.action, el.dataset);
      // Drop focus after mouse/touch clicks only (detail > 0); keyboard users keep their place.
      if (el.tagName === 'BUTTON' && e.detail > 0) el.blur();
      this.focusSink();
    });
    window.addEventListener('resize', () => { if (this.screen === 'lesson') this.fitWord(); });

    // Another tab saved progress: adopt it so this tab never writes an older snapshot back over it.
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY) return;
      this.state = loadState();
      this.applySettings();
      if (this.screen === 'home') this.showHome();
    });

    // Text that arrives without a usable keydown (IME composition, dictation, some virtual keyboards).
    const sink = $('#sink');
    const flush = (paste = false) => {
      const text = sink.value;
      sink.value = '';
      if (paste || this.screen !== 'lesson') return;
      for (const ch of text) this.press(ch);
    };
    sink.addEventListener('input', (e) => { if (!e.isComposing) flush(e.inputType === 'insertFromPaste'); });
    sink.addEventListener('compositionend', () => setTimeout(() => flush(), 0));
    $('#screen-lesson').addEventListener('pointerup', (e) => {
      if (!e.target.closest('button, a')) this.focusSink();
    });
    window.addEventListener('focus', () => this.focusSink());
  }

  get region() {
    return regionById(this.state.settings.region);
  }

  focusSink() {
    if (this.screen !== 'lesson') return;
    const sink = $('#sink');
    if (document.activeElement !== sink) sink.focus({ preventScroll: true });
  }

  async start() {
    if (!this.state.firstVisit) {
      this.state.firstVisit = Date.now();
      this.save();
      await this.startLevel('L1', 'lesson');
      this.toast('Type the name of the bone shown in red. Esc opens the index.', 6500);
    } else {
      await this.showHome();
    }
  }

  save() {
    this.storageOk = saveState(this.state);
    if (!this.storageOk) this.toastOnce('storage', 'Progress can’t be saved in this browser window.');
  }

  /** Make sure the viewer holds this region's models (fetched once, then cached). */
  async ensureRegion(id) {
    if (this.viewer.packId === id) return true;
    if (!this.webgl) { this.viewer.setPack({ header: { region: id } }); return true; }
    if (!this.packs.has(id)) this.packs.set(id, loadPack(id));
    try {
      const pack = await this.packs.get(id);
      this.viewer.setPack(pack, regionById(id).ink);
      return true;
    } catch (err) {
      console.error(err);
      this.packs.delete(id);
      this.toast('The 3D models didn’t load. Check your connection and try again.', 6000);
      return false;
    }
  }

  setRegion(id) {
    if (this.state.settings.region === id) return;
    this.state.settings.region = id;
    this.save();
    this.applySettings();
  }

  // ---------------------------------------------------------------- settings

  applySettings() {
    const { face, lang, sound } = this.state.settings;
    document.documentElement.dataset.face = face;
    const tf = $('#t-font'), tl = $('#t-lang'), ts = $('#t-sound');
    tf.title = `Typeface: ${face}`;
    tl.textContent = lang === 'en' ? 'English' : 'Français';
    tl.title = lang === 'en' ? 'Answers in English (switch to French)' : 'Réponses en français (switch to English)';
    ts.textContent = sound ? 'Sound on' : 'Sound off';
    ts.setAttribute('aria-pressed', String(sound));
    this.sound.enabled = sound;
    const r = this.region;
    $('#crumb').textContent = `Plate ${r.plate} · ${r.title}`;
  }

  action(name, data) {
    const S = this.state.settings;
    switch (name) {
      case 'home': this.showHome(); break;
      case 'font': S.face = FACES[(FACES.indexOf(S.face) + 1) % FACES.length]; this.applySettings(); this.save(); if (this.screen === 'lesson') this.fitWord(); break;
      case 'lang': {
        S.lang = S.lang === 'en' ? 'fr' : 'en';
        this.applySettings();
        this.save();
        if (this.session && this.screen === 'lesson') this.relang();
        else if (this.screen === 'map') this.showMap();
        this.toast(S.lang === 'fr' ? 'Answers in French now. Accents are optional.' : 'Answers in English now.');
        break;
      }
      case 'sound': S.sound = !S.sound; this.applySettings(); this.save(); if (S.sound) this.sound.key(); break;
      case 'region': this.setRegion(data.region); if (this.screen === 'map') this.showMap(); else this.showHome(); break;
      case 'level': this.openLevel(data.level); break;
      case 'play': this.startLevel(data.level, data.mode || 'lesson'); break;
      case 'continue': this.press('Enter'); break;
      case 'primary': this.primaryAction(); break;
      case 'daily': this.startDaily(); break;
      case 'map': this.showMap(); break;
      case 'map-pose': this.viewer.setPose('map', data.pose, { duration: 900 }); break;
      case 'map-bone': this.selectMapBone(data.key); break;
      default: break;
    }
  }

  /** Answer language changed mid-session: redraw whatever is on screen in the new language. */
  relang() {
    const s = this.session;
    s.setLang(this.state.settings.lang);
    const daily = s.mode === 'daily';
    if (s.phase === 'prompt') this.renderPrompt();
    else if (s.phase === 'reveal') daily ? this.renderDailyReveal(false) : this.renderReveal(s.verdict);
    else if (s.phase === 'correct') daily ? this.renderDailyReveal(true) : this.renderWord();
    // 'intro' shows no answer, so there is nothing to redraw.
  }

  // ---------------------------------------------------------------- screens

  show(name) {
    for (const s of ['lesson', 'results', 'home', 'map']) $(`#screen-${s}`).hidden = s !== name;
    this.screen = name;
    document.body.dataset.screen = name;
    $('#toasts').replaceChildren(); // toasts belong to the screen that raised them
    $(`#screen-${name}`).scrollTop = 0; // each screen scrolls on its own; always open at the top
    this.viewer.clearViews();
    this.viewer.setHover(null);
  }

  endSession() {
    for (const t of Object.values(this.timers)) { clearTimeout(t); clearInterval(t); }
    this.timers = {};
    this.session = null;
    this.run = null;
    this.kbd.clearHint();
  }

  /** What Enter does on the home and results screens. */
  primaryTarget() {
    const now = Date.now();
    const region = this.region;
    const isDueLevel = (lv) => !lv.speed && isDue(this.state.levels[lv.id]?.nextReviewAt, now);
    const due = region.levels.find(isDueLevel) || LEVELS.find(isDueLevel);
    if (due) return { label: `Review · ${due.title}`, level: due.id, mode: 'review' };
    const fresh = region.levels.find((lv) => !this.state.levels[lv.id]?.stars?.[0]);
    if (fresh) return { label: fresh.speed ? `Speed run · ${region.title}` : `${fresh.n === 1 ? 'Begin' : 'Continue'} · ${fresh.title}`, level: fresh.id, mode: fresh.speed ? 'speed' : 'lesson' };
    const sr = region.levels.find((lv) => lv.speed);
    return { label: `Speed run · ${region.title}`, level: sr.id, mode: 'speed' };
  }

  primaryAction() {
    const t = this.screen === 'results' && this.resultsPrimary ? this.resultsPrimary : this.primaryTarget();
    this.startLevel(t.level, t.mode);
  }

  /** Clicking a level: a due review if there is one, otherwise the full lesson. */
  openLevel(id) {
    const lv = levelById(id);
    const L = this.state.levels[id];
    if (!lv.speed && L && isDue(L.nextReviewAt, Date.now())) this.startLevel(id, 'review');
    else this.startLevel(id, lv.speed ? 'speed' : 'lesson');
  }

  // ---------------------------------------------------------------- lesson

  async startLevel(id, mode = 'lesson') {
    const level = levelById(id);
    if (!level) return;
    if (level.speed) mode = 'speed';
    const region = regionOfLevel(id);
    const nav = ++this.nav;
    this.endSession();
    this.setRegion(region.id);
    if (!(await this.ensureRegion(region.id)) || nav !== this.nav) return;
    const items = level.items.map((k) => ITEMS[k]);
    const rounds = mode === 'practice' ? [2, 3] : mode === 'review' || mode === 'speed' ? [3] : [1, 2, 3];
    this.session = new Session({
      items, rounds, mode,
      lang: this.state.settings.lang,
      pool: itemsOfRegion(region.id),
      seed: hashString(`${id}:${Date.now()}`),
      maxAttempts: mode === 'speed' ? 2 : 3,
      gap: mode === 'speed' ? 3 : 2,
      now: () => performance.now(),
    }).start();
    this.run = { level, mode, region };
    this.enterLesson();
    if (mode === 'review') this.toast(`Review: ${level.title.toLowerCase()}, straight from memory.`);
    if (mode === 'practice') this.toast('Practice: rounds 2 and 3 only.');
    if (mode === 'speed') this.toast('Speed run: the clock starts on your first key.');
  }

  async startDaily() {
    const now = Date.now();
    const day = dayKey(now);
    const pool = allItems();
    const item = pool[hashString(`bone-of-the-day:${day}`) % pool.length];
    const region = regionOfItem(item.key);
    const n = this.dailyNumber(now);
    const nav = ++this.nav;
    this.endSession();
    this.setRegion(region.id);
    if (!(await this.ensureRegion(region.id)) || nav !== this.nav) return;
    this.session = new Session({ items: [item], rounds: [3], mode: 'daily', lang: this.state.settings.lang, pool: itemsOfRegion(region.id), maxAttempts: 1, now: () => performance.now() }).start();
    this.run = { level: { id: 'daily', title: `Daily #${n}` }, mode: 'daily', day, n, region };
    this.enterLesson();
  }

  dailyNumber(now = Date.now()) {
    const first = this.state.firstVisit ?? now;
    return Math.max(1, Math.round((dayStart(now) - dayStart(first)) / DAY_MS) + 1);
  }

  enterLesson() {
    const P = this.run.region.poses;
    this.show('lesson');
    this.viewer.setView('main', $('#stage-main'), { pose: P.r1 });
    this.viewer.setView('inset', $('#inset-view'), { pose: P.inset[1], tint: INSET_TINT });
    $('#screen-lesson').dataset.mode = this.run.mode;
    if (this.run.mode === 'speed') this.timers.clock = setInterval(() => this.renderMeta(), 250);
    this.onPrompt(true);
    this.focusSink();
  }

  /** A key from the physical or on-screen keyboard. */
  press(k) {
    if (this.screen !== 'lesson' || !this.session) return;
    const s = this.session;
    this.kbd.flash(k);
    const isChar = k !== 'Enter' && k !== 'Backspace';
    // Keys never carry over into a prompt the learner hasn't seen yet:
    // on a round intro any key just starts the round; during the short "correct" beat
    // keys are swallowed (that also absorbs the tail of a longer synonym), and Enter skips it.
    if (isChar && s.phase === 'intro') { this.advance(); return; }
    if (isChar && s.phase === 'correct') return;
    let ev;
    if (k === 'Enter') ev = s.enter();
    else if (k === 'Backspace') ev = s.backspace();
    else ev = s.key(k);
    this.handle(ev);
  }

  advance() {
    clearTimeout(this.timers.next);
    clearTimeout(this.timers.intro);
    if (this.session) this.handle(this.session.next());
  }

  handle(ev) {
    const s = this.session;
    if (!s) return;
    switch (ev.type) {
      case 'hit':
        this.sound.key();
        this.kbd.clearHint();
        this.renderWord();
        break;
      case 'input':
        this.sound.key();
        this.renderWord();
        break;
      case 'error':
        this.sound.error();
        this.kbd.hint(ev.expected);
        this.shake();
        break;
      case 'correct':
        this.sound.success();
        this.kbd.clearHint();
        if (s.mode === 'daily') { this.renderDailyReveal(true); break; }
        this.renderWord();
        this.announce('Correct.');
        clearTimeout(this.timers.next);
        this.timers.next = setTimeout(() => { if (this.session === s && s.phase === 'correct') this.advance(); }, s.round === 1 ? 380 : 620);
        break;
      case 'miss':
        this.sound.miss();
        if (s.mode === 'daily') { this.renderDailyReveal(false); break; }
        this.renderReveal(ev.verdict);
        break;
      case 'prompt':
        this.onPrompt();
        break;
      case 'round':
        this.sound.round();
        this.renderIntro();
        break;
      case 'complete':
        this.finish();
        break;
      default:
        break;
    }
  }

  onPrompt(instant = false) {
    const s = this.session;
    const region = this.run.region;
    const P = region.poses;
    const item = s.item;
    const r = s.round;
    const cam = item.cam || {};
    const pose = cam[`r${r}`] || P[`r${r}`];
    const dur = instant ? 0 : 950;
    // Small or deep structures: move in on them. The foot keeps its hand-tuned framing.
    const auto = region.autoFrame ? this.viewer.framingFor(item.meshes) : null;
    this.viewer.setPose('main', pose, {
      focus: item.meshes,
      focusAmount: cam.focus ?? auto?.focusAmount ?? (r === 1 ? 0.25 : 0.4),
      zoom: cam.zoom ?? auto?.zoom ?? 1,
      duration: dur,
    });
    let ipose = P.inset[r];
    if (ipose === pose) ipose = P.insetAlt;
    this.viewer.setPose('inset', ipose, { focus: item.meshes, focusAmount: 0.15, duration: dur });
    $('#inset-label').textContent = `${region.figure}, ${POSE_LABEL[ipose]}`;
    this.viewer.setHighlight(item.meshes);
    this.kbd.clearHint();
    this.renderPrompt();
    const hint = r === 1 ? `Type: ${item[s.lang]}` : r === 2 ? `Starts with ${item[s.lang][0]}. ${item.cue}` : `Name the ${region.noun} shown in red.`;
    this.announce(`${this.metaText()}. ${hint}`);
  }

  // ---------------------------------------------------------------- rendering

  metaText() {
    const s = this.session;
    if (!s) return '';
    if (s.mode === 'daily') return `Daily #${this.run.n} · from memory`;
    if (s.mode === 'speed') {
      const elapsed = s.startedAt == null ? 0 : (s.endedAt ?? performance.now()) - s.startedAt;
      return `Speed run · ${s.index} of ${s.total} · ${fmtTime(elapsed)}`;
    }
    const prefix = s.mode === 'review' ? 'Review · ' : '';
    return `${prefix}Round ${s.round} · ${ROUND_NAME[s.round]} · ${s.index} of ${s.total}`;
  }

  renderMeta() {
    if (this.screen !== 'lesson' || !this.session) return;
    const s = this.session;
    if (s.phase === 'intro') return;
    $('#p-meta').textContent = this.metaText();
  }

  renderPrompt() {
    const s = this.session;
    if (!s) return;
    const box = $('#prompt');
    box.dataset.state = s.phase;
    $('#p-extra').innerHTML = '';
    this.renderMeta();
    this.renderWord();
    const item = s.item;
    const noun = this.run.region.noun;
    let sub = '';
    if (s.round === 1) sub = `<span class="alt">${esc(altName(item, s.lang))}</span> — ${esc(item.describe)}`;
    else if (s.round === 2) sub = esc(item.cue);
    else sub = `<span class="quiet">${item.meshes.length > 1 && noun === 'bone' ? 'name the bones in red' : `name the ${noun} in red`}${s.mode === 'daily' ? ' · one try' : ''}</span>`;
    $('#p-sub').innerHTML = sub;
  }

  renderWord() {
    const s = this.session;
    const el = $('#p-word');
    if (!s) return;
    const a = s.answer;
    const ch = (c) => (c === ' ' ? '&nbsp;' : esc(c));
    const caret = '<span class="caret" aria-hidden="true"></span>';
    let html = '';
    if (s.phase === 'correct') {
      html = [...a].map((c) => `<span class="ok">${ch(c)}</span>`).join('');
      el.classList.add('win');
    } else {
      el.classList.remove('win');
      if (s.round === 1) {
        for (let i = 0; i < a.length; i++) {
          if (i === s.pos) html += caret;
          html += `<span class="${i < s.pos ? 'ok' : 'todo'}">${ch(a[i])}</span>`;
        }
        if (s.pos >= a.length) html += caret;
      } else {
        const typed = s.input;
        html += [...typed].map((c) => `<span class="ok">${ch(c)}</span>`).join('');
        html += caret;
        if (s.round === 2) {
          for (let i = typed.length; i < a.length; i++) {
            if (a[i] === ' ') html += '<span class="gap"> </span>';
            else if (i === 0) html += `<span class="todo">${ch(a[0])}</span>`;
            else html += '<span class="blank"></span>';
          }
        }
      }
    }
    el.innerHTML = html;
    this.fitWord();
  }

  fitWord() {
    const s = this.session;
    const el = $('#p-word');
    if (!s || !el) return;
    const revealing = $('#prompt').dataset.state === 'reveal'; // misses and the daily card
    let len = s.answer.length;
    if (s.round === 3 && s.phase === 'prompt') len = Math.max(9, s.input.length + 2);
    if (revealing) len = Math.max(len, 9);
    // #prompt sits in a minmax(0, 1fr) column with min-width 0, so its width isn't inflated by the word.
    const w = Math.min($('#prompt').clientWidth || window.innerWidth, 1100);
    const H = window.innerHeight;
    const cap = H < 520 ? (revealing ? 36 : 46) : revealing ? 60 : H < 760 ? 78 : 90;
    const size = Math.max(26, Math.min(cap, (w * 0.9) / (Math.max(len, 6) * 0.56)));
    el.style.fontSize = `${size.toFixed(1)}px`;
  }

  shake() {
    const el = $('#p-word');
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  renderIntro() {
    const s = this.session;
    const r = s.round;
    const region = this.run.region;
    const info = ROUND_INTRO[r];
    $('#prompt').dataset.state = 'intro';
    $('#p-meta').textContent = s.mode === 'lesson' ? `Round ${r} of ${s.rounds.at(-1)}` : '';
    const el = $('#p-word');
    el.classList.remove('win');
    el.innerHTML = `<span class="intro-title">${esc(info.title)}</span>`;
    el.style.fontSize = '';
    $('#p-sub').innerHTML = esc(info.text);
    $('#p-extra').innerHTML = '<span class="press">press any key to start</span>';
    this.viewer.setHighlight([]);
    this.viewer.setPose('main', region.poses[`r${r}`], { duration: 1300 });
    if (r === 3) this.toast(region.turnNote);
    this.announce(`${info.title}. ${info.text}`);
    clearTimeout(this.timers.intro);
    this.timers.intro = setTimeout(() => { if (this.session === s && s.phase === 'intro') this.advance(); }, 3200);
  }

  renderReveal(v) {
    const s = this.session;
    const item = s.item;
    const ans = item[s.lang];
    $('#prompt').dataset.state = 'reveal';
    $('#p-meta').textContent = this.metaText();
    const el = $('#p-word');
    el.classList.remove('win');
    el.innerHTML = `<span class="ans">${esc(ans)}</span>`;
    this.fitWord();
    let msg;
    if (v.verdict === 'close') msg = `Almost. The spelling is <b>${esc(ans)}</b>.`;
    else if (v.verdict === 'other') msg = `That’s the name of the <b class="cool">${esc(v.other[s.lang])}</b>, shown in blue. This one is the <b>${esc(ans)}</b>.`;
    else msg = `This one is the <b>${esc(ans)}</b>.`;
    msg += v.requeued ? ' You’ll see it again in a moment.' : ' It comes back in your next review.';
    $('#p-sub').innerHTML = `<span class="alt">${esc(altName(item, s.lang))}</span>`;
    $('#p-extra').innerHTML = `
      <p class="msg">${msg}</p>
      <div class="row">
        <p class="typed">you typed <s>${esc(v.typed)}</s></p>
        <button class="btn small" data-action="continue">Continue <kbd>⏎</kbd></button>
      </div>`;
    if (v.verdict === 'other') this.viewer.setHighlight(item.meshes, v.other.meshes);
    this.announce(`${msg.replace(/<[^>]+>/g, '')}`);
  }

  renderDailyReveal(correct) {
    const s = this.session;
    const item = s.item;
    $('#prompt').dataset.state = 'reveal';
    const el = $('#p-word');
    el.classList.toggle('win', correct);
    el.innerHTML = `<span class="ans">${esc(item[s.lang])}</span>`;
    this.fitWord();
    $('#p-sub').innerHTML = `<span class="alt">${esc(altName(item, s.lang))}</span> — ${esc(item.describe)}`;
    $('#p-extra').innerHTML = `
      <div class="row">
        <p class="msg">${correct ? 'Got it from memory.' : 'Not this time. Now you know it.'}</p>
        <button class="btn small" data-action="continue">Done <kbd>⏎</kbd></button>
      </div>
      <p class="fact">${esc(item.fact)}</p>`;
    this.announce(`${correct ? 'Correct' : `It was the ${item[s.lang]}`}. ${item.fact}`);
  }

  announce(text) {
    const sr = $('#sr');
    sr.textContent = '';
    setTimeout(() => { sr.textContent = text; }, 30);
  }

  toast(text, ms = 3800) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    $('#toasts').appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => {
      t.classList.remove('in');
      setTimeout(() => t.remove(), 450);
    }, ms);
  }

  toastOnce(id, text) {
    this._toasted ||= new Set();
    if (this._toasted.has(id)) return;
    this._toasted.add(id);
    this.toast(text, 6000);
  }

  // ---------------------------------------------------------------- finishing

  finish() {
    const s = this.session;
    const { level, mode, region } = this.run;
    const sum = s.summary();
    const now = Date.now();
    clearInterval(this.timers.clock);

    if (mode === 'daily') {
      const correct = sum.recall === 1;
      this.state.daily[this.run.day] = { key: s.items[0].key, correct };
      this.save();
      this.endSession();
      this.showHome().then(() => this.toast(correct ? 'Today’s structure: done. See you tomorrow.' : 'Today’s structure: logged. Tomorrow brings a new one.'));
      return;
    }

    const L = levelState(this.state, level.id);
    const before = L.stars.slice();
    L.plays++;
    L.stars[0] = true;
    if (sum.cleanLastRound) L.stars[1] = true;
    let reviewed = false;
    if (mode === 'speed') {
      if (sum.totalMs <= level.parTimeMs) L.stars[2] = true;
    } else if (L.clearedAt && isDue(L.nextReviewAt, now)) {
      // Any run while a review is due counts as that review.
      reviewed = true;
      if (dayKey(now) !== dayKey(L.clearedAt) && sum.recall >= 0.8) L.stars[2] = true;
      L.interval = nextInterval(L.interval || 1, sum.recall);
      L.nextReviewAt = addDays(now, L.interval);
      L.lastReviewAt = now;
    } else if (!L.clearedAt) {
      L.clearedAt = now;
      L.interval = firstInterval(sum.recall);
      L.nextReviewAt = addDays(now, L.interval);
    }
    const prev = L.best || {};
    L.best = {
      recall: Math.max(prev.recall ?? 0, sum.recall),
      wpm: Math.max(prev.wpm ?? 0, sum.wpm),
      accuracy: Math.max(prev.accuracy ?? 0, sum.accuracy),
      timeMs: mode === 'speed' ? Math.min(prev.timeMs ?? Infinity, sum.totalMs) : prev.timeMs ?? null,
    };
    this.save();
    this.sound.complete();
    const ctx = { level, mode, region, sum, before, reviewed, L, now };
    this.endSession();
    this.showResults(ctx);
  }

  showResults({ level, mode, region, sum, before, reviewed, L, now }) {
    this.show('results');
    const speed = mode === 'speed';
    const items = sum.perItem;
    const headline = speed
      ? `${fmtTime(sum.totalMs)} for all ${items.length} names.`
      : sum.recall >= 0.7 ? `${level.headline}.` : 'A solid first pass. The shaky ones come back in your review.';
    const tag = mode === 'review' || reviewed ? 'Review' : mode === 'practice' ? 'Practice' : speed ? 'Speed run' : `Level ${level.n}`;
    const kicker = `Plate ${region.plate} · ${region.title} · ${tag}${speed ? '' : ` · ${level.title}`}`;
    const stats = speed
      ? [['Time', fmtTime(sum.totalMs), 'big'], ['First-try recall', pct(sum.recall)], ['Speed · accuracy', `${sum.wpm} wpm · ${pct(sum.accuracy)}`]]
      : [['First-try recall', pct(sum.recall), 'big'], ['Next review', L.nextReviewAt ? describeDue(L.nextReviewAt, now) : '—'], ['Speed · accuracy', `${sum.wpm} wpm · ${pct(sum.accuracy)}`]];
    const starText = speed
      ? ['Finish the run', 'No misses', `Under ${fmtTime(level.parTimeMs)}`]
      : ['Finish the level', 'Get through round 3 without a miss', 'Recall them on another day'];
    const starHint = (i) => {
      if (speed || i !== 2 || L.stars[2]) return '';
      return L.nextReviewAt ? ` <span class="dim">(review ${describeDue(L.nextReviewAt, now)})</span>` : '';
    };
    const lang = this.state.settings.lang;

    const next = !speed && region.levels[region.levels.indexOf(level) + 1];
    this.resultsPrimary = next
      ? { level: next.id, mode: next.speed ? 'speed' : 'lesson', label: next.speed ? `Next · Speed run` : `Next · ${next.title}` }
      : { level: level.id, mode: speed ? 'speed' : 'lesson', label: speed ? 'Run it again' : 'Play again' };

    $('#screen-results').innerHTML = `
      <div class="res">
        <p class="kicker">${esc(kicker)}</p>
        <h1 class="res-head">${esc(headline)}</h1>
        <div class="stats">
          ${stats.map(([k, v, cls]) => `<div class="stat ${cls || ''}"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}
        </div>
        <ul class="goals">
          ${starText.map((t, i) => `<li class="${L.stars[i] ? 'on' : ''} ${L.stars[i] && !before[i] ? 'new' : ''}"><span class="star" aria-hidden="true">${L.stars[i] ? '★' : '☆'}</span><span>${esc(t)}${starHint(i)}</span>${L.stars[i] && !before[i] ? '<span class="badge">new</span>' : ''}</li>`).join('')}
        </ul>

        <h2>What you named</h2>
        <div class="named">
          ${items.map((p) => `
            <div class="named-row">
              <div class="nm"><b>${esc(p.item[lang])}</b><span>${esc(altName(p.item, lang))}</span></div>
              <p class="nd">${esc(p.item.card)}</p>
              <p class="status ${p.status.tone}">${esc(p.status.text)}</p>
            </div>`).join('')}
        </div>

        ${level.examAngle?.length ? `
        <h2>Exam angle</h2>
        <ol class="notes">
          ${level.examAngle.map((n) => `<li><b>${esc(n.term)}.</b> ${esc(n.text)}</li>`).join('')}
        </ol>` : ''}

        <h2>${esc(region.title)} · levels</h2>
        <div class="rows">${this.levelsHTML(region, level.id)}</div>

        <div class="actions">
          <button class="btn primary" data-action="primary">${esc(this.resultsPrimary.label)} <kbd>⏎</kbd></button>
          ${!speed ? `<button class="btn" data-action="play" data-level="${level.id}" data-mode="practice">Practice rounds 2–3</button>` : ''}
          ${!speed ? `<button class="btn" data-action="play" data-level="${level.id}" data-mode="lesson">Restart the level</button>` : ''}
          <button class="btn" data-action="map">Body map</button>
          <button class="btn ghost" data-action="home">Index</button>
        </div>
        <p class="saved">${this.storageOk === false ? 'This browser window can’t store progress, so it resets when the page closes.' : 'Progress is saved in this browser.'}</p>
      </div>`;
    $('#screen-results').focus({ preventScroll: true });
  }

  levelsHTML(region, currentId = null) {
    const now = Date.now();
    return region.levels.map((lv) => {
      const L = this.state.levels[lv.id];
      const stars = L?.stars || [false, false, false];
      let status = 'not started';
      if (L) {
        if (lv.speed) status = L.best?.timeMs != null && Number.isFinite(L.best.timeMs) ? `best ${fmtTime(L.best.timeMs)}` : 'played';
        else if (L.nextReviewAt) status = isDue(L.nextReviewAt, now) ? 'review due' : `review ${describeDue(L.nextReviewAt, now)}`;
        else status = 'played';
      }
      return `
        <button class="lvl ${lv.id === currentId ? 'current' : ''} ${status === 'review due' ? 'due' : ''}" data-action="level" data-level="${lv.id}">
          <span class="lvl-n">${lv.n}</span>
          <span class="lvl-main"><span class="lvl-title">${esc(lv.title)}</span><span class="lvl-blurb">${esc(lv.blurb)}</span></span>
          <span class="lvl-count">${lv.items.length} ${esc(lv.unit)}</span>
          <span class="lvl-stars" aria-label="${stars.filter(Boolean).length} of 3 stars">${stars.map((on) => (on ? '★' : '☆')).join('')}</span>
          <span class="lvl-status">${esc(status)}</span>
        </button>`;
    }).join('');
  }

  regionTabsHTML() {
    const current = this.region.id;
    return REGIONS.map((r) => {
      const got = r.levels.reduce((n, lv) => n + (this.state.levels[lv.id]?.stars || []).filter(Boolean).length, 0);
      return `
        <button class="plate ${r.id === current ? 'on' : ''}" data-action="region" data-region="${r.id}" aria-pressed="${r.id === current}">
          <span class="plate-n">Plate ${r.plate}</span>
          <span class="plate-t">${esc(r.title)}</span>
          <span class="plate-c">${esc(r.tally)} · ${got}/${r.levels.length * 3} ★</span>
        </button>`;
    }).join('');
  }

  // ---------------------------------------------------------------- home

  async showHome() {
    const nav = ++this.nav;
    this.endSession();
    this.show('home');
    const region = this.region;
    const t = this.primaryTarget();
    const today = this.state.daily[dayKey(Date.now())];
    $('#home-primary').innerHTML = `${esc(t.label)} <kbd>⏎</kbd>`;
    $('#home-regions').innerHTML = this.regionTabsHTML();
    $('#home-levels').innerHTML = this.levelsHTML(region);
    $('#home-levels-title').textContent = `Plate ${region.plate} · ${region.title}`;
    $('#home-cap').textContent = `Plate ${region.plate}. ${region.title}, ${region.tally}.`;
    $('#home-daily').textContent = `Today’s structure${today ? (today.correct ? ' ✓' : ' · done') : ''}`;
    const due = LEVELS.filter((lv) => !lv.speed && isDue(this.state.levels[lv.id]?.nextReviewAt, Date.now()));
    $('#home-due').textContent = due.length ? `${due.length === 1 ? 'One review is' : `${due.length} reviews are`} due today.` : '';
    if (!(await this.ensureRegion(region.id)) || nav !== this.nav || this.screen !== 'home') return;
    this.viewer.setHighlight([]);
    this.viewer.setView('hero', $('#home-stage'), { pose: region.poses.home, sway: false, spin: 0.16 });
  }

  // ---------------------------------------------------------------- body map

  async showMap() {
    const nav = ++this.nav;
    this.endSession();
    this.show('map');
    this.mapSelected = null;
    const region = this.region;
    const lang = this.state.settings.lang;
    $('#map-regions').innerHTML = REGIONS.map((r) => `<button class="${r.id === region.id ? 'on' : ''}" data-action="region" data-region="${r.id}">${esc(r.title)}</button>`).join('');
    $('#map-views').innerHTML = region.mapViews.map(([label, pose]) => `<button data-action="map-pose" data-pose="${pose}">${esc(label)}</button>`).join('');
    $('#map-list').innerHTML = region.mapGroups.map((g) => `
      <div class="map-group">
        <h3>${esc(g.title)}</h3>
        <div class="chips">${g.keys.map((k) => `<button class="chip" data-action="map-bone" data-key="${k}">${esc(this.meshName(k, lang))}</button>`).join('')}</div>
      </div>`).join('');
    $('#map-info').innerHTML = `<p class="quiet">Drag to turn the model. Hover or tap any ${esc(region.noun)} to name it.</p>`;
    const stage = $('#map-stage');
    if (!stage.dataset.bound) {
      stage.dataset.bound = '1';
      stage.addEventListener('pointermove', (e) => {
        if (this.screen !== 'map' || e.buttons) return;
        const key = this.viewer.pick(e.clientX, e.clientY);
        this.viewer.setHover(key === this.mapSelected ? null : key);
        const tip = $('#map-tip');
        if (key) {
          tip.hidden = false;
          tip.textContent = this.meshName(key, this.state.settings.lang);
          const r = stage.getBoundingClientRect();
          tip.style.left = `${e.clientX - r.left + 14}px`;
          tip.style.top = `${e.clientY - r.top + 14}px`;
        } else {
          tip.hidden = true;
        }
        stage.style.cursor = key ? 'pointer' : 'grab';
      });
      stage.addEventListener('pointerleave', () => { this.viewer.setHover(null); $('#map-tip').hidden = true; });
      stage.addEventListener('click', (e) => {
        if (this.screen !== 'map') return;
        if (stage.dataset.dragged) { delete stage.dataset.dragged; return; }
        const key = this.viewer.pick(e.clientX, e.clientY);
        if (key) this.selectMapBone(key);
      });
    }
    if (!(await this.ensureRegion(region.id)) || nav !== this.nav || this.screen !== 'map') return;
    this.viewer.setHighlight([]);
    this.viewer.setView('map', stage, { pose: region.poses.map, sway: false, orbit: true });
  }

  meshName(key, lang) {
    const m = MESH_INFO[key];
    return m ? m[lang] || m.en : key;
  }

  selectMapBone(key) {
    const m = MESH_INFO[key];
    if (!m) return;
    this.mapSelected = key;
    this.viewer.setHover(null);
    this.viewer.setHighlight([key]);
    const lang = this.state.settings.lang;
    const other = lang === 'en' ? 'fr' : 'en';
    const lv = levelOfMesh(key);
    $('#map-info').innerHTML = `
      <h2 class="map-name">${esc(m[lang])}</h2>
      <p class="map-alt">${esc(m[other])}</p>
      <p>${esc(m.describe)}</p>
      ${lv ? `<button class="btn small" data-action="level" data-level="${lv.id}">Practise in level ${lv.n} · ${esc(lv.title)}</button>` : ''}`;
    for (const c of document.querySelectorAll('#map-list .chip')) c.classList.toggle('on', c.dataset.key === key);
  }

  // ---------------------------------------------------------------- keyboard

  onKeyDown(e) {
    if (e.defaultPrevented || e.isComposing) return;
    if (e.metaKey || (e.ctrlKey && !e.altKey)) return; // leave browser shortcuts alone (AltGr = Ctrl+Alt is allowed)
    const k = e.key;
    if (k === 'Escape') {
      if (this.screen !== 'home') { e.preventDefault(); this.showHome(); }
      return;
    }
    if (this.screen === 'lesson') {
      // A control the learner tabbed to (a toggle, Continue, the index) keeps its own Enter/Space.
      if ((k === 'Enter' || k === ' ') && e.target !== $('#sink') && e.target.closest?.('button, a, [role="button"]')) return;
      if (k === 'Enter' || k === 'Backspace' || k.length === 1) {
        e.preventDefault();
        if (e.repeat && k !== 'Backspace') return;
        this.press(k);
      }
      return;
    }
    if ((this.screen === 'results' || this.screen === 'home') && k === 'Enter') {
      if (e.repeat) return; // a held Enter from the last answer must not start the next level
      const a = document.activeElement;
      if (a && a !== document.body && a.matches('button, a, input, [tabindex]:not(#screen-results)')) return;
      e.preventDefault();
      this.primaryAction();
    }
  }
}
