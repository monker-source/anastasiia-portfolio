/**
 * Project media slideshows.
 * Files named like 2a / 2b / 2c are grouped into one carousel.
 * Click left half → previous, right half → next. Counter: 01 / 03.
 */

const initialized = new WeakSet();

function pad2(n) {
  return String(n).padStart(2, "0");
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

  const render = () => {
    slides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === index);
    });
    if (counter) {
      counter.textContent = `${pad2(index + 1)} / ${pad2(slides.length)}`;
    }
    window.dispatchEvent(new CustomEvent("project-media-change"));
  };

  const go = (delta) => {
    index = (index + delta + slides.length) % slides.length;
    render();
  };

  prevBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    go(-1);
  });
  nextBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    go(1);
  });

  viewport?.addEventListener("click", (e) => {
    const rect = viewport.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    go(e.clientX < mid ? -1 : 1);
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
