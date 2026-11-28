import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { memo, useEffect } from "react";
import {
  createRenderHost,
  createVNode,
  loadModule,
  mountElement,
  renderMarkup,
  renderToStaticMarkup,
  renderToString
} from "./markup.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(THIS_DIR, "..", "packages", "ui", "src");

const ui = (await import("vespoli-ui")) as Record<string, any>;

const EXPECTED_TAGS: Readonly<Record<string, string>> = {
  AlertBanner: "div",
  Badge: "span",
  Breadcrumbs: "nav",
  Button: "button",
  CanvasStage: "canvas",
  Card: "section",
  Checkbox: "input",
  Chip: "button",
  ChipBar: "div",
  Code: "code",
  CodeBlock: "pre",
  Col: "div",
  Container: "div",
  Crumb: "span",
  DagLane: "span",
  DagRail: "div",
  Dialog: "dialog",
  DigestChip: "button",
  Disclosure: "details",
  Empty: "section",
  FacetBar: "aside",
  FacetGroup: "fieldset",
  FacetItem: "li",
  FacetList: "ul",
  Field: "div",
  FieldError: "p",
  FieldHint: "p",
  HeaderCell: "th",
  Heading: "h2",
  HeatmapCanvas: "canvas",
  Icon: "span",
  IconButton: "button",
  Input: "input",
  Inspector: "dialog",
  JsonTree: "ul",
  Label: "label",
  MetricItem: "article",
  Metrics: "section",
  Notice: "div",
  Pagination: "nav",
  ProofBadge: "span",
  Properties: "dl",
  PropertyItem: "div",
  RangeBar: "canvas",
  RangeField: "div",
  Row: "div",
  Segment: "button",
  Segments: "div",
  Select: "select",
  Shell: "div",
  SplitView: "div",
  Stack: "div",
  Summary: "summary",
  Tab: "button",
  Table: "table",
  TableBody: "tbody",
  TableCell: "td",
  TableHead: "thead",
  TableRow: "tr",
  TabPanel: "section",
  Tabs: "div",
  Toolbar: "div",
  TreeRow: "tr",
  TreeTable: "table",
  VirtualSpacer: "tr",
  VirtualTable: "table"
};

interface Declaration {
  readonly module: string;
  readonly names: readonly string[];
}

function parseDeclarations(source: string): Declaration[] {
  const out: Declaration[] = [];
  const re = /^export \{([^}]*)\} from "\.\/([a-z0-9]+)\.tsx?";/gm;
  for (const match of source.matchAll(re)) {
    const names = (match[1] ?? "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    out.push({ module: match[2]!, names });
  }
  return out;
}

const declarations = parseDeclarations(
  fs.readFileSync(path.join(SRC_DIR, "index.ts"), "utf8")
);

