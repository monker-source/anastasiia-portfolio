/**
 * Load Decap-managed JSON and helpers for the public site.
 */

const INTRO_URL = new URL("../content/info/intro.json", import.meta.url);
const CONTACTS_URL = new URL("../content/info/contacts.json", import.meta.url);
const PROJECTS_INDEX_URL = new URL("../data/projects-index.json", import.meta.url);

let siteCache = null;
let projectsCache = null;

/** Turn Decap/public paths into URLs relative to the current page. */
export function mediaUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const cleaned = String(path).replace(/^\//, "");
  return new URL(`../${cleaned}`, import.meta.url).href;
}

export function projectHasDetail(project) {
  const d = project?.detail;
  return Boolean(d?.hero && d?.body);
}

export function projectHref(project) {
  if (!projectHasDetail(project)) return null;
  return `./project.html?slug=${encodeURIComponent(project.slug)}`;
}

export async function loadSite() {
  if (siteCache) return siteCache;
  const [introRes, contactsRes] = await Promise.all([
    fetch(INTRO_URL, { cache: "no-store" }),
    fetch(CONTACTS_URL, { cache: "no-store" }),
  ]);
  if (!introRes.ok) throw new Error(`Failed to load intro (${introRes.status})`);
  if (!contactsRes.ok) {
    throw new Error(`Failed to load contacts (${contactsRes.status})`);
  }
  const intro = await introRes.json();
  const contacts = await contactsRes.json();
  siteCache = {
    bio: intro.text || "",
    artistName: contacts.artistName || "",
    email: contacts.email || "",
    phone: contacts.phone || "",
    phoneDisplay: contacts.phoneDisplay || "",
    cvUrl: contacts.cvUrl || "",
  };
  return siteCache;
}

