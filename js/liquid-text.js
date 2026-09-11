/**
 * Liquid mask cursor adapted from Sabo Sugi's CodePen
 * https://codepen.io/editor/sabosugi/pen/01a08674-961d-779f-b73c-527fd4ef0f1c
 *
 * Overlay sits ABOVE scrolling project images. Outside the liquid blob the
 * canvas is transparent; inside it refracts a live composite of bio + previews.
 */
import * as THREE from "three";

const BIO =
  "Anastasiia Bulatova (b. 1997) is a performance artist and researcher whose work investigates the body at the intersection of digital infrastructure, political power, and spatial control. Working across live performance, video, and installation, their practice examines how bodies are rendered, mediated, and disciplined by both physical architecture and algorithmic systems.";

const CONTACT_EMAIL = "anastasiiaabulatova@gmail.com";
const CONTACT_PHONE = "+1 (608) 515-7994";

const CONFIG = {
  radius: 0.12,
  distortion: 0.22,
  noiseScale: 5.7,
  speed: 0.12,
  edgeSoftness: 0.05,
  refraction: 0.11,
  parallax: 0.02,
  mouseSmoothness: 0.08,
  trailLength: 1.05,
  trailPersistence: 0.55,
  trailTaper: 0.86,
  idleDelay: 2.0,
  fadeDuration: 0.3,
  fadeOutDuration: 0.55,
  bg: "#f4f4f2",
  ink: "#0a0a0a",
};

const TRAIL_COUNT = 12;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isCoarsePointer() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function measureFontSize(ctx, text, maxWidth, maxHeight, padding) {
  const availW = maxWidth - padding * 2;
  const availH = maxHeight - padding * 2;
  let lo = 16;
  let hi = Math.min(120, availW * 0.12);
  let best = lo;

  while (lo <= hi) {
    const mid = (lo + hi) / 2;
    ctx.font = `400 ${mid}px Arial, Helvetica, sans-serif`;
    const lines = wrapLines(ctx, text, availW);
    const lineHeight = mid * 1.12;
    const blockH = lines.length * lineHeight;
    if (blockH <= availH) {
      best = mid;
      lo = mid + 0.5;
    } else {
      hi = mid - 0.5;
    }
  }
  return best;
}

function cssPx(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse SVG path in 0–100 space into canvas Path2D scaled to a rect */
function pathToCanvas(pathD, rect) {
  const path = new Path2D();
  const sx = rect.width / 100;
  const sy = rect.height / 100;
  const commands = pathD.match(/[MLZ][^MLZ]*/gi) || [];

  for (const chunk of commands) {
    const type = chunk[0].toUpperCase();
    const nums = chunk
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);

    if (type === "M" && nums.length >= 2) {
      path.moveTo(rect.left + nums[0] * sx, rect.top + nums[1] * sy);
      for (let i = 2; i + 1 < nums.length; i += 2) {
        path.lineTo(rect.left + nums[i] * sx, rect.top + nums[i + 1] * sy);
      }
    } else if (type === "L" && nums.length >= 2) {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        path.lineTo(rect.left + nums[i] * sx, rect.top + nums[i + 1] * sy);
      }
    } else if (type === "Z") {
      path.closePath();
    }
  }
  return path;
}

