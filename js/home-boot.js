/**
 * Homepage bootstrap: load Decap content, then start the canvas.
 */

import {
  applySiteChrome,
  loadPublishedProjects,
  loadSite,
  mediaUrl,
  renderHomeTiles,
} from "./content.js";

async function boot() {
  const [site, projects] = await Promise.all([
    loadSite(),
    loadPublishedProjects(),
  ]);

  applySiteChrome(site);
  renderHomeTiles(projects);

  const firstDetail = projects.find((p) => p.detail?.hero);
  if (firstDetail?.preview) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = mediaUrl(firstDetail.preview);
    document.head.appendChild(link);
  }

  await import("./endless-canvas.js");
}

boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<p style="padding:1rem;font-family:system-ui">Could not load site content. Serve this folder over HTTP (not file://).</p>`
  );
});
