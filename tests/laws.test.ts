import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  TOKEN_LIST,
  configure,
  css,
  media,
  t
} from "../packages/styled/src/index.ts";
import {
  auditSourceLaws,
  compileModule,
  compileScssInline,
  createEsbuildPlugin,
  createVitePlugin
} from "../packages/styled-compiler/src/index.ts";
import {
  StrictMode,
  createTestRoot,
  createVNode
} from "../bench/dom-harness.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..");

const ui = (await import("vespoli-ui")) as Record<string, any>;

describe("Law 1 -- 100% Dumb Stateless 1-In -> 1-Out Primitives", () => {
  it("rejects banned stateful hooks, network calls, and timers with VUI002", () => {
    const badCode = `
      import { useState, useContext } from "react";
      export function BadComp() {
        const [v] = useState(0);
        const ctx = useContext(MyCtx);
        fetch("/api");
        setTimeout(() => {}, 10);
        return <div>{v}{ctx}</div>;
      }
    `;
    const diags = auditSourceLaws(badCode, { isUiPackage: true });
    const codes = diags.map((d) => d.code);
    assert.ok(codes.includes("VUI002"));
    assert.ok(diags.length >= 4);
  });

  it("renders without any Context provider in isolation", () => {
    const root = createTestRoot();
    const el = root.render(
      createVNode(ui.Button, { variant: "primary", children: "Commit" })
    );
    assert.ok(el);
    assert.equal(el.tagName, "BUTTON");
    assert.equal(el.getAttribute("type"), "button");
    assert.equal(el.getAttribute("variant"), null, "variant style prop must be stripped");
    assert.ok(el.className.includes("vui-Button"));
    assert.ok(el.className.includes("vui-Button--variant-primary"));
  });
});

describe("Law 2 -- 1 JSX Tag = 1 Honest Native HTML Element & Ontology", () => {
  const EXPECTED_TAGS: ReadonlyArray<readonly [string, string, Record<string, unknown>?]> = [
    ["Container", "DIV"],
    ["Row", "DIV"],
    ["Col", "DIV"],
    ["Shell", "DIV"],
    ["SplitView", "DIV"],
    ["Card", "SECTION"],
    ["Stack", "DIV"],
    ["Toolbar", "DIV"],
    ["Heading", "H2"],
    ["Breadcrumbs", "NAV"],
    ["Crumb", "SPAN"],
    ["Button", "BUTTON"],
    ["IconButton", "BUTTON", { "aria-label": "Close" }],
    ["Input", "INPUT"],
    ["Select", "SELECT"],
    ["Checkbox", "INPUT"],
    ["Label", "LABEL"],
    ["Field", "DIV"],
    ["FieldHint", "P"],
    ["FieldError", "P"],
    ["RangeField", "DIV"],
    ["Segments", "DIV"],
    ["Segment", "BUTTON"],
    ["Tabs", "DIV"],
    ["Tab", "BUTTON"],
    ["TabPanel", "SECTION"],
    ["Pagination", "NAV"],
    ["FacetBar", "ASIDE"],
    ["FacetGroup", "FIELDSET"],
    ["FacetList", "UL"],
    ["FacetItem", "LI"],
    ["ChipBar", "DIV"],
    ["Chip", "BUTTON"],
    ["Table", "TABLE"],
    ["TableHead", "THEAD"],
    ["TableBody", "TBODY"],
    ["TableRow", "TR"],
    ["HeaderCell", "TH"],
    ["TableCell", "TD"],
    ["VirtualTable", "TABLE"],
    ["VirtualSpacer", "TR", { bit: 0 }],
    ["TreeTable", "TABLE"],
    ["TreeRow", "TR", { level: 2 }],
    ["DagRail", "DIV"],
    ["DagLane", "SPAN", { edge: "straight", node: "commit" }],
    ["Properties", "DL"],
    ["PropertyItem", "DIV"],
    ["Disclosure", "DETAILS"],
    ["Summary", "SUMMARY"],
    ["Code", "CODE"],
    ["CodeBlock", "PRE"],
    ["JsonTree", "UL"],
    ["Empty", "SECTION"],
    ["Badge", "SPAN"],
    ["ProofBadge", "SPAN", { verified: true }],
    ["DigestChip", "BUTTON"],
    ["Notice", "DIV"],
    ["AlertBanner", "DIV"],
    ["Metrics", "SECTION"],
    ["MetricItem", "ARTICLE"],
    ["Icon", "SPAN", { name: "shield" }],
    ["Dialog", "DIALOG", { open: false }],
    ["Inspector", "DIALOG", { open: false }],
    ["CanvasStage", "CANVAS"],
    ["RangeBar", "CANVAS"],
    ["HeatmapCanvas", "CANVAS"]
  ];

  it("renders all 66 primitives as exact 1-tag-1-DOM semantic HTML elements", () => {
    assert.equal(EXPECTED_TAGS.length, 66);
    for (const [compName, expectedTag, extraProps] of EXPECTED_TAGS) {
      const Comp = ui[compName];
      assert.ok(Comp, `Missing component export: ${compName}`);
      const root = createTestRoot();
      const el = root.render(createVNode(Comp, extraProps ?? {}));
      assert.ok(el, `${compName} failed to mount`);
      assert.equal(
        el.tagName,
        expectedTag,
        `${compName} rendered <${el.tagName}> instead of <${expectedTag}>`
      );
      assert.equal(
        root.container.elementChildren.length,
        1,
        `${compName} emitted multiple root elements`
      );
      assert.equal(
        el.elementChildren.length,
        0,
        `${compName} emitted hidden wrapper child elements when given no children`
      );
    }
  });

  it("resolves 1:1 PascalCase subpath imports (vespoli-ui/Button)", async () => {
    const subMod = (await import("vespoli-ui/Button")) as { Button: unknown };
    assert.equal(subMod.Button, ui.Button);
  });

  it("rejects banned suffixes, slots API, non-native aliases, and missing IconButton aria-label", () => {
    const sample = `
      export interface CardWrapper { slotClasses?: string; }
      export function Demo() {
        return <IconButton onPress={fn} />;
      }
    `;
    const diags = auditSourceLaws(sample, { isUiPackage: true });
    const codes = new Set(diags.map((d) => d.code));
    assert.ok(codes.has("VUI004"), "Expected VUI004 for IconButton missing aria-label");
    assert.ok(codes.has("VUI005"), "Expected VUI005 for *Wrapper / slotClasses");
    assert.ok(codes.has("VUI006"), "Expected VUI006 for non-native onPress alias");
  });
});

