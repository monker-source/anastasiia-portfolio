/**
 * Project media slideshows.
 * Files named like 2a / 2b / 2c are grouped into one carousel.
 * Click left half → previous, right half → next. Counter: 01 / 03.
 *
 * Inactive slides keep their URL in data-src so stacked/in-viewport
 * carousels do not download every frame on first paint.
 */

const initialized = new WeakSet();

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Move src → data-src for deferred slides (same-viewport lazy is unreliable). */
function deferInactiveSlides(slides, activeIndex) {
  slides.forEach((slide, i) => {
    const img = slide.querySelector("img");
    if (!img) return;
    if (i === activeIndex) {
      ensureSrc(img);
      return;
    }
    if (img.src && !img.dataset.src) {
      img.dataset.src = img.getAttribute("src") || img.src;
      img.removeAttribute("src");
      img.loading = "lazy";
    }
  });
}

function ensureSrc(img) {
  if (!img) return;
  const pending = img.dataset.src || img.getAttribute("data-src");
  if (pending && !img.getAttribute("src")) {
    img.src = pending;
  }
  img.decoding = "async";
}

function warmImage(img) {
  if (!img) return;
  ensureSrc(img);
  if (!img.src) return;
  if (img.complete) return;
  const warm = new Image();
  warm.src = img.currentSrc || img.src;
}

/** Prefetch only the next slide for snappy forward navigation. */
function preloadNextSlide(slides, index) {
  const next = slides[(index + 1) % slides.length];
  warmImage(next?.querySelector("img"));
}

function lockViewportAspect(root) {
  const viewport = root.querySelector(".slideshow__viewport");
  const probe =
    root.querySelector(".slideshow__slide.is-active img") ||
    root.querySelector(".slideshow__slide img");
  if (!viewport || !probe) return;

  ensureSrc(probe);

  const apply = () => {
    const w = probe.naturalWidth;
    const h = probe.naturalHeight;
    if (w > 0 && h > 0) {
      viewport.style.aspectRatio = `${w} / ${h}`;
      root.classList.add("is-sized");
    }
  };

  if (probe.complete && probe.naturalWidth) apply();
  else probe.addEventListener("load", apply, { once: true });
}

export function initSlideshow(root) {
  if (!root || initialized.has(root)) return;
  const slides = [...root.querySelectorAll(".slideshow__slide")];
  if (slides.length < 2) return;

  initialized.add(root);

  const counter = root.querySelector("[data-slideshow-counter]");
  const prevBtn = root.querySelector("[data-slideshow-prev]");
  const nextBtn = root.querySelector("[data-slideshow-next]");
  const viewport = root.querySelector(".slideshow__viewport");
  let index = Math.max(
    0,
    slides.findIndex((s) => s.classList.contains("is-active"))
  );

  deferInactiveSlides(slides, index);

  const render = () => {
    slides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === index);
      if (i === index) ensureSrc(slide.querySelector("img"));
    });
    if (counter) {
      counter.textContent = `${pad2(index + 1)} / ${pad2(slides.length)}`;
    }
    preloadNextSlide(slides, index);
    lockViewportAspect(root);
    window.dispatchEvent(new CustomEvent("project-media-change"));
  };

  const go = (delta) => {
    index = (index + delta + slides.length) % slides.length;
    render();
  };

  const tapAt = (clientX) => {
    const rect = viewport.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    go(clientX < mid ? -1 : 1);
  };

  prevBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    go(-1);
  });
  nextBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    go(1);
  });

  // Vertical canvas pans steal pointer capture; project-canvas sends this for taps
  root.addEventListener("canvas-slideshow-tap", (e) => {
    tapAt(e.detail?.clientX ?? 0);
  });

  viewport?.addEventListener("click", (e) => {
    // Ignore synthetic click right after canvas-handled tap
    if (performance.now() - (window.__slideshowTapLock || 0) < 80) return;
    tapAt(e.clientX);
  });

  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  });

  root.tabIndex = 0;
  root.classList.add("is-ready");
  render();
}

export function initAllSlideshows(scope = document) {
  scope.querySelectorAll("[data-slideshow]").forEach(initSlideshow);
}

initAllSlideshows();
