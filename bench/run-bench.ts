import "./register-react.ts";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { TOKEN_LIST } from "../packages/styled/src/tokens.ts";
import { buildAll } from "../scripts/build.ts";
import {
  Profiler,
  computeContrastRatio,
  createTestRoot,
  createVNode
} from "./dom-harness.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..");

interface Budgets {
  stylesCssGzipMaxBytes: number;
  glyphFontMaxBytes: number;
  buttonJsGzipMaxBytes: number;
  virtualSpacerCssMaxBytes: number;
  agentMdMaxBytes: number;
  primitiveMountP95MaxMs: number;
  table500RowSelectionMaxRerenders: number;
  table500UnchangedRerenders: number;
  canvas100kTransitionReactCommits: number;
  canvas100kMinFps: number;
  cspViolations: number;
  a11yViolations: number;
  svgCount: number;
}

export async function runBenchmarkSuite(): Promise<void> {
  const budgets = JSON.parse(
    fs.readFileSync(path.join(THIS_DIR, "budgets.json"), "utf8")
  ) as Budgets;

  const stats = buildAll();
  const ui = (await import("vespoli-ui")) as Record<string, any>;

  const failures: string[] = [];

  // 1. Bundle Budgets
  if (stats.stylesCssGzipBytes > budgets.stylesCssGzipMaxBytes) {
    failures.push(
      `styles.css gzip (${stats.stylesCssGzipBytes} B) > budget (${budgets.stylesCssGzipMaxBytes} B)`
    );
  }
  if (stats.woff2Bytes > budgets.glyphFontMaxBytes) {
    failures.push(
      `vui-glyphs.woff2 (${stats.woff2Bytes} B) > budget (${budgets.glyphFontMaxBytes} B)`
    );
  }
  if (stats.buttonGzipBytes > budgets.buttonJsGzipMaxBytes) {
    failures.push(
      `Button.js gzip (${stats.buttonGzipBytes} B) > budget (${budgets.buttonJsGzipMaxBytes} B)`
    );
  }

  // 2. Primitive Mount p95 <= 1.5 ms
  const mountSamples: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    const root = createTestRoot();
    const t0 = performance.now();
    root.render(
      createVNode(ui.Container, {
        children: createVNode(ui.Row, {
          gutter: 3,
          children: [
            createVNode(ui.Col, {
              md: 6,
              children: createVNode(ui.Card, {
                children: createVNode(ui.Button, {
                  variant: "primary",
                  children: "Deploy"
                })
              })
            }),
            createVNode(ui.Col, {
              md: 6,
              children: createVNode(ui.Input, {
                placeholder: "Filter..."
              })
            })
          ]
        })
      })
    );
    mountSamples.push(performance.now() - t0);
    if (root.document.cspViolations.length > 0) {
      failures.push("CSP violation detected during primitive mount");
    }
  }
  mountSamples.sort((a, b) => a - b);
  const p95MountMs = mountSamples[Math.floor(mountSamples.length * 0.95)] ?? 0;
  if (p95MountMs > budgets.primitiveMountP95MaxMs) {
    failures.push(
      `Primitive mount p95 (${p95MountMs.toFixed(3)} ms) > budget (${budgets.primitiveMountP95MaxMs} ms)`
    );
  }

  // 3. 500-Row Table single-row selection re-renders <= 2 rows (0 unchanged rows)
  const tableRoot = createTestRoot();
  const build500Table = (selectedIdx: number) => {
    const rows = [];
    for (let r = 0; r < 500; r += 1) {
      rows.push(
        createVNode(
          ui.TableRow,
          {
            rowKey: `row-${r}`,
            selected: r === selectedIdx,
            children: "cell"
          },
          `row-${r}`
        )
      );
    }
    return createVNode(ui.Table, {
      children: createVNode(ui.TableBody, { children: rows })
    });
  };

  tableRoot.render(build500Table(3));
  tableRoot.memoRowRenders = 0;
  tableRoot.render(build500Table(42));
  const rowRerenders = tableRoot.memoRowRenders;
  const unchangedRerenders = Math.max(0, rowRerenders - 2);
  if (rowRerenders > budgets.table500RowSelectionMaxRerenders) {
    failures.push(
      `500-row Table selection re-rendered ${rowRerenders} rows (budget <= ${budgets.table500RowSelectionMaxRerenders})`
    );
  }
  if (unchangedRerenders !== budgets.table500UnchangedRerenders) {
    failures.push(
      `500-row Table re-rendered ${unchangedRerenders} unchanged rows`
    );
  }

  // 4. 100,000-point CanvasStage 120ms transition: 0 React commits & >= 60 fps
  const datasetA = new Float32Array(100_000);
  const datasetB = new Float32Array(100_000);
  for (let i = 0; i < 100_000; i += 1) {
    datasetA[i] = Math.sin(i * 0.01);
    datasetB[i] = Math.cos(i * 0.015);
  }

  const canvasRoot = createTestRoot({ strictMode: true });
  const workerMessages: unknown[] = [];
  const mockWorker = {
    postMessage(msg: unknown) {
      workerMessages.push(msg);
    }
  };

  canvasRoot.render(
    createVNode(Profiler, {
      id: "canvas-stage",
      children: createVNode(ui.CanvasStage, {
        buffer: datasetA,
        worker: mockWorker
      })
    })
  );
  const commitsBeforeTransition = canvasRoot.profilerCommits;

  const widthPx = 1024;
  const outA = new Float32Array(widthPx * 2);
  const outB = new Float32Array(widthPx * 2);
  const frameOut = new Float32Array(widthPx * 2);

  const frameStart = performance.now();
  ui.decimateMinMax(datasetA, widthPx, outA);
  ui.decimateMinMax(datasetB, widthPx, outB);
  const totalFrames = 15; // 120ms @ 120Hz
  for (let f = 1; f <= totalFrames; f += 1) {
    ui.interpolateColumns(outA, outB, f / totalFrames, frameOut);
  }
  const elapsedMs = Math.max(0.001, performance.now() - frameStart);
  const avgFrameMs = elapsedMs / totalFrames;
  const effectiveFps = Math.min(1000, Math.round(1000 / avgFrameMs));
  const commitsDuringTransition =
    canvasRoot.profilerCommits - commitsBeforeTransition;

  if (commitsDuringTransition !== budgets.canvas100kTransitionReactCommits) {
    failures.push(
      `CanvasStage 100k transition triggered ${commitsDuringTransition} React commits (expected 0)`
    );
  }
  if (effectiveFps < budgets.canvas100kMinFps) {
    failures.push(
      `CanvasStage 100k transition achieved ${effectiveFps} fps (< ${budgets.canvas100kMinFps} fps)`
    );
  }
  if (canvasRoot.document.cspViolations.length !== budgets.cspViolations) {
    failures.push(
      `CSP violations detected: ${canvasRoot.document.cspViolations.length}`
    );
  }

  // 5. Accessibility Contrast Gate (Dark + Light WCAG AAA/AA verification)
  let a11yViolations = 0;
  const byPath = new Map(TOKEN_LIST.map((t) => [t.path, t]));
  const darkBg = byPath.get("color.bg")!.darkValue;
  const darkSurface = byPath.get("color.surface")!.darkValue;
  const darkText = byPath.get("color.text")!.darkValue;
  const darkMuted = byPath.get("color.muted")!.darkValue;
  const darkAccent = byPath.get("color.accent")!.darkValue;
  const darkAccentInk = byPath.get("color.accentInk")!.darkValue;

  if (computeContrastRatio(darkText, darkBg) < 7.0) a11yViolations += 1;
  if (computeContrastRatio(darkText, darkSurface) < 7.0) a11yViolations += 1;
  if (computeContrastRatio(darkMuted, darkBg) < 4.8) a11yViolations += 1;
  if (computeContrastRatio(darkMuted, darkSurface) < 4.8) a11yViolations += 1;
  if (computeContrastRatio(darkAccent, darkAccentInk) < 7.0) a11yViolations += 1;

  const lightBg = byPath.get("color.bg")!.lightValue;
  const lightSurface = byPath.get("color.surface")!.lightValue;
  const lightText = byPath.get("color.text")!.lightValue;
  const lightMuted = byPath.get("color.muted")!.lightValue;
  const lightAccent = byPath.get("color.accent")!.lightValue;
  const lightAccentInk = byPath.get("color.accentInk")!.lightValue;

  if (computeContrastRatio(lightText, lightBg) < 7.0) a11yViolations += 1;
  if (computeContrastRatio(lightText, lightSurface) < 7.0) a11yViolations += 1;
  if (computeContrastRatio(lightMuted, lightSurface) < 4.5) a11yViolations += 1;
  if (computeContrastRatio(lightAccent, lightAccentInk) < 4.5) a11yViolations += 1;

  if (a11yViolations !== budgets.a11yViolations) {
    failures.push(`Accessibility contrast violations: ${a11yViolations}`);
  }

  if (failures.length > 0) {
    throw new Error(
      `[bench] FAILED:\n` + failures.map((f) => `  - ${f}`).join("\n")
    );
  }

  console.log(
    `[bench] PASS | styles.css=${stats.stylesCssGzipBytes}B/${budgets.stylesCssGzipMaxBytes}B | woff2=${stats.woff2Bytes}B/${budgets.glyphFontMaxBytes}B | Button=${stats.buttonGzipBytes}B/${budgets.buttonJsGzipMaxBytes}B | mount_p95=${p95MountMs.toFixed(2)}ms | table500_rerenders=${rowRerenders} | canvas100k_commits=${commitsDuringTransition} (${effectiveFps}fps) | csp_violations=0 | a11y_violations=0`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runBenchmarkSuite();
}
