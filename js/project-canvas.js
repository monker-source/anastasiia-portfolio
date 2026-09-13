/**
 * Project page: vertical-only infinite canvas.
 * Horizontal pan locked. No spherical warp — flat layout.
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
  const w = Math.min(window.innerWidth * 0.84, 1080);
  return { w };
}

/** Local Y so the hero sits in the upper band (text readable below). */
function heroAnchorY(heroH) {
  const topPad = Math.max(window.innerHeight * 0.035, 36);
  return topPad + heroH / 2 - window.innerHeight / 2;
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
  tapSlideshow: null,
  period: { w: 1, h: 2400 },
};

const FRICTION = reducedMotion ? 0.82 : 0.925;
const DRAG = 1;

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
  const mobile = window.innerWidth <= 700;

  // Hero first — exact size shared with homepage transition
  let heroLy = 0;
  if (hero) {
    const w = enterPayload?.w || heroW;
    const aspect =
      enterPayload?.h && enterPayload?.w
        ? enterPayload.h / enterPayload.w
        : 422 / 750;
    hero.style.width = `${w}px`;
    hero.style.height = `${w * aspect}px`;
    hero.style.aspectRatio = "";
    const heroH = hero.offsetHeight || w * aspect;
    heroLy = heroAnchorY(heroH);
    hero.dataset.lx = "0";
    hero.dataset.ly = String(heroLy);
  }

  let cursorY = 0;
  if (hero) {
    const heroH = hero.offsetHeight || heroW * (422 / 750);
    // Keep copy (title + body) snug under the hero — one visual unit
    const afterHero = mobile ? Math.max(hy * 0.06, 28) : Math.max(hy * 0.045, 22);
    cursorY = heroLy + heroH / 2 + afterHero;
  }

  items.forEach((el) => {
    if (el === hero) return;

    const ox = Number(el.dataset.ox) || 0;
    const wf = Number(el.dataset.wf);
    const x = ox * hx;

    if (wf) {
      const w = Math.min(1100, Math.max(280, base * wf));
      el.style.width = `${w}px`;
    }

    const h = el.offsetHeight || hy * 0.6;
    const gapAfter = mobile ? Math.max(hy * 0.12, 56) : Math.max(hy * 0.12, 64);

    const y = cursorY + h / 2;
    cursorY = y + h / 2 + gapAfter;

    el.dataset.lx = String(mobile ? 0 : x);
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

function placeItems() {
  const { h: ph } = state.period;

  items.forEach((el) => {
    const lx = Number(el.dataset.lx);
    const ly = wrapCoord(Number(el.dataset.ly), state.y, ph);
    el.style.transform = `translate3d(${lx}px, ${ly}px, 0) translate(-50%, -50%)`;
  });
}

function render() {
  world.style.transform = `translate3d(0px, ${state.y}px, 0)`;
  placeItems();
}

function tick() {
  if (!state.dragging) {
    state.y += state.vy;
    state.vy *= FRICTION;
    if (Math.abs(state.vy) < 0.02) state.vy = 0;
  }

  normalizePan();
  render();
  requestAnimationFrame(tick);
}

function onPointerDown(e) {
  // Links / chrome only — slideshow area must still allow vertical pan on mobile
  const overSlideshow = !!e.target.closest("[data-slideshow]");
  const overUi = !!e.target.closest(
    ".contact a, .site-brand, [data-slideshow-prev], [data-slideshow-next]"
  );
  if (overUi) return;
  if (e.button !== undefined && e.button !== 0) return;

  state.dragging = true;
  state.pointerId = e.pointerId;
  state.lastX = e.clientX;
  state.lastY = e.clientY;
  state.lastT = performance.now();
  state.moved = false;
  state.vx = 0;
  state.vy = 0;
  state.tapSlideshow = overSlideshow
    ? e.target.closest("[data-slideshow]")
    : null;
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
  const wasDrag = state.moved;
  const tapSlideshow = state.tapSlideshow;
  const upX = e.clientX;
  state.dragging = false;
  state.pointerId = null;
  state.tapSlideshow = null;
  stage.classList.remove("is-dragging");

  // Tap on slideshow (no pan): flip slide. Vertical drag pans the canvas instead.
  if (!wasDrag && tapSlideshow) {
    window.__slideshowTapLock = performance.now();
    tapSlideshow.dispatchEvent(
      new CustomEvent("canvas-slideshow-tap", {
        bubbles: true,
        detail: { clientX: upX },
      })
    );
  }
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

let vtEnter = Boolean(window.__projectVtEnter);
let enterPayloadCache = null;

if (entering) {
  document.documentElement.classList.add("is-entering");
  document.body.classList.add("is-entering");
  if (vtEnter) {
    document.documentElement.classList.add("is-vt-enter");
    document.body.classList.add("is-vt-enter");
  }
}

function finishEnter() {
  vtEnter = vtEnter || Boolean(window.__projectVtEnter);
  if (vtEnter) {
    document.documentElement.classList.add("is-vt-enter");
    document.body.classList.add("is-vt-enter");
  }

  const payload = entering ? readEnterPayload() : null;
  enterPayloadCache = payload;
  const useHandoff = entering && !vtEnter && !reducedMotion;
  const handoff = useHandoff ? mountHandOffFlyer(payload) : null;

  layoutItems(payload);

  state.y = 0;
  render();

  const reveal = () => {
    // Credits stay visible across the handoff — only fade hint
    const chrome = [...document.querySelectorAll(".hint")];
    chrome.forEach((el) => {
      el.style.opacity = "0";
      el.style.transition = "none";
    });

    const animateCopy = entering && !reducedMotion;
    if (animateCopy) {
      document.body.classList.add("is-copy-pending");
    }

    document.documentElement.classList.remove("is-entering", "is-vt-enter");
    document.body.classList.remove("is-entering", "is-vt-enter");
    world.style.opacity = "1";
    render();

    requestAnimationFrame(() => {
      chrome.forEach((el) => {
        el.style.transition = "opacity 0.45s ease";
        el.style.opacity = "1";
      });
      setTimeout(() => {
        chrome.forEach((el) => {
          el.style.transition = "";
          el.style.opacity = "";
        });
      }, 500);

      if (animateCopy) {
        // Two frames: pending (opacity 0) → reveal (staggered fade/slide up)
        requestAnimationFrame(() => {
          document.body.classList.add("is-copy-reveal");
          document.body.classList.remove("is-copy-pending");
          setTimeout(() => {
            document.body.classList.remove("is-copy-reveal");
          }, 1400);
        });
      }
    });

    if (handoff) {
      requestAnimationFrame(() => {
        handoff.style.transition = "opacity 0.4s ease";
        handoff.style.opacity = "0";
        setTimeout(() => handoff.remove(), 420);
      });
    }
  };

  const vt = window.__projectVt;
  if (vtEnter && vt && vt.finished) {
    vt.finished.then(reveal).catch(reveal);
  } else {
    // Wait two frames so the handoff flyer is painted before chrome fades in
    requestAnimationFrame(() => requestAnimationFrame(reveal));
  }
}

layoutItems();
render();
requestAnimationFrame(tick);

let enterDone = false;
function runEnterOnce() {
  if (enterDone) return;
  enterDone = true;
  finishEnter();
}

function armEnter() {
  if (!entering) {
    runEnterOnce();
    return;
  }

  let armed = false;
  const proceed = (fromVt) => {
    if (armed) return;
    armed = true;
    if (fromVt) {
      vtEnter = true;
      document.documentElement.classList.add("is-vt-enter");
      document.body.classList.add("is-vt-enter");
    }
    runEnterOnce();
  };

  if (window.__projectVtEnter) {
    proceed(true);
    return;
  }

  // Wait for pagereveal so VT detection + hero snapshot sizing stay in sync
  if ("onpagereveal" in window) {
    window.addEventListener(
      "pagereveal",
      (e) => {
        if (e.viewTransition) {
          window.__projectVtEnter = true;
          window.__projectVt = e.viewTransition;
        }
        proceed(Boolean(e.viewTransition));
      },
      { once: true }
    );
    setTimeout(() => proceed(false), 150);
  } else {
    proceed(false);
  }
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  armEnter();
} else {
  document.addEventListener("DOMContentLoaded", armEnter, { once: true });
}

window.addEventListener(
  "load",
  () => {
    if (entering) {
      // Keep enter payload sizing — avoid hero jump after the seamless handoff
      layoutItems(enterPayloadCache);
      render();
      return;
    }
    layoutItems();
    render();
  },
  { once: true }
);

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
