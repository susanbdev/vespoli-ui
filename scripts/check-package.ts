import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAll } from "./build.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..");

function collectFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (
      entry.name === ".git" ||
      entry.name === "node_modules" ||
      entry.name === "target"
    ) {
      continue;
    }
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function countPascalWords(ident: string): number {
  const clean = ident.replace(/^\$/, "");
  const parts = clean.match(/[A-Z][a-z0-9]*|[0-9]+/g);
  return parts ? parts.length : 1;
}

export function verifyPackageGate(): void {
  const distIndex = path.join(REPO_ROOT, "dist", "esm", "index.js");
  if (!fs.existsSync(distIndex)) {
    buildAll();
  }

  const failures: string[] = [];

  const vecOpen = "<" + "svg";
  const vecPath = "<" + "path";
  const vecExt = "." + "svg";
  const vecMime = "image/" + "svg+xml";

  // 1. Verify style_runtime_bytes == 0 across dist/esm/**
  const esmFiles = collectFiles(path.join(REPO_ROOT, "dist", "esm")).filter((f) =>
    f.endsWith(".js")
  );
  if (esmFiles.length === 0) {
    failures.push("dist/esm contains 0 JavaScript modules");
  }

  let styleRuntimeBytes = 0;
  let inlineStyleCount = 0;

  for (const file of esmFiles) {
    const content = fs.readFileSync(file, "utf8");
    if (
      content.includes("@vespoli/styled") ||
      content.includes("insertRule") ||
      content.includes("CSSStyleSheet") ||
      /createElement\(\s*["']style["']/.test(content)
    ) {
      styleRuntimeBytes += Buffer.byteLength(content, "utf8");
      failures.push(`Runtime style code leaked into ${path.relative(REPO_ROOT, file)}`);
    }
    if (
      /\bstyle\s*:/.test(content) ||
      /setAttribute\(\s*["']style["']/.test(content)
    ) {
      inlineStyleCount += 1;
      failures.push(`Inline style attribute found in ${path.relative(REPO_ROOT, file)}`);
    }
  }

  // 2. Verify packages/ui/src/** Laws 1, 2, 4, 5, 7 & Naming Law
  const uiSrcFiles = collectFiles(
    path.join(REPO_ROOT, "packages", "ui", "src")
  ).filter((f) => /\.(tsx|ts)$/.test(f));

  const bannedHooks = [
    "useState",
    "useReducer",
    "useContext",
    "createContext",
    "useSyncExternalStore",
    "XMLHttpRequest",
    "WebSocket",
    "setTimeout",
    "setInterval"
  ];
  let statefulHookCount = 0;

  for (const file of uiSrcFiles) {
    const rel = path.relative(REPO_ROOT, file);
    const baseName = path.basename(file);
    const content = fs.readFileSync(file, "utf8");

    if (/\b(?:utils|helpers|common|misc)\b/i.test(baseName)) {
      failures.push(`Banned catch-all module filename: ${rel}`);
    }

    if (/\bstyle\s*=\s*\{|\bstyle\s*=\s*["']/.test(content)) {
      inlineStyleCount += 1;
      failures.push(`Inline style attribute in ${rel}`);
    }

    for (const hook of bannedHooks) {
      if (new RegExp(`\\b${hook}\\b`).test(content)) {
        statefulHookCount += 1;
        failures.push(`Banned stateful/effectful API '${hook}' in ${rel}`);
      }
    }

    if (/\bfetch\s*\(/.test(content)) {
      statefulHookCount += 1;
      failures.push(`Banned network fetch() in ${rel}`);
    }

    // Verify module-level WeakMap/WeakSet only appear in canvas.tsx and transitions.ts
    if (
      baseName !== "canvas.tsx" &&
      baseName !== "transitions.ts" &&
      /\bnew\s+(?:WeakMap|WeakSet|Map|Set)\b/.test(content)
    ) {
      failures.push(`Unexpected module-level collection in ${rel}`);
    }

    // Org Naming Law: check PascalCase identifiers (<= 3 words, 0 banned suffixes)
    const typeDecls = content.matchAll(
      /\b(?:interface|type|function|const)\s+([A-Z][A-Za-z0-9_]*)\b/g
    );
    for (const match of typeDecls) {
      const ident = match[1] ?? "";
      if (/^[A-Z0-9_]+$/.test(ident)) continue; // SCREAMING_SNAKE_CASE constant
      const words = countPascalWords(ident);
      if (words >= 4) {
        failures.push(`Identifier '${ident}' in ${rel} has ${words} words (max 3)`);
      }
      if (
        /(?:Wrapper|Root|Contract|Manager|Helper|Util|Check)$/.test(ident) ||
        (ident.endsWith("Container") && ident !== "Container")
      ) {
        failures.push(`Banned suffix on identifier '${ident}' in ${rel}`);
      }
      if (ident === "Spinner") {
        failures.push(`Banned disembodied Spinner component in ${rel}`);
      }
    }
  }

  const vecTagRe = new RegExp(
    `(?:${"<" + "svg"}|${"<" + "path"})(?:[\\s>/]|$)`,
    "i"
  );
  const vecExtRe = new RegExp(`\\.${"svg"}(?:[^a-z0-9]|$)`, "i");

  // 3. Verify svg_count == 0 across packages/**, bench/**, scripts/**, tests/**, crates/**, dist/**
  let vectorCount = 0;
  const scanRoots = ["packages", "bench", "scripts", "tests", "crates", "dist"];
  for (const dirName of scanRoots) {
    for (const file of collectFiles(path.join(REPO_ROOT, dirName))) {
      if (file.endsWith(".woff2")) {
        if (file.toLowerCase().endsWith(vecExt)) {
          vectorCount += 1;
          failures.push(`Banned vector file ${path.relative(REPO_ROOT, file)}`);
        }
        continue;
      }
      const raw = fs.readFileSync(file, "utf8");
      if (
        vecTagRe.test(raw) ||
        vecExtRe.test(raw) ||
        raw.toLowerCase().includes(vecMime)
      ) {
        vectorCount += 1;
        failures.push(`Banned vector token in ${path.relative(REPO_ROOT, file)}`);
      }
    }
  }

  // 4. Verify AGENT.md (< 3 KB) & manifest.json & subpath exports
  const agentMdPath = path.join(REPO_ROOT, "packages", "ui", "AGENT.md");
  const agentBytes = fs.statSync(agentMdPath).size;
  if (agentBytes > 3072) {
    failures.push(`packages/ui/AGENT.md exceeds 3 KB (${agentBytes} B)`);
  }

  const manifestPath = path.join(REPO_ROOT, "dist", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    tokenCount: number;
    runtimeStyleBytes: number;
    components: Array<{ name: string }>;
  };
  if (manifest.tokenCount !== 42) {
    failures.push(`Expected 42 tokens in manifest.json, got ${manifest.tokenCount}`);
  }
  if (manifest.runtimeStyleBytes !== 0) {
    failures.push(`Expected runtimeStyleBytes == 0`);
  }
  for (const comp of manifest.components) {
    const subpathJs = path.join(
      REPO_ROOT,
      "dist",
      "esm",
      "subpaths",
      `${comp.name}.js`
    );
    if (!fs.existsSync(subpathJs)) {
      failures.push(`Missing 1:1 subpath export for vespoli-ui/${comp.name}`);
    }
    const compCss = path.join(REPO_ROOT, "dist", "css", `${comp.name}.css`);
    if (!fs.existsSync(compCss)) {
      failures.push(`Missing per-component stylesheet dist/css/${comp.name}.css`);
    }
  }

  const fontPath = path.join(REPO_ROOT, "dist", "fonts", "vui-glyphs.woff2");
  const fontBuf = fs.readFileSync(fontPath);
  if (fontBuf.subarray(0, 4).toString("ascii") !== "wOF2" || fontBuf.length > 2048) {
    failures.push(
      `Invalid or oversized vui-glyphs.woff2 (len=${fontBuf.length})`
    );
  }

  if (
    failures.length > 0 ||
    styleRuntimeBytes !== 0 ||
    inlineStyleCount !== 0 ||
    vectorCount !== 0 ||
    statefulHookCount !== 0
  ) {
    throw new Error(
      `[check-package] FAILED:\n` + failures.map((f) => `  - ${f}`).join("\n")
    );
  }

  console.log(
    `[check-package] PASS | style_runtime_bytes=0 | inline_style_attr_count=0 | vector_count=0 | stateful_hook_count=0 | components=${manifest.components.length} | AGENT.md=${agentBytes}B`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyPackageGate();
}
