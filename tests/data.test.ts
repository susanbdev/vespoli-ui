import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createVNode,
  loadModule,
  mountElement,
  renderMarkup
} from "./markup.ts";

const data = await loadModule("data");

function renderTree(props: Record<string, unknown>): string {
  return renderMarkup(createVNode(data.JsonTree, props));
}

describe("data -- Properties and PropertyItem", () => {
  it("Properties is a description list", () => {
    assert.equal(
      renderMarkup(createVNode(data.Properties, { children: [] })),
      '<dl class="vui-Properties"></dl>'
    );
  });

  it("PropertyItem renders dt/dd from term and value", () => {
    assert.equal(
      renderMarkup(createVNode(data.PropertyItem, { term: "Ring", value: "1" })),
      '<div class="vui-PropertyItem"><dt>Ring</dt><dd>1</dd></div>'
    );
  });

  it("PropertyItem accepts value-only and term-only forms", () => {
    const valueOnly = mountElement(createVNode(data.PropertyItem, { value: "v" })).el;
    assert.equal(valueOnly.elementChildren.length, 2);
    assert.equal(valueOnly.elementChildren[1]!.children[0], "v");
    const termOnly = mountElement(createVNode(data.PropertyItem, { term: "t" })).el;
    assert.equal(termOnly.elementChildren[0]!.tagName, "DT");
  });

  it("PropertyItem falls back to raw children and applies mono + className", () => {
    const { el } = mountElement(
      createVNode(data.PropertyItem, {
        mono: true,
        className: "k",
        children: [
          createVNode("dt", { children: "custom" }, "a"),
          createVNode("dd", { children: "slot" }, "b")
        ]
      })
    );
    assert.equal(el.className, "vui-PropertyItem vui-PropertyItem--mono k");
    assert.equal(el.elementChildren.length, 2);
    assert.equal(el.elementChildren[0]!.children[0], "custom");
    assert.equal(
      mountElement(createVNode(data.PropertyItem, { className: "k", term: "a", value: "b" })).el.className,
      "vui-PropertyItem k"
    );
  });

  it("escapes markup in term and value text", () => {
    const html = renderMarkup(
      createVNode(data.PropertyItem, { term: "<img>", value: "a & b" })
    );
    assert.ok(html.includes("&lt;img&gt;"));
    assert.ok(html.includes("a &amp; b"));
    assert.ok(!html.includes("<img>"));
  });
});

describe("data -- Disclosure, Summary, Code, CodeBlock, Empty", () => {
  it("maps each component to its honest native element", () => {
    assert.equal(
      renderMarkup(
        createVNode(data.Disclosure, {
          children: createVNode(data.Summary, { children: "More" })
        })
      ),
      '<details class="vui-Disclosure"><summary class="vui-Summary">More</summary></details>'
    );
    assert.equal(
      renderMarkup(createVNode(data.Code, { children: "a<b" })),
      '<code class="vui-Code">a&lt;b</code>'
    );
    assert.equal(
      renderMarkup(createVNode(data.Empty, { children: "None" })),
      '<section class="vui-Empty">None</section>'
    );
  });

  it("CodeBlock is a pre element with an opt-in wrap modifier", () => {
    assert.equal(mountElement(createVNode(data.CodeBlock, {})).el.className, "vui-CodeBlock");
    const wrapped = mountElement(createVNode(data.CodeBlock, { wrap: true, className: "k" })).el;
    assert.equal(wrapped.tagName, "PRE");
    assert.equal(wrapped.className, "vui-CodeBlock vui-CodeBlock--wrap k");
    assert.equal(wrapped.getAttribute("wrap"), null);
  });

  it("Disclosure forwards the native open attribute", () => {
    assert.equal(mountElement(createVNode(data.Disclosure, { open: true })).el.getAttribute("open"), "");
    assert.equal(mountElement(createVNode(data.Disclosure, {})).el.getAttribute("open"), null);
  });
});

