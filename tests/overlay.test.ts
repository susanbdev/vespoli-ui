import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRenderHost,
  createVNode,
  fireListener,
  flushTasks,
  loadModule,
  mountElement,
  renderMarkup,
  renderToStaticMarkup,
  renderToString
} from "./markup.ts";

const overlay = await loadModule("overlay");
const transitions = await loadModule("transitions");

type DialogName = "Dialog" | "Inspector";

const NAMES: ReadonlyArray<readonly [DialogName, string]> = [
  ["Dialog", "dialog"],
  ["Inspector", "inspector"]
];

for (const [name, morphTarget] of NAMES) {
  describe(`overlay -- ${name}`, () => {
    const overlayPrimitive = overlay[name];

    it("opens natively via showModal exactly once, closes via close(), and re-opens on false->true", async () => {
      const host = createRenderHost();
      const el = host.render(createVNode(overlayPrimitive, { open: true, children: "body" }))!;
      assert.equal(el.tagName, "DIALOG");
      assert.equal(el.open, true);
      assert.equal(el.modalShowCount, 1);
      assert.equal(el.getAttribute("data-vui-morph-target"), morphTarget);

      host.render(createVNode(overlayPrimitive, { open: true, children: "body" }));
      assert.equal(el.modalShowCount, 1, "re-render with open=true must not reopen");
      assert.equal(el.getAttribute("open"), "", "imperative open attribute preserved across re-render");

      host.render(createVNode(overlayPrimitive, { open: false, children: "body" }));
      assert.equal(el.open, false);
      assert.equal(el.getAttribute("open"), null);
      assert.equal(el.modalCloseCount, 1);
      assert.equal(el.getAttribute("data-vui-morph-target"), null);
      await flushTasks();

      host.render(createVNode(overlayPrimitive, { open: true, children: "body" }));
      assert.equal(el.open, true);
      assert.equal(el.modalShowCount, 2);
      await flushTasks();
    });

    it("falls back to setting and removing the open attribute when showModal/close are absent", () => {
      const host = createRenderHost();
      const el = host.render(createVNode(overlayPrimitive, { open: false }))!;
      (el as unknown as Record<string, unknown>).showModal = undefined;
      (el as unknown as Record<string, unknown>).close = undefined;

      host.render(createVNode(overlayPrimitive, { open: true }));
      assert.equal(el.getAttribute("open"), "");
      assert.equal(el.open, true);

      host.render(createVNode(overlayPrimitive, { open: false }));
      assert.equal(el.getAttribute("open"), null);
      assert.equal(el.open, false);
    });

    it("renders effect-free SSR markup via react-dom/server without invoking showModal", () => {
      const closedHtml = renderMarkup(createVNode(overlayPrimitive, { open: false, children: "x" }));
      assert.match(closedHtml, /^<dialog\b/);
      const openStatic = renderToStaticMarkup(createVNode(overlayPrimitive, { open: true, children: "x" }));
      const openStream = renderToString(createVNode(overlayPrimitive, { open: true, children: "x" }));
      assert.equal(openStream, openStatic);
      assert.ok(openStatic.includes(`data-vui-morph-target="${morphTarget}"`));
      assert.equal(/\bopen\b/.test(openStatic), false, "open attribute only mutates via native showModal");
    });

    it("stays closed and never calls showModal when open is false", () => {
      const { el } = mountElement(createVNode(overlayPrimitive, { open: false }));
      assert.equal(el.open, false);
      assert.equal(el.modalShowCount, 0);
      assert.equal(el.modalCloseCount, 0);
    });

    it("never forwards the open prop as an attribute (native top-layer only)", () => {
      const { el } = mountElement(createVNode(overlayPrimitive, { open: false }));
      assert.equal(el.getAttribute("open"), null);
    });

    it("bypasses view-transition morphs under prefers-reduced-motion", () => {
      const host = createRenderHost();
      host.document.reducedMotion = true;
      const el = host.render(createVNode(overlayPrimitive, { open: true }))!;
      assert.equal(el.modalShowCount, 1);
      assert.equal(host.document.viewTransitionCalls.length, 0);
      host.render(createVNode(overlayPrimitive, { open: false }));
      assert.equal(el.modalCloseCount, 1);
      assert.equal(host.document.viewTransitionCalls.length, 0);
    });

    it("runs open and close through a view transition when motion is allowed", async () => {
      const host = createRenderHost();
      const trigger = host.document.createElement("button");
      host.document.body.appendChild(trigger);
      transitions.recordOrigin(host.document, trigger);

      const el = host.render(createVNode(overlayPrimitive, { open: true }))!;
      assert.equal(host.document.viewTransitionCalls.length, 1);
      assert.equal(trigger.getAttribute("data-vui-morph-hidden"), "true", "origin hidden while dialog is open");
      await flushTasks();

      host.render(createVNode(overlayPrimitive, { open: false }));
      assert.equal(host.document.viewTransitionCalls.length, 2);
      assert.equal(el.open, false);
      await flushTasks();
      assert.equal(trigger.getAttribute("data-vui-morph-hidden"), null, "origin restored after close");
      assert.equal(trigger.getAttribute("data-vui-morph"), null);
    });

    it("maps Escape (cancel) to onCancel, preventDefault, and onClose", () => {
      const calls: string[] = [];
      const { el } = mountElement(
        createVNode(overlayPrimitive, {
          open: true,
          onCancel: () => calls.push("cancel"),
          onClose: () => calls.push("close")
        })
      );
      let prevented = false;
      fireListener(el, "cancel", {
        preventDefault: () => {
          prevented = true;
        }
      });
      assert.deepEqual(calls, ["cancel", "close"]);
      assert.equal(prevented, true, "native close is deferred to the controlled open prop");
    });

    it("cancel works without optional handlers", () => {
      const { el } = mountElement(createVNode(overlayPrimitive, { open: true }));
      let prevented = false;
      fireListener(el, "cancel", { preventDefault: () => (prevented = true) });
      assert.equal(prevented, true);
    });

    it("surfaces loading as aria-busy and data-loading", () => {
      const busy = mountElement(createVNode(overlayPrimitive, { open: false, loading: true })).el;
      assert.equal(busy.getAttribute("aria-busy"), "true");
      assert.equal(busy.getAttribute("data-loading"), "true");
      const idle = mountElement(createVNode(overlayPrimitive, { open: false })).el;
      assert.equal(idle.getAttribute("aria-busy"), null);
      assert.equal(idle.getAttribute("data-loading"), null);
    });

    it("assigns function and object refs to the dialog element", () => {
      let viaFn: unknown = null;
      const el = mountElement(
        createVNode(overlayPrimitive, { open: false, ref: (node: unknown) => (viaFn = node) })
      ).el;
      assert.equal(viaFn, el);
      const objRef: { current: unknown } = { current: null };
      const el2 = mountElement(createVNode(overlayPrimitive, { open: false, ref: objRef })).el;
      assert.equal(objRef.current, el2);
    });

    it("strips style and dangerouslySetInnerHTML", () => {
      const { el, doc } = mountElement(
        createVNode(overlayPrimitive, {
          open: false,
          style: { color: "red" },
          dangerouslySetInnerHTML: { __html: "<i>x</i>" }
        })
      );
      assert.equal(el.getAttribute("style"), null);
      assert.equal(el.getAttribute("dangerouslysetinnerhtml"), null);
      assert.deepEqual(doc.cspViolations, []);
    });
  });
}

