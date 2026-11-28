import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createVNode,
  fireListener,
  loadModule,
  mountElement,
  renderMarkup
} from "./markup.ts";

const controls = await loadModule("controls");

describe("controls -- Button and IconButton", () => {
  it("Button defaults to type=button, secondary variant, and enabled", () => {
    assert.equal(
      renderMarkup(createVNode(controls.Button, { children: "Save" })),
      '<button type="button" class="vui-Button">Save</button>'
    );
  });

  it("Button maps each variant to a static class and ignores unknown variants", () => {
    const readVariantClass = (variant: unknown) =>
      mountElement(createVNode(controls.Button, { variant })).el.className;
    assert.equal(readVariantClass("primary"), "vui-Button vui-Button--variant-primary");
    assert.equal(readVariantClass("secondary"), "vui-Button");
    assert.equal(readVariantClass("quiet"), "vui-Button vui-Button--variant-quiet");
    assert.equal(readVariantClass("danger"), "vui-Button vui-Button--variant-danger");
    assert.equal(readVariantClass("constructor"), "vui-Button");
    assert.equal(readVariantClass("__proto__"), "vui-Button");
  });

  it("Button allows type=submit and compact, and forwards click handlers", () => {
    let clicks = 0;
    const { el } = mountElement(
      createVNode(controls.Button, {
        type: "submit",
        compact: true,
        className: "k",
        onClick: () => {
          clicks += 1;
        }
      })
    );
    assert.equal(el.getAttribute("type"), "submit");
    assert.equal(el.className, "vui-Button vui-Button--compact k");
    fireListener(el, "click");
    assert.equal(clicks, 1);
  });

  it("Button loading disables the control and exposes busy state", () => {
    const { el } = mountElement(createVNode(controls.Button, { loading: true }));
    assert.equal(el.disabled, true);
    assert.equal(el.getAttribute("disabled"), "");
    assert.equal(el.getAttribute("aria-busy"), "true");
    assert.equal(el.getAttribute("data-loading"), "true");
    assert.equal(el.getAttribute("loading"), null);
    const idle = mountElement(createVNode(controls.Button, { disabled: true })).el;
    assert.equal(idle.disabled, true);
    assert.equal(idle.getAttribute("aria-busy"), null);
    const enabled = mountElement(createVNode(controls.Button, {})).el;
    assert.equal(enabled.disabled, false);
  });

  it("IconButton shares Button styling, adds vui-IconButton, and honors loading/disabled", () => {
    const { el } = mountElement(
      createVNode(controls.IconButton, { "aria-label": "Close", variant: "danger", compact: true })
    );
    assert.equal(el.tagName, "BUTTON");
    assert.equal(el.getAttribute("aria-label"), "Close");
    assert.equal(
      el.className,
      "vui-Button vui-IconButton vui-Button--variant-danger vui-Button--compact"
    );
    assert.equal(el.getAttribute("type"), "button");

    const busy = mountElement(
      createVNode(controls.IconButton, { "aria-label": "Sync", loading: true })
    ).el;
    assert.equal(busy.disabled, true);
    assert.equal(busy.getAttribute("aria-busy"), "true");
    assert.equal(busy.getAttribute("data-loading"), "true");

    const halted = mountElement(
      createVNode(controls.IconButton, { "aria-label": "Sync", disabled: true })
    ).el;
    assert.equal(halted.disabled, true);
    assert.equal(halted.getAttribute("aria-busy"), null);
  });
});