describe("index -- public surface", () => {
  it("parses a non-trivial declaration set from src/index.ts", () => {
    assert.equal(declarations.length, 11, "one value re-export block per non-index module");
    assert.ok(declarations.every((d) => d.names.length > 0));
  });

  it("exports exactly the names declared in src/index.ts, with no duplicates", () => {
    const declared = declarations.flatMap((d) => d.names);
    assert.equal(new Set(declared).size, declared.length, "duplicate re-export");
    assert.deepEqual(Object.keys(ui).sort(), [...declared].sort());
  });

  it("re-exports the identical binding from each source module", async () => {
    for (const { module, names } of declarations) {
      const mod = await loadModule(module);
      for (const name of names) {
        assert.equal(ui[name], mod[name], `${name} from ${module}`);
      }
    }
  });

  it("covers every source module with no unexported public API drift", async () => {
    for (const { module, names } of declarations) {
      const mod = await loadModule(module);
      assert.deepEqual(Object.keys(mod).sort(), [...names].sort(), `exports of ${module}`);
    }
  });

  it("exposes 66 PascalCase primitives and only camelCase functions otherwise", () => {
    const names = Object.keys(ui);
    const components = names.filter((n) => /^[A-Z]/.test(n));
    const functions = names.filter((n) => /^[a-z]/.test(n));
    assert.equal(components.length, 66);
    assert.equal(components.length + functions.length, names.length);
    for (const name of components) {
      const value = ui[name];
      const isFunction = typeof value === "function";
      const isMemo = typeof value === "object" && value !== null && "type" in value;
      assert.ok(isFunction || isMemo, `${name} must be a component`);
    }
    for (const name of functions) {
      assert.equal(typeof ui[name], "function", name);
    }
  });

  it("renders all 66 primitives via react-dom/server and client DOM with honest semantic tags, refs, zero style, and zero vector markup", () => {
    const needsProps: Record<string, Record<string, unknown>> = {
      IconButton: { "aria-label": "x" },
      FacetItem: { facetKey: "k" },
      Icon: { name: "lock" },
      Dialog: { open: false },
      Inspector: { open: false }
    };
    const vecRe = new RegExp(`<(?:${"s" + "vg"}|${"p" + "ath"})(?:[\\s>/]|$)`, "i");

    for (const name of Object.keys(ui).filter((n) => /^[A-Z]/.test(n))) {
      const baseProps = needsProps[name] ?? {};
      const expectedTag = EXPECTED_TAGS[name];
      assert.ok(expectedTag, `missing expected tag entry for ${name}`);

      const staticHtml = renderToStaticMarkup(createVNode(ui[name], baseProps));
      const streamHtml = renderToString(createVNode(ui[name], baseProps));
      assert.equal(streamHtml.replaceAll("<!-- -->", ""), staticHtml, name);
      assert.match(staticHtml, new RegExp(`^<${expectedTag}\\b`), `${name} honest HTML tag`);
      assert.match(staticHtml, new RegExp(`\\bvui-${name}\\b`), `${name} class token`);
      assert.equal(/(?:^|\s)style=/i.test(staticHtml), false, `${name} inline style`);
      assert.equal(vecRe.test(staticHtml), false, `${name} vector markup`);

      let fnRefNode: unknown = null;
      const objRef: { current: unknown } = { current: null };
      const { el, doc, host } = mountElement(
        createVNode(ui[name], {
          ...baseProps,
          ref: (node: unknown) => {
            fnRefNode = node;
          }
        })
      );
      assert.equal(el.tagName.toLowerCase(), expectedTag, name);
      assert.equal(fnRefNode, el, `${name} function ref`);
      assert.equal(host.container.elementChildren.length, 1, name);
      assert.deepEqual(doc.cspViolations, [], name);

      const objHost = createRenderHost();
      const objEl = objHost.render(createVNode(ui[name], { ...baseProps, ref: objRef }));
      assert.equal(objRef.current, objEl, `${name} object ref`);
    }
  });

  it("handles SSR text boundaries, single-quote escaping, Iterables, camelCase/enumerated attrs, and form value semantics", () => {
    const vnode = createVNode(ui.Badge, { children: ["ring-", "", 1, "'s"] });
    assert.equal(renderToStaticMarkup(vnode), '<span class="vui-Badge">ring-1&#x27;s</span>');
    assert.equal(
      renderToString(vnode),
      '<span class="vui-Badge">ring-<!-- -->1<!-- -->&#x27;s</span>'
    );
    assert.equal(
      renderToString(createVNode(ui.Badge, { children: ["", "solo", ""] })),
      '<span class="vui-Badge">solo</span>'
    );

    const iterableKids = new Set([
      createVNode(ui.Code, { children: "a" }, "a"),
      createVNode(ui.Code, { children: "b" }, "b")
    ]);
    assert.equal(
      renderToStaticMarkup(createVNode(ui.Stack, { children: iterableKids })),
      '<div class="vui-Stack"><code class="vui-Code">a</code><code class="vui-Code">b</code></div>'
    );

    const cellHtml = renderMarkup(
      createVNode(ui.TableCell, {
        colSpan: 2,
        rowSpan: 3,
        spellCheck: false,
        draggable: true,
        onClick: "ignored" as unknown as undefined,
        children: "x"
      })
    );
    assert.equal(
      cellHtml,
      '<td colspan="2" rowspan="3" spellcheck="false" draggable="true" class="vui-TableCell">x</td>'
    );

    const inputHtml = renderMarkup(
      createVNode(ui.Input, {
        readOnly: true,
        autoFocus: true,
        maxLength: 64,
        autoComplete: "off",
        defaultValue: "seed"
      })
    );
    assert.equal(
      inputHtml,
      '<input readonly autofocus maxlength="64" autocomplete="off" value="seed" class="vui-Input">'
    );

    const checkHtml = renderMarkup(
      createVNode(ui.Checkbox, { defaultChecked: true })
    );
    assert.equal(checkHtml, '<input checked type="checkbox" class="vui-Checkbox">');

    const selectHtml = renderMarkup(
      createVNode(ui.Select, {
        value: "b",
        children: createVNode("optgroup", {
          label: "Rings",
          children: [
            createVNode("option", { value: "a", children: "Alpha" }, "a"),
            createVNode("option", { value: "b", children: "Beta" }, "b")
          ]
        })
      })
    );
    assert.equal(
      selectHtml,
      '<select class="vui-Select"><optgroup label="Rings"><option value="a">Alpha</option><option value="b" selected>Beta</option></optgroup></select>'
    );

    const renderTextLeaf = () => ["depth-", 2];
    const renderOuter = () => createVNode(renderTextLeaf, {});
    assert.equal(
      renderMarkup(createVNode(ui.Badge, { children: createVNode(renderOuter, {}) })),
      '<span class="vui-Badge">depth-2</span>'
    );

    const renderMultiKids = () => [
      createVNode(ui.Code, { children: "one" }, "1"),
      " + ",
      createVNode(ui.Code, { children: "two" }, "2")
    ];
    assert.equal(
      renderMarkup(createVNode(ui.Badge, { children: createVNode(renderMultiKids, {}) })),
      '<span class="vui-Badge"><code class="vui-Code">one</code> + <code class="vui-Code">two</code></span>'
    );

    const shrinkHost = createRenderHost();
    const seenRefs: Array<unknown> = [];
    shrinkHost.render(
      createVNode("div", {
        children: [
          createVNode("span", { children: "keep" }, "a"),
          createVNode("span", { ref: (n: unknown) => seenRefs.push(n), children: "drop" }, "b")
        ]
      })
    );
    assert.equal(seenRefs.length, 1);
    assert.notEqual(seenRefs[0], null);
    shrinkHost.render(
      createVNode("div", {
        children: [createVNode("span", { children: "keep" }, "a")]
      })
    );
    assert.equal(seenRefs[1], null, "unmounted child receives ref(null)");

    const propHost = createRenderHost();
    const details = propHost.render(createVNode(ui.Disclosure, { open: true, tabIndex: -1 }))!;
    assert.equal(details.open, true);
    assert.equal(details.tabIndex, -1);
    propHost.render(createVNode(ui.Disclosure, {}));
    assert.equal(details.open, false);
    assert.equal(details.tabIndex, 0);

    const refSwapHost = createRenderHost();
    const refA: { current: unknown } = { current: null };
    const refB: { current: unknown } = { current: null };
    const spanEl = refSwapHost.render(createVNode("span", { ref: refA }));
    assert.equal(refA.current, spanEl);
    refSwapHost.render(createVNode("span", { ref: refB }));
    assert.equal(refA.current, null, "replaced ref detached with null");
    assert.equal(refB.current, spanEl);
    refSwapHost.render(createVNode("span", {}));
    assert.equal(refB.current, null, "removed ref detached with null");

    const renderOption = memo((p: { value: string }) =>
      createVNode("option", { value: p.value, children: p.value })
    );
    const selectHost = createRenderHost();
    const selEl = selectHost.render(
      createVNode(ui.Select, {
        value: "a",
        children: createVNode(renderOption, { value: "a" })
      })
    )!;
    assert.equal(selEl.elementChildren[0]!.getAttribute("selected"), "");
    selectHost.render(
      createVNode(ui.Select, {
        children: createVNode(renderOption, { value: "a" })
      })
    );
    assert.equal(selEl.elementChildren[0]!.getAttribute("selected"), null);

    const throwHost = createRenderHost();
    let leakedRuns = 0;
    const failRender = () => {
      useEffect(() => {
        leakedRuns += 1;
      });
      throw new Error("boom");
    };
    assert.throws(() => throwHost.render(createVNode(failRender, {})), /boom/);
    assert.equal(
      renderToStaticMarkup(createVNode(ui.Dialog, { open: true, children: "ssr" })),
      '<dialog data-vui-morph-target="dialog" class="vui-Dialog">ssr</dialog>'
    );
    assert.equal(leakedRuns, 0);

    assert.equal(
      renderMarkup(createVNode("div", { tabIndex: false as unknown as number })),
      "<div></div>"
    );

    assert.equal(
      renderMarkup(createVNode("div", { style: undefined, dangerouslySetInnerHTML: undefined, hidden: true })),
      "<div hidden></div>"
    );
    assert.equal(
      renderMarkup(createVNode("div", { hidden: "" })),
      '<div hidden=""></div>'
    );

    assert.equal(
      renderMarkup(createVNode("textarea", { defaultValue: "a < 'b'" })),
      "<textarea>a &lt; &#x27;b&#x27;</textarea>"
    );
    assert.equal(
      renderToString(createVNode("textarea", { children: ["x", "y"] })),
      "<textarea>xy</textarea>"
    );
    assert.equal(
      renderToString(createVNode("title", { children: ["vespoli", "-ui"] })),
      "<title>vespoli-ui</title>"
    );
    assert.throws(
      () => renderToStaticMarkup(createVNode("div", { "bad attr": "x" })),
      /Invalid HTML attribute name/
    );
  });
});

describe("index -- behavioral test coverage", () => {
  it("has a dedicated behavioral test file for every packages/ui/src module", () => {
    const modules = fs
      .readdirSync(SRC_DIR)
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => f.replace(/\.tsx?$/, ""));
    assert.equal(modules.length, 12);
    for (const module of modules) {
      const file = path.join(THIS_DIR, `${module}.test.ts`);
      assert.ok(fs.existsSync(file), `missing tests/${module}.test.ts`);
      const body = fs.readFileSync(file, "utf8");
      assert.ok(/\bdescribe\(/.test(body) && /\bit\(/.test(body), `${module}.test.ts has no tests`);
    }
  });
});
