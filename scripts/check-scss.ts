import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileScssFile,
  compileScssInline
} from "../packages/styled-compiler/src/index.ts";
import { buildAll } from "./build.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..");

const REQUIRED_LAYER_ORDER =
  "@layer vui.reset,vui.tokens,vui.grid,vui.components,vui.transitions,vui.utilities;";

export function verifyScssGate(): void {
  const scssDir = path.join(REPO_ROOT, "dist", "scss");
  if (!fs.existsSync(path.join(scssDir, "index.scss"))) {
    buildAll();
  }

  // 1. Deterministic compilation of dist/scss/index.scss across runs
  const indexScss = path.join(scssDir, "index.scss");
  const runA = compileScssFile(indexScss, true);
  const runB = compileScssFile(indexScss, true);
  if (runA !== runB) {
    throw new Error("[check-scss] Non-deterministic index.scss compilation");
  }
  if (!runA.startsWith(REQUIRED_LAYER_ORDER)) {
    throw new Error(
      `[check-scss] Missing required cascade order header: ${REQUIRED_LAYER_ORDER}`
    );
  }

  // 2. Verify 50% Customization Dial: @use 'vespoli-ui/scss' with ($ButtonPaddingX: 10px, $color-accent: #38bdf8)
  const customConsumerScss = `@use "vespoli-ui/scss" with ($ButtonPaddingX: 10px, $color-accent: #38bdf8, $GridGutter: 24px);`;
  const customCss = compileScssInline(customConsumerScss, scssDir, true);
  if (
    !customCss.includes("--vui-color-accent:#38bdf8") ||
    !customCss.includes("10px") ||
    !customCss.includes("padding-inline:24px")
  ) {
    throw new Error(
      "[check-scss] @use 'vespoli-ui/scss' with (...) variable overrides failed to propagate"
    );
  }

  // 3. Compile every dist/scss/components/_*.scss partial standalone with 0 undeclared symbols
  const compDir = path.join(scssDir, "components");
  const partials = fs
    .readdirSync(compDir)
    .filter((f) => f.startsWith("_") && f.endsWith(".scss"))
    .sort();

  if (partials.length === 0) {
    throw new Error("[check-scss] No component SCSS partials found");
  }

  for (const partial of partials) {
    const fullPath = path.join(compDir, partial);
    const rawScss = fs.readFileSync(fullPath, "utf8");

    // Verify PascalCase SCSS variables obey <= 3 word naming ceiling and 0 banned suffixes
    const varMatches = rawScss.matchAll(/\$([A-Z][A-Za-z0-9_]*)\s*:/g);
    for (const m of varMatches) {
      const varName = m[1] ?? "";
      const words = (varName.match(/[A-Z][a-z0-9]*/g) ?? []).length;
      if (words >= 4) {
        throw new Error(
          `[check-scss] SCSS variable '$${varName}' in ${partial} exceeds 3-word ceiling`
        );
      }
      if (/(?:Wrapper|Root|Contract|Container)$/.test(varName)) {
        throw new Error(
          `[check-scss] Banned suffix on SCSS variable '$${varName}' in ${partial}`
        );
      }
    }

    const cssA = compileScssFile(fullPath, true);
    const cssB = compileScssFile(fullPath, true);
    if (cssA !== cssB || cssA.length === 0) {
      throw new Error(
        `[check-scss] Standalone compilation failed or non-deterministic for ${partial}`
      );
    }

    if (partial === "_virtual-spacer.scss") {
      // Spec Section 8: VirtualSpacer 18 binary powers in < 600 B of static CSS (excluding _tokens layer)
      const compLayerOnly = cssA.split("@layer vui.components{")[1] ?? "";
      if (Buffer.byteLength(compLayerOnly, "utf8") >= 600) {
        throw new Error(
          `[check-scss] VirtualSpacer component CSS exceeded 600 B (${compLayerOnly.length} B)`
        );
      }
    }
  }

  console.log(
    `[check-scss] PASS | partials=${partials.length} | deterministic=true | @use-with-overrides=verified`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyScssGate();
}
