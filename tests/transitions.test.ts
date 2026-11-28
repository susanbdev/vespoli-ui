import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRenderHost,
  flushTasks,
  loadModule,
  type SimDocument,
  type SimElement
} from "./markup.ts";

const transitions = await loadModule("transitions");

function castDocument(doc: SimDocument): Document {
  return doc as unknown as Document;
}

function castElement(el: SimElement): HTMLElement {
  return el as unknown as HTMLElement;
}

function mountScene() {
  const host = createRenderHost();
  const doc = host.document;
  const trigger = doc.createElement("button");
  doc.body.appendChild(trigger);
  return { host, doc, trigger };
}

const simDocumentProto = Object.getPrototypeOf(createRenderHost().document) as {
  startViewTransition(
    this: SimDocument,
    arg: (() => void) | { update: () => void; types?: readonly string[] }
  ): { finished: Promise<void> };
};

describe("transitions -- origin tracking", () => {
  it("captures the nearest interactive ancestor on pointerdown", () => {
    const { doc, trigger } = mountScene();
    transitions.trackOrigin(castDocument(doc));
    const inner = doc.createElement("span");
    trigger.appendChild(inner);
    doc.dispatchCapture("pointerdown", { target: inner });
    assert.equal(transitions.readOrigin(castDocument(doc)), trigger);
  });

  it("recognizes anchors, summaries, keyed rows, and data-vui-interactive hosts", () => {
    const { doc } = mountScene();
    transitions.trackOrigin(castDocument(doc));
    const anchor = doc.createElement("a");
    const summary = doc.createElement("summary");
    const row = doc.createElement("tr");
    row.setAttribute("data-row-key", "k");
    const custom = doc.createElement("div");
    custom.setAttribute("data-vui-interactive", "");
    for (const el of [anchor, summary, row, custom]) {
      doc.body.appendChild(el);
      doc.dispatchCapture("pointerdown", { target: el });
      assert.equal(transitions.readOrigin(castDocument(doc)), el, el.tagName);
    }
  });

  it("ignores non-interactive targets and targets without closest()", () => {
    const { doc, trigger } = mountScene();
    transitions.trackOrigin(castDocument(doc));
    doc.dispatchCapture("pointerdown", { target: trigger });
    const plain = doc.createElement("div");
    doc.body.appendChild(plain);
    doc.dispatchCapture("pointerdown", { target: plain });
    doc.dispatchCapture("pointerdown", { target: null });
    doc.dispatchCapture("pointerdown", { target: {} });
    assert.equal(transitions.readOrigin(castDocument(doc)), trigger, "previous origin retained");
  });

  it("tracks keyboard activation only for Enter and Space", () => {
    const { doc, trigger } = mountScene();
    transitions.trackOrigin(castDocument(doc));
    doc.dispatchCapture("keydown", { key: "a", target: trigger });
    doc.dispatchCapture("keydown", { key: "Tab", target: trigger });
    assert.equal(transitions.readOrigin(castDocument(doc)), null);
    doc.dispatchCapture("keydown", { key: "Enter", target: trigger });
    assert.equal(transitions.readOrigin(castDocument(doc)), trigger);
    transitions.clearOrigin(castDocument(doc));
    doc.dispatchCapture("keydown", { key: " ", target: trigger });
    assert.equal(transitions.readOrigin(castDocument(doc)), trigger);
  });

  it("attaches listeners once per document even when called repeatedly", () => {
    const { doc, trigger } = mountScene();
    let attached = 0;
    const original = doc.addEventListener.bind(doc);
    doc.addEventListener = (type, fn) => {
      attached += 1;
      original(type, fn);
    };
    transitions.trackOrigin(castDocument(doc));
    transitions.trackOrigin(castDocument(doc));
    transitions.trackOrigin(castDocument(doc));
    assert.equal(attached, 2, "one pointerdown + one keydown listener");
    doc.dispatchCapture("pointerdown", { target: trigger });
    assert.equal(transitions.readOrigin(castDocument(doc)), trigger);
  });

  it("isolates origins per document", () => {
    const a = mountScene();
    const b = mountScene();
    transitions.recordOrigin(castDocument(a.doc), castElement(a.trigger));
    assert.equal(transitions.readOrigin(castDocument(a.doc)), a.trigger);
    assert.equal(transitions.readOrigin(castDocument(b.doc)), null);
  });

  it("returns null for disconnected origins and clears recorded origins", () => {
    const { doc, trigger } = mountScene();
    transitions.recordOrigin(castDocument(doc), castElement(trigger));
    trigger.isConnected = false;
    assert.equal(transitions.readOrigin(castDocument(doc)), null);
    trigger.isConnected = true;
    assert.equal(transitions.readOrigin(castDocument(doc)), trigger);
    transitions.clearOrigin(castDocument(doc));
    assert.equal(transitions.readOrigin(castDocument(doc)), null);
  });

  it("clearOrigin scrubs lingering morph tokens", () => {
    const { doc, trigger } = mountScene();
    trigger.setAttribute("data-vui-morph", "active");
    const other = doc.createElement("section");
    other.setAttribute("data-vui-morph-hidden", "true");
    doc.body.appendChild(other);
    transitions.clearOrigin(castDocument(doc));
    assert.equal(trigger.getAttribute("data-vui-morph"), null);
    assert.equal(other.getAttribute("data-vui-morph-hidden"), null);
  });

  it("is a no-op without a document and uses globalThis.document when present", async () => {
    assert.doesNotThrow(() => transitions.trackOrigin(undefined));
    assert.equal(transitions.readOrigin(undefined), null);
    assert.doesNotThrow(() => transitions.clearOrigin(undefined));

    const { doc, trigger } = mountScene();
    const prevDoc = (globalThis as Record<string, unknown>).document;
    (globalThis as Record<string, unknown>).document = doc;
    try {
      transitions.trackOrigin();
      doc.dispatchCapture("pointerdown", { target: trigger });
      assert.equal(transitions.readOrigin(), trigger);
      let updated = 0;
      await transitions.transitionTo(() => {
        updated += 1;
      });
      assert.equal(updated, 1);
      transitions.clearOrigin();
      assert.equal(transitions.readOrigin(), null);
    } finally {
      (globalThis as Record<string, unknown>).document = prevDoc;
    }
  });
});

