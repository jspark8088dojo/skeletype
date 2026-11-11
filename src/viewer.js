// 3D foot viewer: X-ray bones, a glowing target, several camera views drawn into DOM rects.
//
// One full-window transparent canvas sits under the UI. Each "view" is a DOM element; every frame the
// scene is drawn into that element's rectangle with its own camera (scissor test). The element itself
// stays transparent so the canvas shows through it.
//
// World frame (from tools/pack-meshes.mjs): right foot, centimetres, +X medial, +Y up, +Z toward the toes.

import * as THREE from 'three';

const LEG = new Set(['tibia', 'fibula']);
const FOOT_CENTER = new THREE.Vector3(0, 3.0, 0);
const FIT_RADIUS = 12.6;
const FIT_MARGIN = 1.2;
const FOV = 30;

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Camera presets: direction from the target to the camera, and the screen-up vector. */
export const POSES = {
  dorsal: { dir: [0, 0.94, -0.36], up: [0, 0, 1], leg: 0.32 },
  plantar: { dir: [0, -0.94, -0.3], up: [0, 0, 1], leg: 0.22 },
  // Same views turned a quarter so the toes point right: used when the stage is much wider than tall.
  dorsalWide: { dir: [-0.32, 0.95, -0.05], up: [1, 0, 0], leg: 0.32 },
  plantarWide: { dir: [0.3, -0.95, -0.05], up: [-1, 0, 0], leg: 0.22 },
  lateral: { dir: [-1, 0.16, 0.04], up: [0, 1, 0], leg: 1 },
  medial: { dir: [1, 0.16, 0.04], up: [0, 1, 0], leg: 1 },
  dorsolateral: { dir: [-0.6, 0.74, -0.16], up: [0, 1, 0], leg: 0.75 },
  dorsomedial: { dir: [0.6, 0.74, -0.16], up: [0, 1, 0], leg: 0.75 },
  plantarLateral: { dir: [-0.62, -0.72, -0.2], up: [0, 0, 1], leg: 0.3 },
  plantarMedial: { dir: [0.62, -0.72, -0.2], up: [0, 0, 1], leg: 0.3 },
  anterior: { dir: [0.18, 0.42, 1], up: [0, 1, 0], leg: 0.6 },
  posterior: { dir: [-0.15, 0.3, -1], up: [0, 1, 0], leg: 0.9 },
  hero: { dir: [-0.86, 0.36, 0.36], up: [0, 1, 0], leg: 1 },
};

export const POSE_LABEL = {
  dorsal: 'dorsal view', plantar: 'plantar view (sole)', dorsalWide: 'dorsal view', plantarWide: 'plantar view (sole)',
  lateral: 'lateral view', medial: 'medial view',
  dorsolateral: 'dorsolateral view', dorsomedial: 'dorsomedial view', plantarLateral: 'plantar-lateral view',
  plantarMedial: 'plantar-medial view', anterior: 'anterior view', posterior: 'posterior view', hero: 'oblique view',
};

// ---------- mesh pack ----------

/** Load the packed meshes: inline base64 (single-file build) or fetched from `url`. */
export async function loadPack(url) {
  const inline = document.getElementById('foot-pack');
  if (inline && inline.textContent.trim()) {
    const bin = atob(inline.textContent.trim());
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return parsePack(u8.buffer);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  return parsePack(await res.arrayBuffer());
}

export function parsePack(buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'SKPK') throw new Error('not a skeletype mesh pack');
  const hlen = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hlen)));
  const base = 8 + hlen;
  const meshes = header.bones.map((b) => {
    const q = new Uint16Array(buf, base + b.vOffset, b.vCount * 3);
    const positions = new Float32Array(b.vCount * 3);
    for (let i = 0; i < b.vCount; i++) {
      for (let a = 0; a < 3; a++) positions[i * 3 + a] = b.min[a] + (q[i * 3 + a] / 65535) * (b.max[a] - b.min[a]);
    }
    return { ...b, positions, indices: new Uint16Array(buf, base + b.iOffset, b.iCount) };
  });
  return { header, meshes };
}

// ---------- materials ----------

const VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vY = wp.y;
  vec4 mv = viewMatrix * wp;
  vV = -mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

