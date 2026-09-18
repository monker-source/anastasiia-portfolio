/**
 * ALL PROJECTS list overlay on the project page.
 * Freezes the project canvas underneath; does not navigate home.
 */

import { getProjectsCatalog } from "./projects-catalog.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let PROJECTS = [];
const LAYOUT_TWEEN_MS = 500;
const MOBILE_TILE_SPACING = -70;

const allBtn = document.querySelector(".site-all");
const stage = document.getElementById("stage");

const listState = {
  open: false,
  scrollY: 0,
  vy: 0,
  dragging: false,
  pointerId: null,
  lastY: 0,
  lastT: 0,
  moved: false,
  periodH: 2400,
  tween: null,
  tiles: [],
  layer: null,
  world: null,
};

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function heroTileW() {
  return Math.min(window.innerWidth * 0.84, 1080);
}

function mobileStackStep(height, spacing) {
  if (spacing >= 0) {
    return height - Math.min(spacing, height * 0.85);
  }
  return height - spacing;
}

function tileHeightAtWidth(tile, tileW) {
  const img = tile.querySelector("img");
  const attrW = Number(img?.getAttribute("width"));
  const attrH = Number(img?.getAttribute("height"));
  if (attrW && attrH) return tileW * (attrH / attrW);
  if (img?.naturalWidth) return tileW * (img.naturalHeight / img.naturalWidth);
  return tileW * 0.65;
}

function setStackChrome(on) {
  listState.open = Boolean(on);
  document.body.classList.toggle("is-projects-stack", listState.open);
  document.body.classList.toggle("is-project-all-open", listState.open);
  if (allBtn) {
    allBtn.setAttribute("aria-pressed", listState.open ? "true" : "false");
    allBtn.classList.toggle("is-active", listState.open);
    allBtn.textContent = listState.open ? "BACK" : "ALL PROJECTS";
  }
  if (stage) {
    stage.style.pointerEvents = listState.open ? "none" : "";
  }
  if (listState.layer) {
    listState.layer.hidden = !listState.open;
    listState.layer.setAttribute("aria-hidden", listState.open ? "false" : "true");
  }
}

function computeColumnLayouts() {
  const desktop = window.innerWidth > 700;
  const tileW = desktop
    ? heroTileW()
    : Math.min(window.innerWidth * 0.92, 380);
  const spacing = MOBILE_TILE_SPACING;
  const layouts = listState.tiles.map(() => ({
    lx: 0,
    ly: 0,
    lrot: 0,
    width: tileW,
  }));

  // Stack in catalog order (sorted by project `order` field)
  let cursor = 0;
  listState.tiles.forEach((tile, i) => {
    const rot = Number(tile.dataset.rot) || 0;
    const h = tileHeightAtWidth(tile, tileW);
    layouts[i].width = tileW;
    layouts[i].lx = 0;
    layouts[i].lrot = rot * 0.4;
    layouts[i].ly = cursor + h / 2;
    cursor = layouts[i].ly - h / 2 + mobileStackStep(h, spacing);
  });

  return layouts;
}

function scatterFromLayouts(column) {
  const hx = window.innerWidth / 2;
  const hy = window.innerHeight / 2;
  // Far past the viewport so opening/closing never shows tiles pop in/out
  const offX = hx + heroTileW() * 0.85 + 80;
  const offY = hy + window.innerHeight * 0.55;
  return column.map((L, i) => {
    const tile = listState.tiles[i];
    const rot = Number(tile.dataset.rot) || 0;
    const side = i % 2 === 0 ? -1 : 1;
    const spread = 0.55 + (i % 5) * 0.08;
    return {
      lx: side * offX * spread,
      ly: L.ly + side * offY * (0.35 + (i % 3) * 0.1),
      lrot: rot,
      width: Math.min(530, Math.max(290, L.width * 0.45)),
    };
  });
}