describe("transitions -- transitionTo", () => {
  it("runs the update synchronously when reduced motion is requested", async () => {
    const { doc } = mountScene();
    doc.reducedMotion = true;
    let ran = 0;
    await transitions.transitionTo(() => (ran += 1), { doc: castDocument(doc) });
    assert.equal(ran, 1);
    assert.equal(doc.viewTransitionCalls.length, 0);
  });

  it("runs the update directly when the View Transitions API or defaultView is unavailable", async () => {
    const { doc } = mountScene();
    (doc as unknown as Record<string, unknown>).startViewTransition = undefined;
    let ran = 0;
    await transitions.transitionTo(() => (ran += 1), { doc: castDocument(doc) });
    assert.equal(ran, 1);

    const viewless = mountScene();
    (viewless.doc as unknown as Record<string, unknown>).defaultView = null;
    await transitions.transitionTo(() => (ran += 1), { doc: castDocument(viewless.doc) });
    assert.equal(ran, 2);
  });

  it("hides the origin during the update, shows the destination, and scrubs on completion", async () => {
    const { doc, trigger } = mountScene();
    transitions.recordOrigin(castDocument(doc), castElement(trigger));
    const dest = doc.createElement("section");
    dest.setAttribute("data-vui-morph-target", "card");
    let seen: Record<string, string | null> = {};
    const done = transitions.transitionTo(
      () => {
        seen = {
          originHidden: trigger.getAttribute("data-vui-morph-hidden"),
          originActive: trigger.getAttribute("data-vui-morph")
        };
        doc.body.appendChild(dest);
      },
      { doc: castDocument(doc) }
    );
    assert.equal(trigger.getAttribute("data-vui-morph-hidden"), "true");
    assert.equal(dest.getAttribute("data-vui-morph"), "active", "destination discovered via data-vui-morph-target");
    await done;
    assert.deepEqual(seen, { originHidden: "true", originActive: null });
    assert.equal(trigger.getAttribute("data-vui-morph-hidden"), null);
    assert.equal(dest.getAttribute("data-vui-morph"), null);
  });

  it("marks the origin as active before the snapshot is taken", async () => {
    const { doc, trigger } = mountScene();
    transitions.recordOrigin(castDocument(doc), castElement(trigger));
    let beforeUpdate: string | null = null;
    doc.startViewTransition = (arg) => {
      beforeUpdate = trigger.getAttribute("data-vui-morph");
      return simDocumentProto.startViewTransition.call(doc, arg);
    };
    await transitions.transitionTo(() => {}, { doc: castDocument(doc) });
    assert.equal(beforeUpdate, "active");
  });

  it("passes direction as a view transition type and prefers an explicit target", async () => {
    const { doc, trigger } = mountScene();
    transitions.recordOrigin(castDocument(doc), castElement(trigger));
    const explicit = doc.createElement("div");
    const ignored = doc.createElement("div");
    ignored.setAttribute("data-vui-morph-target", "x");
    doc.body.appendChild(ignored);
    let activeDuring: string | null = null;
    await transitions.transitionTo(
      () => {
        activeDuring = explicit.getAttribute("data-vui-morph");
      },
      { doc: castDocument(doc), direction: "iris", target: castElement(explicit) }
    );
    assert.deepEqual(doc.viewTransitionCalls[0]!.types, ["iris"]);
    assert.equal(activeDuring, null, "target is activated after the update runs");
    assert.equal(ignored.getAttribute("data-vui-morph"), null);
  });

  it("falls back to the function form when typed transitions are unsupported", async () => {
    const { doc } = mountScene();
    let calls = 0;
    doc.startViewTransition = (arg) => {
      calls += 1;
      if (typeof arg !== "function") throw new TypeError("types unsupported");
      arg();
      return { finished: Promise.resolve() };
    };
    let ran = 0;
    await transitions.transitionTo(() => (ran += 1), { doc: castDocument(doc), direction: "left" });
    assert.equal(calls, 2);
    assert.equal(ran, 1);
  });

  it("swallows rejected transition promises and still scrubs tokens", async () => {
    const { doc, trigger } = mountScene();
    transitions.recordOrigin(castDocument(doc), castElement(trigger));
    doc.startViewTransition = (arg) => {
      const update = typeof arg === "function" ? arg : arg.update;
      update();
      return { finished: Promise.reject(new Error("skipped")) };
    };
    await assert.doesNotReject(transitions.transitionTo(() => {}, { doc: castDocument(doc) }));
    assert.equal(trigger.getAttribute("data-vui-morph-hidden"), null);
  });

  it("clears stale morph tokens before starting an overlapping transition", async () => {
    const { doc } = mountScene();
    const stale = doc.createElement("div");
    stale.setAttribute("data-vui-morph", "active");
    doc.body.appendChild(stale);
    await transitions.transitionTo(() => {}, { doc: castDocument(doc) });
    assert.equal(stale.getAttribute("data-vui-morph"), null);
  });
});

