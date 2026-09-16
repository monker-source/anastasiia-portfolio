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
  listAnchor: { x: 0, y: 0 },
  listBioFreeze: null,
  layoutTween: {
    active: false,
    t0: 0,
    duration: 500,
    from: null,
    to: null,
    toStack: false,
    onComplete: null,
  },
  period: { w: 3200, h: 2400 },
  sphere: { tiltX: 0, tiltY: 0, targetTiltX: 0, targetTiltY: 0 },
};

const FRICTION = reducedMotion ? 0.82 : 0.925;
const DRAG = 1;
const MAX_TILT = 5.5;
const MAX_DEPTH = 95;
const LAYOUT_TWEEN_MS = 500;

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

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/** Snapshot intro screen place + spherical warp so list view does not resize it. */
function captureBioFreeze(panX, panY) {
  const pw = state.period.w;
  const ph = state.period.h;
  const lx = wrapCoord(0, panX, pw);
  const ly = wrapCoord(0, panY, ph);
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const sx = cx + panX + lx;
  const sy = cy + panY + ly;
  const dx = (sx - cx) / Math.max(cx, 1);
  const dy = (sy - cy) / Math.max(cy, 1);
  const r2 = dx * dx + dy * dy;
  const dist = Math.min(1.2, Math.hypot(dx, dy));
  return {
    x: panX + lx,
    y: panY + ly,
    depth: Math.max(-MAX_DEPTH * 0.45, -r2 * MAX_DEPTH * 0.45),
    bendX: dy * r2 * 2.4,
    bendY: -dx * r2 * 2.4,
    scale: Math.max(0.85, 1 - dist * 0.12),
  };
}

function applyBioFreeze(freeze) {
  if (!bio || !freeze) return;
  bio.style.transform = `translate3d(calc(-50% + ${freeze.x.toFixed(2)}px), calc(-50% + ${freeze.y.toFixed(2)}px), ${freeze.depth.toFixed(2)}px) rotateX(${freeze.bendX.toFixed(2)}deg) rotateY(${freeze.bendY.toFixed(2)}deg) scale(${freeze.scale.toFixed(4)})`;
}

function setStackChrome(on) {
  state.stackMode = Boolean(on);
  document.body.classList.toggle("is-projects-stack", state.stackMode);
  const allBtn = document.querySelector(".site-all");
  if (allBtn) {
    allBtn.setAttribute("aria-pressed", state.stackMode ? "true" : "false");
    allBtn.classList.toggle("is-active", state.stackMode);
    allBtn.textContent = state.stackMode ? "BACK" : "ALL PROJECTS";
  }
  if (state.stackMode) hideHint();
}

function setStackMode(on) {
  state.layoutTween.active = false;
  state.layoutTween.onComplete = null;
  setStackChrome(on);
  if (on) {
    state.listAnchor = { x: state.x, y: state.y };
    state.listBioFreeze = captureBioFreeze(state.x, state.y);
  } else {
    state.listBioFreeze = null;
  }
  state.x = on ? 0 : state.listAnchor.x;
  state.y = on ? 0 : state.listAnchor.y;
  state.vx = 0;
  state.vy = 0;
  layoutTiles();
  render();
}

function tileHeightAtWidth(tile, tileW) {
  const img = tile.querySelector("img");
  if (img?.naturalWidth) {
    return tileW * (img.naturalHeight / img.naturalWidth);
  }
  const attrW = Number(img?.getAttribute("width"));
  const attrH = Number(img?.getAttribute("height"));
  if (attrW && attrH) return tileW * (attrH / attrW);
  const curW = tile.offsetWidth;
  const curH = tile.offsetHeight;
  if (curW && curH) return tileW * (curH / curW);
  return tileW * 0.65;
}

/** Mobile vertical strip: negative = gap between tiles (px). */
const MOBILE_TILE_SPACING = -70;

function mobileStackStep(height, spacing) {
  if (spacing >= 0) {
    return height - Math.min(spacing, height * 0.85);
  }
  return height - spacing; // spacing negative → adds gap
}

