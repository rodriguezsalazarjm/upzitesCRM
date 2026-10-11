// Reproduce la lista de archivos que `vercel deploy` subiría desde un directorio,
// usando EL MISMO código del CLI instalado: el módulo `ignore@4.0.6` se extrae
// tal cual de su chunk empaquetado, y el recorrido replica readdir-recursive
// (una carpeta ignorada se poda entera). Lista por defecto copiada del CLI.
// Uso (desde la raíz del repo): node apps/web/scripts/qa/vercel-upload-filelist.cjs .
// La ruta CHUNK apunta al CLI instalado globalmente; si el CLI se actualiza, ajustarla.
const fs = require("fs");
const path = require("path");

const CHUNK = "C:/Users/rodri/AppData/Roaming/npm/node_modules/vercel/dist/chunks/chunk-T77OYIET.js";
const src = fs.readFileSync(CHUNK, "utf8");
const start = src.indexOf('"../../node_modules/.pnpm/ignore@4.0.6/node_modules/ignore/index.js"(exports, module) {');
const end = src.indexOf("module.exports = (options) => new IgnoreBase(options);", start);
if (start < 0 || end < 0) throw new Error("no se encontró ignore@4.0.6 en el CLI");
const body = src.slice(src.indexOf("{", start) + 1, end) + "module.exports = (options) => new IgnoreBase(options);";
const mod = { exports: {} };
new Function("exports", "module", "require", body)(mod.exports, mod, require);
const makeIgnore = mod.exports;

// Lista por defecto del CLI (getVercelIgnore, rama no-prebuilt).
const DEFAULTS = [".hg", ".git", ".gitmodules", ".svn", ".cache", ".next", ".now", ".vercel", ".npmignore", ".dockerignore", ".gitignore", ".*.swp", ".DS_Store", ".wafpicke-*", ".lock-wscript", ".env.local", ".env.*.local", ".venv", ".yarn/cache", ".pnp*", "npm-debug.log", "config.gypi", "node_modules", "__pycache__", "venv", "CVS"];
const cliSrcHasDefaults = DEFAULTS.every((d) => src.includes(JSON.stringify(d)));

const cwd = path.resolve(process.argv[2]);
const ignoreFile = process.argv[3] ?? path.join(cwd, ".vercelignore");
const ignoreText = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, "utf8") : "";
const ig = makeIgnore();
ig.add(`${DEFAULTS.join("\n")}\n${ignoreText.replace(/(\n|^)\.\//g, "$1")}`);

const files = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = path.relative(cwd, abs);
    if (ig.ignores(rel)) continue;
    const st = fs.lstatSync(abs);
    if (st.isDirectory()) walk(abs);
    else files.push(rel.split(path.sep).join("/"));
  }
}
walk(cwd);

const envFiles = files.filter((f) => /(^|\/)\.env(\.|$)/.test(path.posix.basename(f)) || /(^|\/)\.env/.test(f));
console.log(JSON.stringify({
  cliDefaultsVerified: cliSrcHasDefaults,
  ignoreFile: path.relative(process.cwd(), ignoreFile) || ignoreFile,
  totalFiles: files.length,
  envFilesUploaded: envFiles,
  webAppFiles: files.filter((f) => f.startsWith("apps/web/")).length,
  hasWebPackageJson: files.includes("apps/web/package.json"),
  hasRootLockfile: files.includes("pnpm-lock.yaml"),
  hasWorkspaceFile: files.includes("pnpm-workspace.yaml"),
  hasRootPackageJson: files.includes("package.json"),
  docsIncluded: files.some((f) => f.startsWith("docs/")),
}, null, 2));
if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, files.sort().join("\n"));