// Additive "X-ray": faint core, bright silhouette rims, faded out toward the top of the leg.
const XRAY_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uCore;
uniform float uPower;
uniform vec2 uFade;
uniform float uGlobal;
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
  float ndv = abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(1.0 - ndv, uPower);
  float a = uOpacity * uGlobal * (uCore + (1.0 - uCore) * rim);
  a *= 1.0 - smoothstep(uFade.x, uFade.y, vY);
  gl_FragColor = vec4(uColor * a, a);
}`;

// Solid, softly lit and rim-lit: the bone being asked about.
const SOLID_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uRim;
uniform float uOpacity;
uniform float uPulse;
uniform float uGlobal;
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vV);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  vec3 l = normalize(vec3(0.35, 0.8, 0.5));
  float diff = 0.38 + 0.62 * max(dot(n, l), 0.0);
  float rim = pow(1.0 - ndv, 2.2);
  vec3 col = uColor * diff * (0.92 + 0.08 * uPulse) + uRim * rim * 0.9;
  float a = uOpacity * uGlobal;
  gl_FragColor = vec4(col * a, a);
}`;

const hex3 = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

function xrayMaterial({ color, opacity, core = 0.07, power = 1.6, fade = [998, 999] }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: hex3(color) },
      uOpacity: { value: opacity },
      uCore: { value: core },
      uPower: { value: power },
      uFade: { value: new THREE.Vector2(fade[0], fade[1]) },
      uGlobal: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: XRAY_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,
    side: THREE.DoubleSide,
  });
}

function solidMaterial({ color, rim, opacity = 0.96 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: hex3(color) },
      uRim: { value: hex3(rim) },
      uOpacity: { value: opacity },
      uPulse: { value: 0 },
      uGlobal: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: SOLID_FRAG,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending,
    premultipliedAlpha: true,
    side: THREE.DoubleSide,
  });
}

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

function poseQuaternion(name) {
  const p = POSES[name] || POSES.dorsal;
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...p.dir).normalize(), new THREE.Vector3(), new THREE.Vector3(...p.up));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

// ---------- viewer ----------

