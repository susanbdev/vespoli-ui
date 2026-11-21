import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import {
  buildAgentManifest,
  buildCssArtifacts,
  compileModule,
  compileScssFile,
  emitScssBundle
} from "../packages/styled-compiler/src/index.ts";
import type {
  ComponentAst,
  ComponentManifestEntry
} from "../packages/styled-compiler/src/index.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..");
const UI_SRC = path.join(REPO_ROOT, "packages", "ui", "src");
const ROOT_DIST = path.join(REPO_ROOT, "dist");
const PKG_DIST = path.join(REPO_ROOT, "packages", "ui", "dist");

const SOURCE_MODULES = [
  "grid.tsx",
  "layout.tsx",
  "controls.tsx",
  "filter.tsx",
  "table.tsx",
  "data.tsx",
  "status.tsx",
  "overlay.tsx",
  "canvas.tsx",
  "transitions.ts",
  "a11y.ts",
  "index.ts"
] as const;

const EXPLICIT_COMPONENT_SPECS: ReadonlyArray<ComponentManifestEntry> = [
  {
    name: "Container",
    tag: "<div>",
    module: "grid",
    styleProps: [{ name: "fluid", values: ["true", "false", "sm", "md", "lg", "xl", "xxl"] }],
    scssVars: ["$GridGutter", "$ContainerSm", "$ContainerMd", "$ContainerLg", "$ContainerXl", "$ContainerXxl"]
  },
  {
    name: "Row",
    tag: "<div>",
    module: "grid",
    styleProps: [
      { name: "gutter", values: ["0", "1", "2", "3", "4", "5", "6"] },
      { name: "rowGutter", values: ["0", "1", "2", "3", "4", "5", "6"] },
      { name: "align", values: ["start", "center", "end", "stretch"] }
    ],
    scssVars: ["$GridColumns", "$GridGutter"]
  },
  {
    name: "Col",
    tag: "<div>",
    module: "grid",
    styleProps: [
      { name: "xs..xxl", values: ["1..12", "full"] },
      { name: "offsetXs..offsetXxl", values: ["0..11"] }
    ],
    scssVars: ["$GridColumns"]
  },
  {
    name: "Heading",
    tag: "<h1>..<h6>",
    module: "layout",
    styleProps: [
      { name: "level", values: ["1", "2", "3", "4", "5", "6"] },
      { name: "size", values: ["xs", "sm", "md", "lg", "xl"] }
    ],
    scssVars: []
  },
  {
    name: "Crumb",
    tag: "<a>|<span>",
    module: "layout",
    styleProps: [{ name: "current", values: ["true", "false"] }],
    scssVars: ["$CrumbGap"]
  },
  {
    name: "Segment",
    tag: "<button>",
    module: "controls",
    styleProps: [
      { name: "active", values: ["true", "false"] },
      { name: "compact", values: ["true", "false"] }
    ],
    scssVars: ["$SegmentMinHeight", "$SegmentPaddingY", "$SegmentPaddingX", "$SegmentRadius"]
  },
  {
    name: "Tab",
    tag: "<button>",
    module: "controls",
    styleProps: [{ name: "active", values: ["true", "false"] }],
    scssVars: ["$TabGap", "$TabMinHeight", "$TabPaddingY", "$TabPaddingX"]
  },
  {
    name: "Pagination",
    tag: "<nav>",
    module: "controls",
    styleProps: [
      { name: "hasPrev", values: ["true", "false"] },
      { name: "hasNext", values: ["true", "false"] }
    ],
    scssVars: ["$PaginationGap"]
  },
  {
    name: "FacetList",
    tag: "<ul>",
    module: "filter",
    styleProps: [{ name: "selectedKeys", values: ["Set<string>"] }],
    scssVars: ["$FacetListGap"]
  },
  {
    name: "FacetItem",
    tag: "<li>",
    module: "filter",
    styleProps: [
      { name: "selected", values: ["true", "false"] },
      { name: "excluded", values: ["true", "false"] }
    ],
    scssVars: ["$FacetItemGap", "$FacetItemRadius"]
  },
  {
    name: "Chip",
    tag: "<button>",
    module: "filter",
    styleProps: [{ name: "operator", values: ["in", "not"] }],
    scssVars: ["$ChipGap", "$ChipMinHeight", "$ChipPaddingY", "$ChipPaddingX", "$ChipRadius"]
  },
  {
    name: "TableBody",
    tag: "<tbody>",
    module: "table",
    styleProps: [],
    scssVars: []
  },
  {
    name: "TableRow",
    tag: "<tr>",
    module: "table",
    styleProps: [{ name: "selected", values: ["true", "false"] }],
    scssVars: []
  },
  {
    name: "VirtualSpacer",
    tag: "<tr>",
    module: "table",
    styleProps: [{ name: "bit", values: ["0..17"] }],
    scssVars: []
  },
  {
    name: "TreeRow",
    tag: "<tr>",
    module: "table",
    styleProps: [
      { name: "level", values: ["1..8"] },
      { name: "expanded", values: ["true", "false"] }
    ],
    scssVars: []
  },
  {
    name: "PropertyItem",
    tag: "<div>",
    module: "data",
    styleProps: [{ name: "mono", values: ["true", "false"] }],
    scssVars: ["$PropertyItemGap"]
  },
  {
    name: "JsonTree",
    tag: "<ul>",
    module: "data",
    styleProps: [],
    scssVars: ["$JsonTreeRadius"]
  },
  {
    name: "Icon",
    tag: "<span>",
    module: "status",
    styleProps: [
      {
        name: "name",
        values: [
          "chevron-right",
          "chevron-down",
          "chevron-left",
          "chevron-up",
          "check",
          "close",
          "sort",
          "dot",
          "shield",
          "branch",
          "lock",
          "merkle",
          "commit",
          "snapshot",
          "alert",
          "terminal"
        ]
      },
      { name: "size", values: ["sm", "md", "lg"] }
    ],
    scssVars: []
  },
  {
    name: "Dialog",
    tag: "<dialog>",
    module: "overlay",
    styleProps: [
      { name: "open", values: ["true", "false"] },
      { name: "loading", values: ["true", "false"] }
    ],
    scssVars: ["$DialogPaddingY", "$DialogPaddingX", "$DialogRadius"]
  },
  {
    name: "Inspector",
    tag: "<dialog>",
    module: "overlay",
    styleProps: [
      { name: "open", values: ["true", "false"] },
      { name: "drawer", values: ["right", "bottom"] },
      { name: "loading", values: ["true", "false"] }
    ],
    scssVars: ["$InspectorPaddingY", "$InspectorPaddingX", "$InspectorRadius"]
  },
  {
    name: "CanvasStage",
    tag: "<canvas>",
    module: "canvas",
    styleProps: [],
    scssVars: ["$CanvasStageRadius"]
  },
  {
    name: "RangeBar",
    tag: "<canvas>",
    module: "canvas",
    styleProps: [],
    scssVars: ["$RangeBarRadius"]
  },
  {
    name: "HeatmapCanvas",
    tag: "<canvas>",
    module: "canvas",
    styleProps: [],
    scssVars: ["$HeatmapCanvasRadius"]
  }
];

