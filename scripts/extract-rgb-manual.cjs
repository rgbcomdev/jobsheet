const fs = require("fs");
const path = require("path");

const SRC = String.raw`c:\Users\USER\Downloads\NAVER WORKS\rgb_manual_v1.15.html`;
const ROOT = String.raw`D:\next\jobsheet`;
const PUBLIC_MANUAL = path.join(ROOT, "public", "manual");
const SHOTS_DIR = path.join(PUBLIC_MANUAL, "shots");
const APP_MANUAL = path.join(ROOT, "src", "app", "manual");

fs.mkdirSync(SHOTS_DIR, { recursive: true });
fs.mkdirSync(APP_MANUAL, { recursive: true });

const html = fs.readFileSync(SRC, "utf8");
console.log("source bytes:", Buffer.byteLength(html, "utf8"));
console.log("source chars:", html.length);

// Extract style
const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
if (!styleMatch) throw new Error("No <style> found");
const css = styleMatch[1].trim() + "\n";
fs.writeFileSync(path.join(APP_MANUAL, "manual.css"), css, "utf8");
console.log("CSS written, length:", css.length);

// Extract scripts (preserve)
const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map((m) => m[0]);
console.log("script tags:", scripts.length);

// Google fonts / head links of interest
const fontLinks = [...html.matchAll(/<link[^>]+>/gi)]
  .map((m) => m[0])
  .filter((t) => /fonts\.googleapis|fonts\.gstatic|preconnect/i.test(t));
console.log("font/preconnect links:", fontLinks.length);

// Body inner HTML
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
if (!bodyMatch) throw new Error("No <body> found");
let bodyInner = bodyMatch[1];

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function guessName(imgTag, surrounding) {
  const attrs = {
    id: (imgTag.match(/\bid=["']([^"']+)["']/i) || [])[1],
    class: (imgTag.match(/\bclass=["']([^"']+)["']/i) || [])[1],
    alt: (imgTag.match(/\balt=["']([^"']*)["']/i) || [])[1],
    dataSlot: (imgTag.match(/\bdata-slot=["']([^"']+)["']/i) || [])[1],
    dataName: (imgTag.match(/\bdata-name=["']([^"']+)["']/i) || [])[1],
  };
  const before = surrounding.slice(Math.max(0, surrounding.length - 500));
  const idMatches = [...before.matchAll(/\bid=["']([^"']+)["']/gi)];
  const parentIdClean = idMatches.length ? idMatches[idMatches.length - 1][1] : null;
  const classMatches = [...before.matchAll(/\bclass=["']([^"']+)["']/gi)];
  const parentClass = classMatches.length ? classMatches[classMatches.length - 1][1] : "";

  const candidates = [
    attrs.dataSlot,
    attrs.dataName,
    attrs.id,
    attrs.alt,
    parentIdClean,
    attrs.class && attrs.class.split(/\s+/).find((c) => /shot|screen|dash|admin|manual|img|preview/i.test(c)),
    parentClass && parentClass.split(/\s+/).find((c) => /shot|screen|dash|admin|section|part/i.test(c)),
  ].filter(Boolean);

  for (const c of candidates) {
    const slug = slugify(c);
    if (slug && slug !== "img" && slug !== "image") return slug;
  }
  return null;
}

const usedNames = new Set();
const imageMeta = [];
let imgIndex = 0;

bodyInner = bodyInner.replace(/<img\b[^>]*>/gi, (imgTag, offset, full) => {
  const srcMatch = imgTag.match(/\bsrc=["'](data:image\/(jpeg|jpg|png|webp|gif);base64,([^"']+))["']/i);
  if (!srcMatch) return imgTag;

  imgIndex += 1;
  const mime = srcMatch[2].toLowerCase();
  const b64 = srcMatch[3];
  const ext = mime === "png" ? "png" : mime === "webp" ? "webp" : mime === "gif" ? "gif" : "jpg";

  const surrounding = full.slice(Math.max(0, offset - 600), offset);
  let base = guessName(imgTag, surrounding) || `shot-${String(imgIndex).padStart(2, "0")}`;
  let name = base;
  let n = 2;
  while (usedNames.has(name)) {
    name = `${base}-${n}`;
    n += 1;
  }
  usedNames.add(name);

  const filename = `${name}.${ext}`;
  const outPath = path.join(SHOTS_DIR, filename);
  fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
  imageMeta.push({ index: imgIndex, file: filename, bytes: fs.statSync(outPath).size, name });

  const newSrc = `/manual/shots/${filename}`;
  return imgTag.replace(srcMatch[0], `src="${newSrc}"`);
});