export async function loadProjects() {
  if (projectsCache) return projectsCache;
  const res = await fetch(PROJECTS_INDEX_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load projects index (${res.status})`);
  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  projectsCache = items.slice().sort((a, b) => {
    const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : 9999;
    const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : 9999;
    if (ao !== bo) return ao - bo;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
  return projectsCache;
}

export async function loadPublishedProjects() {
  const all = await loadProjects();
  return all.filter((p) => p.published !== false);
}

export async function loadProjectBySlug(slug) {
  const all = await loadProjects();
  return all.find((p) => p.slug === slug) || null;
}

export function applySiteChrome(site) {
  if (!site) return;

  document.querySelectorAll(".site-brand").forEach((el) => {
    el.textContent = site.artistName || el.textContent;
  });

  const bioEl = document.getElementById("bio-text");
  if (bioEl && site.bio) {
    bioEl.textContent = site.bio;
  }

  const email = document.querySelector("#contact-email a");
  if (email && site.email) {
    email.href = `mailto:${site.email}`;
    email.setAttribute("aria-label", `Email ${site.email}`);
  }

  const phone = document.querySelector("#contact-phone a");
  if (phone && site.phone) {
    phone.href = `tel:${site.phone}`;
    const label = site.phoneDisplay || site.phone;
    phone.setAttribute("aria-label", `Call ${label}`);
  }

  const cv = document.querySelector("#contact-cv a");
  if (cv && site.cvUrl) {
    cv.href = site.cvUrl;
  }

  if (site.artistName && !document.title.includes("—")) {
    const page = document.body.classList.contains("page-project")
      ? null
      : site.artistName;
    if (page) document.title = page;
  }
}

/** Catalog shape used by ALL PROJECTS overlays (array already sorted by order). */
export function toCatalogEntry(project) {
  const layout = project.layout || {};
  return {
    src: mediaUrl(project.preview),
    alt: project.title,
    href: projectHref(project),
    w: project.previewWidth || 750,
    h: project.previewHeight || 500,
    oy: layout.oy ?? 0,
    rot: layout.rot ?? 0,
    order: Number.isFinite(Number(project.order)) ? Number(project.order) : 9999,
    slug: project.slug,
  };
}

export function normalizeSlideshowImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        return item.image || item.src || item.path || "";
      }
      return "";
    })
    .filter(Boolean);
}

export function renderHomeTiles(projects, worldEl) {
  const world = worldEl || document.getElementById("world");
  if (!world) return;

  world.querySelectorAll(".tile").forEach((el) => el.remove());

  projects.forEach((project, index) => {
    const layout = project.layout || {};
    const fig = document.createElement("figure");
    fig.className = "tile";
    if (projectHasDetail(project)) fig.classList.add("tile--project");
    fig.dataset.ox = String(layout.ox ?? 0);
    fig.dataset.oy = String(layout.oy ?? 0);
    fig.dataset.wf = String(layout.wf ?? 0.4);
    fig.dataset.rot = String(layout.rot ?? 0);

    const img = document.createElement("img");
    img.src = mediaUrl(project.preview);
    img.alt = project.title;
    img.width = project.previewWidth || 750;
    img.height = project.previewHeight || 500;
    img.draggable = false;
    img.loading = index < 2 ? "eager" : "lazy";

    const href = projectHref(project);
    if (href) {
      const a = document.createElement("a");
      a.className = "tile__link";
      a.href = href;
      a.dataset.heroSrc = mediaUrl(project.detail.hero);
      a.setAttribute("aria-label", `Open project: ${project.title}`);
      a.appendChild(img);
      fig.appendChild(a);
    } else {
      fig.appendChild(img);
    }

    world.appendChild(fig);
  });
}

export function renderProjectPage(project) {
  const detail = project.detail || {};
  const world = document.getElementById("world");
  if (!world) return;

  document.title = `${project.title} — Anastasiia Bulatova`;

  const heroSrc = mediaUrl(detail.hero || project.preview);
  const heroW = project.previewWidth || 1200;
  const heroH = project.previewHeight || 675;

  world.replaceChildren();

  const hero = document.createElement("figure");
  hero.className = "project-tile project-tile--hero";
  hero.dataset.item = "";
  hero.dataset.ox = "0";
  hero.dataset.oy = "0";
  hero.dataset.hero = "";
  const heroImg = document.createElement("img");
  heroImg.src = heroSrc;
  heroImg.alt = project.title;
  heroImg.width = heroW;
  heroImg.height = heroH;
  heroImg.draggable = false;
  heroImg.loading = "eager";
  hero.appendChild(heroImg);
  world.appendChild(hero);

  const copy = document.createElement("section");
  copy.className = "project-copy";
  copy.dataset.item = "";
  copy.dataset.ox = "0";
  copy.dataset.cluster = "hero";
  const h1 = document.createElement("h1");
  h1.className = "project__title";
  h1.textContent = project.title;
  copy.appendChild(h1);
  if (detail.subhead) {
    const h2 = document.createElement("h2");
    h2.className = "project__subhead";
    h2.textContent = detail.subhead;
    copy.appendChild(h2);
  }
  if (detail.body) {
    const p = document.createElement("p");
    p.className = "project__body";
    p.textContent = detail.body;
    copy.appendChild(p);
  }
  world.appendChild(copy);

  const slideshows = Array.isArray(detail.slideshows) ? detail.slideshows : [];
  slideshows.forEach((show, si) => {
    const images = normalizeSlideshowImages(show.images);
    if (!images.length) return;

    const root = document.createElement("div");
    root.className = "project-tile slideshow";
    root.dataset.item = "";
    root.dataset.ox = String(show.ox ?? (si % 2 === 0 ? 0.34 : -0.36));
    root.dataset.oy = "0";
    root.dataset.wf = String(show.wf ?? 0.7);
    root.dataset.slideshow = "";
    root.setAttribute("aria-roledescription", "carousel");
    root.setAttribute("aria-label", show.label || `Gallery ${si + 1}`);

    const viewport = document.createElement("div");
    viewport.className = "slideshow__viewport";

    images.forEach((src, i) => {
      const slide = document.createElement("figure");
      slide.className = "slideshow__slide" + (i === 0 ? " is-active" : "");
      const img = document.createElement("img");
      img.alt = `${show.label || "Slide"} ${i + 1} of ${images.length}`;
      img.draggable = false;
      if (i === 0) {
        img.src = mediaUrl(src);
        img.loading = "eager";
      } else {
        img.dataset.src = mediaUrl(src);
        img.loading = "lazy";
      }
      slide.appendChild(img);
      viewport.appendChild(slide);
    });

    const bar = document.createElement("div");
    bar.className = "slideshow__bar";
    bar.innerHTML = `
      <button type="button" class="slideshow__hit slideshow__hit--prev" data-slideshow-prev aria-label="Previous slide"></button>
      <p class="slideshow__counter" data-slideshow-counter aria-live="polite">01 / ${String(images.length).padStart(2, "0")}</p>
      <button type="button" class="slideshow__hit slideshow__hit--next" data-slideshow-next aria-label="Next slide"></button>
    `;

    root.appendChild(viewport);
    root.appendChild(bar);
    world.appendChild(root);
  });
}
