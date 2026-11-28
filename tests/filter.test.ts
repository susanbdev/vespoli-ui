import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createVNode,
  fireListener,
  loadModule,
  mountElement,
  renderMarkup
} from "./markup.ts";

const filter = await loadModule("filter");

const OPTIONS = [
  { key: "ring-0", label: "Ring 0", count: 1 },
  { key: "ring-1", label: "Ring 1", count: 17 },
  { key: "ring-2", label: "Ring 2" }
];

describe("filter -- FacetBar and FacetGroup", () => {
  it("map to aside and fieldset elements", () => {
    assert.equal(
      renderMarkup(createVNode(filter.FacetBar, { children: [] })),
      '<aside class="vui-FacetBar"></aside>'
    );
    assert.equal(
      renderMarkup(createVNode(filter.FacetGroup, { className: "k" })),
      '<fieldset class="vui-FacetGroup k"></fieldset>'
    );
  });
});

describe("filter -- FacetList items mode", () => {
  it("renders a listbox of options with labels, optional counts, and a single tab stop", () => {
    const { el } = mountElement(createVNode(filter.FacetList, { items: OPTIONS }));
    assert.equal(el.tagName, "UL");
    assert.equal(el.getAttribute("role"), "listbox");
    assert.equal(el.elementChildren.length, 3);
    assert.deepEqual(
      el.elementChildren.map((li) => li.getAttribute("tabindex")),
      ["0", "-1", "-1"]
    );
    assert.deepEqual(
      el.elementChildren.map((li) => li.getAttribute("data-facet-key")),
      ["ring-0", "ring-1", "ring-2"]
    );
    assert.equal(el.elementChildren[0]!.elementChildren.length, 2, "label + count");
    assert.equal(el.elementChildren[1]!.elementChildren[1]!.children[0], "17");
    assert.equal(el.elementChildren[2]!.elementChildren.length, 1, "count omitted when undefined");
    for (const li of el.elementChildren) {
      assert.equal(li.tagName, "LI");
      assert.equal(li.getAttribute("role"), "option");
      assert.equal(li.className, "vui-FacetItem");
    }
  });

  it("derives selected and excluded state from arrays or Sets", () => {
    const viaArray = mountElement(
      createVNode(filter.FacetList, {
        items: OPTIONS,
        selectedKeys: ["ring-1"],
        excludedKeys: ["ring-2"]
      })
    ).el;
    assert.deepEqual(
      viaArray.elementChildren.map((li) => li.getAttribute("aria-selected")),
      ["false", "true", "false"]
    );
    assert.deepEqual(
      viaArray.elementChildren.map((li) => li.getAttribute("data-excluded")),
      [null, null, "true"]
    );
    const viaSet = mountElement(
      createVNode(filter.FacetList, {
        items: OPTIONS,
        selectedKeys: new Set(["ring-0", "ring-2"]),
        excludedKeys: new Set(["ring-1"])
      })
    ).el;
    assert.deepEqual(
      viaSet.elementChildren.map((li) => li.getAttribute("aria-selected")),
      ["true", "false", "true"]
    );
    assert.equal(viaSet.elementChildren[1]!.getAttribute("data-excluded"), "true");
  });

  it("delegates clicks to onToggleKey with the alt-key (exclude) flag", () => {
    const toggles: Array<[string, boolean]> = [];
    const { el } = mountElement(
      createVNode(filter.FacetList, {
        items: OPTIONS,
        onToggleKey: (key: string, alt: boolean) => toggles.push([key, alt])
      })
    );
    const li = el.elementChildren[1]!;
    fireListener(el, "click", { target: li });
    fireListener(el, "click", { target: li.elementChildren[0], altKey: true });
    assert.deepEqual(toggles, [
      ["ring-1", false],
      ["ring-1", true]
    ]);
  });

  it("ignores clicks that do not originate inside a facet option", () => {
    const toggles: string[] = [];
    const { el } = mountElement(
      createVNode(filter.FacetList, {
        items: OPTIONS,
        onToggleKey: (key: string) => toggles.push(key)
      })
    );
    fireListener(el, "click", { target: el });
    fireListener(el, "click", { target: null });
    fireListener(el, "click", {});
    assert.deepEqual(toggles, []);
  });

  it("toggles on Enter and Space only, preventing default for handled keys", () => {
    const toggles: Array<[string, boolean]> = [];
    const { el } = mountElement(
      createVNode(filter.FacetList, {
        items: OPTIONS,
        onToggleKey: (key: string, alt: boolean) => toggles.push([key, alt])
      })
    );
    const li = el.elementChildren[0]!;
    let prevented = 0;
    const press = (key: string, extra: Record<string, unknown> = {}) =>
      fireListener(el, "keydown", {
        key,
        target: li,
        preventDefault: () => {
          prevented += 1;
        },
        ...extra
      });
    press("Enter");
    press(" ", { altKey: true });
    press("a");
    press("Tab");
    assert.deepEqual(toggles, [
      ["ring-0", false],
      ["ring-0", true]
    ]);
    assert.equal(prevented, 2);
  });

  it("still forwards caller onClick and onKeyDown handlers with or without onToggleKey", () => {
    const seen: string[] = [];
    const { el } = mountElement(
      createVNode(filter.FacetList, {
        items: OPTIONS,
        onToggleKey: () => {},
        onClick: () => seen.push("click"),
        onKeyDown: () => seen.push("key")
      })
    );
    fireListener(el, "click", { target: el.elementChildren[0] });
    fireListener(el, "keydown", { key: "x", target: el.elementChildren[0] });
    assert.deepEqual(seen, ["click", "key"]);

    const directOnly = mountElement(
      createVNode(filter.FacetList, {
        items: OPTIONS,
        onClick: () => seen.push("direct-click"),
        onKeyDown: () => seen.push("direct-key")
      })
    ).el;
    fireListener(directOnly, "click", { target: directOnly.elementChildren[0] });
    fireListener(directOnly, "keydown", { key: "Enter", target: directOnly.elementChildren[0] });
    assert.deepEqual(seen, ["click", "key", "direct-click", "direct-key"]);
  });
});

