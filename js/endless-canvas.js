/**
 * Endless drag canvas: bio at origin, project tiles scattered around.
 * Toroidal wrap — drag far enough and you return to the same start.
 * Soft spherical warp via perspective + per-tile depth from viewport center.
 */

const stage = document.getElementById("stage");
const world = document.getElementById("world");
const hint = document.getElementById("hint");
const tiles = [...document.querySelectorAll(".tile")];
const bio = document.getElementById("bio-block");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  transitioning: false,
  hitLink: null,
  hitTile: null,
  stackMode: false,
  period: { w: 3200, h: 2400 },
  sphere: { tiltX: 0, tiltY: 0, targetTiltX: 0, targetTiltY: 0 },
};

const FRICTION = reducedMotion ? 0.82 : 0.925;
const DRAG = 1;
const MAX_TILT = 5.5;
const MAX_DEPTH = 95;

function wrapCoord(local, pan, period) {
  // Nearest replica of this item relative to the current view
  return local + period * Math.round((-pan - local) / period);
}

function normalizePan() {
  const { w, h } = state.period;
  if (isMobileLayout()) {
    state.x = 0;
    state.vx = 0;
  } else if (w > 0) {
    while (state.x > w / 2) state.x -= w;
    while (state.x < -w / 2) state.x += w;
  }
  if (h > 0) {
    while (state.y > h / 2) state.y -= h;
    while (state.y < -h / 2) state.y += h;
  }
}

function isMobileLayout() {
  return state.stackMode || window.innerWidth <= 700;
}

function setStackMode(on) {
  state.stackMode = Boolean(on);
  document.body.classList.toggle("is-projects-stack", state.stackMode);
  const allBtn = document.querySelector(".site-all");
  if (allBtn) {
    allBtn.setAttribute("aria-pressed", state.stackMode ? "true" : "false");
    allBtn.classList.toggle("is-active", state.stackMode);
  }
  state.x = 0;
  state.y = 0;
  state.vx = 0;
  state.vy = 0;
  layoutTiles();
  render();
  if (state.stackMode) hideHint();
}

/** Mobile vertical strip: negative = gap between tiles (px). */
const MOBILE_TILE_SPACING = -70;

function mobileStackStep(height, spacing) {
  if (spacing >= 0) {
    return height - Math.min(spacing, height * 0.85);
  }
  return height - spacing; // spacing negative → adds gap
}

function layoutTiles() {
  const hx = window.innerWidth / 2;
  const hy = window.innerHeight / 2;
  const mobile = isMobileLayout();
  // Large tiles relative to viewport so start view is mostly peeks
  const base = Math.max(window.innerWidth, 900);

  if (mobile) {
    // Keep intro clear; stack peeks above / below with fixed spacing
    // Desktop ALL PROJECTS uses most of the width; real phones stay compact
    const tileW = state.stackMode && window.innerWidth > 700
      ? Math.min(window.innerWidth * 0.84, 1120)
      : Math.min(window.innerWidth * 0.92, 380);
    const spacing = MOBILE_TILE_SPACING;
    const bioGap = Math.max(window.innerHeight * 0.05, 22);
    const bioH = bio?.offsetHeight || Math.min(window.innerHeight * 0.55, 420);
    const clearHalf = bioH / 2 + bioGap;

    tiles.forEach((tile) => {
      const rot = Number(tile.dataset.rot) || 0;
      tile.style.width = `${tileW}px`;
      tile.dataset.lx = "0";
      tile.dataset.lrot = String(rot * 0.4);
    });

    const above = tiles
      .filter((t) => Number(t.dataset.oy) < 0)
      .sort((a, b) => Number(b.dataset.oy) - Number(a.dataset.oy));
    let cursor = -clearHalf;
    above.forEach((tile) => {
      const h = tile.offsetHeight || tileW * 0.65;
      const y = cursor - h / 2;
      tile.dataset.ly = String(y);
      cursor = y - mobileStackStep(h, spacing) + h / 2;
    });

    const below = tiles
      .filter((t) => Number(t.dataset.oy) >= 0)
      .sort((a, b) => Number(a.dataset.oy) - Number(b.dataset.oy));
    cursor = clearHalf;
    below.forEach((tile) => {
      const h = tile.offsetHeight || tileW * 0.65;
      const y = cursor + h / 2;
      tile.dataset.ly = String(y);
      cursor = y - h / 2 + mobileStackStep(h, spacing);
    });
  } else {
    tiles.forEach((tile) => {
      const ox = Number(tile.dataset.ox);
      const oy = Number(tile.dataset.oy);
      const wf = Number(tile.dataset.wf);
      const rot = Number(tile.dataset.rot) || 0;
      const w = Math.min(530, Math.max(290, base * wf * 0.7));
      const x = ox * hx;
      const y = oy * hy;

      tile.style.width = `${w}px`;
      tile.dataset.lx = String(x);
      tile.dataset.ly = String(y);
      tile.dataset.lrot = String(rot);
    });
  }

  computePeriod();
  if (mobile) {
    state.x = 0;
    state.vx = 0;
  }
}