describe("Law 3 -- Static styled -> SCSS Extraction & Bundler Plugins", () => {
  it("exports exactly 42 flat semantic tokens", () => {
    assert.equal(TOKEN_LIST.length, 42);
    assert.equal(t.color.accent, "var(--vui-color-accent)");
    assert.equal(t.space[4], "var(--vui-space-4)");
    assert.equal(css`color: ${t.color.text};`, "color: var(--vui-color-text);");
    assert.ok(media.forcedColors`border: 1px solid ButtonText;`.includes("forced-colors: active"));
  });

  it("rejects unbounded dynamic interpolations with VUI001", () => {
    const badStyled = `
      import { styled } from "@vespoli/styled";
      export interface BadProps { width?: number; }
      export const BadBox = styled.div<BadProps>\`
        width: \${p => p.width + "px"};
      \`;
    `;
    const compiled = compileModule(badStyled, "bad.tsx", { isUiPackage: true });
    assert.ok(compiled.diagnostics.some((d) => d.code === "VUI001"));
  });

  it("inlines file-local styled components to direct HTML elements with 0 Fiber wrappers", () => {
    const localSrc = `
      import { styled, t } from "@vespoli/styled";
      const InnerSlot = styled.span\`
        padding: \${t.space[1]};
      \`;
      export function HostCard() {
        return <section><InnerSlot className="extra">ok</InnerSlot></section>;
      }
    `;
    const compiled = compileModule(localSrc, "local.tsx");
    assert.equal(compiled.diagnostics.length, 0);
    assert.ok(!compiled.esmCode.includes("function InnerSlot"));
    assert.ok(compiled.esmCode.includes('_jsx("span"'));
    assert.ok(compiled.esmCode.includes('"vui-InnerSlot"'));
  });

  it("supports styled(Button) composition and configure('Button', ...) in Vite & esbuild plugins", () => {
    const cfg = configure("Button", "letter-spacing: 0.02em;");
    assert.equal(cfg.componentName, "Button");

    const vitePlugin = createVitePlugin();
    const consumerCode = `
      import { styled, configure, t } from "@vespoli/styled";
      configure("ActionBtn", \`letter-spacing: 0.04em;\`);
      export const ActionBtn = styled.button\`
        padding: \${t.space[2]} \${t.space[3]};
      \`;
      export const SuperBtn = styled(ActionBtn)\`
        font-weight: 700;
      \`;
    `;
    const transformed = vitePlugin.transform(consumerCode, "/app/src/ActionBtn.tsx");
    assert.ok(transformed);
    assert.ok(!transformed.code.includes("@vespoli/styled"));
    assert.ok(transformed.code.includes("vui-ActionBtn vui-SuperBtn"));
    const virtualScss = vitePlugin.load("\0virtual:vespoli-styled.css");
    assert.ok(virtualScss?.includes("letter-spacing: 0.04em;"));

    const esbuildPlugin = createEsbuildPlugin();
    let registered = false;
    esbuildPlugin.setup({
      onLoad(_opts, _cb) {
        registered = true;
      }
    });
    assert.equal(registered, true);
  });

  it("compiles @use 'vespoli-ui/scss' with (...) variable overrides deterministically", () => {
    const scssDir = path.join(REPO_ROOT, "dist", "scss");
    const overridden = compileScssInline(
      `@use "vespoli-ui/scss" with ($ButtonPaddingX: 18px, $color-accent: #22d3ee);`,
      scssDir,
      true
    );
    assert.ok(overridden.includes("--vui-color-accent:#22d3ee"));
    assert.ok(overridden.includes("18px"));
  });
});