/** Compute per-tile layout for free canvas or stack/list mode (does not write DOM). */
function computeLayout(forStack) {
  const hx = window.innerWidth / 2;
  const hy = window.innerHeight / 2;
  const useColumn = forStack || window.innerWidth <= 700;
  const base = Math.max(window.innerWidth, 900);
  const layouts = tiles.map(() => ({ lx: 0, ly: 0, lrot: 0, width: 400 }));

  if (useColumn) {
    const desktopStack = forStack && window.innerWidth > 700;
    const tileW = desktopStack
      ? Math.min(window.innerWidth * 0.84, 1080)
      : Math.min(window.innerWidth * 0.92, 380);
    const spacing = MOBILE_TILE_SPACING;
    const bioGap = desktopStack
      ? 0
      : Math.max(window.innerHeight * 0.05, 22);
    const bioH = desktopStack
      ? 0
      : bio?.offsetHeight || Math.min(window.innerHeight * 0.55, 420);
    const clearHalf = bioH / 2 + bioGap;

    tiles.forEach((tile, i) => {
      const rot = Number(tile.dataset.rot) || 0;
      layouts[i].width = tileW;
      layouts[i].lx = 0;
      layouts[i].lrot = rot * 0.4;
    });

    const above = tiles
      .map((t, i) => ({ tile: t, i }))
      .filter(({ tile }) => Number(tile.dataset.oy) < 0)
      .sort((a, b) => Number(b.tile.dataset.oy) - Number(a.tile.dataset.oy));
    let cursor = -clearHalf;
    above.forEach(({ tile, i }) => {
      const h = tileHeightAtWidth(tile, tileW);
      const y = cursor - h / 2;
      layouts[i].ly = y;
      cursor = y - mobileStackStep(h, spacing) + h / 2;
    });

    const below = tiles
      .map((t, i) => ({ tile: t, i }))
      .filter(({ tile }) => Number(tile.dataset.oy) >= 0)
      .sort((a, b) => Number(a.tile.dataset.oy) - Number(b.tile.dataset.oy));
    cursor = clearHalf;
    below.forEach(({ tile, i }) => {
      const h = tileHeightAtWidth(tile, tileW);
      const y = cursor + h / 2;
      layouts[i].ly = y;
      cursor = y - h / 2 + mobileStackStep(h, spacing);
    });
  } else {
    tiles.forEach((tile, i) => {
      const ox = Number(tile.dataset.ox);
      const oy = Number(tile.dataset.oy);
      const wf = Number(tile.dataset.wf);
      const rot = Number(tile.dataset.rot) || 0;
      const w = Math.min(530, Math.max(290, base * wf * 0.7));
      layouts[i].width = w;
      layouts[i].lx = ox * hx;
      layouts[i].ly = oy * hy;
      layouts[i].lrot = rot;
    });
  }

  return layouts;
}

function applyLayout(layouts) {
  tiles.forEach((tile, i) => {
    const L = layouts[i];
    tile.style.width = `${L.width}px`;
    tile.dataset.lx = String(L.lx);
    tile.dataset.ly = String(L.ly);
    tile.dataset.lrot = String(L.lrot);
  });
}

function layoutTiles() {
  applyLayout(computeLayout(state.stackMode));
  computePeriod();
  if (state.stackMode || window.innerWidth <= 700) {
    state.x = 0;
    state.vx = 0;
  }
}

function lerpLayout(from, to, u) {
  return from.map((f, i) => {
    const t = to[i];
    return {
      lx: f.lx + (t.lx - f.lx) * u,
      ly: f.ly + (t.ly - f.ly) * u,
      lrot: f.lrot + (t.lrot - f.lrot) * u,
      width: f.width + (t.width - f.width) * u,
    };
  });
}

/** Map free-canvas local layout to on-screen positions for a given pan. */
function visualLayoutsFromLocal(locals, pan) {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  const bioW = bio?.offsetWidth || 1100;
  const bioH = bio?.offsetHeight || 500;
  minX = Math.min(minX, -bioW / 2);
  maxX = Math.max(maxX, bioW / 2);
  minY = Math.min(minY, -bioH / 2);
  maxY = Math.max(maxY, bioH / 2);
  locals.forEach((L) => {
    const h = L.width * 0.6;
    minX = Math.min(minX, L.lx - L.width / 2);
    maxX = Math.max(maxX, L.lx + L.width / 2);
    minY = Math.min(minY, L.ly - h / 2);
    maxY = Math.max(maxY, L.ly + h / 2);
  });
  const pw = Math.max(maxX - minX + Math.max(window.innerWidth * 0.18, 140), 1);
  const ph = Math.max(maxY - minY + Math.max(window.innerHeight * 0.18, 100), 1);
  return locals.map((L) => ({
    lx: wrapCoord(L.lx, pan.x, pw) + pan.x,
    ly: wrapCoord(L.ly, pan.y, ph) + pan.y,
    lrot: L.lrot,
    width: L.width,
  }));
}

