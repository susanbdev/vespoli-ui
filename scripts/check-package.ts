import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { auditSourceLaws } from "../packages/styled-compiler/src/index.ts";
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

function hasTopLevelCollection(source: string): boolean {
  let depth = 0;
  let quote: string | null = null;
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (quote) {
      if (ch === quote) {
        let bs = 0;
        let k = i;
        while (k > 0 && source[k - 1] === "\\") {
          bs += 1;
          k -= 1;
        }
        if ((bs & 1) === 0) quote = null;
      }
      i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i + 1 < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        i += 1;
      }
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}") {
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (depth === 0 && source.startsWith("new ", i)) {
      const prev = i > 0 ? source[i - 1]! : " ";
      if (!/[A-Za-z0-9_$]/.test(prev)) {
        const rest = source.slice(i + 4).trimStart();
        if (/^(?:WeakMap|WeakSet|Map|Set)\b/.test(rest)) {
          return true;
        }
      }
    }
    i += 1;
  }
  return false;
}

export function verifyPackageGate(): void {
  const distIndex = path.join(REPO_ROOT, "dist", "esm", "index.js");
  if (!fs.existsSync(distIndex)) {
    buildAll();
  }

  const failures: string[] = [];

  const vecMime = "image/" + "svg+xml";
  const vecExt = "." + "svg";

  // 1. Verify style_runtime_bytes == 0 and style/dangerouslySetInnerHTML stripping across dist/esm/**
  const esmFiles = collectFiles(path.join(REPO_ROOT, "dist", "esm")).filter((f) =>
    f.endsWith(".js")
  );
  if (esmFiles.length === 0) {
    failures.push("dist/esm contains 0 JavaScript modules");
  }

  let styleRuntimeBytes = 0;
  let inlineStyleCount = 0;

  for (const file of esmFiles) {
    const relEsm = path.relative(REPO_ROOT, file);
    const content = fs.readFileSync(file, "utf8");
    if (
      content.includes("@vespoli/styled") ||
      content.includes("insertRule") ||
      content.includes("CSSStyleSheet") ||
      /createElement\(\s*["'`]style["'`]/.test(content)
    ) {
      styleRuntimeBytes += Buffer.byteLength(content, "utf8");
      failures.push(`Runtime style code leaked into ${relEsm}`);
    }
    if (
      /(?<![\w$.])style\s*:(?!\s*_style\b)/.test(content) ||
      /(?<![\w$.])dangerouslySetInnerHTML\s*:(?!\s*_dangerouslySetInnerHTML\b)/.test(
        content
      ) ||
      /\.\s*style\s*(?:\.|\[)/.test(content) ||
      /setAttribute\(\s*["'`]style["'`]/.test(content)
    ) {
      inlineStyleCount += 1;
      failures.push(`Inline style or dangerouslySetInnerHTML emission found in ${relEsm}`);
    }
  }

  // 2. Verify packages/ui/src/** Laws 1, 2, 4, 5, 7, raw 7-bit LF ASCII & Naming Law
  const uiSrcFiles = collectFiles(
    path.join(REPO_ROOT, "packages", "ui", "src")
  ).filter((f) => /\.(tsx|ts)$/.test(f));

  let statefulHookCount = 0;

  for (const file of uiSrcFiles) {
    const rel = path.relative(REPO_ROOT, file);
    const baseName = path.basename(file);
    const rawBuf = fs.readFileSync(file);

    for (let idx = 0; idx < rawBuf.length; idx += 1) {
      const b = rawBuf[idx]!;
      if (b !== 9 && b !== 10 && (b < 32 || b > 126)) {
        failures.push(
          `Raw byte 0x${b.toString(16)} disallowed in ${rel} at offset ${idx}`
        );
        break;
      }
    }

    const content = rawBuf.toString("utf8");

    if (/\b(?:utils|helpers|common|misc)\b/i.test(baseName)) {
      failures.push(`Banned catch-all module filename: ${rel}`);
    }

    const lawDiags = auditSourceLaws(content, {
      isUiPackage: true,
      filePath: rel
    });
    for (const d of lawDiags) {
      if (d.code === "VUI002") statefulHookCount += 1;
      if (d.code === "VUI003") inlineStyleCount += 1;
      failures.push(`${rel}:${d.line ?? 0} ${d.code}: ${d.message}`);
    }

    // Verify module-level WeakMap/WeakSet/Map/Set only appear in canvas.tsx and transitions.ts
    if (
      baseName !== "canvas.tsx" &&
      baseName !== "transitions.ts" &&
      hasTopLevelCollection(content)
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

  // 3. Verify svg_count == 0 and 0 nested AGENT*.md files across packages/**, bench/**, scripts/**, tests/**, crates/**, dist/**
  let vectorCount = 0;
  const scanRoots = ["packages", "bench", "scripts", "tests", "crates", "dist"];
  for (const dirName of scanRoots) {
    for (const file of collectFiles(path.join(REPO_ROOT, dirName))) {
      const base = path.basename(file);
      if (/^agent.*\.md$/i.test(base)) {
        failures.push(
          `Nested AGENT*.md file is prohibited: ${path.relative(REPO_ROOT, file)}`
        );
      }
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

  // 4. Verify REFERENCE.md (< 3 KB) & manifest.json & subpath exports
  const refMdPath = path.join(REPO_ROOT, "packages", "ui", "REFERENCE.md");
  if (!fs.existsSync(refMdPath)) {
    failures.push("Missing packages/ui/REFERENCE.md");
  }
  const refBytes = fs.existsSync(refMdPath) ? fs.statSync(refMdPath).size : 0;
  if (refBytes > 3072) {
    failures.push(`packages/ui/REFERENCE.md exceeds 3 KB (${refBytes} B)`);
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
  if (
    fontBuf.length < 48 ||
    fontBuf.subarray(0, 4).toString("ascii") !== "wOF2" ||
    fontBuf.length >= 2048
  ) {
    failures.push(
      `Invalid or oversized vui-glyphs.woff2 (len=${fontBuf.length})`
    );
  } else {
    const numTables = fontBuf.readUInt16BE(12);
    const compressedLen = fontBuf.readUInt32BE(20);
    if (numTables !== 10 || compressedLen === 0 || compressedLen >= fontBuf.length) {
      failures.push(
        `Invalid WOFF2 header in vui-glyphs.woff2 (numTables=${numTables}, compressedLen=${compressedLen})`
      );
    } else {
      try {
        const rawSfntStream = zlib.brotliDecompressSync(
          fontBuf.subarray(fontBuf.length - compressedLen)
        );
        if (rawSfntStream.length === 0) {
          failures.push("Empty Brotli SFNT payload in vui-glyphs.woff2");
        }
      } catch (err) {
        failures.push(`WOFF2 Brotli decompression failed: ${String(err)}`);
      }
    }
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
    `[check-package] PASS | style_runtime_bytes=0 | inline_style_attr_count=0 | vector_count=0 | stateful_hook_count=0 | components=${manifest.components.length} | REFERENCE.md=${refBytes}B`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyPackageGate();
}
