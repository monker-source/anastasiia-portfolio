#!/usr/bin/env node
/**
 * Scan content/projects/*.json → data/projects-index.json
 * Run on Netlify build and locally before preview (npm run build).
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const projectsDir = path.join(root, "content", "projects");
const outDir = path.join(root, "data");
const outFile = path.join(outDir, "projects-index.json");

function readProjects() {
  if (!fs.existsSync(projectsDir)) return [];
  return fs
    .readdirSync(projectsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const raw = fs.readFileSync(path.join(projectsDir, name), "utf8");
      const data = JSON.parse(raw);
      const slugFromFile = name.replace(/\.json$/i, "");
      if (!data.slug) data.slug = slugFromFile;
      return data;
    });
}

function sortProjects(items) {
  return items.slice().sort((a, b) => {
    const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : 9999;
    const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : 9999;
    if (ao !== bo) return ao - bo;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

const items = sortProjects(readProjects());
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ items }, null, 2) + "\n");
console.log(`Wrote ${items.length} projects → ${path.relative(root, outFile)}`);