export function buildAll(): {
  stylesCssGzipBytes: number;
  woff2Bytes: number;
  buttonGzipBytes: number;
  componentCount: number;
} {
  fs.rmSync(ROOT_DIST, { recursive: true, force: true });
  fs.rmSync(PKG_DIST, { recursive: true, force: true });

  const esmDir = path.join(ROOT_DIST, "esm");
  const subpathsDir = path.join(esmDir, "subpaths");
  const scssDir = path.join(ROOT_DIST, "scss");
  fs.mkdirSync(subpathsDir, { recursive: true });
  fs.mkdirSync(scssDir, { recursive: true });

  const allComponents: ComponentAst[] = [];
  const componentModuleMap = new Map<string, string>();

  for (const fileName of SOURCE_MODULES) {
    const absPath = path.join(UI_SRC, fileName);
    const stem = fileName.replace(/\.(tsx|ts)$/, "");
    const raw = fs.readFileSync(absPath, "utf8");

    const compiled = compileModule(raw, stem, { isUiPackage: true });
    if (compiled.diagnostics.length > 0) {
      const formatted = compiled.diagnostics
        .map((d) => `${fileName}:${d.line ?? 0} ${d.code}: ${d.message}`)
        .join("\n");
      throw new Error(`Compilation failed:\n${formatted}`);
    }

    fs.writeFileSync(path.join(esmDir, `${stem}.js`), compiled.esmCode, "utf8");

    const modSubDir = path.join(esmDir, stem);
    for (const [compName, singleJs] of Object.entries(compiled.perComponentEsm)) {
      fs.mkdirSync(modSubDir, { recursive: true });
      fs.writeFileSync(path.join(modSubDir, `${compName}.js`), singleJs, "utf8");
      componentModuleMap.set(compName, `../${stem}.js`);
    }

    for (const comp of compiled.components) {
      allComponents.push(comp);
      if (!componentModuleMap.has(comp.name)) {
        componentModuleMap.set(comp.name, `../${stem}.js`);
      }
    }

    // Detect custom exported PascalCase components in module (e.g. Container, Row, Col, Heading, Crumb)
    const fnExports = raw.matchAll(/export\s+(?:function|const)\s+([A-Z][A-Za-z0-9_]*)\b/g);
    for (const match of fnExports) {
      const exportedName = match[1];
      if (exportedName && !componentModuleMap.has(exportedName)) {
        componentModuleMap.set(exportedName, `../${stem}.js`);
      }
    }
  }

  for (const [compName, relTarget] of componentModuleMap.entries()) {
    const normalizedTarget = relTarget.startsWith("./")
      ? `../${relTarget.slice(2)}`
      : relTarget;
    fs.writeFileSync(
      path.join(subpathsDir, `${compName}.js`),
      `export { ${compName} } from ${JSON.stringify(normalizedTarget)};\n`,
      "utf8"
    );
  }

  const scssBundle = emitScssBundle(allComponents);
  for (const [relFile, content] of Object.entries(scssBundle.files)) {
    const outFile = path.join(scssDir, relFile);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, content, "utf8");
  }

  const { stylesCss, fontBytes } = buildCssArtifacts(
    scssDir,
    ROOT_DIST,
    allComponents
  );

  // Emit Grid CSS files in dist/css/ from _grid.scss
  const compiledGridCss = compileScssFile(path.join(scssDir, "_grid.scss"), true);
  for (const gridName of ["Container", "Row", "Col"]) {
    fs.writeFileSync(
      path.join(ROOT_DIST, "css", `${gridName}.css`),
      compiledGridCss,
      "utf8"
    );
  }

  const { manifest, agentMarkdown } = buildAgentManifest(
    allComponents,
    EXPLICIT_COMPONENT_SPECS
  );
  fs.writeFileSync(
    path.join(ROOT_DIST, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(REPO_ROOT, "packages", "ui", "REFERENCE.md"),
    agentMarkdown,
    "utf8"
  );

  copyDirectory(ROOT_DIST, PKG_DIST);

  const stylesCssGzipBytes = zlib.gzipSync(Buffer.from(stylesCss, "utf8"), {
    level: 9
  }).length;
  const buttonJs = fs.readFileSync(
    path.join(esmDir, "controls", "Button.js"),
    "utf8"
  );
  const buttonGzipBytes = zlib.gzipSync(Buffer.from(buttonJs, "utf8"), {
    level: 9
  }).length;

  return {
    stylesCssGzipBytes,
    woff2Bytes: fontBytes.length,
    buttonGzipBytes,
    componentCount: manifest.components.length
  };
}

function copyDirectory(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stats = buildAll();
  console.log(
    `[build] Built ${stats.componentCount} components | styles.css gzip=${stats.stylesCssGzipBytes}B | vui-glyphs.woff2=${stats.woff2Bytes}B | Button.js gzip=${stats.buttonGzipBytes}B`
  );
}
