/**
 * Project previews: weird jagged masks (Sonic Acts–style)
 * + stable-random horizontal placement.
 */

const PREVIEWS = [...document.querySelectorAll(".preview")];
const DEFS = document.getElementById("weird-mask-defs");

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build an irregular torn/organic outline in a 0–100 viewBox.
 * Closer to the Sonic Acts “weird mask”: lumpy blob with crinkled edges,
 * not a star-burst of spikes.
 */
function buildWeirdPath(rand) {
  const count = 36 + Math.floor(rand() * 18);
  const stretchX = 0.88 + rand() * 0.28;
  const stretchY = 0.92 + rand() * 0.28;
  const points = [];

  // Low-frequency lobes so the silhouette feels like one torn piece
  const lobes = 3 + Math.floor(rand() * 3);
  const lobePhase = rand() * Math.PI * 2;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const a = t * Math.PI * 2;

    const lobe =
      0.78 +
      0.18 * Math.sin(a * lobes + lobePhase) +
      0.1 * Math.sin(a * (lobes + 2) - lobePhase * 0.5);

    // High-frequency crinkle along the edge (torn paper / jagged cut)
    const crinkle = 1 + (rand() - 0.5) * 0.16;
    // Occasional deeper bite — not a long spike
    const bite = rand() > 0.9 ? 0.78 + rand() * 0.12 : 1;

    const r = 44 * lobe * crinkle * bite;
    const x = 50 + Math.cos(a) * r * stretchX;
    const y = 50 + Math.sin(a) * r * stretchY;

    points.push([
      Math.min(99.2, Math.max(0.8, x)),
      Math.min(99.2, Math.max(0.8, y)),
    ]);
  }

  // Short edge nicks — keep them shallow so it stays blob-like
  const edged = [];
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    edged.push([x0, y0]);
    if (rand() > 0.72) {
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      const nx = -(y1 - y0);
      const ny = x1 - x0;
      const len = Math.hypot(nx, ny) || 1;
      const push = (rand() > 0.5 ? 1 : -1) * (1.2 + rand() * 2.8);
      edged.push([
        Math.min(99.2, Math.max(0.8, mx + (nx / len) * push)),
        Math.min(99.2, Math.max(0.8, my + (ny / len) * push)),
      ]);
    }
  }

  return (
    edged
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(" ") + " Z"
  );
}

function distributeHorizontal(count, rand) {
  // Spread across the width; shuffle so order ≠ left-to-right
  const slots = Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    // Bias away from dead center extremes a bit
    return 0.04 + t * 0.92;
  });

  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  // Nudge each slot so neighbors feel less grid-like
  return slots.map((x) => {
    const n = (rand() - 0.5) * 0.12;
    return Math.min(0.96, Math.max(0.04, x + n));
  });
}

function applyMasksAndPositions() {
  if (!DEFS || !PREVIEWS.length) return;

  DEFS.replaceChildren();
  const layoutRand = mulberry32(0xa57a51a);
  const xs = distributeHorizontal(PREVIEWS.length, layoutRand);

  PREVIEWS.forEach((el, index) => {
    const rand = mulberry32(0x51c0 + index * 9973);
    const pathD = buildWeirdPath(rand);
    const id = `weird-mask-${index}`;

    const clipPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "clipPath"
    );
    clipPath.setAttribute("id", id);
    clipPath.setAttribute("clipPathUnits", "objectBoundingBox");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    // Paths are authored in 0–100 space → scale to unit square for objectBoundingBox
    path.setAttribute("d", pathD);
    path.setAttribute("transform", "scale(0.01)");
    clipPath.appendChild(path);
    DEFS.appendChild(clipPath);

    const frame = el.querySelector(".preview__frame");
    if (frame) {
      const url = `url(#${id})`;
      frame.style.clipPath = url;
      frame.style.webkitClipPath = url;
      // Used by the liquid overlay to redraw the same mask into the scene texture
      frame.dataset.maskPath = pathD;
    }

    el.style.setProperty("--preview-x", xs[index].toFixed(4));
    const rot = (rand() - 0.5) * 7;
    el.style.setProperty("--preview-rot", `${rot.toFixed(2)}deg`);
  });
}

applyMasksAndPositions();
window.addEventListener("resize", () => {
  // Positions are %-based; masks stay. No rebuild needed.
});