describe("filter -- FacetList children mode", () => {
  it("renders caller children (including when items is empty) and only wires delegation when onToggleKey is set", () => {
    const children = [
      createVNode(filter.FacetItem, { facetKey: "a", children: "A" }, "a"),
      createVNode(filter.FacetItem, { facetKey: "b", selected: true, children: "B" }, "b")
    ];
    const plain = mountElement(
      createVNode(filter.FacetList, { children, onClick: () => {} })
    ).el;
    assert.equal(plain.elementChildren.length, 2);
    assert.equal(plain.elementChildren[1]!.getAttribute("aria-selected"), "true");
    assert.ok(plain.listeners.has("click"), "caller onClick is bound directly");

    const emptyItems = mountElement(
      createVNode(filter.FacetList, { items: [], children })
    ).el;
    assert.equal(emptyItems.elementChildren.length, 2);

    const toggles: string[] = [];
    const wired = mountElement(
      createVNode(filter.FacetList, {
        children,
        onToggleKey: (key: string) => toggles.push(key)
      })
    ).el;
    fireListener(wired, "click", { target: wired.elementChildren[1] });
    assert.deepEqual(toggles, ["b"]);
  });

  it("FacetItem exposes option semantics and facet data attributes", () => {
    const { el } = mountElement(
      createVNode(filter.FacetItem, { facetKey: "k1", excluded: true, className: "x" })
    );
    assert.equal(el.tagName, "LI");
    assert.equal(el.getAttribute("role"), "option");
    assert.equal(el.getAttribute("data-facet-key"), "k1");
    assert.equal(el.getAttribute("aria-selected"), "false");
    assert.equal(el.getAttribute("data-excluded"), "true");
    assert.equal(el.className, "vui-FacetItem x");
    const plain = mountElement(createVNode(filter.FacetItem, { facetKey: "k2", selected: true })).el;
    assert.equal(plain.getAttribute("aria-selected"), "true");
    assert.equal(plain.getAttribute("data-excluded"), null);
  });
});

describe("filter -- ChipBar and Chip", () => {
  it("ChipBar is a labelled region", () => {
    assert.equal(
      renderMarkup(createVNode(filter.ChipBar, {})),
      '<div role="region" aria-label="Active filters" class="vui-ChipBar"></div>'
    );
    assert.equal(
      mountElement(createVNode(filter.ChipBar, { role: "group" })).el.getAttribute("role"),
      "group"
    );
  });

  it("Chip is a button that applies the NOT operator modifier", () => {
    assert.equal(
      renderMarkup(createVNode(filter.Chip, { children: "ring:1" })),
      '<button type="button" class="vui-Chip">ring:1</button>'
    );
    assert.equal(
      mountElement(createVNode(filter.Chip, { operator: "not" })).el.className,
      "vui-Chip vui-Chip--operator-not"
    );
    assert.equal(
      mountElement(createVNode(filter.Chip, { operator: "not", className: "k" })).el.className,
      "vui-Chip vui-Chip--operator-not k"
    );
    assert.equal(
      mountElement(createVNode(filter.Chip, { operator: "in", className: "k" })).el.className,
      "vui-Chip k"
    );
  });

  it("Chip prefers onRemove over onClick", () => {
    const calls: string[] = [];
    const both = mountElement(
      createVNode(filter.Chip, {
        onRemove: () => calls.push("remove"),
        onClick: () => calls.push("click")
      })
    ).el;
    fireListener(both, "click");
    const clickOnly = mountElement(
      createVNode(filter.Chip, { onClick: () => calls.push("click") })
    ).el;
    fireListener(clickOnly, "click");
    assert.deepEqual(calls, ["remove", "click"]);
    assert.equal(both.getAttribute("onremove"), null, "onRemove must not leak as an attribute");
  });
});

describe("filter -- security", () => {
  it("every filter primitive strips style and dangerouslySetInnerHTML", () => {
    const withKey: Record<string, Record<string, unknown>> = { FacetItem: { facetKey: "k" } };
    for (const name of ["FacetBar", "FacetGroup", "FacetList", "FacetItem", "ChipBar", "Chip"]) {
      const { el, doc } = mountElement(
        createVNode(filter[name], {
          ...(withKey[name] ?? {}),
          style: { color: "red" },
          dangerouslySetInnerHTML: { __html: "<i>x</i>" }
        })
      );
      assert.equal(el.getAttribute("style"), null, name);
      assert.equal(el.getAttribute("dangerouslysetinnerhtml"), null, name);
      assert.deepEqual(doc.cspViolations, [], name);
    }
  });

  it("escapes hostile facet labels", () => {
    const html = renderMarkup(
      createVNode(filter.FacetList, {
        items: [{ key: "x", label: "<script>alert(1)</script>" }]
      })
    );
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(!html.includes("<script>"));
  });
});
