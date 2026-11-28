import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createVNode,
  loadModule,
  mountElement,
  readClasses,
  renderMarkup
} from "./markup.ts";

const grid = await loadModule("grid");

describe("grid -- Container", () => {
  it("renders a bare vui-Container div by default", () => {
    assert.equal(
      renderMarkup(createVNode(grid.Container, { children: "x" })),
      '<div class="vui-Container">x</div>'
    );
  });

  it("maps fluid=true and breakpoint strings to static modifier classes", () => {
    const listFluidClasses = (fluid: unknown) =>
      readClasses(mountElement(createVNode(grid.Container, { fluid })).el);
    assert.deepEqual(listFluidClasses(true), ["vui-Container", "vui-Container--fluid"]);
    assert.deepEqual(listFluidClasses(false), ["vui-Container"]);
    for (const bp of ["sm", "md", "lg", "xl", "xxl"]) {
      assert.deepEqual(listFluidClasses(bp), ["vui-Container", `vui-Container--fluid-${bp}`]);
    }
  });

  it("ignores unknown and prototype-key fluid values", () => {
    for (const bad of ["huge", "__proto__", "constructor", "toString", "", 3, null]) {
      const { el } = mountElement(createVNode(grid.Container, { fluid: bad }));
      assert.equal(el.className, "vui-Container", `fluid=${String(bad)} leaked a class`);
    }
  });

  it("appends className, forwards attributes, and strips style and raw HTML sinks", () => {
    const { el, doc } = mountElement(
      createVNode(grid.Container, {
        id: "main",
        "data-testid": "c",
        className: "extra",
        style: { color: "red" },
        dangerouslySetInnerHTML: { __html: "<b>x</b>" }
      })
    );
    assert.equal(el.className, "vui-Container extra");
    assert.equal(el.getAttribute("id"), "main");
    assert.equal(el.getAttribute("data-testid"), "c");
    assert.equal(el.getAttribute("style"), null);
    assert.equal(el.getAttribute("dangerouslysetinnerhtml"), null);
    assert.deepEqual(doc.cspViolations, []);
  });
});

describe("grid -- Row", () => {
  it("composes gutter, rowGutter, and align classes in a fixed order", () => {
    const { el } = mountElement(
      createVNode(grid.Row, { gutter: 3, rowGutter: 2, align: "center", className: "mine" })
    );
    assert.equal(
      el.className,
      "vui-Row vui-g-3 vui-gy-2 vui-Row--align-center mine"
    );
  });

  it("emits gutter 0..6, rowGutter 0..6, and every valid align token", () => {
    for (const g of [0, 1, 2, 3, 4, 5, 6]) {
      assert.equal(mountElement(createVNode(grid.Row, { gutter: g })).el.className, `vui-Row vui-g-${g}`);
      assert.equal(mountElement(createVNode(grid.Row, { rowGutter: g })).el.className, `vui-Row vui-gy-${g}`);
    }
    for (const align of ["start", "center", "end", "stretch"]) {
      assert.equal(
        mountElement(createVNode(grid.Row, { align })).el.className,
        `vui-Row vui-Row--align-${align}`
      );
    }
  });

  it("drops out-of-range gutters and prototype-key aligns", () => {
    const { el } = mountElement(
      createVNode(grid.Row, { gutter: 7, rowGutter: -1, align: "constructor" })
    );
    assert.equal(el.className, "vui-Row");
  });
});

describe("grid -- Col", () => {
  it("emits spans across all 6 breakpoints followed by all 6 offsets", () => {
    const { el } = mountElement(
      createVNode(grid.Col, {
        xs: 12,
        sm: 10,
        md: 8,
        lg: 6,
        xl: 4,
        xxl: "full",
        offsetXs: 0,
        offsetSm: 1,
        offsetMd: 2,
        offsetLg: 3,
        offsetXl: 4,
        offsetXxl: 11
      })
    );
    assert.equal(
      el.className,
      "vui-Col vui-c-xs-12 vui-c-sm-10 vui-c-md-8 vui-c-lg-6 vui-c-xl-4 vui-c-xxl-full " +
        "vui-o-xs-0 vui-o-sm-1 vui-o-md-2 vui-o-lg-3 vui-o-xl-4 vui-o-xxl-11"
    );
  });

  it("rejects out-of-range spans and offsets without emitting classes", () => {
    const { el } = mountElement(
      createVNode(grid.Col, { xs: 0, sm: 13, md: "constructor", offsetXs: 12, offsetLg: -1 })
    );
    assert.equal(el.className, "vui-Col");
  });

  it("strips style and raw HTML sinks on Row and Col as well as Container", () => {
    for (const name of ["Row", "Col"] as const) {
      const { el, doc } = mountElement(
        createVNode(grid[name], {
          style: { width: 10 },
          dangerouslySetInnerHTML: { __html: "<b>x</b>" }
        })
      );
      assert.equal(el.getAttribute("style"), null, name);
      assert.equal(el.getAttribute("dangerouslysetinnerhtml"), null, name);
      assert.deepEqual(doc.cspViolations, [], name);
    }
  });

  it("renders a complete 12-column row as nested markup with no inline style", () => {
    const html = renderMarkup(
      createVNode(grid.Container, {
        children: createVNode(grid.Row, {
          gutter: 2,
          children: [
            createVNode(grid.Col, { md: 8, children: "main" }),
            createVNode(grid.Col, { md: 4, children: "side" })
          ]
        })
      })
    );
    assert.equal(
      html,
      '<div class="vui-Container"><div class="vui-Row vui-g-2">' +
        '<div class="vui-Col vui-c-md-8">main</div>' +
        '<div class="vui-Col vui-c-md-4">side</div></div></div>'
    );
    assert.ok(!html.includes("style="));
  });
});
