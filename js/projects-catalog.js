/**
 * Shared project peeks — loaded from Decap content when available.
 * Kept as a sync fallback for tooling; runtime uses window.__PROJECTS_CATALOG__
 * or fetch via content.js.
 */

import { loadPublishedProjects, toCatalogEntry } from "./content.js";

export async function getProjectsCatalog() {
  if (Array.isArray(window.__PROJECTS_CATALOG__)) {
    return window.__PROJECTS_CATALOG__;
  }
  const projects = await loadPublishedProjects();
  return projects.map(toCatalogEntry);
}

/** @deprecated Prefer getProjectsCatalog() — empty until hydrated */
export const PROJECTS = [];