describe("data -- JsonTree", () => {
  it("renders objects as a tree of labelled treeitems with quoted string leaves", () => {
    assert.equal(
      renderTree({ data: { name: "ledger", ok: true, n: 3, none: null } }),
      '<ul role="tree" class="vui-JsonTree">' +
        '<li role="treeitem"><span>name: </span><span>&quot;ledger&quot;</span></li>' +
        '<li role="treeitem"><span>ok: </span><span>true</span></li>' +
        '<li role="treeitem"><span>n: </span><span>3</span></li>' +
        '<li role="treeitem"><span>none: </span><span>null</span></li></ul>'
    );
  });

  it("renders nested arrays and objects as expanded groups keyed by index", () => {
    assert.equal(
      renderTree({ data: { rows: [10, "x"] } }),
      '<ul role="tree" class="vui-JsonTree">' +
        '<li role="treeitem" aria-expanded="true"><span>rows:</span>' +
        '<ul role="group">' +
        '<li role="treeitem"><span>0: </span><span>10</span></li>' +
        '<li role="treeitem"><span>1: </span><span>&quot;x&quot;</span></li>' +
        "</ul></li></ul>"
    );
  });

  it("renders top-level arrays by index and scalars (including falsy 0, false, and empty string) under the value label", () => {
    const arr = mountElement(createVNode(data.JsonTree, { data: ["a", "b"] })).el;
    assert.equal(arr.elementChildren.length, 2);
    assert.equal(arr.elementChildren[1]!.elementChildren[0]!.children.join(""), "1: ");
    const scalar = mountElement(createVNode(data.JsonTree, { data: 7 })).el;
    assert.equal(scalar.elementChildren.length, 1);
    assert.equal(scalar.elementChildren[0]!.elementChildren[0]!.children.join(""), "value: ");
    const nul = mountElement(createVNode(data.JsonTree, { data: null })).el;
    assert.equal(nul.elementChildren[0]!.elementChildren[1]!.children[0], "null");
    assert.ok(renderTree({ data: 0 }).includes("<span>0</span>"));
    assert.ok(renderTree({ data: false }).includes("<span>false</span>"));
    assert.ok(renderTree({ data: "" }).includes("<span>&quot;&quot;</span>"));
  });

  it("formats bigint, undefined, symbol, and function leaves without throwing", () => {
    const readFormattedLeaf = (value: unknown) => {
      const { el } = mountElement(createVNode(data.JsonTree, { data: { v: value } }));
      return el.elementChildren[0]!.elementChildren[1]!.children[0];
    };
    assert.equal(readFormattedLeaf(10n), "10n");
    assert.equal(readFormattedLeaf(undefined), "undefined");
    assert.equal(readFormattedLeaf(Symbol("s")), "Symbol(s)");
    assert.equal(readFormattedLeaf(() => 1), "() => 1");
  });

  it("marks circular object and array references instead of recursing forever", () => {
    const loop: Record<string, unknown> = { id: 1 };
    loop.self = loop;
    const html = renderTree({ data: loop });
    assert.ok(html.includes("<span>self: </span><span>&quot;[Circular]&quot;</span>"));
    const deep: Record<string, unknown> = { a: { b: {} } };
    (deep.a as Record<string, unknown>).b = deep.a;
    assert.ok(renderTree({ data: deep }).includes("[Circular]"));
    const loopArr: unknown[] = ["x"];
    loopArr.push(loopArr);
    assert.ok(renderTree({ data: loopArr }).includes("<span>1: </span><span>&quot;[Circular]&quot;</span>"));
  });

  it("does not flag repeated (non-circular) siblings as circular", () => {
    const shared = { x: 1 };
    const html = renderTree({ data: { a: shared, b: shared } });
    assert.ok(!html.includes("[Circular]"));
  });

  it("clamps maxDepth to 1..32 and summarizes truncated containers", () => {
    const payload = { a: { b: { c: 1 } }, list: [[1]] };
    const shallow = renderTree({ data: payload, maxDepth: 1 });
    assert.ok(shallow.includes("<span>[Object]</span>"));
    assert.ok(shallow.includes("<span>[Array]</span>"));
    assert.ok(!shallow.includes("c: "));

    const two = renderTree({ data: payload, maxDepth: 2 });
    assert.ok(two.includes("b: </span><span>[Object]</span>"));

    const zero = renderTree({ data: payload, maxDepth: 0 });
    assert.equal(zero, shallow, "maxDepth 0 clamps up to 1");
    const nan = renderTree({ data: payload, maxDepth: Number.NaN });
    const full = renderTree({ data: payload });
    assert.equal(nan, full, "non-finite maxDepth falls back to the 32 ceiling");

    let nested: unknown = "bottom";
    for (let i = 0; i < 40; i += 1) nested = { next: nested };
    const capped = renderTree({ data: nested, maxDepth: 1000 });
    assert.ok(capped.includes("[Object]"), "depth is capped at 32 regardless of maxDepth");
    assert.ok(!capped.includes("bottom"));
  });

  it("escapes hostile strings and never creates elements from data", () => {
    const { el, doc } = mountElement(
      createVNode(data.JsonTree, {
        data: { "<script>": "<img src=x onerror=alert(1)>" }
      })
    );
    const html = renderTree({ data: { "<script>": "<img src=x onerror=alert(1)>" } });
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.ok(!html.includes("<img"));
    assert.equal(el.querySelectorAll("script").length, 0);
    assert.equal(el.querySelectorAll("img").length, 0);
    assert.deepEqual(doc.cspViolations, []);
  });

  it("without data it renders passthrough children inside the tree", () => {
    const { el } = mountElement(
      createVNode(data.JsonTree, {
        className: "k",
        children: createVNode("li", { role: "treeitem", children: "manual" })
      })
    );
    assert.equal(el.getAttribute("role"), "tree");
    assert.equal(el.className, "vui-JsonTree k");
    assert.equal(el.elementChildren.length, 1);
    assert.equal(el.elementChildren[0]!.children[0], "manual");
  });

  it("does not mutate the caller's data", () => {
    const input = { a: [1, { b: 2 }] };
    const snapshot = JSON.stringify(input);
    renderTree({ data: input });
    assert.equal(JSON.stringify(input), snapshot);
  });
});

describe("data -- security", () => {
  it("every data primitive strips style and dangerouslySetInnerHTML", () => {
    for (const name of ["Properties", "PropertyItem", "Disclosure", "Summary", "Code", "CodeBlock", "JsonTree", "Empty"]) {
      const { el, doc } = mountElement(
        createVNode(data[name], {
          style: { color: "red" },
          dangerouslySetInnerHTML: { __html: "<i>x</i>" }
        })
      );
      assert.equal(el.getAttribute("style"), null, name);
      assert.equal(el.getAttribute("dangerouslysetinnerhtml"), null, name);
      assert.deepEqual(doc.cspViolations, [], name);
    }
  });
});