console.log("images extracted:", imageMeta.length);

const parts = [];
const navBlock = (bodyInner.match(/<nav\b[\s\S]*?<\/nav>/i) || [])[0] || "";
const navLinks = [...navBlock.matchAll(/<a\b[^>]*href=["']#([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
for (const m of navLinks) {
  const id = m[1];
  const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (id && title) parts.push({ id, title });
}

if (parts.length === 0) {
  const sections = [...bodyInner.matchAll(/<(?:section|div|article)\b[^>]*\bid=["']([^"']+)["'][^>]*>[\s\S]{0,200}?<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)];
  for (const m of sections) {
    const id = m[1];
    const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (id && title) parts.push({ id, title });
  }
}

fs.writeFileSync(
  path.join(PUBLIC_MANUAL, "metadata.json"),
  JSON.stringify({ source: "rgb_manual_v1.15.html", parts, images: imageMeta, fonts: fontLinks }, null, 2),
  "utf8"
);

const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
const title = titleMatch ? titleMatch[1].trim() : "RGB Manual";

const scriptBlock = scripts.join("\n");
const fontBlock = fontLinks.join("\n  ");

// Move scripts out of bodyInner if they were inside body (avoid duplicate)
const bodyScripts = [...bodyInner.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map((m) => m[0]);
let bodyWithoutScripts = bodyInner;
for (const s of bodyScripts) {
  bodyWithoutScripts = bodyWithoutScripts.replace(s, "");
}
// Prefer scripts originally in document; if scripts only in body, keep those
const finalScripts = scripts.length ? scripts : bodyScripts;
const cleanedBody = (scripts.length ? bodyWithoutScripts : bodyInner).trim();

const cleaned = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  ${fontBlock}
  <link rel="stylesheet" href="/manual/manual.css" />
</head>
<body>
${cleanedBody}
${finalScripts.join("\n")}
</body>
</html>
`;

fs.writeFileSync(path.join(PUBLIC_MANUAL, "manual.css"), css, "utf8");
fs.writeFileSync(path.join(PUBLIC_MANUAL, "index.html"), cleaned, "utf8");
fs.writeFileSync(path.join(PUBLIC_MANUAL, "body.html"), cleanedBody + "\n", "utf8");

function dirSize(dir) {
  let total = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) total += dirSize(p);
    else total += fs.statSync(p).size;
  }
  return total;
}

const totalSize = dirSize(PUBLIC_MANUAL);
const scriptPreserved = finalScripts.length > 0 && cleaned.includes("<script");

console.log("--- SUMMARY ---");
console.log("image count:", imageMeta.length);
console.log("images:", imageMeta.map((i) => i.file).join(", "));
console.log("total public/manual size bytes:", totalSize);
console.log("total public/manual size MB:", (totalSize / (1024 * 1024)).toFixed(2));
console.log("part titles:");
for (const p of parts) console.log(`  - ${p.id}: ${p.title}`);
console.log("script preserved:", scriptPreserved, `(${finalScripts.length} tag(s))`);
console.log("outputs:");
console.log(" ", path.join(PUBLIC_MANUAL, "index.html"));
console.log(" ", path.join(PUBLIC_MANUAL, "body.html"));
console.log(" ", path.join(PUBLIC_MANUAL, "manual.css"));
console.log(" ", path.join(APP_MANUAL, "manual.css"));
console.log(" ", path.join(PUBLIC_MANUAL, "metadata.json"));
console.log(" ", SHOTS_DIR);
