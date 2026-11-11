// 3D viewer: structures drawn like an ink study on paper, the one being asked about in solid red.
//
// One full-window transparent canvas sits under the UI. Each "view" is a DOM element; every frame the
// scene is drawn into that element's rectangle with its own camera (scissor test). The element itself
// stays transparent so the canvas shows through it.
//
// World frame (see tools/pack-*.mjs): centimetres, +Y up, +Z anterior, +X the body's left.
// (The foot pack is a right foot with its sole on y = 0, so there +X is also medial.)

import * as THREE from 'three';

const FOV = 30;
const FIT_MARGIN = 1.2;

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Camera presets: direction from the target to the camera, the screen-up vector, and how visible context meshes are. */
export const POSES = {
  // foot
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
  // general (skull, organs)
  front: { dir: [0, 0.06, 1], up: [0, 1, 0], leg: 1 },
  back: { dir: [0, 0.06, -1], up: [0, 1, 0], leg: 1 },
  right: { dir: [-1, 0.06, 0.02], up: [0, 1, 0], leg: 1 },
  left: { dir: [1, 0.06, 0.02], up: [0, 1, 0], leg: 1 },
  top: { dir: [0, 1, 0.04], up: [0, 0, -1], leg: 1 },
  bottom: { dir: [0, -1, 0.04], up: [0, 0, 1], leg: 1 },
  frontRight: { dir: [-0.62, 0.2, 0.78], up: [0, 1, 0], leg: 1 },
  frontLeft: { dir: [0.62, 0.2, 0.78], up: [0, 1, 0], leg: 1 },
  backRight: { dir: [-0.62, 0.2, -0.78], up: [0, 1, 0], leg: 1 },
  backLeft: { dir: [0.62, 0.2, -0.78], up: [0, 1, 0], leg: 1 },
  below: { dir: [0, -0.9, 0.5], up: [0, 1, 0], leg: 1 },
};

export const POSE_LABEL = {
  dorsal: 'dorsal view', plantar: 'plantar view (sole)', dorsalWide: 'dorsal view', plantarWide: 'plantar view (sole)',
  lateral: 'lateral view', medial: 'medial view',
  dorsolateral: 'dorsolateral view', dorsomedial: 'dorsomedial view', plantarLateral: 'plantar-lateral view',
  plantarMedial: 'plantar-medial view', anterior: 'anterior view', posterior: 'posterior view', hero: 'oblique view',
  front: 'anterior view', back: 'posterior view', right: 'right lateral view', left: 'left lateral view',
  top: 'superior view', bottom: 'inferior view', frontRight: 'right anterior oblique', frontLeft: 'left anterior oblique',
  backRight: 'right posterior oblique', backLeft: 'left posterior oblique', below: 'from below',
};

// ---------- mesh packs ----------

/** Load a region's packed meshes: inline base64 (single-file build) or fetched from assets/<id>.pack. */
export async function loadPack(id) {
  const inline = document.getElementById(`pack-${id}`);
  if (inline && inline.textContent.trim()) {
    const bin = atob(inline.textContent.trim());
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return parsePack(u8.buffer);
  }
  const res = await fetch(`assets/${id}.pack`);
  if (!res.ok) throw new Error(`could not load the ${id} models (${res.status})`);
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
varying vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vV = -mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

// "Ink wash": a faint tone over the whole surface that deepens toward the silhouette, like a pencil study.
// Context meshes (e.g. the leg above the foot) fade out with distance from the centre.
const INK_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uCore;
uniform float uPower;
uniform vec3 uCenter;
uniform vec2 uFade;
uniform float uGlobal;
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
void main() {
  float ndv = abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(1.0 - ndv, uPower);
  float a = uOpacity * uGlobal * (uCore + (1.0 - uCore) * rim);
  a *= 1.0 - smoothstep(uFade.x, uFade.y, distance(vW, uCenter));
  gl_FragColor = vec4(uColor * a, a);
}`;

// Solid and softly lit, with a darker edge: the structure being asked about.
const SOLID_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uEdge;
uniform float uOpacity;
uniform float uPulse;
uniform float uGlobal;
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float ndv = clamp(dot(n, normalize(vV)), 0.0, 1.0);
  vec3 l = normalize(vec3(0.35, 0.8, 0.5));
  float diff = 0.62 + 0.38 * max(dot(n, l), 0.0);
  vec3 col = uColor * diff * (1.0 + 0.07 * uPulse);
  col = mix(col, uEdge, pow(1.0 - ndv, 2.4) * 0.75);
  float a = uOpacity * uGlobal;
  gl_FragColor = vec4(col * a, a);
}`;

const hex3 = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

function inkMaterial({ color, opacity, core = 0.05, power = 1.5 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: hex3(color) }, uOpacity: { value: opacity }, uCore: { value: core }, uPower: { value: power },
      uCenter: { value: new THREE.Vector3() }, uFade: { value: new THREE.Vector2(1e5, 1e6) }, uGlobal: { value: 0 },
    },
    vertexShader: VERT, fragmentShader: INK_FRAG,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending, premultipliedAlpha: true, side: THREE.DoubleSide,
  });
}