function computePeriod() {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;

  const mobile = isMobileLayout();
  const bioW = bio?.offsetWidth || 1100;
  const bioH = bio?.offsetHeight || 500;
  minX = Math.min(minX, -bioW / 2);
  maxX = Math.max(maxX, bioW / 2);
  minY = Math.min(minY, -bioH / 2);
  maxY = Math.max(maxY, bioH / 2);

  tiles.forEach((tile) => {
    const x = Number(tile.dataset.lx);
    const y = Number(tile.dataset.ly);
    const w = tile.offsetWidth || 600;
    const h = tile.offsetHeight || w * 0.6;
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
    minY = Math.min(minY, y - h / 2);
    maxY = Math.max(maxY, y + h / 2);
  });

  // Slim seam between wrapped copies — less empty void while looping
  const gapX = mobile ? 40 : Math.max(window.innerWidth * 0.18, 140);
  const gapY = mobile
    ? -MOBILE_TILE_SPACING
    : Math.max(window.innerHeight * 0.18, 100);
  state.period = {
    // Mobile is a vertical strip — no horizontal looping space
    w: mobile ? 1 : maxX - minX + gapX,
    h: Math.max(maxY - minY + gapY, 1),
  };
}

function hideHint() {
  if (state.hintHidden || !hint) return;
  state.hintHidden = true;
  hint.classList.add("is-hidden");
}

function updateSphereFromVelocity() {
  const speed = Math.hypot(state.vx, state.vy);
  const damp = Math.min(1, speed / 28);
  state.sphere.targetTiltX = (-state.vy / 40) * damp;
  state.sphere.targetTiltY = (state.vx / 40) * damp;
  state.sphere.targetTiltX = Math.max(-MAX_TILT, Math.min(MAX_TILT, state.sphere.targetTiltX));
  state.sphere.targetTiltY = Math.max(-MAX_TILT, Math.min(MAX_TILT, state.sphere.targetTiltY));
}

