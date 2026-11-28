import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createVNode,
  loadModule,
  mountElement,
  type SimElement
} from "./markup.ts";

const a11y = await loadModule("a11y");
const controls = await loadModule("controls");

function mountTabs(activeIndex: number, disabledIndex = -1): SimElement {
  return mountElement(
    createVNode(controls.Tabs, {
      children: ["One", "Two", "Three", "Four"].map((label, i) =>
        createVNode(
          controls.Tab,
          { active: i === activeIndex, disabled: i === disabledIndex, children: label },
          label
        )
      )
    })
  ).el;
}

function pressKey(
  host: SimElement,
  key: string,
  target: unknown,
  axis?: string,
  selector?: string
) {
  let prevented = 0;
  const focused = a11y.delegateRovingKey(
    {
      key,
      currentTarget: host,
      target,
      preventDefault: () => {
        prevented += 1;
      }
    },
    axis,
    selector
  );
  return { focused, prevented };
}

describe("a11y -- resolveNextIndex", () => {
  it("moves along the horizontal axis by default and wraps at both ends", () => {
    assert.equal(a11y.resolveNextIndex(0, 4, "ArrowRight"), 1);
    assert.equal(a11y.resolveNextIndex(3, 4, "ArrowRight"), 0);
    assert.equal(a11y.resolveNextIndex(1, 4, "ArrowLeft"), 0);
    assert.equal(a11y.resolveNextIndex(0, 4, "ArrowLeft"), 3);
    assert.equal(a11y.resolveNextIndex(0, 4, "ArrowDown"), null);
    assert.equal(a11y.resolveNextIndex(0, 4, "ArrowUp"), null);
  });

  it("moves along the vertical axis only for Up/Down", () => {
    assert.equal(a11y.resolveNextIndex(0, 3, "ArrowDown", "vertical"), 1);
    assert.equal(a11y.resolveNextIndex(2, 3, "ArrowDown", "vertical"), 0);
    assert.equal(a11y.resolveNextIndex(0, 3, "ArrowUp", "vertical"), 2);
    assert.equal(a11y.resolveNextIndex(0, 3, "ArrowRight", "vertical"), null);
    assert.equal(a11y.resolveNextIndex(0, 3, "ArrowLeft", "vertical"), null);
  });

  it("accepts both axes for grid-like widgets", () => {
    for (const key of ["ArrowRight", "ArrowDown"]) {
      assert.equal(a11y.resolveNextIndex(1, 5, key, "both"), 2, key);
    }
    for (const key of ["ArrowLeft", "ArrowUp"]) {
      assert.equal(a11y.resolveNextIndex(1, 5, key, "both"), 0, key);
    }
  });

  it("jumps to the first and last item with Home and End regardless of axis", () => {
    for (const axis of ["horizontal", "vertical", "both"]) {
      assert.equal(a11y.resolveNextIndex(2, 6, "Home", axis), 0);
      assert.equal(a11y.resolveNextIndex(2, 6, "End", axis), 5);
    }
  });

  it("returns null for unhandled keys and empty collections", () => {
    for (const key of ["Enter", " ", "a", "Tab", "PageDown", "", "arrowright"]) {
      assert.equal(a11y.resolveNextIndex(0, 3, key), null, JSON.stringify(key));
    }
    assert.equal(a11y.resolveNextIndex(0, 0, "ArrowRight"), null);
    assert.equal(a11y.resolveNextIndex(0, -2, "Home"), null);
  });

  it("clamps negative and out-of-range current indices before stepping", () => {
    assert.equal(a11y.resolveNextIndex(-1, 4, "ArrowRight"), 1);
    assert.equal(a11y.resolveNextIndex(-5, 4, "ArrowLeft"), 3);
    assert.equal(a11y.resolveNextIndex(6, 4, "ArrowRight"), 3);
  });
});