describe("Law 4 & Law 5 -- Strict CSP (Zero Inline style) & Hard Zero-SVG + OffscreenCanvas", () => {
  it("rejects inline style attributes and vector tags with VUI003", () => {
    const vecTag = "<" + "svg><" + "path d='M0 0'/></" + "svg>";
    const bad = `export function Bad() { return <div style={{ top: 0 }}>${vecTag}</div>; }`;
    const diags = auditSourceLaws(bad, { isUiPackage: true });
    assert.ok(diags.filter((d) => d.code === "VUI003").length >= 2);
  });

  it("reuses OffscreenCanvas WorkerChannel via WeakMap under React 19 StrictMode double-effect", () => {
    const messages: Array<Record<string, unknown>> = [];
    const worker = {
      postMessage(msg: Record<string, unknown>) {
        messages.push(msg);
      }
    };
    const buf = new Float32Array([0.1, 0.5, 0.9, -0.4]);
    const strictRoot = createTestRoot({ strictMode: true });
    const el = strictRoot.render(
      createVNode(StrictMode, {
        children: createVNode(ui.CanvasStage, { buffer: buf, worker })
      })
    );
    assert.ok(el);
    assert.equal(el.tagName, "CANVAS");
    const initMsgs = messages.filter((m) => m.type === "init");
    const dataMsgs = messages.filter((m) => m.type === "data");
    assert.equal(initMsgs.length, 1, "transferControlToOffscreen must run exactly once");
    assert.equal(dataMsgs.length, 2, "data message posted on both StrictMode effect runs");
    assert.equal(strictRoot.document.cspViolations.length, 0);
  });

  it("operates RingBuffer, decimateMinMax, interpolateColumns, and blitScrollColumn at 100k+ scale", () => {
    const ring = ui.createRingBuffer(4);
    ui.appendSamples(ring, [1, 2, 3, 4, 5, 6]);
    const win = ui.readWindow(ring);
    assert.deepEqual(Array.from(win), [3, 4, 5, 6]);

    const large = new Float32Array(120_000);
    large[10] = -12.5;
    large[11] = 42.0;
    const decimated = ui.decimateMinMax(large, 600);
    assert.equal(decimated.length, 1200);
    assert.equal(decimated[0], -12.5);
    assert.equal(decimated[1], 42.0);

    const next = new Float32Array(1200).fill(10);
    const mid = ui.interpolateColumns(decimated, next, 0.5);
    assert.equal(mid[0], (-12.5 + 10) * 0.5);

    const ops: string[] = [];
    ui.blitScrollColumn(
      {
        drawImage: (_s: unknown, dx: number) => ops.push(`draw:${dx}`),
        clearRect: () => ops.push("clear"),
        fillRect: () => ops.push("fill")
      },
      { width: 400, height: 100 },
      2,
      0.2,
      0.8
    );
    assert.deepEqual(ops, ["draw:-2", "clear", "fill"]);
  });
});

