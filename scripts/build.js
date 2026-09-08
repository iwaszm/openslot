const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const turnstileSiteKey = process.env.OPENSLOT_TURNSTILE_SITE_KEY || "0x4AAAAAAEsrM-tkdjA40QZH";

const requiredEnv = ["OPENSLOT_SUPABASE_URL", "OPENSLOT_SUPABASE_ANON_KEY"];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of [
  "index.html",
  "home.css",
  "home.js",
  "styles.css",
  "customer.js",
  "admin.js",
  "i18n.js",
]) {
  copyFile(file);
}

for (const dir of ["assets", "datenschutz", "lisa", "liyong"]) {
  copyDir(dir);
}
replaceTurnstileSiteKeys(dist);

writeFile(
  "config.js",
  `window.OPENSLOT_SUPABASE = ${JSON.stringify(
    {
      url: process.env.OPENSLOT_SUPABASE_URL,
      anonKey: process.env.OPENSLOT_SUPABASE_ANON_KEY,
      turnstileSiteKey,
    },
    null,
    2,
  )};\n`,
);

writeFile(
  "_redirects",
  `/lisa /lisa/index.html 200
/lisa/admin /lisa/admin/index.html 200
/liyong /liyong/index.html 200
/liyong/admin /liyong/admin/index.html 200
`,
);

function copyFile(relativePath) {
  fs.copyFileSync(path.join(root, relativePath), path.join(dist, relativePath));
}

function copyDir(relativePath) {
  fs.cpSync(path.join(root, relativePath), path.join(dist, relativePath), {
    recursive: true,
  });
}

function writeFile(relativePath, content) {
  const target = path.join(dist, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function replaceTurnstileSiteKeys(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      replaceTurnstileSiteKeys(entryPath);
      continue;
    }
    if (!entry.name.endsWith(".html")) continue;
    const html = fs.readFileSync(entryPath, "utf8");
    fs.writeFileSync(
      entryPath,
      html.replace(/data-sitekey="[^"]*"/g, `data-sitekey="${escapeHtmlAttribute(turnstileSiteKey)}"`),
      "utf8",
    );
  }
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
