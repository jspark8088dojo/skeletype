// On-screen keyboard: mirrors physical key presses and works as the input on touch screens.

import { fold } from './match.js';

// [value, label, width]. value is what gets typed (or a named key); null = decorative only.
const ROWS = [
  [['`'], ['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['7'], ['8'], ['9'], ['0'], ['-'], ['='], ['Backspace', 'delete', 1.7]],
  [[null, 'tab', 1.5], ['q'], ['w'], ['e'], ['r'], ['t'], ['y'], ['u'], ['i'], ['o'], ['p'], ['['], [']'], ['\\', '\\', 1.2]],
  [[null, 'caps', 1.8], ['a'], ['s'], ['d'], ['f'], ['g'], ['h'], ['j'], ['k'], ['l'], [';'], ["'"], ['Enter', 'return', 1.9]],
  [[null, 'shift', 2.35], ['z'], ['x'], ['c'], ['v'], ['b'], ['n'], ['m'], [','], ['.'], ['/'], [null, 'shift', 2.35]],
  [[' ', '', 1]],
];

const idFor = (value) => (value === ' ' ? 'space' : value);
const NAMES = { ' ': 'space', Backspace: 'delete', Enter: 'return', '`': 'backtick', '-': 'hyphen', '=': 'equals', '[': 'left bracket', ']': 'right bracket', '\\': 'backslash', ';': 'semicolon', "'": 'apostrophe', ',': 'comma', '.': 'period', '/': 'slash' };

export class Keyboard {
  constructor(el, onPress) {
    this.el = el;
    this.onPress = onPress;
    this.keys = new Map();
    this.timers = new Map();
    this.hinted = null;
    el.classList.add('kbd');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'On-screen keyboard');
    for (const row of ROWS) {
      const r = document.createElement('div');
      r.className = 'krow';
      for (const [value, label = value, w = 1] of row) {
        const k = document.createElement('div');
        k.className = 'key';
        if (value === null || value.length > 1) k.classList.add('mod');
        if (value === ' ') k.classList.add('space');
        k.style.setProperty('--w', w);
        k.textContent = label;
        if (value === null) {
          k.setAttribute('aria-hidden', 'true'); // tab, caps, shift: decoration only
        } else {
          k.dataset.k = idFor(value);
          k.setAttribute('role', 'button');
          k.setAttribute('aria-label', NAMES[value] || value);
          this.keys.set(idFor(value), k);
          // Touch and mouse type on pointerdown (instant, no focus change)...
          k.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.onPress(value);
          });
          // ...while screen readers activate with a synthetic click (detail 0) and no pointerdown.
          k.addEventListener('click', (e) => {
            if (e.detail === 0) this.onPress(value);
          });
        }
        r.appendChild(k);
      }
      el.appendChild(r);
    }
  }

  _find(value) {
    if (value === 'Enter' || value === 'Backspace') return this.keys.get(value);
    if (value === ' ') return this.keys.get('space');
    return this.keys.get(fold(value).charAt(0));
  }

  /** Light a key briefly. */
  flash(value) {
    const k = this._find(value);
    if (!k) return;
    k.classList.add('down');
    clearTimeout(this.timers.get(k));
    this.timers.set(k, setTimeout(() => k.classList.remove('down'), 130));
  }

  /** Point at the key the learner should press next (after a wrong key in round 1). */
  hint(value) {
    this.clearHint();
    const k = this._find(value);
    if (!k) return;
    k.classList.add('hint');
    this.hinted = k;
  }

  clearHint() {
    if (this.hinted) this.hinted.classList.remove('hint');
    this.hinted = null;
  }
}