describe("transitions -- morphOpen and morphClose", () => {
  it("morphOpen opens the container, hides the origin, and tags the container during the snapshot", async () => {
    const { doc, trigger } = mountScene();
    transitions.recordOrigin(castDocument(doc), castElement(trigger));
    const box = doc.createElement("dialog");
    doc.body.appendChild(box);
    let opened = 0;
    const done = transitions.morphOpen(castElement(box), () => (opened += 1));
    assert.equal(opened, 1);
    assert.equal(box.getAttribute("data-vui-morph"), "active");
    assert.equal(trigger.getAttribute("data-vui-morph-hidden"), "true");
    await done;
    assert.equal(box.getAttribute("data-vui-morph"), null);
    assert.equal(trigger.getAttribute("data-vui-morph-hidden"), "true", "origin stays hidden while open");
  });

  it("morphClose reverses the aperture back to the origin recorded by morphOpen", async () => {
    const { doc, trigger } = mountScene();
    transitions.recordOrigin(castDocument(doc), castElement(trigger));
    const box = doc.createElement("dialog");
    doc.body.appendChild(box);
    await transitions.morphOpen(castElement(box), () => {});
    let closed = 0;
    let originDuring: string | null = null;
    const done = transitions.morphClose(castElement(box), () => {
      closed += 1;
      originDuring = trigger.getAttribute("data-vui-morph");
    });
    assert.equal(closed, 1);
    assert.equal(originDuring, null, "origin token is applied after the close callback");
    await done;
    assert.equal(trigger.getAttribute("data-vui-morph"), null);
    assert.equal(trigger.getAttribute("data-vui-morph-hidden"), null);
    assert.equal(box.getAttribute("data-vui-morph"), null);
  });

  it("morphClose also reverses to the origin recorded directly by transitionTo without morphOpen", async () => {
    const { doc, trigger } = mountScene();
    transitions.recordOrigin(castDocument(doc), castElement(trigger));
    const panel = doc.createElement("section");
    panel.setAttribute("data-vui-morph-target", "panel");
    await transitions.transitionTo(
      () => {
        doc.body.appendChild(panel);
      },
      { doc: castDocument(doc) }
    );
    trigger.setAttribute("data-vui-morph-hidden", "true");
    let originActiveAfterCloseCallback: string | null = null;
    doc.startViewTransition = (arg) => {
      const update = typeof arg === "function" ? arg : arg.update;
      update();
      originActiveAfterCloseCallback = trigger.getAttribute("data-vui-morph");
      return { finished: Promise.resolve() };
    };
    await transitions.morphClose(castElement(panel), () => {});
    assert.equal(originActiveAfterCloseCallback, "active");
    assert.equal(trigger.getAttribute("data-vui-morph-hidden"), null);
    assert.equal(trigger.getAttribute("data-vui-morph"), null);
  });

  it("morphClose without a recorded origin simply closes", async () => {
    const { doc } = mountScene();
    const box = doc.createElement("dialog");
    doc.body.appendChild(box);
    let closed = 0;
    await transitions.morphClose(castElement(box), () => (closed += 1));
    assert.equal(closed, 1);
    assert.equal(doc.viewTransitionCalls.length, 0);
  });

  it("both helpers bypass view transitions under reduced motion and restore the origin on close", async () => {
    const { doc, trigger } = mountScene();
    transitions.recordOrigin(castDocument(doc), castElement(trigger));
    const box = doc.createElement("dialog");
    doc.body.appendChild(box);
    await transitions.morphOpen(castElement(box), () => {});
    trigger.setAttribute("data-vui-morph-hidden", "true");
    doc.reducedMotion = true;
    let opened = 0;
    let closed = 0;
    await transitions.morphOpen(castElement(box), () => (opened += 1));
    await transitions.morphClose(castElement(box), () => (closed += 1));
    assert.equal(opened, 1);
    assert.equal(closed, 1);
    assert.equal(doc.viewTransitionCalls.length, 1, "only the initial animated open");
    assert.equal(trigger.getAttribute("data-vui-morph-hidden"), null);
    await flushTasks();
  });

  it("run without View Transitions support, callbacks still execute", async () => {
    const { doc } = mountScene();
    (doc as unknown as Record<string, unknown>).startViewTransition = undefined;
    const box = doc.createElement("dialog");
    let n = 0;
    await transitions.morphOpen(castElement(box), () => (n += 1));
    await transitions.morphClose(castElement(box), () => (n += 1));
    assert.equal(n, 2);
  });
});
