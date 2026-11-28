import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRenderHost,
  createVNode,
  fireListener,
  loadModule,
  mountElement,
  renderMarkup
} from "./markup.ts";

const table = await loadModule("table");

describe("table -- Table, TableHead, VirtualTable, TreeTable", () => {
  it("renders honest table elements with loading state surfaced to assistive tech", () => {
    assert.equal(
      renderMarkup(createVNode(table.Table, { children: [] })),
      '<table class="vui-Table"></table>'
    );
    const busy = mountElement(createVNode(table.Table, { loading: true })).el;
    assert.equal(busy.getAttribute("aria-busy"), "true");
    assert.equal(busy.getAttribute("data-loading"), "true");
    assert.equal(mountElement(createVNode(table.TableHead, {})).el.tagName, "THEAD");
    assert.equal(mountElement(createVNode(table.TableHead, {})).el.className, "vui-TableHead");
  });

  it("VirtualTable and TreeTable extend the base table class", () => {
    const virtual = mountElement(createVNode(table.VirtualTable, { loading: true })).el;
    assert.equal(virtual.className, "vui-Table vui-VirtualTable");
    assert.equal(virtual.getAttribute("aria-busy"), "true");
    const tree = mountElement(createVNode(table.TreeTable, {})).el;
    assert.equal(tree.className, "vui-Table vui-TreeTable");
    assert.equal(tree.getAttribute("role"), "treegrid");
    assert.equal(
      mountElement(createVNode(table.TreeTable, { role: "grid" })).el.getAttribute("role"),
      "grid"
    );
  });
});

describe("table -- TableBody delegation", () => {
  function mountBody(onRowActivate: (key: string, ev: unknown) => void, extra = {}) {
    return mountElement(
      createVNode(table.TableBody, {
        onRowActivate,
        ...extra,
        children: [
          createVNode(table.TableRow, {
            rowKey: "sha-1",
            children: createVNode(table.TableCell, { children: "one" })
          }, "r1"),
          createVNode(table.TableRow, {
            rowKey: "sha-2",
            children: createVNode(table.TableCell, { children: "two" })
          }, "r2")
        ]
      })
    ).el;
  }

  it("activates the row key on click, even from a nested cell", () => {
    const keys: string[] = [];
    const body = mountBody((key) => keys.push(key));
    const row2 = body.elementChildren[1]!;
    fireListener(body, "click", { target: row2 });
    fireListener(body, "click", { target: row2.elementChildren[0] });
    assert.deepEqual(keys, ["sha-2", "sha-2"]);
  });

  it("passes the originating event to onRowActivate", () => {
    let received: unknown;
    const body = mountBody((_key, ev) => {
      received = ev;
    });
    fireListener(body, "click", { target: body.elementChildren[0], marker: 7 });
    assert.equal((received as { marker: number }).marker, 7);
  });

  it("activates on Enter and Space but not other keys, preventing default when handled", () => {
    const keys: string[] = [];
    const body = mountBody((key) => keys.push(key));
    let prevented = 0;
    const pressRowKey = (key: string) =>
      fireListener(body, "keydown", {
        key,
        target: body.elementChildren[0],
        preventDefault: () => {
          prevented += 1;
        }
      });
    pressRowKey("Enter");
    pressRowKey(" ");
    pressRowKey("ArrowDown");
    pressRowKey("x");
    assert.deepEqual(keys, ["sha-1", "sha-1"]);
    assert.equal(prevented, 2);
  });

  it("ignores events whose target is not inside a keyed row", () => {
    const keys: string[] = [];
    const body = mountBody((key) => keys.push(key));
    fireListener(body, "click", { target: body });
    fireListener(body, "click", { target: null });
    fireListener(body, "keydown", { key: "Enter", target: body, preventDefault() {} });
    assert.deepEqual(keys, []);
  });

  it("forwards caller onClick/onKeyDown, and binds them directly without onRowActivate", () => {
    const seen: string[] = [];
    const wired = mountBody(() => {}, {
      onClick: () => seen.push("click"),
      onKeyDown: () => seen.push("key")
    });
    fireListener(wired, "click", { target: wired.elementChildren[0] });
    fireListener(wired, "keydown", { key: "q", target: wired.elementChildren[0] });
    assert.deepEqual(seen, ["click", "key"]);

    const passthrough = mountElement(
      createVNode(table.TableBody, { onClick: () => seen.push("direct") })
    ).el;
    fireListener(passthrough, "click");
    assert.deepEqual(seen, ["click", "key", "direct"]);
    assert.equal(passthrough.listeners.has("keydown"), false);
    assert.equal(passthrough.getAttribute("onrowactivate"), null);
  });
});