function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function paintWrappedElement(ctx, el, shiftX, shiftY) {
  if (!el) return;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return;

  const rect = el.getBoundingClientRect();
  if (rect.bottom < -40 || rect.top > window.innerHeight + 40) return;

  const fontSize = cssPx(style.fontSize, 16);
  const lineHeight = cssPx(style.lineHeight, fontSize * 1.4);
  const padL = cssPx(style.paddingLeft, 0);
  const padR = cssPx(style.paddingRight, 0);
  const padT = cssPx(style.paddingTop, 0);
  const maxW = Math.max(40, rect.width - padL - padR);
  const text = el.textContent.replace(/\s+/g, " ").trim();
  if (!text) return;

  const weight = style.fontWeight || "400";
  ctx.fillStyle = CONFIG.ink;
  ctx.font = `${weight} ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const lines = wrapLines(ctx, text, maxW);
  let y = rect.top + padT + shiftY;
  const x = rect.left + padL + shiftX;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
}

function paintProjectMedia(ctx, width, height, shiftX, shiftY) {
  const items = document.querySelectorAll(
    ".project-media .project-figure, .project-media .slideshow"
  );

  items.forEach((item) => {
    let img = null;
    let frame = item;

    if (item.classList.contains("slideshow")) {
      const active = item.querySelector(".slideshow__slide.is-active img");
      img = active;
      frame = item.querySelector(".slideshow__viewport") || item;
    } else {
      img = item.querySelector("img");
    }

    if (!img || !img.complete || img.naturalWidth === 0) return;

    const br = frame.getBoundingClientRect();
    if (br.bottom < -40 || br.top > height + 40) return;
    if (br.right < -40 || br.left > width + 40) return;

    ctx.save();
    ctx.translate(shiftX, shiftY);
    drawImageCover(ctx, img, br.left, br.top, br.width, br.height);
    ctx.restore();
  });
}

function paintScene(ctx, width, height, options = {}) {
  const { scale = 1, shiftX = 0, shiftY = 0 } = options;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  ctx.fillStyle = CONFIG.bg;
  ctx.fillRect(0, 0, width, height);

  const contactEls = [
    document.getElementById("contact-email"),
    document.getElementById("contact-cv"),
    document.getElementById("contact-phone"),
  ].filter(Boolean);
  const bioEl = document.getElementById("bio-text");

  contactEls.forEach((contactEl) => {
    const cs = getComputedStyle(contactEl);
    const size = cssPx(cs.fontSize, 12);
    const link = contactEl.querySelector("a");
    if (!link) return;
    const lr = link.getBoundingClientRect();
    const alignRight = contactEl.classList.contains("contact--phone");
    const alignCenter = contactEl.classList.contains("contact--cv");
    ctx.fillStyle = CONFIG.ink;
    ctx.font = `400 ${size}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = alignRight ? "right" : alignCenter ? "center" : "left";
    ctx.textBaseline = "top";
    const x = alignRight
      ? lr.right
      : alignCenter
        ? lr.left + lr.width / 2
        : lr.left;
    ctx.fillText(link.textContent.trim(), x + shiftX, lr.top + shiftY);
  });

  if (bioEl) {
    const bs = getComputedStyle(bioEl);
    const br = bioEl.getBoundingClientRect();
    const fontSize = cssPx(bs.fontSize, 32);
    const lineHeight = cssPx(bs.lineHeight, fontSize * 1.12);
    const padL = cssPx(bs.paddingLeft, 20);
    const padT = cssPx(bs.paddingTop, 20);
    const maxW = br.width - padL - cssPx(bs.paddingRight, 20);

    ctx.fillStyle = CONFIG.ink;
    ctx.font = `400 ${fontSize}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const lines = wrapLines(ctx, BIO, maxW);
    let y = br.top + padT + shiftY;
    const x = br.left + padL + shiftX;
    for (const line of lines) {
      ctx.fillText(line, x, y);
      y += lineHeight;
    }
  }

  // Project page fixed copy
  paintWrappedElement(
    ctx,
    document.getElementById("project-title"),
    shiftX,
    shiftY
  );
  paintWrappedElement(
    ctx,
    document.getElementById("project-subhead"),
    shiftX,
    shiftY
  );
  paintWrappedElement(
    ctx,
    document.getElementById("project-body"),
    shiftX,
    shiftY
  );

  const previews = document.querySelectorAll(".preview");
  previews.forEach((preview) => {
    const frame = preview.querySelector(".preview__frame");
    const img = frame?.querySelector("img");
    if (!frame || !img || !img.complete || img.naturalWidth === 0) return;

    const br = frame.getBoundingClientRect();
    if (br.bottom < -40 || br.top > height + 40) return;
    if (br.right < -40 || br.left > width + 40) return;

    const fw = frame.offsetWidth || br.width;
    const fh = frame.offsetHeight || br.height;
    const rot = cssPx(
      getComputedStyle(preview).getPropertyValue("--preview-rot"),
      0
    );
    const pathD = frame.dataset.maskPath;
    const local = { left: 0, top: 0, width: fw, height: fh };

    ctx.save();
    ctx.translate(
      br.left + br.width / 2 + shiftX,
      br.top + br.height / 2 + shiftY
    );
    ctx.rotate((rot * Math.PI) / 180);
    ctx.translate(-fw / 2, -fh / 2);

    if (pathD) {
      ctx.clip(pathToCanvas(pathD, local));
    }
    drawImageCover(ctx, img, 0, 0, fw, fh);
    ctx.restore();
  });

  paintProjectMedia(ctx, width, height, shiftX, shiftY);
}

async function waitForFonts() {
  if (document.fonts?.ready) {
    try {
      await document.fonts.load("400 48px Arial");
      await document.fonts.load("400 12px Arial");
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }
}

function createTextureFromCanvas(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

async function init() {
  if (prefersReducedMotion() || isCoarsePointer()) return;

  const canvasEl = document.getElementById("liquid-canvas");
  if (!canvasEl) return;

  await waitForFonts();

  const trailPoints = Array.from(
    { length: TRAIL_COUNT },
    () => new THREE.Vector2(0.5, 0.5)
  );

  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: false,
    alpha: true,
    premultipliedAlpha: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  const outerCanvas = document.createElement("canvas");
  const innerCanvas = document.createElement("canvas");
  const outerCtx = outerCanvas.getContext("2d", { willReadFrequently: false });
  const innerCtx = innerCanvas.getContext("2d", { willReadFrequently: false });

  let outerTex = createTextureFromCanvas(outerCanvas);
  let innerTex = createTextureFromCanvas(innerCanvas);

  const uniforms = {
    u_imageOuter: { value: outerTex },
    u_imageInner: { value: innerTex },
    u_resolution: {
      value: new THREE.Vector2(window.innerWidth, window.innerHeight),
    },
    u_imageOuterRes: { value: new THREE.Vector2(1, 1) },
    u_imageInnerRes: { value: new THREE.Vector2(1, 1) },
    u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
    u_time: { value: 0 },
    u_visibility: { value: 0 },
    u_trail: { value: trailPoints },
    u_trailLength: { value: CONFIG.trailLength },
    u_trailTaper: { value: CONFIG.trailTaper },
    u_radius: { value: CONFIG.radius },
    u_distortion: { value: CONFIG.distortion },
    u_noiseScale: { value: CONFIG.noiseScale },
    u_speed: { value: CONFIG.speed },
    u_edgeSoftness: { value: CONFIG.edgeSoftness },
    u_refraction: { value: CONFIG.refraction },
    u_parallax: { value: CONFIG.parallax },
  };

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform sampler2D u_imageOuter;
    uniform sampler2D u_imageInner;
    uniform vec2 u_resolution;
    uniform vec2 u_imageOuterRes;
    uniform vec2 u_imageInnerRes;

    uniform vec2 u_mouse;
    uniform float u_time;
    uniform float u_visibility;
    uniform vec2 u_trail[12];
    uniform float u_trailLength;
    uniform float u_trailTaper;

    uniform float u_radius;
    uniform float u_distortion;
    uniform float u_noiseScale;
    uniform float u_speed;
    uniform float u_edgeSoftness;
    uniform float u_refraction;
    uniform float u_parallax;

    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      mat2 rot = mat2(0.87, -0.48, 0.48, 0.87);
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = rot * p * 2.0;
        a *= 0.5;
      }
      return v;
    }

    vec3 taperedCapsule(vec2 p, vec2 a, vec2 b, float ra, float rb) {
      vec2 segment = b - a;
      float segmentLength = length(segment);
      float radiusDelta = rb - ra;
      if (segmentLength <= abs(radiusDelta) + 0.00001) {
        vec2 offset = p - (ra >= rb ? a : b);
        float distanceToCenter = length(offset);
        return vec3(distanceToCenter - max(ra, rb), offset / max(distanceToCenter, 0.00001));
      }
      vec2 axis = segment / segmentLength;
      vec2 relative = p - a;
      float along = dot(relative, axis);
      vec2 perpendicular = relative - axis * along;
      float slope = radiusDelta / segmentLength;
      float tangent = sqrt(max(1.0 - slope * slope, 0.000001));
      float h = clamp((along + slope * length(perpendicular) / tangent) / segmentLength, 0.0, 1.0);
      vec2 offset = relative - segment * h;
      float distanceToCenter = length(offset);
      return vec3(distanceToCenter - mix(ra, rb, h), offset / max(distanceToCenter, 0.00001));
    }

    vec3 mergeFields(vec3 a, vec3 b, float width) {
      if (width < 0.000001) return a.x < b.x ? a : b;
      float h = clamp(0.5 + 0.5 * (b.x - a.x) / width, 0.0, 1.0);
      return vec3(mix(b.x, a.x, h) - width * h * (1.0 - h), mix(b.yz, a.yz, h));
    }

    vec2 getCoverUv(vec2 uv, vec2 res, vec2 texRes) {
      vec2 ratio = res / texRes;
      float coverRatio = max(ratio.x, ratio.y);
      vec2 scaledRes = texRes * coverRatio;
      vec2 offset = (scaledRes - res) * 0.5 / scaledRes;
      return uv * (res / scaledRes) + offset;
    }

    void main() {
      vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
      vec2 p = (vUv - u_mouse) * aspect;

      float n = fbm(p * u_noiseScale + u_time * u_speed);

      vec3 liquidField = vec3(length(p) - u_radius, p / max(length(p), 0.00001));
      for (int i = 0; i < 11; i++) {
        vec2 a = (u_trail[i] - u_mouse) * aspect * u_trailLength;
        vec2 b = (u_trail[i + 1] - u_mouse) * aspect * u_trailLength;
        float ra = u_radius * (1.0 - u_trailTaper * float(i) / 11.0);
        float rb = u_radius * (1.0 - u_trailTaper * float(i + 1) / 11.0);
        vec3 segmentField = taperedCapsule(p, a, b, ra, rb);
        float blendWidth = u_radius * 0.12 * smoothstep(0.0, u_radius * 0.15, length(b - a));
        liquidField = mergeFields(liquidField, segmentField, blendWidth);
      }

      float field = liquidField.x - u_radius * (n - 0.5) * u_distortion * 2.0;
      float mask = 1.0 - smoothstep(-u_edgeSoftness, u_edgeSoftness, field);
      float edgeProfile = smoothstep(0.0, 0.5, mask) * (1.0 - smoothstep(0.5, 1.0, mask));
      vec2 refractionDir = liquidField.yz;
      vec2 finalUvOffset = refractionDir * edgeProfile * u_refraction * u_visibility;

      vec2 outerUv = getCoverUv(vUv + finalUvOffset, u_resolution, u_imageOuterRes);
      vec4 colOuter = texture2D(u_imageOuter, outerUv);

      vec2 parallaxOffset = (u_mouse - 0.5) * u_parallax;
      vec2 innerUv = getCoverUv(vUv - finalUvOffset, u_resolution, u_imageInnerRes) + parallaxOffset;
      vec4 colInner = texture2D(u_imageInner, innerUv);

      vec3 finalRgb = mix(colOuter.rgb, colInner.rgb, mask * u_visibility);
      float alpha = mask * u_visibility;
      gl_FragColor = vec4(finalRgb, alpha);
    }
  `;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);

  function resizeSceneCanvases(w, h, dpr) {
    const bw = Math.max(1, Math.floor(w * dpr));
    const bh = Math.max(1, Math.floor(h * dpr));
    if (outerCanvas.width !== bw || outerCanvas.height !== bh) {
      outerCanvas.width = bw;
      outerCanvas.height = bh;
      innerCanvas.width = bw;
      innerCanvas.height = bh;
    }
  }

  function rebuildSceneTextures() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    resizeSceneCanvases(w, h, dpr);

    paintScene(outerCtx, w, h, { scale: dpr });
    paintScene(innerCtx, w, h, {
      scale: dpr,
      shiftX: -1.5,
      shiftY: -1,
    });

    outerTex.needsUpdate = true;
    innerTex.needsUpdate = true;
    uniforms.u_imageOuterRes.value.set(outerCanvas.width, outerCanvas.height);
    uniforms.u_imageInnerRes.value.set(innerCanvas.width, innerCanvas.height);
    uniforms.u_resolution.value.set(w, h);
    renderer.setSize(w, h, false);
  }

  rebuildSceneTextures();
  document.body.classList.add("has-liquid-cursor");

  const cursorDot = document.createElement("div");
  cursorDot.className = "cursor-dot";
  cursorDot.setAttribute("aria-hidden", "true");
  document.body.appendChild(cursorDot);

  const moveCursorDot = (x, y) => {
    cursorDot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    cursorDot.classList.add("is-visible");
  };

  const hideCursorDot = () => {
    cursorDot.classList.remove("is-visible");
  };

  let resizeTimer = 0;
  let sceneDirty = true;
  const markDirty = () => {
    sceneDirty = true;
  };
  window.addEventListener("scroll", markDirty, { passive: true });
  window.addEventListener("project-media-change", markDirty);
  window.addEventListener("resize", () => {
    markDirty();
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(rebuildSceneTextures, 100);
  });

  document.querySelectorAll(".preview img, .project-media img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", markDirty, { once: true });
  });

  const currentMouse = new THREE.Vector2(0.5, 0.5);
  const targetMouse = new THREE.Vector2(0.5, 0.5);

  let pointerInside = false;
  let lastPointerActivity = -Infinity;
  let visibilityProgress = 0;
  let previousPointerX = NaN;
  let previousPointerY = NaN;

  const activatePointer = (event) => {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    targetMouse.set(event.clientX / w, 1 - event.clientY / h);
    if (visibilityProgress === 0) {
      currentMouse.copy(targetMouse);
      for (const point of trailPoints) point.copy(targetMouse);
      uniforms.u_mouse.value.copy(targetMouse);
    }
    pointerInside = true;
    lastPointerActivity = performance.now();
    previousPointerX = event.clientX;
    previousPointerY = event.clientY;
    moveCursorDot(event.clientX, event.clientY);
  };

  const deactivatePointer = () => {
    pointerInside = false;
    previousPointerX = NaN;
    previousPointerY = NaN;
    hideCursorDot();
  };

  window.addEventListener("pointermove", (event) => {
    if (
      !pointerInside ||
      event.clientX !== previousPointerX ||
      event.clientY !== previousPointerY
    ) {
      activatePointer(event);
    }
  });
  window.addEventListener("pointerdown", activatePointer);
  document.addEventListener("pointerleave", deactivatePointer);
  window.addEventListener("blur", deactivatePointer);

  const fixedStep = 1 / 120;
  let previousTime = performance.now();
  let accumulator = 0;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      deactivatePointer();
      visibilityProgress = 0;
      uniforms.u_visibility.value = 0;
    }
    previousTime = performance.now();
    accumulator = 0;
  });

  renderer.setAnimationLoop((now) => {
    const delta = Math.min(Math.max((now - previousTime) / 1000, 0), 0.05);
    previousTime = now;
    if (document.hidden) return;

    if (sceneDirty) {
      rebuildSceneTextures();
      sceneDirty = false;
    }

    const active =
      pointerInside && now - lastPointerActivity < CONFIG.idleDelay * 1000;
    visibilityProgress = THREE.MathUtils.clamp(
      visibilityProgress +
        ((active ? 1 : -1) * delta) /
          (active ? CONFIG.fadeDuration : CONFIG.fadeOutDuration),
      0,
      1
    );
    uniforms.u_visibility.value =
      visibilityProgress * visibilityProgress * (3 - 2 * visibilityProgress);
    uniforms.u_time.value += delta;

    accumulator += delta;
    const mouseAlpha = 1 - Math.pow(1 - CONFIG.mouseSmoothness, fixedStep * 60);
    const trailAlpha =
      1 - Math.exp((-fixedStep * (TRAIL_COUNT - 1)) / CONFIG.trailPersistence);

    while (accumulator >= fixedStep) {
      currentMouse.lerp(targetMouse, mouseAlpha);
      trailPoints[0].copy(currentMouse);
      for (let i = TRAIL_COUNT - 1; i > 0; i--) {
        trailPoints[i].lerp(trailPoints[i - 1], trailAlpha);
      }
      accumulator -= fixedStep;
    }

    uniforms.u_mouse.value.copy(currentMouse);
    renderer.render(scene, camera);
  });
}

init().catch((err) => {
  console.error(err);
  document.body.classList.remove("has-liquid-cursor");
  document.querySelector(".cursor-dot")?.remove();
});