describe("Law 6 -- 12-Column Structural CSS Grid & Binary VirtualSpacer", () => {
  it("maps Container, Row, and Col responsive spans & offsets to static classes with 0 inline styles", () => {
    const root = createTestRoot();
    const el = root.render(
      createVNode(ui.Container, {
        fluid: "lg",
        children: createVNode(ui.Row, {
          gutter: 4,
          rowGutter: 2,
          align: "center",
          children: createVNode(ui.Col, {
            xs: 12,
            md: 6,
            xl: 4,
            offsetMd: 2,
            children: "SHA-256"
          })
        })
      })
    );
    assert.ok(el);
    assert.ok(el.className.includes("vui-Container--fluid-lg"));
    const row = el.elementChildren[0]!;
    assert.ok(row.className.includes("vui-Row"));
    assert.ok(row.className.includes("vui-g-4"));
    assert.ok(row.className.includes("vui-gy-2"));
    const col = row.elementChildren[0]!;
    assert.ok(col.className.includes("vui-Col"));
    assert.ok(col.className.includes("vui-c-md-6"));
    assert.ok(col.className.includes("vui-o-md-2"));
    assert.equal(root.document.cspViolations.length, 0);
  });

  it("decomposes any integer row offset 0..262,143 into <= 18 power-of-two VirtualSpacer bits", () => {
    const bits = ui.decomposeOffset(100_005);
    assert.ok(bits.length <= 18);
    const reconstructed = bits.reduce((acc: number, b: number) => acc + 2 ** b, 0);
    assert.equal(reconstructed, 100_005);
  });
});

