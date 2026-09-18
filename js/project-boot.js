/**
 * Project page bootstrap: load one project by ?slug=, then canvas + slideshows.
 */

import {
  applySiteChrome,
  loadProjectBySlug,
  loadPublishedProjects,
  loadSite,
  mediaUrl,
  projectHasDetail,
  renderProjectPage,
  toCatalogEntry,
} from "./content.js";

async function boot() {
  const params = new URLSearchParams(location.search);
  const slug = params.get("slug");

  const [site, projects] = await Promise.all([
    loadSite(),
    loadPublishedProjects(),
  ]);
  applySiteChrome(site);

  let project = slug ? await loadProjectBySlug(slug) : null;
  if (!project || !projectHasDetail(project)) {
    project =
      projects.find((p) => projectHasDetail(p)) ||
      (await loadProjectBySlug("cartographic-spatial-struggle"));
  }

  if (!project || !projectHasDetail(project)) {
    location.replace("./index.html");
    return;
  }

  // Keep ?slug= in the URL when we fell back
  if (!slug || slug !== project.slug) {
    const url = new URL(location.href);
    url.searchParams.set("slug", project.slug);
    history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  renderProjectPage(project);

  try {
    const payload = JSON.parse(sessionStorage.getItem("projectEnter") || "null");
    const heroEl = document.querySelector("[data-hero]");
    if (heroEl && payload?.w) {
      heroEl.style.width = `${payload.w}px`;
      heroEl.style.height = `${payload.h}px`;
      heroEl.style.aspectRatio = "";
      const img = heroEl.querySelector("img");
      if (img && payload.src) img.src = payload.src;
    }
  } catch {
    /* ignore */
  }

  const heroLink = document.createElement("link");
  heroLink.rel = "preload";
  heroLink.as = "image";
  heroLink.href = mediaUrl(project.detail.hero);
  document.head.appendChild(heroLink);

  // Expose catalog for ALL PROJECTS overlay before it loads
  window.__PROJECTS_CATALOG__ = projects.map(toCatalogEntry);

  await Promise.all([
    import("./slideshow.js"),
    import("./project-canvas.js"),
    import("./project-all.js"),
  ]);
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<p style="padding:1rem;font-family:system-ui">Could not load project. Serve this folder over HTTP (not file://).</p>`
  );
});