export class Viewer {
  constructor(canvas, pack, palette = {}) {
    this.canvas = canvas;
    this.palette = {
      bone: '#cfe0ff', leg: '#c4d6f5', target: '#ffad3b', targetRim: '#fff1d6',
      hover: '#7cc8ff', hoverRim: '#e8f6ff', secondary: '#6fb6ff', secondaryRim: '#e3f2ff', ...palette,
    };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.views = new Map();
    this.raycaster = new THREE.Raycaster();
    this.reduced = prefersReducedMotion();
    this.t0 = performance.now();
    this.globalFade = 0;

    const P = this.palette;
    this.mats = {
      xray: xrayMaterial({ color: P.bone, opacity: 0.5 }),
      leg: xrayMaterial({ color: P.leg, opacity: 0.42, fade: [15, 25] }),
      target: solidMaterial({ color: P.target, rim: P.targetRim }),
      hover: solidMaterial({ color: P.hover, rim: P.hoverRim, opacity: 0.85 }),
      secondary: solidMaterial({ color: P.secondary, rim: P.secondaryRim, opacity: 0.8 }),
    };

    this.meshes = new Map();
    this.info = new Map();
    for (const m of pack.meshes) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
      g.setIndex(new THREE.BufferAttribute(m.indices, 1));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, LEG.has(m.key) ? this.mats.leg : this.mats.xray);
      mesh.userData.key = m.key;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      this.meshes.set(m.key, mesh);
      this.info.set(m.key, {
        centroid: new THREE.Vector3(...m.centroid),
        size: new THREE.Vector3(m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]),
      });
    }
    this.pickable = [...this.meshes.values()];

    // Points used to frame the foot tightly: every bone's box corners (the leg only up to the ankle).
    this.fitPoints = [];
    this.fitIsLeg = [];
    for (const m of pack.meshes) {
      const leg = LEG.has(m.key);
      const top = leg ? Math.min(m.max[1], 9) : m.max[1];
      for (const x of [m.min[0], m.max[0]]) for (const y of [m.min[1], top]) for (const z of [m.min[2], m.max[2]]) {
        this.fitPoints.push(new THREE.Vector3(x, y, z));
        this.fitIsLeg.push(leg);
      }
    }
    this._tmp = new THREE.Vector3();
    this._inv = new THREE.Quaternion();

    // Soft contact shadow under the sole.
    const shadowTex = radialTexture([[0, 'rgba(0,0,0,0.62)'], [0.55, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(17, 30),
      new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x000000, transparent: true, depthWrite: false, depthTest: false, premultipliedAlpha: true }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(0.2, -0.6, -0.4);
    this.shadow.renderOrder = 0;
    this.scene.add(this.shadow);

    // Halo sprites behind highlighted bones.
    this.glowTex = radialTexture([[0, 'rgba(255,255,255,0.9)'], [0.35, 'rgba(255,255,255,0.28)'], [1, 'rgba(255,255,255,0)']]);
    this.glows = [];
    this.targets = new Set();
    this.secondary = new Set();
    this.hovered = null;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
    this._loop = (t) => { this.frame(t); this.raf = requestAnimationFrame(this._loop); };
    this.raf = requestAnimationFrame(this._loop);
  }

  resize() {
    // Page zoom and moving to another display change devicePixelRatio; keep the canvas crisp.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, true);
  }

  // ----- views -----

  /** Register a view drawn into `el`. Options: pose, focus (mesh keys), focusAmount, zoom, sway, spin, orbit, tint. */
  setView(name, el, opts = {}) {
    let v = this.views.get(name);
    if (v && v.el !== el) { this._detachOrbit(v); v = null; }
    if (!v) {
      v = {
        name, el, camera: new THREE.PerspectiveCamera(FOV, 1, 1, 400),
        q: poseQuaternion(opts.pose || 'dorsal'), target: FOOT_CENTER.clone(), zoom: 1,
        yaw: 0, pitch: 0, spin: 0, spinRate: 0, sway: true, legOpacity: 1, anim: null, tint: null,
        phase: name.length * 1.7, orbit: false, handlers: null,
      };
      this.views.set(name, v);
    }
    v.sway = opts.sway ?? true;
    v.spinRate = opts.spin ?? 0;
    v.tint = opts.tint ?? null;
    if (opts.orbit) this._attachOrbit(v); else this._detachOrbit(v);
    this.setPose(name, opts.pose || 'dorsal', { ...opts, duration: opts.duration ?? 0 });
    return v;
  }

  removeView(name) {
    const v = this.views.get(name);
    if (!v) return;
    this._detachOrbit(v);
    this.views.delete(name);
  }

  clearViews() {
    for (const name of [...this.views.keys()]) this.removeView(name);
  }

  /** Animate a view to a preset pose, optionally framing some meshes. */
  setPose(name, pose, { focus = null, focusAmount = 0.3, zoom = 1, duration = 900, leg } = {}) {
    const v = this.views.get(name);
    if (!v) return;
    pose = this.resolvePose(v, pose);
    const P = POSES[pose] || POSES.dorsal;
    const to = {
      q: poseQuaternion(pose),
      target: this.focusPoint(focus, focusAmount),
      zoom,
      leg: leg ?? P.leg,
    };
    v.pose = pose;
    const dur = this.reduced ? 0 : duration;
    if (dur <= 0) {
      v.q.copy(to.q); v.target.copy(to.target); v.zoom = to.zoom; v.legOpacity = to.leg;
      v.yaw = 0; v.pitch = 0; v.anim = null;
      return;
    }
    v.anim = {
      t0: performance.now(), dur,
      q0: v.q.clone(), target0: v.target.clone(), zoom0: v.zoom, leg0: v.legOpacity, yaw0: v.yaw, pitch0: v.pitch,
      to,
    };
  }

  /** Top and sole views lie the foot sideways when the view is much wider than tall. */
  resolvePose(v, pose) {
    if (pose !== 'dorsal' && pose !== 'plantar') return pose;
    const r = v.el.getBoundingClientRect();
    return r.width > r.height * 1.3 ? `${pose}Wide` : pose;
  }

  /** The pose a view actually uses (after the wide/tall choice). */
  poseOf(name) {
    return this.views.get(name)?.pose;
  }

  focusPoint(keys, amount) {
    const p = FOOT_CENTER.clone();
    if (!keys?.length || !amount) return p;
    const c = new THREE.Vector3();
    let n = 0;
    for (const k of keys) {
      const i = this.info.get(k);
      if (i) { c.add(i.centroid); n++; }
    }
    if (!n) return p;
    c.divideScalar(n);
    return p.lerp(c, amount);
  }

  // ----- highlighting -----

  /** Glow these meshes (the bone being asked about). `secondary` meshes glow in a cool colour (a mix-up). */
  setHighlight(keys = [], secondary = []) {
    this.targets = new Set(keys);
    this.secondary = new Set(secondary.filter((k) => !this.targets.has(k)));
    this._applyMaterials();
    this._buildGlows();
  }

  setHover(key) {
    if (key === this.hovered) return;
    this.hovered = key;
    this._applyMaterials();
  }

  _applyMaterials() {
    for (const [key, mesh] of this.meshes) {
      let mat = LEG.has(key) ? this.mats.leg : this.mats.xray;
      let order = 2;
      if (this.targets.has(key)) { mat = this.mats.target; order = 1; }
      else if (this.secondary.has(key)) { mat = this.mats.secondary; order = 1; }
      else if (key === this.hovered) { mat = this.mats.hover; order = 1; }
      mesh.material = mat;
      mesh.renderOrder = order;
    }
  }

  /** Halos are pooled: reusing the sprites (and their one shader) avoids a recompile on every highlight. */
  _buildGlows() {
    this.spritePool ||= [];
    const wanted = [
      ...[...this.targets].map((k) => [k, this.palette.target, this.targets.size > 2 ? 0.16 : 0.3]),
      ...[...this.secondary].map((k) => [k, this.palette.secondary, 0.22]),
    ].filter(([k]) => this.info.has(k));
    while (this.spritePool.length < wanted.length) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      s.renderOrder = 3;
      this.scene.add(s);
      this.spritePool.push(s);
    }
    this.glows = [];
    this.spritePool.forEach((s, n) => {
      const w = wanted[n];
      s.visible = Boolean(w);
      if (!w) return;
      const [key, color, strength] = w;
      const i = this.info.get(key);
      s.material.color.set(color);
      s.scale.setScalar(Math.max(4, Math.max(i.size.x, i.size.y, i.size.z) * 2.4));
      s.position.copy(i.centroid);
      s.userData.base = strength;
      this.glows.push(s);
    });
  }

  // ----- picking & orbit -----

  /** Mesh key under a client point, or null. */
  pick(clientX, clientY) {
    for (const v of this.views.values()) {
      const r = v.el.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, v.camera);
      const hits = this.raycaster.intersectObjects(this.pickable, false).filter((h) => !LEG.has(h.object.userData.key) || h.point.y < 20);
      return hits.length ? hits[0].object.userData.key : null;
    }
    return null;
  }

  _attachOrbit(v) {
    if (v.handlers) return;
    let drag = null;
    const down = (e) => {
      // A new gesture: forget whether the previous one was a drag (a touch drag fires no click to clear it).
      delete v.el.dataset.dragged;
      if (drag) return; // one finger turns the foot; a second finger is ignored
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      v.el.setPointerCapture?.(e.pointerId);
      v.el.classList.add('dragging');
    };
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      v.anim = null;
      v.yaw -= dx * 0.0095;
      v.pitch = Math.max(-1.35, Math.min(1.35, v.pitch - dy * 0.0095));
    };
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved > 6) v.el.dataset.dragged = '1';
      drag = null;
      v.el.releasePointerCapture?.(e.pointerId);
      v.el.classList.remove('dragging');
    };
    v.el.addEventListener('pointerdown', down);
    v.el.addEventListener('pointermove', move);
    v.el.addEventListener('pointerup', up);
    v.el.addEventListener('pointercancel', up);
    v.handlers = { down, move, up };
    v.orbit = true;
  }

  _detachOrbit(v) {
    if (!v.handlers) return;
    const { down, move, up } = v.handlers;
    v.el.removeEventListener('pointerdown', down);
    v.el.removeEventListener('pointermove', move);
    v.el.removeEventListener('pointerup', up);
    v.el.removeEventListener('pointercancel', up);
    v.handlers = null;
    v.orbit = false;
  }

  // ----- frame -----

  frame(now) {
    const r = this.renderer;
    const W = window.innerWidth, H = window.innerHeight;
    if (r.getPixelRatio() !== Math.min(window.devicePixelRatio || 1, 2)) this.resize(); // moved to another display
    const dt = Math.min(0.05, (now - (this.lastT ?? now)) / 1000);
    this.lastT = now;
    // Fade the bones in over 0.7 s of wall-clock time (frame-count based fades crawl in throttled tabs).
    this.globalFade = Math.min(1, (now - this.t0) / 700);
    const fade = ease(this.globalFade);
    for (const m of Object.values(this.mats)) m.uniforms.uGlobal.value = fade;
    const pulse = 0.5 + 0.5 * Math.sin((now - this.t0) * 0.004);
    this.mats.target.uniforms.uPulse.value = pulse;
    for (const s of this.glows) s.material.opacity = s.userData.base * (0.75 + 0.25 * pulse) * fade;

    r.setScissorTest(false);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.setScissorTest(true);

    const legBase = this.mats.leg.uniforms.uOpacity;
    for (const v of this.views.values()) {
      const rect = v.el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.top > H || rect.right < 0 || rect.left > W) continue;
      if (!v.el.isConnected || v.el.closest('[hidden]')) continue;
      // Clip to the part of the view its scrolling screen actually shows (else it paints over the top bar).
      const box = v.el.closest('.screen')?.getBoundingClientRect();
      const top = Math.max(rect.top, box ? box.top : 0);
      const bottom = Math.min(rect.bottom, box ? box.bottom : H);
      if (bottom - top < 1) continue;
      this._updateCamera(v, now, dt, rect.width / rect.height);
      const x = rect.left;
      r.setViewport(x, H - rect.bottom, rect.width, rect.height);
      r.setScissor(x, H - bottom, rect.width, bottom - top);
      if (v.tint) {
        r.setClearColor(v.tint[0], v.tint[1]);
        r.clear(true, true, false);
        r.setClearColor(0x000000, 0);
      } else {
        r.clearDepth();
      }
      legBase.value = 0.42 * v.legOpacity;
      this.shadow.visible = v.camera.position.y > 2;
      r.render(this.scene, v.camera);
    }
  }

  _updateCamera(v, now, dt, aspect) {
    if (v.anim) {
      const a = v.anim;
      const k = Math.min(1, (now - a.t0) / a.dur);
      const e = ease(k);
      v.q.slerpQuaternions(a.q0, a.to.q, e);
      v.target.lerpVectors(a.target0, a.to.target, e);
      v.zoom = lerp(a.zoom0, a.to.zoom, e);
      v.legOpacity = lerp(a.leg0, a.to.leg, e);
      v.yaw = lerp(a.yaw0, 0, e);
      v.pitch = lerp(a.pitch0, 0, e);
      if (k >= 1) v.anim = null;
    }
    if (!this.reduced) v.spin += v.spinRate * dt;
    const sway = v.sway && !this.reduced ? Math.sin((now - this.t0) * 0.00042 + v.phase) * 0.11 : 0;
    // Turntable spin turns the foot about the world vertical; drag and sway orbit in screen space.
    const qSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), v.spin);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), v.yaw + sway);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), v.pitch);
    const q = qSpin.multiply(v.q).multiply(qYaw).multiply(qPitch);

    const cam = v.camera;
    cam.aspect = aspect;
    const dist = this._fitDistance(v, aspect) * v.zoom;
    cam.position.copy(v.target).add(this._tmp.set(0, 0, dist).applyQuaternion(q));
    cam.quaternion.copy(q);
    cam.near = Math.max(0.5, dist - 45);
    cam.far = dist + 70;
    cam.updateProjectionMatrix();
  }

  /**
   * Distance at which the whole foot fits the view for the pose orientation (ignoring sway and drag, so
   * the framing stays steady). Spinning views use a bounding sphere so the zoom doesn't pump as it turns.
   */
  _fitDistance(v, aspect) {
    const vf = THREE.MathUtils.degToRad(FOV);
    const tanV = Math.tan(vf / 2);
    const tanH = tanV * aspect;
    if (v.spinRate) {
      const hf = 2 * Math.atan(tanH);
      return FIT_RADIUS / Math.sin(Math.min(vf, hf) / 2);
    }
    const inv = this._inv.copy(v.q).invert();
    const p = this._tmp;
    let foot = 0;
    let leg = 0;
    for (let i = 0; i < this.fitPoints.length; i++) {
      p.copy(this.fitPoints[i]).sub(v.target).applyQuaternion(inv);
      const need = Math.max(Math.abs(p.x) / tanH, Math.abs(p.y) / tanV) * FIT_MARGIN + p.z;
      if (this.fitIsLeg[i]) { if (need > leg) leg = need; } else if (need > foot) foot = need;
    }
    // A mostly faded leg shouldn't shrink the foot; blend smoothly as the leg fades in and out.
    const t = THREE.MathUtils.smoothstep(v.legOpacity, 0.35, 0.85);
    return Math.max(foot, lerp(foot, leg, t));
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._onResize);
    this.clearViews();
    this.renderer.dispose();
  }
}

/** Stand-in used when WebGL is unavailable: same API, draws nothing. */
export class NullViewer {
  constructor() { this.views = new Map(); this.info = new Map(); }
  setView() {}
  removeView() {}
  clearViews() {}
  setPose() {}
  setHighlight() {}
  setHover() {}
  pick() { return null; }
  dispose() {}
}