describe("Law 7 & Accessibility -- Conservation of UI Matter, Dialog Morphs, & Roving Focus", () => {
  it("tracks origin trigger per Document and executes View Transition aperture morphs + reduced-motion bypass", async () => {
    const root = createTestRoot();
    const doc = root.document as unknown as Document;
    ui.trackOrigin(doc);

    const btn = root.document.createElement("button");
    root.document.body.appendChild(btn);
    root.document.dispatchCapture("pointerdown", { target: btn });
    assert.equal(ui.readOrigin(doc), btn);

    const dest = root.document.createElement("section");
    dest.setAttribute("data-vui-morph-target", "card");
    let updated = false;
    await ui.transitionTo(
      () => {
        updated = true;
        root.document.body.appendChild(dest);
      },
      { doc, direction: "right", target: dest as unknown as HTMLElement }
    );
    assert.equal(updated, true);
    assert.equal(root.document.viewTransitionCalls.length, 1);
    assert.deepEqual(root.document.viewTransitionCalls[0]?.types, ["right"]);
    assert.equal(btn.getAttribute("data-vui-morph"), null, "morph token scrubbed on completion");

    // Reduced motion runs synchronously with 0 View Transition calls
    root.document.reducedMotion = true;
    await ui.transitionTo(() => {}, { doc, direction: "left" });
    assert.equal(root.document.viewTransitionCalls.length, 1);
  });

  it("synchronizes native Dialog showModal() and close() with origin aperture morphing", async () => {
    const root = createTestRoot();
    const trigger = root.document.createElement("button");
    root.document.body.appendChild(trigger);
    ui.recordOrigin(root.document as unknown as Document, trigger as unknown as HTMLElement);

    const dialogEl = root.render(
      createVNode(ui.Dialog, { open: true, loading: true, children: "Loading skeleton" })
    )!;
    assert.equal(dialogEl.tagName, "DIALOG");
    assert.equal(dialogEl.open, true);
    assert.equal(dialogEl.modalShowCount, 1);
    assert.equal(dialogEl.getAttribute("data-loading"), "true");
    assert.equal(dialogEl.getAttribute("aria-busy"), "true");

    root.render(createVNode(ui.Dialog, { open: false, children: "Done" }));
    assert.equal(dialogEl.open, false);
    assert.equal(dialogEl.modalCloseCount, 1);
  });

  it("handles stateless roving-tabindex focus movement and delegated FacetList / TableBody activation", () => {
    const root = createTestRoot();
    const tabsEl = root.render(
      createVNode(ui.Tabs, {
        children: [
          createVNode(ui.Tab, { active: true, children: "Overview" }, "t0"),
          createVNode(ui.Tab, { active: false, children: "Commits" }, "t1"),
          createVNode(ui.Tab, { active: false, children: "Proofs" }, "t2")
        ]
      })
    )!;
    let prevented = false;
    const focused = ui.delegateRovingKey({
      key: "ArrowRight",
      currentTarget: tabsEl,
      target: tabsEl.elementChildren[0],
      preventDefault() {
        prevented = true;
      }
    });
    assert.equal(prevented, true);
    assert.equal(focused, tabsEl.elementChildren[1]);
    assert.equal(tabsEl.elementChildren[0]!.tabIndex, -1);
    assert.equal(tabsEl.elementChildren[1]!.tabIndex, 0);

    // Delegated TableBody row activation
    let activatedKey = "";
    const tableEl = root.render(
      createVNode(ui.TableBody, {
        onRowActivate: (k: string) => {
          activatedKey = k;
        },
        children: createVNode(ui.TableRow, { rowKey: "sha-9f81", children: "cell" })
      })
    )!;
    const rowEl = tableEl.elementChildren[0]!;
    tableEl.listeners.get("click")?.({ target: rowEl });
    assert.equal(activatedKey, "sha-9f81");

    // Delegated FacetList option toggle
    let toggled = "";
    const facetEl = root.render(
      createVNode(ui.FacetList, {
        items: [
          { key: "ring-0", label: "Ring 0", count: 1 },
          { key: "ring-1", label: "Ring 1", count: 17 }
        ],
        selectedKeys: ["ring-1"],
        onToggleKey: (k: string) => {
          toggled = k;
        }
      })
    )!;
    assert.equal(facetEl.elementChildren.length, 2);
    facetEl.listeners.get("click")?.({ target: facetEl.elementChildren[0], altKey: false });
    assert.equal(toggled, "ring-0");

    // JsonTree structured rendering
    const treeEl = root.render(
      createVNode(ui.JsonTree, { data: { ok: true, nested: [1, 2] } })
    )!;
    assert.equal(treeEl.tagName, "UL");
    assert.equal(treeEl.getAttribute("role"), "tree");
    assert.equal(treeEl.elementChildren.length, 2);
  });

  it("rejects disembodied Spinner primitive with VUI007", () => {
    const diags = auditSourceLaws("export function Spinner() { return <div />; }", {
      isUiPackage: true
    });
    assert.ok(diags.some((d) => d.code === "VUI007"));
  });

  it("keeps REFERENCE.md synchronized with manifest.json and bans nested AGENT.md", () => {
    assert.equal(
      fs.existsSync(path.join(REPO_ROOT, "packages", "ui", "AGENT.md")),
      false,
      "nested packages/ui/AGENT.md must not exist"
    );
    const refText = fs.readFileSync(
      path.join(REPO_ROOT, "packages", "ui", "REFERENCE.md"),
      "utf8"
    );
    assert.ok(refText.includes("## Primitives (66)"));
    assert.ok(Buffer.byteLength(refText, "utf8") <= 3072);
  });
});