function warpTiles() {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const { w: pw, h: ph } = state.period;
  // List view keeps a soft sphere so identity stays, without collapsing width
  const soft = state.stackMode;
  const depthAmt = soft ? MAX_DEPTH * 0.38 : MAX_DEPTH;
  const scaleFalloff = soft ? 0.08 : 0.22;
  const scaleFloor = soft ? 0.92 : 0.75;
  const bendAmt = soft ? 1.15 : 3.2;
  const bioDepthAmt = soft ? MAX_DEPTH * 0.18 : MAX_DEPTH * 0.45;
  const bioScaleFalloff = soft ? 0.05 : 0.12;
  const bioScaleFloor = soft ? 0.94 : 0.85;
  const bioBendAmt = soft ? 0.9 : 2.4;

  tiles.forEach((tile) => {
    const baseX = Number(tile.dataset.lx);
    const baseY = Number(tile.dataset.ly);
    const rot = Number(tile.dataset.lrot) || 0;
    const lx = wrapCoord(baseX, state.x, pw);
    const ly = wrapCoord(baseY, state.y, ph);

    const sx = cx + state.x + lx;
    const sy = cy + state.y + ly;
    const dx = (sx - cx) / cx;
    const dy = (sy - cy) / cy;
    const r2 = dx * dx + dy * dy;

    const depth = Math.max(-depthAmt, -r2 * depthAmt);
    const dist = Math.min(1.2, Math.hypot(dx, dy));
    const scale = Math.max(scaleFloor, 1 - dist * scaleFalloff);
    const bendX = dy * r2 * bendAmt;
    const bendY = -dx * r2 * bendAmt;

    tile.style.transform = `translate3d(${lx}px, ${ly}px, ${depth.toFixed(2)}px) translate(-50%, -50%) rotateX(${bendX.toFixed(2)}deg) rotateY(${bendY.toFixed(2)}deg) rotate(${rot}deg) scale(${scale.toFixed(4)})`;
  });

  if (bio) {
    const lx = wrapCoord(0, state.x, pw);
    const ly = wrapCoord(0, state.y, ph);
    const sx = cx + state.x + lx;
    const sy = cy + state.y + ly;
    const dx = (sx - cx) / cx;
    const dy = (sy - cy) / cy;
    const r2 = dx * dx + dy * dy;
    const depth = Math.max(-bioDepthAmt, -r2 * bioDepthAmt);
    const dist = Math.min(1.2, Math.hypot(dx, dy));
    const scale = Math.max(bioScaleFloor, 1 - dist * bioScaleFalloff);
    const bendX = dy * r2 * bioBendAmt;
    const bendY = -dx * r2 * bioBendAmt;
    bio.style.transform = `translate3d(calc(-50% + ${lx}px), calc(-50% + ${ly}px), ${depth.toFixed(2)}px) rotateX(${bendX.toFixed(2)}deg) rotateY(${bendY.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
  }
}

function render() {
  const { tiltX, tiltY } = state.sphere;
  const tiltScale = state.stackMode ? 0.35 : 1;
  world.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) rotateX(${(tiltX * tiltScale).toFixed(3)}deg) rotateY(${(tiltY * tiltScale).toFixed(3)}deg)`;
  warpTiles();
}

function tick() {
  if (!state.dragging) {
    state.x += state.vx;
    state.y += state.vy;
    state.vx *= FRICTION;
    state.vy *= FRICTION;
    if (Math.abs(state.vx) < 0.02) state.vx = 0;
    if (Math.abs(state.vy) < 0.02) state.vy = 0;
  }

  normalizePan();
  updateSphereFromVelocity();
  state.sphere.tiltX += (state.sphere.targetTiltX - state.sphere.tiltX) * 0.12;
  state.sphere.tiltY += (state.sphere.targetTiltY - state.sphere.tiltY) * 0.12;

  if (!state.dragging && state.vx === 0 && state.vy === 0) {
    state.sphere.targetTiltX *= 0.9;
    state.sphere.targetTiltY *= 0.9;
  }

  render();
  requestAnimationFrame(tick);
}

function onPointerDown(e) {
  if (state.transitioning) return;
  if (e.target.closest(".contact a, .site-brand, .site-all")) return;
  if (e.button !== undefined && e.button !== 0) return;

  state.dragging = true;
  state.pointerId = e.pointerId;
  state.lastX = e.clientX;
  state.lastY = e.clientY;
  state.lastT = performance.now();
  state.moved = false;
  state.vx = 0;
  state.vy = 0;
  state.hitLink = e.target.closest("a.tile__link");
  state.hitTile = e.target.closest(".tile");
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
  const dx = e.clientX - state.lastX;
  const dy = e.clientY - state.lastY;

  // Generous threshold so a real click isn't treated as a pan
  if (Math.hypot(dx, dy) > 10) state.moved = true;

  if (state.moved) {
    if (isMobileLayout()) {
      state.y += dy * DRAG;
      state.vy = (dy / dt) * 16;
      state.x = 0;
      state.vx = 0;
    } else {
      state.x += dx * DRAG;
      state.y += dy * DRAG;
      state.vx = (dx / dt) * 16;
      state.vy = (dy / dt) * 16;
    }
    hideHint();
  }

  state.lastX = e.clientX;
  state.lastY = e.clientY;
  state.lastT = now;
}

function onPointerUp(e) {
  if (!state.dragging || e.pointerId !== state.pointerId) return;
  const wasDrag = state.moved;
  const link = state.hitLink;
  const tile = state.hitTile;
  state.dragging = false;
  state.pointerId = null;
  state.hitLink = null;
  state.hitTile = null;
  stage.classList.remove("is-dragging");

  if (!wasDrag && link && tile && !state.transitioning) {
    e.preventDefault();
    flyToProject(tile, link.href);
    return;
  }

  if (wasDrag && link) {
    const block = (ev) => {
      ev.preventDefault();
      link.removeEventListener("click", block, true);
    };
    link.addEventListener("click", block, true);
  }
}

function flyToProject(tile, href) {
  if (state.transitioning) return;
  state.transitioning = true;
  state.dragging = false;
  state.vx = 0;
  state.vy = 0;

  const img = tile.querySelector("img");
  const rect = tile.getBoundingClientRect();
  const rot = Number(tile.dataset.lrot) || 0;
  // Use the project hero asset so the handoff matches pixel-for-pixel
  const projectSrc = new URL("./archive/project%201/1.jpeg", location.href).href;
  const previewSrc = img?.currentSrc || img?.src;
  if (!previewSrc) {
    location.href = href;
    return;
  }

  const flyer = document.createElement("figure");
  flyer.className = "tile-flyer";
  flyer.innerHTML = `<img src="${previewSrc}" alt="" draggable="false" />`;
  flyer.style.left = `${rect.left}px`;
  flyer.style.top = `${rect.top}px`;
  flyer.style.width = `${rect.width}px`;
  flyer.style.height = `${rect.height}px`;
  flyer.style.transform = `rotate(${rot}deg)`;
  document.body.appendChild(flyer);

  // Warm the project image while flying
  const warm = new Image();
  warm.src = projectSrc;

  tile.style.opacity = "0";
  stage.classList.add("is-transitioning");
  hideHint();

  // Same formulas as project-canvas heroTargetSize() + heroTopPad()
  const targetW = Math.min(window.innerWidth * 0.84, 1080);
  const targetH = targetW * (rect.height / Math.max(rect.width, 1));
  const targetLeft = (window.innerWidth - targetW) / 2;
  // Match menu top inset under the chrome
  const chrome = document.querySelector(".site-chrome");
  const targetTop = chrome
    ? chrome.offsetHeight
    : Math.max(window.innerHeight * 0.035, 36);
  const duration = reducedMotion ? 0 : 820;

  requestAnimationFrame(() => {
    flyer.style.transition = reducedMotion
      ? "none"
      : `left ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), top ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), width ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), height ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    flyer.style.left = `${targetLeft}px`;
    flyer.style.top = `${targetTop}px`;
    flyer.style.width = `${targetW}px`;
    flyer.style.height = `${targetH}px`;
    flyer.style.transform = "rotate(0deg)";
  });

  // Prefer hero asset as soon as it's warm so the page-boundary snapshot matches
  const flyerImg = flyer.querySelector("img");
  const swapToHero = () => {
    if (flyerImg && flyerImg.src !== projectSrc) flyerImg.src = projectSrc;
  };
  warm.decode?.().then(swapToHero).catch(swapToHero);
  warm.addEventListener("load", swapToHero, { once: true });
  const swapAt = Math.max(0, duration - 180);
  setTimeout(swapToHero, swapAt);

  const go = () => {
    swapToHero();
    // Shared element for cross-document View Transitions (erases the reload flash)
    flyer.style.viewTransitionName = "project-hero";
    try {
      sessionStorage.setItem(
        "projectEnter",
        JSON.stringify({
          src: projectSrc,
          w: targetW,
          h: targetH,
          left: targetLeft,
          top: targetTop,
        })
      );
    } catch {
      /* ignore */
    }
    const url = new URL(href, location.href);
    url.searchParams.set("enter", "1");
    location.href = `${url.pathname}${url.search}`;
  };

  if (reducedMotion) go();
  else setTimeout(go, duration + 40);
}

function onTileClick(e) {
  const link = e.target.closest("a.tile__link");
  if (!link) return;
  // Navigation is handled on pointerup; block the native follow-up click
  e.preventDefault();
}

function onWheel(e) {
  e.preventDefault();
  if (isMobileLayout()) {
    state.vy -= e.deltaY * 0.08;
  } else {
    state.vx -= e.deltaX * 0.08;
    state.vy -= e.deltaY * 0.08;
  }
  hideHint();
}

const allProjectsBtn = document.querySelector(".site-all");
if (allProjectsBtn) {
  allProjectsBtn.addEventListener("click", (e) => {
    e.preventDefault();
    setStackMode(!state.stackMode);
  });
}

if (new URLSearchParams(location.search).has("all")) {
  setStackMode(true);
  try {
    history.replaceState(null, "", "./index.html");
  } catch {
    /* ignore */
  }
}

layoutTiles();
render();
requestAnimationFrame(tick);

// Recalc layout once images have real heights (mobile stacking needs them)
window.addEventListener(
  "load",
  () => {
    layoutTiles();
    render();
  },
  { once: true }
);

stage.addEventListener("pointerdown", onPointerDown);
stage.addEventListener("pointermove", onPointerMove);
stage.addEventListener("pointerup", onPointerUp);
stage.addEventListener("pointercancel", onPointerUp);
stage.addEventListener("wheel", onWheel, { passive: false });
stage.addEventListener("click", onTileClick);

window.addEventListener("resize", () => {
  layoutTiles();
  render();
});

stage.addEventListener("dragstart", (e) => e.preventDefault());