describe("controls -- Input, Select, Checkbox, Label", () => {
  it("Input renders a void input with modifiers and aria-invalid only when invalid", () => {
    assert.equal(
      renderMarkup(createVNode(controls.Input, { name: "q", placeholder: "Search" })),
      '<input name="q" placeholder="Search" class="vui-Input">'
    );
    const { el } = mountElement(
      createVNode(controls.Input, { invalid: true, mono: true, compact: true })
    );
    assert.equal(el.getAttribute("aria-invalid"), "true");
    assert.equal(el.className, "vui-Input vui-Input--compact vui-Input--mono");
    assert.equal(el.getAttribute("invalid"), null);
  });

  it("Select renders options as children and marks invalid", () => {
    const html = renderMarkup(
      createVNode(controls.Select, {
        invalid: true,
        compact: true,
        children: [
          createVNode("option", { value: "a", children: "A" }),
          createVNode("option", { value: "b", children: "B" })
        ]
      })
    );
    assert.equal(
      html,
      '<select aria-invalid="true" class="vui-Select vui-Select--compact">' +
        '<option value="a">A</option><option value="b">B</option></select>'
    );
  });

  it("Checkbox defaults type=checkbox and honors invalid", () => {
    const { el } = mountElement(createVNode(controls.Checkbox, { invalid: true, checked: true }));
    assert.equal(el.tagName, "INPUT");
    assert.equal(el.getAttribute("type"), "checkbox");
    assert.equal(el.getAttribute("aria-invalid"), "true");
    assert.equal(el.getAttribute("checked"), "");
    assert.equal(el.className, "vui-Checkbox");
    const radio = mountElement(createVNode(controls.Checkbox, { type: "radio" })).el;
    assert.equal(radio.getAttribute("type"), "radio");
  });

  it("Label renders for-association and muted modifier", () => {
    assert.equal(
      renderMarkup(createVNode(controls.Label, { htmlFor: "q", muted: true, children: "Query" })),
      '<label for="q" class="vui-Label vui-Label--muted">Query</label>'
    );
  });
});

describe("controls -- Field, FieldHint, FieldError, RangeField", () => {
  it("Field maps gap 1..3 to modifiers and ignores unsupported gaps", () => {
    for (const gap of [1, 2, 3]) {
      assert.equal(
        mountElement(createVNode(controls.Field, { gap })).el.className,
        `vui-Field vui-Field--gap-${gap}`
      );
    }
    assert.equal(mountElement(createVNode(controls.Field, { gap: 9 })).el.className, "vui-Field");
  });

  it("FieldHint is a paragraph and FieldError defaults to role=alert", () => {
    assert.equal(
      renderMarkup(createVNode(controls.FieldHint, { children: "hint" })),
      '<p class="vui-FieldHint">hint</p>'
    );
    assert.equal(
      renderMarkup(createVNode(controls.FieldError, { children: "bad" })),
      '<p role="alert" class="vui-FieldError">bad</p>'
    );
    assert.equal(
      mountElement(createVNode(controls.FieldError, { role: "status" })).el.getAttribute("role"),
      "status"
    );
  });

  it("RangeField supports compact", () => {
    assert.equal(mountElement(createVNode(controls.RangeField, {})).el.className, "vui-RangeField");
    assert.equal(
      mountElement(createVNode(controls.RangeField, { compact: true })).el.className,
      "vui-RangeField vui-RangeField--compact"
    );
  });
});

describe("controls -- Segments, Tabs, TabPanel", () => {
  it("Segments is a radiogroup with role override support and Segment encodes active roving tabindex", () => {
    const group = mountElement(createVNode(controls.Segments, {})).el;
    assert.equal(group.getAttribute("role"), "radiogroup");
    assert.equal(group.className, "vui-Segments");
    const customGroup = mountElement(
      createVNode(controls.Segments, { role: "group", className: "k" })
    ).el;
    assert.equal(customGroup.getAttribute("role"), "group");
    assert.equal(customGroup.className, "vui-Segments k");

    const on = mountElement(createVNode(controls.Segment, { active: true, children: "A" })).el;
    assert.equal(on.getAttribute("role"), "radio");
    assert.equal(on.getAttribute("type"), "button");
    assert.equal(on.getAttribute("aria-checked"), "true");
    assert.equal(on.getAttribute("tabindex"), "0");
    assert.equal(on.className, "vui-Segment");

    const off = mountElement(createVNode(controls.Segment, { compact: true, className: "k" })).el;
    assert.equal(off.getAttribute("aria-checked"), "false");
    assert.equal(off.getAttribute("tabindex"), "-1");
    assert.equal(off.className, "vui-Segment vui-Segment--compact k");
  });

  it("Tabs is a tablist and Tab encodes selection with aria-selected and tabindex", () => {
    assert.equal(mountElement(createVNode(controls.Tabs, {})).el.getAttribute("role"), "tablist");
    const sel = mountElement(createVNode(controls.Tab, { active: true })).el;
    assert.equal(sel.getAttribute("role"), "tab");
    assert.equal(sel.getAttribute("aria-selected"), "true");
    assert.equal(sel.getAttribute("tabindex"), "0");
    const unsel = mountElement(createVNode(controls.Tab, { className: "k" })).el;
    assert.equal(unsel.getAttribute("aria-selected"), "false");
    assert.equal(unsel.getAttribute("tabindex"), "-1");
    assert.equal(unsel.className, "vui-Tab k");
  });

  it("TabPanel is a focusable tabpanel section", () => {
    const { el } = mountElement(createVNode(controls.TabPanel, { "aria-labelledby": "t1" }));
    assert.equal(el.tagName, "SECTION");
    assert.equal(el.getAttribute("role"), "tabpanel");
    assert.equal(el.getAttribute("tabindex"), "0");
    assert.equal(el.getAttribute("aria-labelledby"), "t1");
  });

  it("a full tablist renders exactly one tab stop", () => {
    const { el } = mountElement(
      createVNode(controls.Tabs, {
        children: [
          createVNode(controls.Tab, { active: false, children: "One" }, "a"),
          createVNode(controls.Tab, { active: true, children: "Two" }, "b"),
          createVNode(controls.Tab, { active: false, children: "Three" }, "c")
        ]
      })
    );
    const stops = el.elementChildren.filter((t) => t.getAttribute("tabindex") === "0");
    assert.equal(stops.length, 1);
    assert.equal(stops[0]!.children[0], "Two");
  });
});