describe("table -- TableRow", () => {
  it("renders a keyed, selectable row", () => {
    const { el } = mountElement(createVNode(table.TableRow, { rowKey: "k", selected: true }));
    assert.equal(el.tagName, "TR");
    assert.equal(el.getAttribute("data-row-key"), "k");
    assert.equal(el.getAttribute("aria-selected"), "true");
    assert.equal(el.getAttribute("rowkey"), null, "rowKey must not leak as an attribute");
    const plain = mountElement(createVNode(table.TableRow, { rowKey: "k2" })).el;
    assert.equal(plain.getAttribute("aria-selected"), null);
  });

  it("is memoized: identical props skip re-render, changed props re-render", () => {
    const host = createRenderHost();
    const renderRow = (props: Record<string, unknown>) =>
      host.render(createVNode(table.TableRow, props));
    renderRow({ rowKey: "a", children: "x" });
    assert.equal(host.memoRowRenders, 1);
    renderRow({ rowKey: "a", children: "x" });
    assert.equal(host.memoRowRenders, 1, "same props must not re-render");
    const el = renderRow({ rowKey: "a", selected: true, children: "x" })!;
    assert.equal(host.memoRowRenders, 2);
    assert.equal(el.getAttribute("aria-selected"), "true");
  });
});

describe("table -- cells", () => {
  it("TableCell maps all align and width tokens, ignoring defaults and unknown tokens", () => {
    const readCellClass = (props: Record<string, unknown>) =>
      mountElement(createVNode(table.TableCell, props)).el.className;
    assert.equal(readCellClass({}), "vui-TableCell");
    assert.equal(readCellClass({ align: "left", width: "auto" }), "vui-TableCell");
    for (const width of ["xs", "sm", "md", "lg"]) {
      assert.equal(readCellClass({ width }), `vui-TableCell vui-TableCell--width-${width}`);
    }
    assert.equal(
      readCellClass({ align: "right", width: "lg" }),
      "vui-TableCell vui-TableCell--align-right vui-TableCell--width-lg"
    );
    assert.equal(
      readCellClass({ align: "center", width: "xs" }),
      "vui-TableCell vui-TableCell--align-center vui-TableCell--width-xs"
    );
    assert.equal(readCellClass({ align: "constructor", width: "__proto__" }), "vui-TableCell");
    assert.equal(mountElement(createVNode(table.TableCell, {})).el.tagName, "TD");
  });

  it("HeaderCell defaults scope=col, allows override, and maps all align/width tokens", () => {
    const { el } = mountElement(
      createVNode(table.HeaderCell, { align: "center", width: "md", children: "Name" })
    );
    assert.equal(el.tagName, "TH");
    assert.equal(el.getAttribute("scope"), "col");
    assert.equal(el.className, "vui-HeaderCell vui-HeaderCell--align-center vui-HeaderCell--width-md");
    assert.equal(
      mountElement(createVNode(table.HeaderCell, { align: "right", width: "lg" })).el.className,
      "vui-HeaderCell vui-HeaderCell--align-right vui-HeaderCell--width-lg"
    );
    for (const width of ["xs", "sm", "md", "lg"]) {
      assert.equal(
        mountElement(createVNode(table.HeaderCell, { width })).el.className,
        `vui-HeaderCell vui-HeaderCell--width-${width}`
      );
    }
    assert.equal(
      mountElement(createVNode(table.HeaderCell, { scope: "row" })).el.getAttribute("scope"),
      "row"
    );
    assert.equal(
      mountElement(createVNode(table.HeaderCell, { width: "xl" })).el.className,
      "vui-HeaderCell"
    );
  });

  it("renders a complete table as valid nested markup", () => {
    const html = renderMarkup(
      createVNode(table.Table, {
        children: [
          createVNode(table.TableHead, {
            children: createVNode(table.TableRow, {
              rowKey: "h",
              children: createVNode(table.HeaderCell, { children: "Commit" })
            })
          }, "h"),
          createVNode(table.TableBody, {
            children: createVNode(table.TableRow, {
              rowKey: "r",
              children: createVNode(table.TableCell, { align: "right", children: "9f81" })
            })
          }, "b")
        ]
      })
    );
    assert.equal(
      html,
      '<table class="vui-Table"><thead class="vui-TableHead"><tr data-row-key="h" class="vui-TableRow">' +
        '<th scope="col" class="vui-HeaderCell">Commit</th></tr></thead>' +
        '<tbody class="vui-TableBody"><tr data-row-key="r" class="vui-TableRow">' +
        '<td class="vui-TableCell vui-TableCell--align-right">9f81</td></tr></tbody></table>'
    );
  });
});