function solidMaterial({ color, edge, opacity = 0.97 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: hex3(color) }, uEdge: { value: hex3(edge) }, uOpacity: { value: opacity }, uPulse: { value: 0 }, uGlobal: { value: 0 },
    },
    vertexShader: VERT, fragmentShader: SOLID_FRAG,
    transparent: true, depthWrite: true, depthTest: true, blending: THREE.NormalBlending, premultipliedAlpha: true, side: THREE.DoubleSide,
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
  const p = POSES[name] || POSES.front;
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...p.dir).normalize(), new THREE.Vector3(), new THREE.Vector3(...p.up));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

// ---------- viewer ----------

export class Viewer {
  constructor(canvas, palette = {}) {
    this.canvas = canvas;
    this.palette = {
      ink: '#3b342c', target: '#cf3a2b', targetEdge: '#6e1710', hover: '#c58a1f', hoverEdge: '#6b4708',
      secondary: '#2f6690', secondaryEdge: '#17364f', ...palette,
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
    this.center = new THREE.Vector3();
    this.radius = 12;
    this.fadeAt = Infinity;
    this.context = new Set();

    const P = this.palette;
    this.mats = {
      ink: inkMaterial({ color: P.ink, opacity: 0.5 }),
      context: inkMaterial({ color: P.ink, opacity: 0.42 }),
      target: solidMaterial({ color: P.target, edge: P.targetEdge }),
      hover: solidMaterial({ color: P.hover, edge: P.hoverEdge, opacity: 0.9 }),
      secondary: solidMaterial({ color: P.secondary, edge: P.secondaryEdge, opacity: 0.88 }),
    };

    this.meshes = new Map();
    this.info = new Map();
    this.pickable = [];
    this.fitPoints = [];
    this.fitIsContext = [];
    this._tmp = new THREE.Vector3();
    this._inv = new THREE.Quaternion();

    // Soft contact shadow under the model.
    const shadowTex = radialTexture([[0, 'rgba(0,0,0,0.3)'], [0.55, 'rgba(0,0,0,0.12)'], [1, 'rgba(0,0,0,0)']]);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x2a2018, transparent: true, depthWrite: false, depthTest: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 0;
    this.shadow.visible = false;
    this.scene.add(this.shadow);

    // Soft tinted halo behind highlighted structures (helps find small or deep ones).
    this.glowTex = radialTexture([[0, 'rgba(255,255,255,0.85)'], [0.4, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
    this.spritePool = [];
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

  /** Swap in a region's meshes. `opts.inkOpacity` tunes how dark the un-highlighted structures are drawn. */
  setPack(pack, opts = {}) {
    for (const mesh of this.meshes.values()) { this.scene.remove(mesh); mesh.geometry.dispose(); }
    this.meshes.clear();
    this.info.clear();
    this.targets = new Set();
    this.secondary = new Set();
    this.hovered = null;
    const h = pack.header;
    this.packId = h.region || 'foot';
    this.center.fromArray(h.center || [0, 0, 0]);
    this.radius = h.radius || 12;
    this.context = new Set(h.context || []);
    const fade = h.fade || [1e5, 1e6];
    this.fadeAt = fade[0];
    this.mats.ink.uniforms.uOpacity.value = opts.inkOpacity ?? 0.5;
    this.mats.ink.uniforms.uCore.value = opts.inkCore ?? 0.05;
    this.contextOpacity = (opts.inkOpacity ?? 0.5) * 0.85;
    this.mats.context.uniforms.uCenter.value.copy(this.center);
    this.mats.context.uniforms.uFade.value.set(fade[0], fade[1]);

    this.fitPoints = [];
    this.fitIsContext = [];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const m of pack.meshes) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
      g.setIndex(new THREE.BufferAttribute(m.indices, 1));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const ctx = this.context.has(m.key);
      const mesh = new THREE.Mesh(g, ctx ? this.mats.context : this.mats.ink);
      mesh.userData.key = m.key;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      this.meshes.set(m.key, mesh);
      this.info.set(m.key, {
        centroid: new THREE.Vector3(...m.centroid),
        min: new THREE.Vector3(...m.min), max: new THREE.Vector3(...m.max),
        size: new THREE.Vector3(m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]),
      });
      // Points used to frame the model: every box corner (context meshes only near the centre).
      const c = this.center.toArray();
      const clip = (v, a) => (ctx ? Math.max(c[a] - this.radius * 0.5, Math.min(c[a] + this.radius * 0.5, v)) : v);
      for (const x of [m.min[0], m.max[0]]) for (const y of [m.min[1], m.max[1]]) for (const z of [m.min[2], m.max[2]]) {
        this.fitPoints.push(new THREE.Vector3(clip(x, 0), clip(y, 1), clip(z, 2)));
        this.fitIsContext.push(ctx);
      }
      if (!ctx) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], m.min[a]); hi[a] = Math.max(hi[a], m.max[a]); }
    }
    this.pickable = [...this.meshes.values()];
    const floor = h.floorY ?? lo[1];
    this.shadow.scale.set((hi[0] - lo[0]) * 1.5, (hi[2] - lo[2]) * 1.35, 1);
    this.shadow.position.set((lo[0] + hi[0]) / 2, floor - this.radius * 0.05, (lo[2] + hi[2]) / 2);
    this.floorY = floor;
    this.t0 = performance.now(); // fade the new model in
    this._buildGlows();
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
        q: poseQuaternion(opts.pose || 'front'), target: this.center.clone(), zoom: 1,
        yaw: 0, pitch: 0, spin: 0, spinRate: 0, sway: true, legOpacity: 1, anim: null, tint: null,
        phase: name.length * 1.7, orbit: false, handlers: null,
      };
      this.views.set(name, v);
    }
    v.sway = opts.sway ?? true;
    v.spinRate = opts.spin ?? 0;
    v.tint = opts.tint ?? null;
    if (opts.orbit) this._attachOrbit(v); else this._detachOrbit(v);
    this.setPose(name, opts.pose || 'front', { ...opts, duration: opts.duration ?? 0 });
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
    const P = POSES[pose] || POSES.front;
    const to = { q: poseQuaternion(pose), target: this.focusPoint(focus, focusAmount), zoom, leg: leg ?? P.leg };
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

  /** Top and sole views of the foot lie sideways when the view is much wider than tall. */
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
    const p = this.center.clone();
    if (!keys?.length || !amount) return p;
    const c = new THREE.Vector3();
    let n = 0;
    for (const k of keys) {
      const i = this.info.get(k);
      if (i) { c.add(i.centroid); n++; }
    }
    if (!n) return p;
    return p.lerp(c.divideScalar(n), amount);
  }

  /** A zoom (1 = whole model) and focus amount that bring small structures closer without losing context. */
  framingFor(keys) {
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const k of keys || []) {
      const i = this.info.get(k);
      if (i) { lo.min(i.min); hi.max(i.max); }
    }
    if (!Number.isFinite(lo.x)) return { zoom: 1, focusAmount: 0 };
    const extent = hi.distanceTo(lo) / 2;
    const zoom = Math.max(0.42, Math.min(1, 0.36 + (extent / this.radius) * 0.95));
    return { zoom, focusAmount: Math.min(0.9, (1 - zoom) * 1.6) };
  }

  // ----- highlighting -----

  /** Paint these meshes solid red (what is being asked). `secondary` meshes are painted blue (a mix-up). */
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
      let mat = this.context.has(key) ? this.mats.context : this.mats.ink;
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
    const wanted = [
      ...[...this.targets].map((k) => [k, this.palette.target, this.targets.size > 2 ? 0.1 : 0.2]),
      ...[...this.secondary].map((k) => [k, this.palette.secondary, 0.14]),
    ].filter(([k]) => this.info.has(k));
    while (this.spritePool.length < wanted.length) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthTest: false, depthWrite: false }));
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
      s.scale.setScalar(Math.max(this.radius * 0.3, Math.max(i.size.x, i.size.y, i.size.z) * 2.2));
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
      const hits = this.raycaster.intersectObjects(this.pickable, false)
        .filter((h) => !this.context.has(h.object.userData.key) || h.point.distanceTo(this.center) < this.fadeAt + 4);
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
      if (drag) return; // one finger turns the model; a second finger is ignored
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
    // Fade the model in over 0.6 s of wall-clock time (frame-count based fades crawl in throttled tabs).
    const fade = ease(Math.min(1, Math.max(0, (now - this.t0) / 600)));
    for (const m of Object.values(this.mats)) m.uniforms.uGlobal.value = fade;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);
    this.mats.target.uniforms.uPulse.value = pulse;
    for (const s of this.glows) s.material.opacity = s.userData.base * (0.8 + 0.2 * pulse) * fade;
    this.shadow.material.opacity = fade;

    r.setScissorTest(false);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    if (!this.meshes.size) return;
    r.setScissorTest(true);

    const ctxOpacity = this.mats.context.uniforms.uOpacity;
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
      ctxOpacity.value = (this.contextOpacity ?? 0.42) * v.legOpacity;
      this.shadow.visible = v.camera.position.y > this.floorY + this.radius * 0.15;
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
    const sway = v.sway && !this.reduced ? Math.sin(now * 0.00042 + v.phase) * 0.11 : 0;
    // Turntable spin turns the model about the world vertical; drag and sway orbit in screen space.
    const qSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), v.spin);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), v.yaw + sway);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), v.pitch);
    const q = qSpin.multiply(v.q).multiply(qYaw).multiply(qPitch);

    const cam = v.camera;
    cam.aspect = aspect;
    const dist = this._fitDistance(v, aspect) * v.zoom;
    cam.position.copy(v.target).add(this._tmp.set(0, 0, dist).applyQuaternion(q));
    cam.quaternion.copy(q);
    cam.near = Math.max(0.5, dist - this.radius * 4);
    cam.far = dist + this.radius * 6;
    cam.updateProjectionMatrix();
  }

  /**
   * Distance at which the whole model fits the view for the pose orientation (ignoring sway and drag, so
   * the framing stays steady). Spinning views use a bounding sphere so the zoom doesn't pump as it turns.
   */
  _fitDistance(v, aspect) {
    const vf = THREE.MathUtils.degToRad(FOV);
    const tanV = Math.tan(vf / 2);
    const tanH = tanV * aspect;
    if (v.spinRate || v.orbit) {
      const hf = 2 * Math.atan(tanH);
      return (this.radius * 1.02) / Math.sin(Math.min(vf, hf) / 2);
    }
    const inv = this._inv.copy(v.q).invert();
    const p = this._tmp;
    let main = 0;
    let ctx = 0;
    for (let i = 0; i < this.fitPoints.length; i++) {
      p.copy(this.fitPoints[i]).sub(this.center).applyQuaternion(inv);
      const need = Math.max(Math.abs(p.x) / tanH, Math.abs(p.y) / tanV) * FIT_MARGIN + p.z;
      if (this.fitIsContext[i]) { if (need > ctx) ctx = need; } else if (need > main) main = need;
    }
    // Faded context shouldn't shrink the model; blend smoothly as it fades in and out.
    const t = THREE.MathUtils.smoothstep(v.legOpacity, 0.35, 0.85);
    return Math.max(main, lerp(main, ctx, t));
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
  constructor() { this.views = new Map(); this.info = new Map(); this.packId = null; }
  setPack(pack) { this.packId = pack?.header?.region || 'foot'; }
  setView() {}
  removeView() {}
  clearViews() {}
  setPose() {}
  setHighlight() {}
  setHover() {}
  framingFor() { return { zoom: 1, focusAmount: 0 }; }
  poseOf() { return undefined; }
  pick() { return null; }
  dispose() {}
}