describe("controls -- Pagination", () => {
  it("renders an empty labelled nav when given no controls", () => {
    assert.equal(
      renderMarkup(createVNode(controls.Pagination, {})),
      '<nav aria-label="Pagination" class="vui-Pagination"></nav>'
    );
  });

  it("renders custom children verbatim without synthesized buttons", () => {
    const { el } = mountElement(
      createVNode(controls.Pagination, {
        onPrev: () => {},
        children: createVNode("a", { href: "/p/2", children: "2" })
      })
    );
    assert.equal(el.elementChildren.length, 1);
    assert.equal(el.elementChildren[0]!.tagName, "A");
  });

  it("renders Previous, summary, and Next with disabled state derived from hasPrev/hasNext", () => {
    const calls: string[] = [];
    const { el } = mountElement(
      createVNode(controls.Pagination, {
        hasPrev: false,
        hasNext: true,
        summary: "1-25 of 90",
        onPrev: () => calls.push("prev"),
        onNext: () => calls.push("next")
      })
    );
    const [prev, summary, next] = el.elementChildren;
    assert.equal(prev!.tagName, "BUTTON");
    assert.equal(prev!.children[0], "Previous");
    assert.equal(prev!.disabled, true);
    assert.equal(summary!.tagName, "SPAN");
    assert.equal(summary!.children[0], "1-25 of 90");
    assert.equal(next!.children[0], "Next");
    assert.equal(next!.disabled, false);
    assert.equal(prev!.className, "vui-Button vui-Button--compact");
    fireListener(next!, "click");
    assert.deepEqual(calls, ["next"]);

    const rev = mountElement(
      createVNode(controls.Pagination, {
        hasPrev: true,
        hasNext: false,
        onPrev: () => calls.push("prev"),
        onNext: () => calls.push("next")
      })
    ).el;
    assert.equal(rev.elementChildren[0]!.disabled, false);
    assert.equal(rev.elementChildren[1]!.disabled, true);
    fireListener(rev.elementChildren[0]!, "click");
    assert.deepEqual(calls, ["next", "prev"]);
  });

  it("omits the summary span when no summary is provided, and supports summary-only mode", () => {
    const { el } = mountElement(
      createVNode(controls.Pagination, { hasPrev: true, hasNext: true, onNext: () => {} })
    );
    assert.equal(el.elementChildren.length, 2);
    assert.deepEqual(
      el.elementChildren.map((c) => c.children[0]),
      ["Previous", "Next"]
    );
    assert.equal(
      renderMarkup(createVNode(controls.Pagination, { summary: "Page 1" })),
      '<nav aria-label="Pagination" class="vui-Pagination">' +
        '<button type="button" class="vui-Button vui-Button--compact" disabled>Previous</button>' +
        "<span>Page 1</span>" +
        '<button type="button" class="vui-Button vui-Button--compact" disabled>Next</button></nav>'
    );
  });
});

describe("controls -- security", () => {
  it("every control strips style and dangerouslySetInnerHTML at runtime", () => {
    const names = [
      "Button",
      "IconButton",
      "Input",
      "Select",
      "Checkbox",
      "Label",
      "Field",
      "FieldHint",
      "FieldError",
      "RangeField",
      "Segments",
      "Segment",
      "Tabs",
      "Tab",
      "TabPanel",
      "Pagination"
    ];
    for (const name of names) {
      const { el, doc } = mountElement(
        createVNode(controls[name], {
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