describe("table -- VirtualSpacer and decomposeOffset", () => {
  it("VirtualSpacer accepts bits 0..17 and coerces everything else to 0", () => {
    const readSpacerBit = (value: unknown) =>
      mountElement(createVNode(table.VirtualSpacer, { bit: value })).el.getAttribute("data-bit");
    assert.equal(readSpacerBit(0), "0");
    assert.equal(readSpacerBit(9), "9");
    assert.equal(readSpacerBit(17), "17");
    for (const bad of [-1, 18, 1.5, Number.NaN, "3", undefined, null, Infinity]) {
      assert.equal(readSpacerBit(bad), "0", `bit=${String(bad)}`);
    }
    const el = mountElement(createVNode(table.VirtualSpacer, { bit: 4 })).el;
    assert.equal(el.tagName, "TR");
    assert.equal(el.getAttribute("aria-hidden"), "true");
    assert.equal(el.className, "vui-VirtualSpacer");
  });

  it("decomposeOffset returns ascending power-of-two bit indices", () => {
    assert.deepEqual(table.decomposeOffset(0), []);
    assert.deepEqual(table.decomposeOffset(1), [0]);
    assert.deepEqual(table.decomposeOffset(5), [0, 2]);
    assert.deepEqual(table.decomposeOffset(1024), [10]);
    assert.deepEqual(table.decomposeOffset(262143), Array.from({ length: 18 }, (_, i) => i));
  });

  it("decomposeOffset clamps, floors, and rejects non-finite input", () => {
    assert.deepEqual(table.decomposeOffset(262144), table.decomposeOffset(262143));
    assert.deepEqual(table.decomposeOffset(10_000_000), table.decomposeOffset(262143));
    assert.deepEqual(table.decomposeOffset(-5), []);
    assert.deepEqual(table.decomposeOffset(Number.NaN), []);
    assert.deepEqual(table.decomposeOffset(Infinity), []);
    assert.deepEqual(table.decomposeOffset(6.9), [1, 2]);
  });

  it("decomposeOffset bits always reconstruct the clamped offset", () => {
    for (const n of [0, 1, 2, 3, 255, 256, 4097, 65535, 131072, 200000, 262143]) {
      const sum = table.decomposeOffset(n).reduce((acc: number, b: number) => acc + 2 ** b, 0);
      assert.equal(sum, n);
    }
  });
});

describe("table -- TreeRow, DagRail, DagLane", () => {
  it("TreeRow validates level 1..8 and exposes aria-level, data-level, and expanded state", () => {
    const row = mountElement(createVNode(table.TreeRow, { level: 3, expanded: true })).el;
    assert.equal(row.tagName, "TR");
    assert.equal(row.getAttribute("role"), "row");
    assert.equal(row.getAttribute("aria-level"), "3");
    assert.equal(row.getAttribute("data-level"), "3");
    assert.equal(row.getAttribute("aria-expanded"), "true");
    assert.equal(row.className, "vui-TreeRow");
    for (const bad of [0, 9, 1.5, -2, Number.NaN, "2", undefined]) {
      const el = mountElement(createVNode(table.TreeRow, { level: bad })).el;
      assert.equal(el.getAttribute("aria-level"), "1", `level=${String(bad)}`);
      assert.equal(el.getAttribute("data-level"), "1");
    }
    assert.equal(
      mountElement(createVNode(table.TreeRow, { level: 8 })).el.getAttribute("aria-level"),
      "8"
    );
  });

  it("TreeRow distinguishes collapsed (false) from leaf (undefined)", () => {
    assert.equal(
      mountElement(createVNode(table.TreeRow, { level: 1, expanded: false })).el.getAttribute("aria-expanded"),
      "false"
    );
    assert.equal(
      mountElement(createVNode(table.TreeRow, { level: 1 })).el.getAttribute("aria-expanded"),
      null
    );
  });

  it("DagRail is a div and DagLane is an aria-hidden span with all edge/node modifiers", () => {
    assert.equal(
      renderMarkup(createVNode(table.DagRail, {})),
      '<div class="vui-DagRail"></div>'
    );
    assert.equal(
      renderMarkup(createVNode(table.DagLane, { edge: "fork-right", node: "head" })),
      '<span aria-hidden="true" class="vui-DagLane vui-DagLane--edge-fork-right vui-DagLane--node-head"></span>'
    );
    assert.equal(
      mountElement(createVNode(table.DagLane, { edge: "merge-left", node: "merge" })).el.className,
      "vui-DagLane vui-DagLane--edge-merge-left vui-DagLane--node-merge"
    );
    assert.equal(
      mountElement(createVNode(table.DagLane, { edge: "straight", node: "commit" })).el.className,
      "vui-DagLane vui-DagLane--node-commit"
    );
    assert.equal(
      mountElement(createVNode(table.DagLane, { edge: "ghost", node: "ghost" })).el.className,
      "vui-DagLane vui-DagLane--edge-ghost vui-DagLane--node-ghost"
    );
    assert.equal(
      mountElement(createVNode(table.DagLane, { edge: "constructor", node: "__proto__" })).el.className,
      "vui-DagLane"
    );
    assert.equal(
      mountElement(createVNode(table.DagLane, { "aria-hidden": "false" })).el.getAttribute("aria-hidden"),
      "true",
      "decorative lane stays hidden"
    );
  });
});

describe("table -- security", () => {
  it("every table primitive strips style and dangerouslySetInnerHTML", () => {
    const names = [
      "Table",
      "TableHead",
      "TableBody",
      "TableRow",
      "TableCell",
      "HeaderCell",
      "VirtualTable",
      "VirtualSpacer",
      "TreeTable",
      "TreeRow",
      "DagRail",
      "DagLane"
    ];
    for (const name of names) {
      const { el, doc } = mountElement(
        createVNode(table[name], {
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
