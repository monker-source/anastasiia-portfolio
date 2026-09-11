/**
 * Liquid mask cursor adapted from Sabo Sugi's CodePen
 * https://codepen.io/editor/sabosugi/pen/01a08674-961d-779f-b73c-527fd4ef0f1c
 *
 * Overlay sits ABOVE scrolling project images. Outside the liquid blob the
 * canvas is transparent; inside it refracts a live composite of bio + previews.
 */
import * as THREE from "three";

const CONFIG = {
  radius: 0.17,
  distortion: 0.2,
  noiseScale: 4.8,
  speed: 0.1,
  edgeSoftness: 0.065,
  refraction: 0.16,
  magnify: 1.1,
  parallax: 0.025,
  mouseSmoothness: 0.08,
  trailLength: 1.0,
  trailPersistence: 0.28,
  trailTaper: 0.82,
  idleDelay: 2.0,
  fadeDuration: 0.3,
  fadeOutDuration: 0.55,
  bg: "#f4f4f2",
  ink: "#0a0a0a",
};

const TRAIL_COUNT = 6;
const TRAIL_SEGMENTS = TRAIL_COUNT - 1;
const SCENE_DPR_CAP = 1.5;
const SCROLL_DIRTY_MS = 40;

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

function cssPx(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function fontStack(style) {
  return style.fontFamily || "Arial, Helvetica, sans-serif";
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

function paintWrappedElement(ctx, el) {
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
  ctx.font = `${weight} ${fontSize}px ${fontStack(style)}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const lines = wrapLines(ctx, text, maxW);
  let y = rect.top + padT;
  const x = rect.left + padL;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
}

function paintContactLink(ctx, contactEl) {
  if (!contactEl) return;
  const style = getComputedStyle(contactEl);
  if (style.display === "none" || style.visibility === "hidden") return;

  const link = contactEl.querySelector("a");
  if (!link) return;

  const lr = link.getBoundingClientRect();
  if (lr.bottom < -40 || lr.top > window.innerHeight + 40) return;

  const size = cssPx(style.fontSize, 12);
  const weight = style.fontWeight || "400";
  const alignRight = contactEl.classList.contains("contact--phone");
  const alignCenter = contactEl.classList.contains("contact--cv");

  ctx.fillStyle = CONFIG.ink;
  ctx.font = `${weight} ${size}px ${fontStack(style)}`;
  ctx.textAlign = alignRight ? "right" : alignCenter ? "center" : "left";
  ctx.textBaseline = "top";

  const x = alignRight
    ? lr.right
    : alignCenter
      ? lr.left + lr.width / 2
      : lr.left;
  ctx.fillText(link.textContent.trim(), x, lr.top);
}

function paintProjectMedia(ctx, width, height) {
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

    drawImageCover(ctx, img, br.left, br.top, br.width, br.height);
  });
}

function paintScene(ctx, width, height, scale = 1) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  ctx.fillStyle = CONFIG.bg;
  ctx.fillRect(0, 0, width, height);

  paintContactLink(ctx, document.getElementById("contact-email"));
  paintContactLink(ctx, document.getElementById("contact-cv"));
  paintContactLink(ctx, document.getElementById("contact-phone"));

  paintWrappedElement(ctx, document.getElementById("bio-text"));
  paintWrappedElement(ctx, document.getElementById("project-title"));
  paintWrappedElement(ctx, document.getElementById("project-subhead"));
  paintWrappedElement(ctx, document.getElementById("project-body"));

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
    ctx.translate(br.left + br.width / 2, br.top + br.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.translate(-fw / 2, -fh / 2);

    if (pathD) {
      ctx.clip(pathToCanvas(pathD, local));
    }
    drawImageCover(ctx, img, 0, 0, fw, fh);
    ctx.restore();
  });

  paintProjectMedia(ctx, width, height);
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

  const dprCap = Math.min(window.devicePixelRatio || 1, SCENE_DPR_CAP);

  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: false,
    alpha: true,
    premultipliedAlpha: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(dprCap);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  const sceneCanvas = document.createElement("canvas");
  const sceneCtx = sceneCanvas.getContext("2d", { willReadFrequently: false });
  const sceneTex = createTextureFromCanvas(sceneCanvas);

  const uniforms = {
    u_image: { value: sceneTex },
    u_resolution: {
      value: new THREE.Vector2(window.innerWidth, window.innerHeight),
    },
    u_imageRes: { value: new THREE.Vector2(1, 1) },
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
    u_magnify: { value: CONFIG.magnify },
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
    uniform sampler2D u_image;
    uniform vec2 u_resolution;
    uniform vec2 u_imageRes;

    uniform vec2 u_mouse;
    uniform float u_time;
    uniform float u_visibility;
    uniform vec2 u_trail[${TRAIL_COUNT}];
    uniform float u_trailLength;
    uniform float u_trailTaper;

    uniform float u_radius;
    uniform float u_distortion;
    uniform float u_noiseScale;
    uniform float u_speed;
    uniform float u_edgeSoftness;
    uniform float u_refraction;
    uniform float u_magnify;
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
      for (int i = 0; i < 2; i++) {
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
      for (int i = 0; i < ${TRAIL_SEGMENTS}; i++) {
        vec2 a = (u_trail[i] - u_mouse) * aspect * u_trailLength;
        vec2 b = (u_trail[i + 1] - u_mouse) * aspect * u_trailLength;
        float ra = u_radius * (1.0 - u_trailTaper * float(i) / float(${TRAIL_SEGMENTS}));
        float rb = u_radius * (1.0 - u_trailTaper * float(i + 1) / float(${TRAIL_SEGMENTS}));
        vec3 segmentField = taperedCapsule(p, a, b, ra, rb);
        float blendWidth = u_radius * 0.12 * smoothstep(0.0, u_radius * 0.15, length(b - a));
        liquidField = mergeFields(liquidField, segmentField, blendWidth);
      }

      float field = liquidField.x - u_radius * (n - 0.5) * u_distortion * 2.0;
      float mask = 1.0 - smoothstep(-u_edgeSoftness, u_edgeSoftness, field);
      float edgeProfile = smoothstep(0.0, 0.5, mask) * (1.0 - smoothstep(0.5, 1.0, mask));
      vec2 refractionDir = liquidField.yz;
      vec2 rimOffset = refractionDir * edgeProfile * u_refraction * u_visibility;

      // Enlarge content under the lens (zoom UV around pointer)
      float zoom = mix(1.0, u_magnify, mask * u_visibility);
      vec2 magnifiedUv = u_mouse + (vUv - u_mouse) / max(zoom, 0.0001);

      // Optical rim: dual sample with opposite refraction (single texture)
      vec2 parallaxOffset = (u_mouse - 0.5) * u_parallax * mask * u_visibility;
      vec2 outerUv = getCoverUv(magnifiedUv + rimOffset, u_resolution, u_imageRes);
      vec2 innerUv = getCoverUv(magnifiedUv - rimOffset, u_resolution, u_imageRes) + parallaxOffset;
      vec4 colOuter = texture2D(u_image, outerUv);
      vec4 colInner = texture2D(u_image, innerUv);

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

  function resizeSceneCanvas(w, h, dpr) {
    const bw = Math.max(1, Math.floor(w * dpr));
    const bh = Math.max(1, Math.floor(h * dpr));
    if (sceneCanvas.width !== bw || sceneCanvas.height !== bh) {
      sceneCanvas.width = bw;
      sceneCanvas.height = bh;
    }
  }

  function rebuildSceneTexture() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, SCENE_DPR_CAP);
    resizeSceneCanvas(w, h, dpr);

    paintScene(sceneCtx, w, h, dpr);

    sceneTex.needsUpdate = true;
    uniforms.u_imageRes.value.set(sceneCanvas.width, sceneCanvas.height);
    uniforms.u_resolution.value.set(w, h);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
  }

  rebuildSceneTexture();
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
  let scrollDirtyTimer = 0;
  let sceneDirty = true;

  const markDirty = () => {
    sceneDirty = true;
  };

  const markScrollDirty = () => {
    window.clearTimeout(scrollDirtyTimer);
    scrollDirtyTimer = window.setTimeout(markDirty, SCROLL_DIRTY_MS);
  };

  window.addEventListener("scroll", markScrollDirty, { passive: true });
  window.addEventListener("project-media-change", markDirty);
  window.addEventListener("resize", () => {
    markDirty();
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      rebuildSceneTexture();
      sceneDirty = false;
    }, 100);
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
      if (sceneDirty) {
        rebuildSceneTexture();
        sceneDirty = false;
      }
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

    // Skip expensive scene paints while the lens is fully hidden
    if (sceneDirty && uniforms.u_visibility.value > 0) {
      rebuildSceneTexture();
      sceneDirty = false;
    }

    uniforms.u_time.value += delta;

    accumulator += delta;
    const mouseAlpha = 1 - Math.pow(1 - CONFIG.mouseSmoothness, fixedStep * 60);
    const trailAlpha =
      1 - Math.exp((-fixedStep * TRAIL_SEGMENTS) / CONFIG.trailPersistence);

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