function applyTileLayout(layouts) {
  listState.tiles.forEach((tile, i) => {
    const L = layouts[i];
    tile.style.width = `${L.width}px`;
    tile.dataset.lx = String(L.lx);
    tile.dataset.ly = String(L.ly);
    tile.dataset.lrot = String(L.lrot);
  });
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

function computeListPeriod(layouts) {
  let minY = 0;
  let maxY = 0;
  layouts.forEach((L) => {
    const h = L.width * 0.6;
    minY = Math.min(minY, L.ly - h / 2);
    maxY = Math.max(maxY, L.ly + h / 2);
  });
  listState.periodH = Math.max(maxY - minY - MOBILE_TILE_SPACING, 1);
}

function wrapY(local, pan, period) {
  return local + period * Math.round((-pan - local) / period);
}

function paintTiles() {
  const tweening = Boolean(listState.tween);
  listState.tiles.forEach((tile) => {
    const baseX = Number(tile.dataset.lx) || 0;
    const baseY = Number(tile.dataset.ly) || 0;
    const rot = Number(tile.dataset.lrot) || 0;
    const lx = baseX;
    const ly = tweening
      ? baseY
      : wrapY(baseY, listState.scrollY, listState.periodH) + listState.scrollY;
    // Soft depth toward edges
    const cy = window.innerHeight / 2;
    const dy = (cy + ly - cy) / cy;
    const r2 = dy * dy;
    const depth = Math.max(-36, -r2 * 36) + 48;
    const scale = Math.max(0.92, 1 - Math.min(1.2, Math.abs(dy)) * 0.08);
    const bendX = dy * r2 * 1.15;
    tile.style.transform = `translate3d(${lx}px, ${ly}px, ${depth.toFixed(2)}px) translate(-50%, -50%) rotateX(${bendX.toFixed(2)}deg) rotate(${rot}deg) scale(${scale.toFixed(4)})`;
  });
}

function ensureLayer() {
  if (listState.layer) return;

  const layer = document.createElement("div");
  layer.className = "all-layer";
  layer.id = "all-layer";
  layer.hidden = true;
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("aria-label", "All projects");

  const listStage = document.createElement("div");
  listStage.className = "all-layer__stage";
  listStage.id = "all-stage";

  const world = document.createElement("div");
  world.className = "all-layer__world";
  world.id = "all-world";

  PROJECTS.forEach((p) => {
    const fig = document.createElement("figure");
    fig.className = "all-layer__tile tile";
    fig.dataset.oy = String(p.oy);
    fig.dataset.rot = String(p.rot);
    fig.dataset.order = String(p.order ?? 9999);
    const img = document.createElement("img");
    img.src = p.src;
    img.alt = p.alt;
    img.width = p.w;
    img.height = p.h;
    img.draggable = false;
    img.loading = "lazy";
    if (p.href) {
      const a = document.createElement("a");
      a.className = "tile__link";
      a.href = p.href;
      a.setAttribute("aria-label", `Open project: ${p.alt}`);
      // Already on this project — closing list is enough
      if (location.pathname.endsWith("project.html") || location.pathname.endsWith("/project.html")) {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          if (listState.open) closeList();
        });
      }
      a.appendChild(img);
      fig.appendChild(a);
    } else {
      fig.appendChild(img);
    }
    world.appendChild(fig);
  });

  listStage.appendChild(world);
  layer.appendChild(listStage);
  document.body.appendChild(layer);

  listState.layer = layer;
  listState.world = world;
  listState.tiles = [...world.querySelectorAll(".all-layer__tile")];

  listStage.addEventListener("pointerdown", onListPointerDown);
  listStage.addEventListener("pointermove", onListPointerMove);
  listStage.addEventListener("pointerup", onListPointerUp);
  listStage.addEventListener("pointercancel", onListPointerUp);
  listStage.addEventListener("wheel", onListWheel, { passive: false });
  listStage.addEventListener("dragstart", (e) => e.preventDefault());
}

function startTween(from, to, onDone) {
  if (reducedMotion) {
    applyTileLayout(to);
    computeListPeriod(to);
    listState.tween = null;
    paintTiles();
    onDone?.();
    return;
  }
  listState.tween = {
    t0: performance.now(),
    duration: LAYOUT_TWEEN_MS,
    from,
    to,
    onDone,
  };
  applyTileLayout(from);
  paintTiles();
}

