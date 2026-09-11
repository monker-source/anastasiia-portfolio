/**
 * Infinite scroll for project media.
 * Near the end of the stack, append another copy of the original set.
 * Horizontal offsets stay varied across clones.
 */
import { initAllSlideshows } from "./slideshow.js";

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const section = document.querySelector("[data-infinite-media]");
if (section) {
  const templateItems = [...section.querySelectorAll(":scope > [data-media-item]")];
  let setCount = 1;
  let appending = false;

  const assignOffsets = (items, setIndex) => {
    const rand = mulberry32(0xc2a1 + setIndex * 7919);
    const count = items.length;
    const slots = Array.from({ length: count }, (_, i) =>
      count === 1 ? 0.5 : 0.06 + (i / Math.max(1, count - 1)) * 0.88
    );
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    items.forEach((el, i) => {
      const n = (rand() - 0.5) * 0.1;
      const x = Math.min(0.94, Math.max(0.06, slots[i] + n));
      el.style.setProperty("--media-x", x.toFixed(4));
    });
  };

  assignOffsets(templateItems, 0);

  const appendSet = () => {
    if (appending || !templateItems.length) return;
    appending = true;
    const frag = document.createDocumentFragment();
    const clones = templateItems.map((item) => {
      const clone = item.cloneNode(true);
      clone.querySelectorAll("img").forEach((img) => {
        img.loading = "lazy";
      });
      // Reset slideshow active state
      const slides = clone.querySelectorAll(".slideshow__slide");
      slides.forEach((slide, i) => {
        slide.classList.toggle("is-active", i === 0);
      });
      const counter = clone.querySelector("[data-slideshow-counter]");
      if (counter && slides.length) {
        counter.textContent = `01 / ${String(slides.length).padStart(2, "0")}`;
      }
      frag.appendChild(clone);
      return clone;
    });
    section.appendChild(frag);
    assignOffsets(clones, setCount);
    setCount += 1;
    initAllSlideshows(section);
    window.dispatchEvent(new CustomEvent("project-media-change"));
    appending = false;
  };

  // Seed a second set so the loop feels continuous early
  appendSet();

  const onScroll = () => {
    const rect = section.getBoundingClientRect();
    const remaining = rect.bottom - window.innerHeight;
    if (remaining < window.innerHeight * 1.25) {
      appendSet();
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}