function snapshotLayouts() {
  const tw = state.layoutTween;
  if (tw.active && tw.from && tw.to) {
    const u = easeOutCubic(
      Math.min(1, (performance.now() - tw.t0) / tw.duration)
    );
    return lerpLayout(tw.from, tw.to, u);
  }
  if (state.stackMode) {
    // List mode: column is screen-centered; y includes list scroll
    const { h: ph } = state.period;
    return tiles.map((tile) => ({
      lx: Number(tile.dataset.lx) || 0,
      ly: wrapCoord(Number(tile.dataset.ly) || 0, state.y, ph) + state.y,
      lrot: Number(tile.dataset.lrot) || 0,
      width: parseFloat(tile.style.width) || tile.offsetWidth || 400,
    }));
  }
  // Free canvas: visual positions (include pan)
  const { w: pw, h: ph } = state.period;
  return tiles.map((tile) => ({
    lx: wrapCoord(Number(tile.dataset.lx) || 0, state.x, pw) + state.x,
    ly: wrapCoord(Number(tile.dataset.ly) || 0, state.y, ph) + state.y,
    lrot: Number(tile.dataset.lrot) || 0,
    width: parseFloat(tile.style.width) || tile.offsetWidth || 400,
  }));
}

/** 0 = free canvas warp, 1 = list soft warp. Smooth across the layout tween. */
function stackBlend() {
  const tw = state.layoutTween;
  if (tw.active && tw.from && tw.to) {
    const u = easeOutCubic(
      Math.min(1, (performance.now() - tw.t0) / Math.max(tw.duration, 1))
    );
    return tw.toStack ? u : 1 - u;
  }
  return state.stackMode ? 1 : 0;
}

function updateLayoutTween(now) {
  const tw = state.layoutTween;
  if (!tw.active || !tw.from || !tw.to) return;
  const u = Math.min(1, (now - tw.t0) / tw.duration);
  applyLayout(lerpLayout(tw.from, tw.to, easeOutCubic(u)));
  // Skip period rebuild while flying — list period (w=1) would break mid-flight positions
  if (u >= 1) {
    tw.active = false;
    applyLayout(tw.to);
    const done = tw.onComplete;
    tw.onComplete = null;
    if (done) done();
    else computePeriod();
  }
}