describe("a11y -- moveFocus", () => {
  it("sets a roving tabindex, focuses the target, and returns it", () => {
    const host = mountTabs(0);
    const active = a11y.moveFocus(host, 2);
    assert.equal(active, host.elementChildren[2]);
    assert.equal(host.elementChildren[2]!.focused, true);
    assert.deepEqual(
      host.elementChildren.map((t) => t.tabIndex),
      [-1, -1, 0, -1]
    );
    assert.equal(host.elementChildren[0]!.focused, false);
  });

  it("wraps indices modulo the focusable count, including negatives", () => {
    const host = mountTabs(0);
    assert.equal(a11y.moveFocus(host, 4), host.elementChildren[0]);
    assert.equal(a11y.moveFocus(host, -1), host.elementChildren[3]);
    assert.equal(a11y.moveFocus(host, -6), host.elementChildren[2]);
  });

  it("skips disabled items when counting and focusing", () => {
    const host = mountTabs(0, 1);
    const second = a11y.moveFocus(host, 1);
    assert.equal(second, host.elementChildren[2], "disabled Two is skipped");
    assert.equal(host.elementChildren[1]!.focused, false);
    assert.equal(a11y.moveFocus(host, 3), host.elementChildren[0], "three focusable items wrap");
  });

  it("returns null and mutates nothing when there is nothing focusable", () => {
    const empty = mountElement(createVNode(controls.Tabs, {})).el;
    assert.equal(a11y.moveFocus(empty, 0), null);
    const allDisabled = mountElement(
      createVNode(controls.Tabs, {
        children: [createVNode(controls.Tab, { disabled: true, children: "x" }, "x")]
      })
    ).el;
    assert.equal(a11y.moveFocus(allDisabled, 0), null);
  });

  it("honors a custom selector", () => {
    const host = mountElement(
      createVNode("div", {
        children: [
          createVNode("span", { "data-roving-item": "", children: "a" }, "a"),
          createVNode("button", { children: "ignored by selector" }, "b"),
          createVNode("span", { "data-roving-item": "", children: "c" }, "c")
        ]
      })
    ).el;
    const picked = a11y.moveFocus(host, 1, "span[data-roving-item]");
    assert.equal(picked, host.elementChildren[2]);
    assert.equal(host.elementChildren[1]!.focused, false);
  });

  it("works for radio groups built from Segments", () => {
    const host = mountElement(
      createVNode(controls.Segments, {
        children: ["a", "b", "c"].map((k, i) =>
          createVNode(controls.Segment, { active: i === 0, children: k }, k)
        )
      })
    ).el;
    assert.equal(a11y.moveFocus(host, 1), host.elementChildren[1]);
  });
});

describe("a11y -- delegateRovingKey", () => {
  it("moves focus from the event target and prevents default scrolling", () => {
    const host = mountTabs(0);
    const { focused, prevented } = pressKey(host, "ArrowRight", host.elementChildren[0]);
    assert.equal(focused, host.elementChildren[1]);
    assert.equal(prevented, 1);
    assert.deepEqual(
      host.elementChildren.map((t) => t.tabIndex),
      [-1, 0, -1, -1]
    );
  });

  it("wraps from the last item to the first", () => {
    const host = mountTabs(3);
    const { focused } = pressKey(host, "ArrowRight", host.elementChildren[3]);
    assert.equal(focused, host.elementChildren[0]);
  });

  it("handles Home and End", () => {
    const host = mountTabs(1);
    assert.equal(pressKey(host, "End", host.elementChildren[1]).focused, host.elementChildren[3]);
    assert.equal(pressKey(host, "Home", host.elementChildren[3]).focused, host.elementChildren[0]);
  });

  it("uses the item holding tabindex 0 when the target is not a roving item", () => {
    const host = mountTabs(2);
    const { focused } = pressKey(host, "ArrowLeft", { notAnItem: true });
    assert.equal(focused, host.elementChildren[1]);
  });

  it("ignores keys off the configured axis without preventing default", () => {
    const host = mountTabs(0);
    const horizontalOnly = pressKey(host, "ArrowDown", host.elementChildren[0]);
    assert.equal(horizontalOnly.focused, null);
    assert.equal(horizontalOnly.prevented, 0);
    const vertical = pressKey(host, "ArrowDown", host.elementChildren[0], "vertical");
    assert.equal(vertical.focused, host.elementChildren[1]);
    assert.equal(vertical.prevented, 1);
    const unrelated = pressKey(host, "Enter", host.elementChildren[1]);
    assert.equal(unrelated.focused, null);
    assert.equal(unrelated.prevented, 0);
  });

  it("skips disabled items while stepping", () => {
    const host = mountTabs(0, 1);
    const { focused } = pressKey(host, "ArrowRight", host.elementChildren[0]);
    assert.equal(focused, host.elementChildren[2]);
  });

  it("returns null without side effects on empty hosts", () => {
    const empty = mountElement(createVNode(controls.Tabs, {})).el;
    const { focused, prevented } = pressKey(empty, "ArrowRight", empty);
    assert.equal(focused, null);
    assert.equal(prevented, 0);
  });

  it("delegates roving focus across custom selector items", () => {
    const host = mountElement(
      createVNode("div", {
        children: [
          createVNode("span", { "data-roving-item": "", tabIndex: 0, children: "a" }, "a"),
          createVNode("button", { tabIndex: 0, children: "skip" }, "b"),
          createVNode("span", { "data-roving-item": "", tabIndex: -1, children: "c" }, "c")
        ]
      })
    ).el;
    const { focused, prevented } = pressKey(
      host,
      "ArrowRight",
      host.elementChildren[0],
      "horizontal",
      "span[data-roving-item]"
    );
    assert.equal(focused, host.elementChildren[2]);
    assert.equal(prevented, 1);
  });
});
