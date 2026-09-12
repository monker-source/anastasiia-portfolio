/**
 * Project page: vertical-only infinite canvas.
 * Sphere warp like the homepage moodboard. Horizontal pan locked.
 */

const stage = document.getElementById("stage");
const world = document.getElementById("world");
const hint = document.getElementById("hint");
const items = [...document.querySelectorAll("[data-item]")];
const hero = document.querySelector("[data-hero]");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const entering = new URLSearchParams(location.search).has("enter");

/** Must match homepage flyToProject target */
export function heroTargetSize() {
  const w = Math.min(window.innerWidth * 0.72, 880);
  return { w };
}

const state = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  dragging: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
  lastT: 0,
  moved: false,
  hintHidden: false,
  period: { w: 1, h: 2400 },
  sphere: { tiltX: 0, tiltY: 0, targetTiltX: 0, targetTiltY: 0 },
};

const FRICTION = reducedMotion ? 0.82 : 0.925;
const DRAG = 1;
const MAX_TILT = 5.5;
const MAX_DEPTH = 110;

function wrapCoord(local, pan, period) {
  return local + period * Math.round((-pan - local) / period);
}

function normalizePan() {
  const { h } = state.period;
  if (h > 0) {
    while (state.y > h / 2) state.y -= h;
    while (state.y < -h / 2) state.y += h;
  }
  state.x = 0;
  state.vx = 0;
}

function layoutItems(enterPayload = null) {
  const hx = window.innerWidth / 2;
  const hy = window.innerHeight / 2;
  const base = Math.max(window.innerWidth, 900);
  const { w: heroW } = heroTargetSize();

  // Hero first — exact size shared with homepage transition
  if (hero) {
    const w = enterPayload?.w || heroW;
    const aspect =
      enterPayload?.h && enterPayload?.w
        ? enterPayload.h / enterPayload.w
        : 422 / 750;
    hero.style.width = `${w}px`;
    hero.style.height = `${w * aspect}px`;
    hero.style.aspectRatio = "";
    hero.dataset.lx = "0";
    hero.dataset.ly = "0";
  }

  let cursorY = 0;
  if (hero) {
    const heroH = hero.offsetHeight || heroW * (422 / 750);
    cursorY = heroH / 2 + Math.max(hy * 0.28, 160);
  }

  items.forEach((el) => {
    if (el === hero) return;

    const ox = Number(el.dataset.ox) || 0;
    const wf = Number(el.dataset.wf);
    const x = ox * hx;

    if (wf) {
      const w = Math.min(820, Math.max(260, base * wf));
      el.style.width = `${w}px`;
    }

    // Stack copy + media below the hero with breathing room
    const h = el.offsetHeight || hy * 0.6;
    const y = cursorY + h / 2;
    cursorY = y + h / 2 + Math.max(hy * 0.22, 120);

    el.dataset.lx = String(x);
    el.dataset.ly = String(y);
  });

  computePeriod();
  state.y = 0;
}

function computePeriod() {
  let minY = 0;
  let maxY = 0;

  items.forEach((el) => {
    const y = Number(el.dataset.ly);
    const h = el.offsetHeight || window.innerHeight * 0.5;
    minY = Math.min(minY, y - h / 2);
    maxY = Math.max(maxY, y + h / 2);
  });

  const gapY = Math.max(window.innerHeight * 0.2, 120);
  state.period = {
    w: 1,
    h: Math.max(maxY - minY + gapY, window.innerHeight * 1.5),
  };
}

function hideHint() {
  if (state.hintHidden || !hint) return;
  state.hintHidden = true;
  hint.classList.add("is-hidden");
}

function updateSphereFromVelocity() {
  const speed = Math.abs(state.vy);
  const damp = Math.min(1, speed / 28);
  state.sphere.targetTiltX = (-state.vy / 40) * damp;
  state.sphere.targetTiltY = 0;
  state.sphere.targetTiltX = Math.max(-MAX_TILT, Math.min(MAX_TILT, state.sphere.targetTiltX));
}

function peripheryScale(dx, dy) {
  // Mild size falloff — full at center, no smaller than 0.75
  const dist = Math.min(1.2, Math.hypot(dx, dy));
  return Math.max(0.75, 1 - dist * 0.22);
}