function toggleStackMode() {
  const toStack = !state.stackMode;
  if (reducedMotion) {
    setStackMode(toStack);
    return;
  }

  const from = snapshotLayouts();
  state.vx = 0;
  state.vy = 0;

  if (toStack) {
    // Remember where we were; freeze that as the list backdrop
    state.listAnchor = { x: state.x, y: state.y };
    state.listBioFreeze = captureBioFreeze(state.x, state.y);
    setStackChrome(true);
    // List scroll starts at 0; column is built in screen space
    state.x = 0;
    state.y = 0;
    const to = computeLayout(true);
    state.layoutTween.active = true;
    state.layoutTween.t0 = performance.now();
    state.layoutTween.duration = LAYOUT_TWEEN_MS;
    state.layoutTween.from = from;
    state.layoutTween.to = to;
    state.layoutTween.toStack = true;
    state.layoutTween.onComplete = () => {
      applyLayout(to);
      computePeriod();
    };
    applyLayout(from);
    render();
    return;
  }

  // Leave list → fly back to scattered places at the saved spot
  const anchor = { x: state.listAnchor.x, y: state.listAnchor.y };
  // Keep listBioFreeze through the exit flight — clearing it early re-captures
  // with the list period (w≈1) and snaps the intro to the wrong size/place.
  setStackChrome(false);
  const freeLocal = computeLayout(false);
  const to = visualLayoutsFromLocal(freeLocal, anchor);
  state.x = 0;
  state.y = 0;
  state.layoutTween.active = true;
  state.layoutTween.t0 = performance.now();
  state.layoutTween.duration = LAYOUT_TWEEN_MS;
  state.layoutTween.from = from;
  state.layoutTween.to = to;
  state.layoutTween.toStack = false;
  state.layoutTween.onComplete = () => {
    applyLayout(freeLocal);
    state.x = anchor.x;
    state.y = anchor.y;
    state.listBioFreeze = null;
    computePeriod();
  };
  applyLayout(from);
  render();
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
  const blend = stackBlend();
  const tweening = state.layoutTween.active;
  // Blend free ↔ list warp so both toggle directions feel the same
  const depthAmt = MAX_DEPTH * (1 - 0.62 * blend);
  const scaleFalloff = 0.22 + (0.08 - 0.22) * blend;
  const scaleFloor = 0.75 + (0.92 - 0.75) * blend;
  const bendAmt = 3.2 + (1.15 - 3.2) * blend;
  const bioDepthAmt = MAX_DEPTH * 0.45;
  const bioScaleFalloff = 0.12;
  const bioScaleFloor = 0.85;
  const bioBendAmt = 2.4;
  // List mode: only vertical scroll is baked into tiles (column stays screen-centered)
  const panX = state.stackMode && !tweening ? 0 : state.x * blend;
  const panY = state.stackMode && !tweening ? state.y : state.y * blend;
  const tileZLift = 48 * blend;

  tiles.forEach((tile) => {
    const baseX = Number(tile.dataset.lx);
    const baseY = Number(tile.dataset.ly);
    const rot = Number(tile.dataset.lrot) || 0;
    // During fly tween positions are absolute — wrapping with list period (w=1)
    // would snap every tile to the center before they can fly into the column
    let lx;
    let ly;
    if (tweening) {
      lx = baseX;
      ly = baseY;
    } else if (state.stackMode) {
      lx = wrapCoord(baseX, 0, pw);
      ly = wrapCoord(baseY, state.y, ph) + state.y;
    } else {
      lx = wrapCoord(baseX, state.x, pw) + panX;
      ly = wrapCoord(baseY, state.y, ph) + panY;
    }

    const sx = tweening || state.stackMode
      ? cx + lx
      : cx + state.x * (1 - blend) + lx;
    const sy = tweening || state.stackMode
      ? cy + ly
      : cy + state.y * (1 - blend) + ly;
    const dx = (sx - cx) / cx;
    const dy = (sy - cy) / cy;
    const r2 = dx * dx + dy * dy;

    const depth = Math.max(-depthAmt, -r2 * depthAmt) + tileZLift;
    const dist = Math.min(1.2, Math.hypot(dx, dy));
    const scale = Math.max(scaleFloor, 1 - dist * scaleFalloff);
    const bendX = dy * r2 * bendAmt;
    const bendY = -dx * r2 * bendAmt;

    tile.style.transform = `translate3d(${lx}px, ${ly}px, ${depth.toFixed(2)}px) translate(-50%, -50%) rotateX(${bendX.toFixed(2)}deg) rotateY(${bendY.toFixed(2)}deg) rotate(${rot}deg) scale(${scale.toFixed(4)})`;
  });

  if (bio) {
    // Freeze intro where it was when list opened (or while flying in/out)
    const freezeBio =
      state.stackMode ||
      state.layoutTween.active;
    if (freezeBio) {
      // Never re-capture here: list period makes wrapCoord destroy the snapshot
      if (state.listBioFreeze) applyBioFreeze(state.listBioFreeze);
      return;
    }
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
  const blend = stackBlend();
  const { tiltX, tiltY } = state.sphere;
  // List + fly: world stays still; tile coords are screen-true
  if (state.layoutTween.active || state.stackMode) {
    world.style.transform = "translate3d(0, 0, 0)";
  } else {
    const panKeep = 1 - blend;
    world.style.transform = `translate3d(${(state.x * panKeep).toFixed(2)}px, ${(state.y * panKeep).toFixed(2)}px, 0) rotateX(${(tiltX * panKeep).toFixed(3)}deg) rotateY(${(tiltY * panKeep).toFixed(3)}deg)`;
  }
  warpTiles();
}

function tick() {
  if (!state.dragging && !state.layoutTween.active) {
    state.x += state.vx;
    state.y += state.vy;
    state.vx *= FRICTION;
    state.vy *= FRICTION;
    if (Math.abs(state.vx) < 0.02) state.vx = 0;
    if (Math.abs(state.vy) < 0.02) state.vy = 0;
  }

  updateLayoutTween(performance.now());
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
  if (state.transitioning || state.layoutTween.active) return;
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
  if (state.layoutTween.active) return;
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
    toggleStackMode();
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
    if (!state.layoutTween.active) {
      layoutTiles();
      render();
    }
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
  state.layoutTween.active = false;
  layoutTiles();
  render();
});

stage.addEventListener("dragstart", (e) => e.preventDefault());
