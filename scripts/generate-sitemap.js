(async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const SITE_URL = "https://japanmemorylane.com";
  const scriptDir = path.dirname(process.argv[1]);
  const PUBLIC_DIR = fs.existsSync(path.join(scriptDir, "..", "public"))
    ? path.join(scriptDir, "..", "public")
    : path.join(scriptDir, "..");
  const DISALLOW = [
    "/api/"
  ];

  const EXCLUDED_SEGMENTS = new Set([
    "api",
    "assets",
    "debug",
    "draft",
    "private",
    "admin",
    "test",
    "tests",
    "missing",
    "raw",
    "recovered",
    "old",
  ]);

  const EXCLUDED_FILES = new Set(["404.html", "index-old.html"]);

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(fullPath);
      return fullPath;
    });
  }

  function toRelative(filePath) {
    return path.relative(PUBLIC_DIR, filePath).split(path.sep).join("/");
  }

  function shouldExclude(relPath) {
    const lower = relPath.toLowerCase();
    const fileName = path.posix.basename(lower);
    const segments = lower.split("/");

    if (!lower.endsWith(".html")) return true;
    if (EXCLUDED_FILES.has(fileName)) return true;
    if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) return true;
    if (lower.includes("/recovered/raw/")) return true;
    if (lower.includes("/node_modules/")) return true;
    return false;
  }

  function toUrlPath(relPath) {
    const normalized = relPath.replace(/\\/g, "/");
    if (normalized === "index.html") return "/";
    if (normalized.endsWith("/index.html")) {
      return `/${normalized.slice(0, -"index.html".length)}`;
    }
    return `/${normalized}`;
  }

  function xmlEscape(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  const urls = walk(PUBLIC_DIR)
    .map(toRelative)
    .filter((relPath) => !shouldExclude(relPath))
    .map(toUrlPath)
    .sort((a, b) => a.localeCompare(b));

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((urlPath) => `  <url><loc>${xmlEscape(new URL(urlPath, SITE_URL).href)}</loc></url>`),
    '</urlset>',
    '',
  ].join("\n");

  const robots = [
    "User-agent: *",
    "Allow: /",
    ...DISALLOW.map((pathName) => `Disallow: ${pathName}`),
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");

  fs.writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), sitemap, "utf8");
  fs.writeFileSync(path.join(PUBLIC_DIR, "robots.txt"), robots, "utf8");
  console.log(`Generated sitemap with ${urls.length} URLs.`);
})();