function warpItems() {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const { h: ph } = state.period;

  items.forEach((el) => {
    const baseX = Number(el.dataset.lx);
    const baseY = Number(el.dataset.ly);
    const lx = baseX;
    const ly = wrapCoord(baseY, state.y, ph);

    const sx = cx + state.x + lx;
    const sy = cy + state.y + ly;
    const dx = (sx - cx) / cx;
    const dy = (sy - cy) / cy;
    const r2 = dx * dx + dy * dy;

    const depth = Math.max(-MAX_DEPTH, -r2 * MAX_DEPTH);
    const scale = peripheryScale(dx, dy);
    const bendX = dy * r2 * 3.2;
    const bendY = -dx * r2 * 3.2;

    el.style.transform = `translate3d(${lx}px, ${ly}px, ${depth.toFixed(2)}px) translate(-50%, -50%) rotateX(${bendX.toFixed(2)}deg) rotateY(${bendY.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
  });
}

function render() {
  const { tiltX, tiltY } = state.sphere;
  world.style.transform = `translate3d(0px, ${state.y}px, 0) rotateX(${tiltX.toFixed(3)}deg) rotateY(${tiltY.toFixed(3)}deg)`;
  warpItems();
}

function tick() {
  if (!state.dragging) {
    state.y += state.vy;
    state.vy *= FRICTION;
    if (Math.abs(state.vy) < 0.02) state.vy = 0;
  }

  normalizePan();
  updateSphereFromVelocity();
  state.sphere.tiltX += (state.sphere.targetTiltX - state.sphere.tiltX) * 0.12;
  state.sphere.tiltY += (state.sphere.targetTiltY - state.sphere.tiltY) * 0.12;

  if (!state.dragging && state.vy === 0) {
    state.sphere.targetTiltX *= 0.9;
  }

  render();
  requestAnimationFrame(tick);
}

function onPointerDown(e) {
  // Let slideshow receive clicks / horizontal interaction
  if (e.target.closest(".contact a, .project-back, [data-slideshow]")) return;
  if (e.button !== undefined && e.button !== 0) return;

  state.dragging = true;
  state.pointerId = e.pointerId;
  state.lastX = e.clientX;
  state.lastY = e.clientY;
  state.lastT = performance.now();
  state.moved = false;
  state.vx = 0;
  state.vy = 0;
  stage.classList.add("is-dragging");
  try {
    stage.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

function onPointerMove(e) {
  if (!state.dragging || e.pointerId !== state.pointerId) return;

  const now = performance.now();
  const dt = Math.max(8, now - state.lastT);
  const dy = e.clientY - state.lastY;

  if (Math.abs(dy) > 10 || Math.abs(e.clientX - state.lastX) > 10) state.moved = true;

  if (state.moved) {
    state.y += dy * DRAG;
    state.vy = (dy / dt) * 16;
    hideHint();
  }

  state.lastX = e.clientX;
  state.lastY = e.clientY;
  state.lastT = now;
}

function onPointerUp(e) {
  if (!state.dragging || e.pointerId !== state.pointerId) return;
  state.dragging = false;
  state.pointerId = null;
  stage.classList.remove("is-dragging");
}

function onWheel(e) {
  e.preventDefault();
  state.vy -= e.deltaY * 0.08;
  hideHint();
}

function readEnterPayload() {
  try {
    const raw = sessionStorage.getItem("projectEnter");
    sessionStorage.removeItem("projectEnter");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function mountHandOffFlyer(payload) {
  if (!payload || reducedMotion) return null;
  const flyer = document.createElement("figure");
  flyer.className = "tile-flyer tile-flyer--handoff";
  flyer.innerHTML = `<img src="${payload.src}" alt="" draggable="false" />`;
  flyer.style.left = `${payload.left}px`;
  flyer.style.top = `${payload.top}px`;
  flyer.style.width = `${payload.w}px`;
  flyer.style.height = `${payload.h}px`;
  flyer.style.transform = "rotate(0deg)";
  document.body.appendChild(flyer);
  return flyer;
}

function finishEnter() {
  const payload = entering ? readEnterPayload() : null;
  const handoff = entering ? mountHandOffFlyer(payload) : null;

  layoutItems(payload);

  state.y = 0;
  document.body.classList.remove("is-entering");
  world.style.opacity = "1";
  render();

  if (handoff) {
    requestAnimationFrame(() => {
      handoff.style.transition = "opacity 0.28s ease";
      handoff.style.opacity = "0";
      setTimeout(() => handoff.remove(), 300);
    });
  }
}

if (entering) {
  document.body.classList.add("is-entering");
}

layoutItems();
render();
requestAnimationFrame(tick);

if (document.readyState === "complete") {
  finishEnter();
} else {
  window.addEventListener("load", finishEnter, { once: true });
}

stage.addEventListener("pointerdown", onPointerDown);
stage.addEventListener("pointermove", onPointerMove);
stage.addEventListener("pointerup", onPointerUp);
stage.addEventListener("pointercancel", onPointerUp);
stage.addEventListener("wheel", onWheel, { passive: false });

window.addEventListener("resize", () => {
  layoutItems();
  state.y = 0;
  render();
});

stage.addEventListener("dragstart", (e) => e.preventDefault());
