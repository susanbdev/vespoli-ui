import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ComponentAst } from "./ast-pass.ts";
import { toKebab } from "./ast-pass.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");

export interface ComponentManifestEntry {
  readonly name: string;
  readonly tag: string;
  readonly module: string;
  readonly styleProps: ReadonlyArray<{
    readonly name: string;
    readonly values: readonly string[];
  }>;
  readonly scssVars: readonly string[];
}

export interface ManifestDoc {
  readonly version: string;
  readonly runtimeStyleBytes: 0;
  readonly tokenCount: number;
  readonly components: readonly ComponentManifestEntry[];
}

export function ensureRustCompiler(): string {
  const debugBin = path.join(REPO_ROOT, "target", "debug", "vui-compile");
  if (!fs.existsSync(debugBin)) {
    execFileSync(
      "cargo",
      ["build", "--manifest-path", path.join(REPO_ROOT, "Cargo.toml"), "-p", "compiler", "--offline"],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? "1" },
        stdio: "inherit"
      }
    );
  }
  return debugBin;
}

export function compileScssFile(scssPath: string, minify = true): string {
  const bin = ensureRustCompiler();
  const args = ["scss", scssPath];
  if (minify) args.push("--minify");
  return execFileSync(bin, args, {
    cwd: REPO_ROOT,
    encoding: "utf8"
  });
}

export function compileScssInline(
  scssSource: string,
  baseDir: string,
  minify = true
): string {
  const bin = ensureRustCompiler();
  const args = ["scss-inline", baseDir];
  if (minify) args.push("--minify");
  return execFileSync(bin, args, {
    cwd: REPO_ROOT,
    input: scssSource,
    encoding: "utf8"
  });
}

export function emitGlyphFont(outputWoff2Path: string): Buffer {
  const bin = ensureRustCompiler();
  execFileSync(bin, ["font", outputWoff2Path], {
    cwd: REPO_ROOT
  });
  return fs.readFileSync(outputWoff2Path);
}

export function buildCssArtifacts(
  scssDir: string,
  distDir: string,
  components: readonly ComponentAst[]
): { stylesCss: string; fontBytes: Buffer } {
  const indexScss = path.join(scssDir, "index.scss");
  const stylesCss = compileScssFile(indexScss, true);

  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "styles.css"), stylesCss, "utf8");

  const cssDir = path.join(distDir, "css");
  fs.mkdirSync(cssDir, { recursive: true });

  const seenCss = new Set<string>();
  for (const comp of components) {
    if (seenCss.has(comp.name)) continue;
    seenCss.add(comp.name);
    const kebab = toKebab(comp.name);
    const partialPath = path.join(scssDir, "components", `_${kebab}.scss`);
    if (fs.existsSync(partialPath)) {
      const compCss = compileScssFile(partialPath, true);
      fs.writeFileSync(path.join(cssDir, `${comp.name}.css`), compCss, "utf8");
    } else if (comp.name === "Container" || comp.name === "Row" || comp.name === "Col") {
      const gridCss = compileScssFile(path.join(scssDir, "_grid.scss"), true);
      fs.writeFileSync(path.join(cssDir, `${comp.name}.css`), gridCss, "utf8");
    }
  }

  const fontOut = path.join(distDir, "fonts", "vui-glyphs.woff2");
  const fontBytes = emitGlyphFont(fontOut);

  return { stylesCss, fontBytes };
}

export function buildAgentManifest(
  components: readonly ComponentAst[],
  explicitSpecs: ReadonlyArray<ComponentManifestEntry>
): { manifest: ManifestDoc; agentMarkdown: string } {
  const byName = new Map<string, ComponentManifestEntry>();

  for (const comp of components) {
    if (!comp.exported) continue;
    byName.set(comp.name, {
      name: comp.name,
      tag: `<${comp.tag}>`,
      module: comp.sourceModule,
      styleProps: comp.props.map((p) => ({ name: p.name, values: p.values })),
      scssVars: comp.mintedVars.map((v) => `$${v.name}`)
    });
  }

  for (const spec of explicitSpecs) {
    const existing = byName.get(spec.name);
    if (existing) {
      byName.set(spec.name, {
        ...existing,
        tag: spec.tag,
        styleProps:
          spec.styleProps.length > 0 ? spec.styleProps : existing.styleProps
      });
    } else {
      byName.set(spec.name, spec);
    }
  }

  const sorted = Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const manifest: ManifestDoc = {
    version: "1.0.0",
    runtimeStyleBytes: 0,
    tokenCount: 42,
    components: sorted
  };

  const rows = sorted
    .map((c) => {
      const propsPart =
        c.styleProps.length > 0
          ? `[${c.styleProps.map((p) => p.name).join(",")}]`
          : "";
      const varsSuffix =
        c.scssVars.length > 0 ? `(${c.scssVars[0]})` : "";
      return `${c.name}:${c.tag}${propsPart}${varsSuffix}`;
    })
    .join("; ");

  const agentMarkdown = `# vespoli-ui Agent Reference (v1.0)

Imports: \`import { Button, Container, Row, Col, Dialog, transitionTo } from 'vespoli-ui'\` + \`import 'vespoli-ui/styles.css'\`.
Rules: 0 providers, native HTML props (\`onClick\`, \`disabled\`, \`open\`, \`onClose\`), 0 inline \`style\`, 0 vector tags, \`<IconButton aria-label="...">\` required.
Helpers: \`transitionTo(fn, { direction? })\`, \`trackOrigin(doc?)\`, \`moveFocus(el, idx)\`, \`decimateMinMax(f32, widthPx)\`.
Layers: \`@layer vui.reset, vui.tokens, vui.grid, vui.components, vui.transitions, vui.utilities;\`
SCSS: \`@use 'vespoli-ui/scss' with ($ButtonPaddingX: 10px, $color-accent: #38bdf8);\`

## Primitives (${sorted.length})
${rows}
`;

  return { manifest, agentMarkdown };
}