describe("overlay -- Dialog specifics", () => {
  it("fires onClose for a native close event only while open", () => {
    let closes = 0;
    const open = mountElement(
      createVNode(overlay.Dialog, { open: true, onClose: () => (closes += 1) })
    ).el;
    fireListener(open, "close");
    assert.equal(closes, 1);
    const shut = mountElement(
      createVNode(overlay.Dialog, { open: false, onClose: () => (closes += 1) })
    ).el;
    fireListener(shut, "close");
    assert.equal(closes, 1, "programmatic close already controlled by the open prop");
  });

  it("uses the plain vui-Dialog class", () => {
    assert.equal(
      mountElement(createVNode(overlay.Dialog, { open: false, className: "k" })).el.className,
      "vui-Dialog k"
    );
  });
});

describe("overlay -- Inspector specifics", () => {
  it("maps drawer edge with a right default and fallback", () => {
    const readInspectorClass = (drawer: unknown) =>
      mountElement(createVNode(overlay.Inspector, { open: false, drawer })).el.className;
    assert.equal(readInspectorClass(undefined), "vui-Inspector vui-Inspector--drawer-right");
    assert.equal(readInspectorClass("right"), "vui-Inspector vui-Inspector--drawer-right");
    assert.equal(readInspectorClass("bottom"), "vui-Inspector vui-Inspector--drawer-bottom");
    assert.equal(readInspectorClass("left"), "vui-Inspector vui-Inspector--drawer-right");
    assert.equal(readInspectorClass("constructor"), "vui-Inspector vui-Inspector--drawer-right");
    assert.equal(
      mountElement(createVNode(overlay.Inspector, { open: false, drawer: "bottom", className: "k" })).el.className,
      "vui-Inspector vui-Inspector--drawer-bottom k"
    );
  });

  it("fires onClose for a native close event only while open", () => {
    let closes = 0;
    const open = mountElement(
      createVNode(overlay.Inspector, { open: true, onClose: () => (closes += 1) })
    ).el;
    fireListener(open, "close");
    assert.equal(closes, 1);
    const shut = mountElement(
      createVNode(overlay.Inspector, { open: false, onClose: () => (closes += 1) })
    ).el;
    fireListener(shut, "close");
    assert.equal(closes, 1);
  });
});