function updateTween(now) {
  const tw = listState.tween;
  if (!tw) return;
  const u = Math.min(1, (now - tw.t0) / tw.duration);
  applyTileLayout(lerpLayout(tw.from, tw.to, easeOutCubic(u)));
  paintTiles();
  if (u >= 1) {
    listState.tween = null;
    applyTileLayout(tw.to);
    computeListPeriod(tw.to);
    paintTiles();
    tw.onDone?.();
  }
}

function openList() {
  ensureLayer();
  setStackChrome(true);
  listState.scrollY = 0;
  listState.vy = 0;
  window.__projectAllOpen = true;

  const column = computeColumnLayouts();
  const from = scatterFromLayouts(column);
  computeListPeriod(column);
  startTween(from, column);
}

function closeList() {
  if (!listState.open) return;
  const column = listState.tiles.map((tile) => ({
    lx: Number(tile.dataset.lx) || 0,
    ly:
      wrapY(Number(tile.dataset.ly) || 0, listState.scrollY, listState.periodH) +
      listState.scrollY,
    lrot: Number(tile.dataset.lrot) || 0,
    width: parseFloat(tile.style.width) || tile.offsetWidth || 400,
  }));
  const to = scatterFromLayouts(computeColumnLayouts());

  startTween(column, to, () => {
    setStackChrome(false);
    window.__projectAllOpen = false;
    listState.scrollY = 0;
    listState.vy = 0;
  });
}

function toggleList(e) {
  e?.preventDefault();
  if (listState.tween) return;
  if (listState.open) closeList();
  else openList();
}

function onListPointerDown(e) {
  if (!listState.open || listState.tween) return;
  if (e.target.closest(".site-all, .site-brand, .contact a")) return;
  if (e.button !== undefined && e.button !== 0) return;
  listState.dragging = true;
  listState.pointerId = e.pointerId;
  listState.lastY = e.clientY;
  listState.lastT = performance.now();
  listState.moved = false;
  listState.vy = 0;
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

function onListPointerMove(e) {
  if (!listState.dragging || e.pointerId !== listState.pointerId) return;
  const now = performance.now();
  const dt = Math.max(8, now - listState.lastT);
  const dy = e.clientY - listState.lastY;
  if (Math.abs(dy) > 10) listState.moved = true;
  if (listState.moved) {
    listState.scrollY += dy;
    listState.vy = (dy / dt) * 16;
  }
  listState.lastY = e.clientY;
  listState.lastT = now;
}

function onListPointerUp(e) {
  if (!listState.dragging || e.pointerId !== listState.pointerId) return;
  listState.dragging = false;
  listState.pointerId = null;
}

function onListWheel(e) {
  if (!listState.open || listState.tween) return;
  e.preventDefault();
  listState.vy -= e.deltaY * 0.08;
}

function tickList() {
  updateTween(performance.now());
  if (listState.open && !listState.tween && !listState.dragging) {
    listState.scrollY += listState.vy;
    listState.vy *= reducedMotion ? 0.82 : 0.925;
    if (Math.abs(listState.vy) < 0.02) listState.vy = 0;
    const ph = listState.periodH;
    if (ph > 0) {
      while (listState.scrollY > ph / 2) listState.scrollY -= ph;
      while (listState.scrollY < -ph / 2) listState.scrollY += ph;
    }
    paintTiles();
  } else if (listState.open && !listState.tween) {
    paintTiles();
  }
  requestAnimationFrame(tickList);
}

async function bootProjectAll() {
  PROJECTS = await getProjectsCatalog();

  if (allBtn) {
    allBtn.setAttribute("role", "button");
    allBtn.setAttribute("aria-pressed", "false");
    allBtn.addEventListener("click", toggleList);
  }

  window.addEventListener("resize", () => {
    if (!listState.open || listState.tween) return;
    const column = computeColumnLayouts();
    applyTileLayout(column);
    computeListPeriod(column);
    paintTiles();
  });

  requestAnimationFrame(tickList);
}

bootProjectAll();

export function isProjectAllOpen() {
  return listState.open;
}