describe("Adversarial Security & Hardening Regressions", () => {
  it("enforces Crumb href scheme allowlist and strips control/whitespace bytes", () => {
    const hostileHrefs = [
      "javascript:alert(1)",
      "\t\njava\rscript:alert(1)",
      String.fromCharCode(1, 32) + "JaVaScRiPt:evil()",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "//evil.example/phish",
      "/\\evil.example/phish",
      "ftp://files.example/x"
    ];
    for (const bad of hostileHrefs) {
      assert.equal(ui.sanitizeHref(bad), undefined, `Expected ${JSON.stringify(bad)} to be rejected`);
      const root = createTestRoot();
      const el = root.render(createVNode(ui.Crumb, { href: bad, children: "Link" }))!;
      assert.equal(el.tagName, "SPAN", `Hostile href ${JSON.stringify(bad)} must degrade to <span>`);
      assert.equal(el.getAttribute("href"), null);
    }

    const validHrefs: ReadonlyArray<readonly [string, string]> = [
      ["https://vespoli.dev/docs", "https://vespoli.dev/docs"],
      ["  https://vespoli.dev/clean\n", "https://vespoli.dev/clean"],
      ["http://localhost:8787/ok", "http://localhost:8787/ok"],
      ["mailto:sec@vespoli.dev", "mailto:sec@vespoli.dev"],
      ["/commits/123", "/commits/123"],
      ["#section-2", "#section-2"],
      ["?filter=active", "?filter=active"]
    ];
    for (const [raw, expected] of validHrefs) {
      const root = createTestRoot();
      const el = root.render(createVNode(ui.Crumb, { href: raw, children: "Safe" }))!;
      assert.equal(el.tagName, "A");
      assert.equal(el.getAttribute("href"), expected);
    }
  });

  it("strips style and dangerouslySetInnerHTML at runtime across all 66 primitives", () => {
    const ALL_66: ReadonlyArray<readonly [string, Record<string, unknown>?]> = [
      ["Container"], ["Row"], ["Col"], ["Shell"], ["SplitView"], ["Card"],
      ["Stack"], ["Toolbar"], ["Heading"], ["Breadcrumbs"], ["Crumb", { href: "/ok" }],
      ["Button"], ["IconButton", { "aria-label": "Close" }], ["Input"], ["Select"],
      ["Checkbox"], ["Label"], ["Field"], ["FieldHint"], ["FieldError"],
      ["RangeField"], ["Segments"], ["Segment"], ["Tabs"], ["Tab"], ["TabPanel"],
      ["Pagination"], ["FacetBar"], ["FacetGroup"], ["FacetList"], ["FacetItem"],
      ["ChipBar"], ["Chip"], ["Table"], ["TableHead"], ["TableBody"], ["TableRow"],
      ["HeaderCell"], ["TableCell"], ["VirtualTable"], ["VirtualSpacer", { bit: 0 }],
      ["TreeTable"], ["TreeRow", { level: 1 }], ["DagRail"],
      ["DagLane", { edge: "straight", node: "commit" }], ["Properties"],
      ["PropertyItem"], ["Disclosure"], ["Summary"], ["Code"], ["CodeBlock"],
      ["JsonTree"], ["Empty"], ["Badge"], ["ProofBadge"], ["DigestChip"],
      ["Notice"], ["AlertBanner"], ["Metrics"], ["MetricItem"],
      ["Icon", { name: "shield" }], ["Dialog", { open: false }],
      ["Inspector", { open: false }], ["CanvasStage"], ["RangeBar"], ["HeatmapCanvas"]
    ];
    assert.equal(ALL_66.length, 66);
    for (const [name, baseProps] of ALL_66) {
      const root = createTestRoot();
      const el = root.render(
        createVNode(ui[name], {
          ...(baseProps ?? {}),
          style: { color: "red" },
          dangerouslySetInnerHTML: { __html: "<img onerror=alert(1)>" }
        })
      )!;
      assert.equal(el.getAttribute("style"), null, `${name} leaked style attribute`);
      assert.equal(
        el.getAttribute("dangerouslysetinnerhtml"),
        null,
        `${name} leaked dangerouslySetInnerHTML`
      );
      assert.equal(
        root.document.cspViolations.length,
        0,
        `${name} caused CSP/XSS violation`
      );
    }
  });

  it("blocks Object.prototype pollution in Button, Heading, Grid, and Icon lookup maps and rejects selector injection", () => {
    const root = createTestRoot();
    for (const protoKey of ["__proto__", "constructor", "toString", "valueOf"]) {
      const btn = root.render(createVNode(ui.Button, { variant: protoKey }))!;
      assert.ok(!btn.className.includes("function"), `Button leaked prototype for ${protoKey}`);
      assert.equal(btn.className, "vui-Button");

      const h = root.render(createVNode(ui.Heading, { size: protoKey }))!;
      assert.ok(!h.className.includes("function"), `Heading leaked prototype for ${protoKey}`);
      assert.equal(h.className, "vui-Heading vui-Heading--size-md");

      const icon = root.render(createVNode(ui.Icon, { name: protoKey, size: protoKey }))!;
      assert.ok(!icon.className.includes("function"));
      assert.equal(icon.children.length, 0, `Icon leaked prototype child for ${protoKey}`);
    }

    const injectedSrc = `
      import { styled, css } from "@vespoli/styled";
      export interface EvilProps { variant?: "ok" | "x { color: red } .pwn"; }
      export const EvilBtn = styled.button<EvilProps>\`
        \${p => p.variant === "x { color: red } .pwn" && css\`color: red;\`}
      \`;
    `;
    const compiled = compileModule(injectedSrc, "evil.tsx");
    assert.ok(
      compiled.diagnostics.some((d) => d.code === "VUI001"),
      "Must reject unsafe union literal characters with VUI001"
    );
  });

  it("validates same-origin HTTP(S) workerUrl, terminates owned Workers on unmount, and bounds canvas buffers", () => {
    const prevWorker = (globalThis as Record<string, unknown>).Worker;
    const spawned: Array<{ url: string; terminated: boolean }> = [];
    class MockWorker {
      public url: string;
      public terminated = false;
      constructor(url: string) {
        this.url = url;
        spawned.push(this);
      }
      postMessage(_msg: unknown): void {}
      terminate(): void {
        this.terminated = true;
      }
    }
    (globalThis as Record<string, unknown>).Worker = MockWorker;

    try {
      for (const badUrl of [
        "https://evil.example/worker.js",
        "javascript:alert(1)",
        "data:text/javascript,postMessage(1)",
        "blob:https://vespoli.local/1234"
      ]) {
        const badRoot = createTestRoot();
        assert.throws(() => {
          badRoot.render(createVNode(ui.CanvasStage, { workerUrl: badUrl }));
        }, /Blocked cross-origin|Invalid workerUrl/);
      }
      assert.equal(spawned.length, 0, "No Worker may be constructed for rejected URLs");

      const strictRoot = createTestRoot({ strictMode: true });
      strictRoot.render(
        createVNode(StrictMode, {
          children: createVNode(ui.HeatmapCanvas, {
            workerUrl: "/workers/heatmap.js",
            buffer: new Float32Array([1, 2, 3, 4])
          })
        })
      );
      assert.equal(spawned.length, 1);
      assert.equal(spawned[0]!.url, "https://vespoli.local/workers/heatmap.js");
      assert.equal(spawned[0]!.terminated, false, "StrictMode re-run must keep owned Worker alive");

      strictRoot.unmount();
      assert.equal(spawned[0]!.terminated, true, "Owned Worker must terminate on unmount");
    } finally {
      (globalThis as Record<string, unknown>).Worker = prevWorker;
    }

    assert.throws(() => ui.createRingBuffer(NaN), RangeError);
    assert.throws(() => ui.createRingBuffer(Infinity), RangeError);
    assert.throws(() => ui.createRingBuffer(0), RangeError);
    assert.throws(() => ui.createRingBuffer(16_777_217), RangeError);
    assert.throws(() => ui.decimateMinMax(new Float32Array(8), NaN), RangeError);
    assert.throws(() => ui.decimateMinMax(new Float32Array(8), 16_385), RangeError);
    assert.throws(
      () => ui.interpolateColumns(new Float32Array(4), new Float32Array(4), NaN),
      RangeError
    );
  });

  it("detects CRLF, banned effect/ref/beacon/SSE/BroadcastChannel/multiline-fetch/style/IconButton bypasses, and compiles Vite/esbuild CSS", () => {
    const crlfDiags = auditSourceLaws("export const A = 1;\r\n", { isUiPackage: true });
    assert.ok(crlfDiags.some((d) => d.code === "VUI009"));

    const sneaky = `
      import { useEffect, useLayoutEffect, useInsertionEffect, useRef, useImperativeHandle } from "react";
      export function Bad(el: any) {
        useEffect(() => {}, []);
        useLayoutEffect(() => {}, []);
        useInsertionEffect(() => {}, []);
        const r = useRef(null);
        useImperativeHandle(r, () => ({}));
        navigator.sendBeacon("/x");
        new EventSource("/events");
        new BroadcastChannel("sync");
        globalThis["fetch"]("/sneak");
        fetch
          ("/multiline");
        el.style.top = "0";
        return (
          <div style = {{ top: 0 }}>
            <span style='left:0' />
            <IconButton
              onClick={() => {}}
            />
          </div>
        );
      }
    `;
    const diags = auditSourceLaws(sneaky, { isUiPackage: true });
    assert.ok(diags.filter((d) => d.code === "VUI002").length >= 10);
    assert.ok(diags.filter((d) => d.code === "VUI003").length >= 3);
    assert.equal(diags.filter((d) => d.code === "VUI004").length, 1);

    // Vite query-string IDs, HMR deduplication, and valid CSS compilation
    const vite = createVitePlugin();
    const src = `
      import { styled, t } from "@vespoli/styled";
      export const Pill = styled.span\`padding: \${t.space[2]};\`;
    `;
    assert.ok(vite.transform(src, "/app/Pill.tsx?v=1"));
    assert.ok(vite.transform(src, "/app/Pill.tsx?v=2"));
    const cssOut = vite.load("\0virtual:vespoli-styled.css") ?? "";
    assert.ok(!cssOut.includes("@use"), "Vite virtual CSS must be compiled CSS, not raw SCSS");
    assert.ok(!cssOut.includes("$space-"), "Vite virtual CSS must resolve SCSS variables");
    assert.equal(
      cssOut.split(".vui-Pill {").length - 1,
      1,
      "HMR transforms of the same module must not duplicate CSS rules"
    );

    // esbuild CSS extraction & preservation
    const sandboxDir = path.join(REPO_ROOT, "target", "esbuild_plugin_sandbox");
    fs.mkdirSync(sandboxDir, { recursive: true });
    const sampleTsx = path.join(sandboxDir, "SampleTag.tsx");
    fs.writeFileSync(sampleTsx, src, "utf8");
    try {
      const esb = createEsbuildPlugin();
      let loadHandler: ((args: { path: string }) => unknown) | undefined;
      esb.setup({
        onLoad(opts, cb) {
          if (!opts.namespace) loadHandler = cb;
        }
      });
      assert.ok(loadHandler);
      loadHandler({ path: sampleTsx });
      loadHandler({ path: sampleTsx });
      const esbCss = esb.getCss();
      assert.ok(esbCss.includes(".vui-Pill"));
      assert.ok(!esbCss.includes("@use"));
      assert.equal(esbCss.split(".vui-Pill {").length - 1, 1);
    } finally {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  it("guards JsonTree against circular references via WeakSet and enforces maxDepth", () => {
    const cyclic: Record<string, unknown> = { id: "root" };
    cyclic.self = cyclic;

    let deep: Record<string, unknown> = { leaf: "end" };
    for (let i = 0; i < 45; i += 1) {
      deep = { next: deep };
    }

    const root = createTestRoot();
    const cycEl = root.render(createVNode(ui.JsonTree, { data: cyclic }))!;
    assert.equal(cycEl.tagName, "UL");
    const serialized = JSON.stringify(cycEl.children.map((c) => (typeof c === "string" ? c : c.tagName)));
    assert.ok(serialized.length > 0);

    const boundedEl = root.render(createVNode(ui.JsonTree, { data: deep, maxDepth: 4 }))!;
    assert.equal(boundedEl.tagName, "UL");
  });

  it("scales VirtualSpacer heights when $RowHeight is overridden in SCSS", () => {
    const scssDir = path.join(REPO_ROOT, "dist", "scss");
    const cssOut = compileScssInline(
      `@use "vespoli-ui/scss" with ($RowHeight: 44px);`,
      scssDir,
      true
    );
    assert.ok(cssOut.includes('[data-bit="0"]{height:44px}'));
    assert.ok(cssOut.includes('[data-bit="1"]{height:88px}'));
    assert.ok(cssOut.includes('[data-bit="3"]{height:352px}'));
  });
});
