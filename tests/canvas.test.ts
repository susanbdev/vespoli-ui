import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRenderHost,
  createVNode,
  loadModule,
  mountElement,
  renderMarkup
} from "./markup.ts";

const canvas = await loadModule("canvas");

interface PortMessage {
  readonly type: string;
  readonly mode?: string;
  readonly samples?: Float32Array;
  readonly palette?: Record<string, string>;
}

function createPort(): {
  postMessage(msg: PortMessage): void;
  messages: PortMessage[];
  terminated: number;
  terminate(): void;
} {
  const messages: PortMessage[] = [];
  return {
    messages,
    terminated: 0,
    postMessage(msg: PortMessage) {
      messages.push(msg);
    },
    terminate() {
      this.terminated += 1;
    }
  };
}

function mountCanvasHost() {
  return mountElement(createVNode("canvas", {})).el;
}

describe("canvas -- ring buffer", () => {
  it("createRingBuffer validates capacity and floors fractions", () => {
    for (const bad of [0, -1, Number.NaN, Infinity, 16_777_217]) {
      assert.throws(() => canvas.createRingBuffer(bad), RangeError, `capacity=${bad}`);
    }
    const ring = canvas.createRingBuffer(2.9);
    assert.equal(ring.capacity, 2);
    assert.equal(ring.length, 0);
    assert.equal(ring.head, 0);
    assert.ok(ring.data instanceof Float32Array);
    assert.equal(ring.data.length, 2);
    assert.equal(canvas.createRingBuffer(16_777_216).capacity, 16_777_216);
  });

  it("appendSamples fills in order and tracks length until full", () => {
    const ring = canvas.createRingBuffer(4);
    assert.equal(canvas.appendSamples(ring, [1, 2, 3]), ring, "returns the same ring");
    assert.equal(ring.length, 3);
    assert.deepEqual(Array.from(canvas.readWindow(ring)), [1, 2, 3]);
  });

  it("appendSamples overwrites the oldest samples once full and readWindow stays chronological", () => {
    const ring = canvas.createRingBuffer(4);
    canvas.appendSamples(ring, [1, 2, 3, 4, 5, 6]);
    assert.equal(ring.length, 4);
    assert.deepEqual(Array.from(canvas.readWindow(ring)), [3, 4, 5, 6]);
    canvas.appendSamples(ring, new Float32Array([7]));
    assert.deepEqual(Array.from(canvas.readWindow(ring)), [4, 5, 6, 7]);
  });

  it("appendSamples coerces non-finite samples to 0", () => {
    const ring = canvas.createRingBuffer(4);
    canvas.appendSamples(ring, [Number.NaN, Infinity, -Infinity, 2]);
    assert.deepEqual(Array.from(canvas.readWindow(ring)), [0, 0, 0, 2]);
  });

  it("appendSamples and readWindow reject corrupted ring state", () => {
    assert.throws(
      () => canvas.appendSamples({ data: new Float32Array(1), capacity: 0, head: 0, length: 0 }, [1]),
      RangeError
    );
    assert.throws(
      () => canvas.appendSamples({ data: new Float32Array(1), capacity: 99_999_999, head: 0, length: 0 }, [1]),
      RangeError
    );
    assert.throws(
      () => canvas.readWindow({ data: new Float32Array(1), capacity: 1, head: 0, length: -1 }),
      RangeError
    );
    assert.throws(
      () => canvas.readWindow({ data: new Float32Array(1), capacity: 1, head: 0, length: 99_999_999 }),
      RangeError
    );
  });

  it("readWindow reuses a sufficiently large output buffer and trims to length", () => {
    const ring = canvas.createRingBuffer(8);
    canvas.appendSamples(ring, [5, 6, 7]);
    const out = new Float32Array(8);
    const view = canvas.readWindow(ring, out);
    assert.equal(view.length, 3);
    assert.equal(view.buffer, out.buffer, "no new allocation");
    assert.deepEqual(Array.from(view), [5, 6, 7]);
    const small = new Float32Array(1);
    const grown = canvas.readWindow(ring, small);
    assert.notEqual(grown.buffer, small.buffer, "undersized output is replaced");
    assert.equal(grown.length, 3);
  });
});

describe("canvas -- decimateMinMax", () => {
  it("validates widthPx and sample length bounds", () => {
    for (const bad of [0, -3, Number.NaN, Infinity, 16_385]) {
      assert.throws(() => canvas.decimateMinMax(new Float32Array(4), bad), RangeError, `width=${bad}`);
    }
    assert.throws(
      () => canvas.decimateMinMax({ length: 16_777_217 } as unknown as Float32Array, 4),
      RangeError
    );
  });

  it("emits per-column min/max pairs for Float32Array and Uint32Array inputs", () => {
    const samples = new Float32Array([1, 5, -2, 3, 9, 0, 4, 4]);
    const pairs = canvas.decimateMinMax(samples, 4);
    assert.deepEqual(Array.from(pairs), [1, 5, -2, 3, 0, 9, 4, 4]);
    const two = canvas.decimateMinMax(samples, 2);
    assert.deepEqual(Array.from(two), [-2, 5, 0, 9]);
    const u32 = new Uint32Array([10, 40, 20, 30]);
    assert.deepEqual(Array.from(canvas.decimateMinMax(u32, 2)), [10, 40, 20, 30]);
  });

  it("returns zeros for empty input and replicates samples when columns exceed length", () => {
    assert.deepEqual(Array.from(canvas.decimateMinMax(new Float32Array(0), 3)), [0, 0, 0, 0, 0, 0]);
    const wide = canvas.decimateMinMax(new Float32Array([2, 8]), 4);
    assert.equal(wide.length, 8);
    for (let col = 0; col < 4; col += 1) {
      const min = wide[col * 2]!;
      const max = wide[col * 2 + 1]!;
      assert.ok(min <= max);
      assert.ok(min === 2 || min === 8);
    }
  });

  it("treats non-finite samples as ignorable and reuses a provided output buffer", () => {
    const out = new Float32Array(8);
    const pairs = canvas.decimateMinMax(new Float32Array([Number.NaN, 4, Infinity, -1]), 2, out);
    assert.equal(pairs.buffer, out.buffer);
    assert.deepEqual(Array.from(pairs), [4, 4, -1, -1]);
    const allBad = canvas.decimateMinMax(new Float32Array([Number.NaN, Infinity]), 1);
    assert.deepEqual(Array.from(allBad), [0, 0]);
  });

  it("preserves global extremes at 100k+ scale", () => {
    const n = 200_000;
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i += 1) samples[i] = Math.sin(i / 97);
    samples[123_457] = 7;
    samples[7] = -9;
    const pairs = canvas.decimateMinMax(samples, 800);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < pairs.length; i += 2) {
      min = Math.min(min, pairs[i]!);
      max = Math.max(max, pairs[i + 1]!);
    }
    assert.equal(min, -9);
    assert.equal(max, 7);
  });
});

describe("canvas -- interpolateColumns", () => {
  it("blends linearly and clamps progress to 0..1", () => {
    const a = new Float32Array([0, 10]);
    const b = new Float32Array([10, 20]);
    assert.deepEqual(Array.from(canvas.interpolateColumns(a, b, 0.5)), [5, 15]);
    assert.deepEqual(Array.from(canvas.interpolateColumns(a, b, -4)), [0, 10]);
    assert.deepEqual(Array.from(canvas.interpolateColumns(a, b, 9)), [10, 20]);
  });

  it("rejects non-finite progress and uses the shorter input length", () => {
    assert.throws(() => canvas.interpolateColumns(new Float32Array(2), new Float32Array(2), Number.NaN), RangeError);
    assert.throws(() => canvas.interpolateColumns(new Float32Array(2), new Float32Array(2), Infinity), RangeError);
    const out = canvas.interpolateColumns(new Float32Array([1, 2, 3]), new Float32Array([3, 4]), 1);
    assert.deepEqual(Array.from(out), [3, 4]);
  });

  it("enforces the column pair upper bound and reuses output buffers", () => {
    const big = new Float32Array(16_384 * 2 + 1);
    assert.throws(() => canvas.interpolateColumns(big, big, 0.5), RangeError);
    const out = new Float32Array(4);
    const res = canvas.interpolateColumns(new Float32Array([0, 0]), new Float32Array([2, 4]), 0.5, out);
    assert.equal(res.buffer, out.buffer);
    assert.deepEqual(Array.from(res), [1, 2]);
  });
});

describe("canvas -- blitScrollColumn", () => {
  function createContext() {
    const calls: Array<[string, ...number[]]> = [];
    return {
      calls,
      drawImage(_surface: unknown, x: number, y: number) {
        calls.push(["drawImage", x, y]);
      },
      clearRect(x: number, y: number, w: number, h: number) {
        calls.push(["clearRect", x, y, w, h]);
      },
      fillRect(x: number, y: number, w: number, h: number) {
        calls.push(["fillRect", x, y, w, h]);
      }
    };
  }

  it("scrolls left by dx, clears the new column, and fills the normalized span", () => {
    const ctx = createContext();
    canvas.blitScrollColumn(ctx, { width: 100, height: 50 }, 2, 0.25, 0.75);
    assert.deepEqual(ctx.calls, [
      ["drawImage", -2, 0],
      ["clearRect", 98, 0, 2, 50],
      ["fillRect", 98, 12, 2, 26]
    ]);
  });

  it("is symmetric in min/max, floors dx to at least 1, and defaults non-finite dx", () => {
    const a = createContext();
    const b = createContext();
    canvas.blitScrollColumn(a, { width: 10, height: 10 }, 0.4, 0.9, 0.1);
    canvas.blitScrollColumn(b, { width: 10, height: 10 }, Number.NaN, 0.1, 0.9);
    assert.deepEqual(a.calls, b.calls);
    assert.deepEqual(a.calls[0], ["drawImage", -1, 0]);
    assert.deepEqual(a.calls[1], ["clearRect", 9, 0, 1, 10]);
  });

  it("always draws at least one pixel of height for degenerate ranges", () => {
    const ctx = createContext();
    canvas.blitScrollColumn(ctx, { width: 10, height: 10 }, 1, 0.5, 0.5);
    const fill = ctx.calls.find((c) => c[0] === "fillRect")!;
    assert.ok((fill[4] as number) >= 1);
  });
});

describe("canvas -- validateWorkerUrl", () => {
  it("resolves same-origin relative and absolute URLs against document or globalThis location", () => {
    const el = mountCanvasHost();
    assert.equal(canvas.validateWorkerUrl("/w/telemetry.js", el), "https://vespoli.local/w/telemetry.js");
    assert.equal(canvas.validateWorkerUrl("https://vespoli.local/a.js", el), "https://vespoli.local/a.js");
    assert.equal(canvas.validateWorkerUrl("w.js", el), "https://vespoli.local/w.js");

    const detached = { ownerDocument: null } as unknown;
    const prevLoc = (globalThis as Record<string, unknown>).location;
    (globalThis as Record<string, unknown>).location = {
      href: "https://panel.local/x",
      origin: "https://panel.local"
    };
    try {
      assert.equal(canvas.validateWorkerUrl("/w.js", detached), "https://panel.local/w.js");
    } finally {
      (globalThis as Record<string, unknown>).location = prevLoc;
    }
    assert.throws(
      () => canvas.validateWorkerUrl("/w.js", detached),
      /without window\.location origin/
    );
  });

  it("rejects cross-origin, scheme-escape, and empty URLs", () => {
    const el = mountCanvasHost();
    for (const bad of [
      "https://evil.example/w.js",
      "http://vespoli.local/w.js",
      "//evil.example/w.js",
      "javascript:alert(1)",
      "data:text/javascript,1",
      "blob:https://vespoli.local/x",
      "",
      "   "
    ]) {
      assert.throws(() => canvas.validateWorkerUrl(bad, el), Error, `url=${JSON.stringify(bad)}`);
    }
    assert.throws(() => canvas.validateWorkerUrl(undefined, el), /Invalid workerUrl/);
  });
});

describe("canvas -- connectCanvas", () => {
  it("returns null when no worker is available or the canvas cannot transfer control", () => {
    const el = mountCanvasHost();
    assert.equal(canvas.connectCanvas(el, {}), null);
    const noTransfer = { ownerDocument: el.ownerDocument } as unknown;
    assert.equal(canvas.connectCanvas(noTransfer, { worker: createPort() }), null);
  });

  it("posts one init (with computed or fallback palette) and then data, reusing the channel per canvas", () => {
    const el = mountCanvasHost();
    const port = createPort();
    const first = canvas.connectCanvas(el, { worker: port, mode: "heatmap", buffer: new Float32Array([1, 2]) });
    const second = canvas.connectCanvas(el, { worker: port, mode: "heatmap", buffer: new Float32Array([3]) });
    assert.ok(first);
    assert.equal(second, first, "same channel instance");
    assert.deepEqual(
      port.messages.map((m) => m.type),
      ["init", "data", "data"]
    );
    assert.equal(port.messages[0]!.mode, "heatmap");
    assert.deepEqual(port.messages[0]!.palette, {
      accent: "#5eead4",
      surface: "#12161b",
      border: "#262f3b"
    });
    assert.deepEqual(Array.from(port.messages[2]!.samples!), [3]);

    const themedCanvas = {
      ownerDocument: {
        defaultView: {
          getComputedStyle: () => ({
            getPropertyValue: (prop: string) => {
              if (prop === "--vui-color-accent") return "  #38bdf8  ";
              if (prop === "--vui-color-surface") return "#0f172a";
              return "";
            }
          })
        }
      },
      transferControlToOffscreen: () => ({ width: 100, height: 40 })
    } as unknown;
    const themedPort = createPort();
    canvas.connectCanvas(themedCanvas, { worker: themedPort });
    assert.deepEqual(themedPort.messages[0]!.palette, {
      accent: "#38bdf8",
      surface: "#0f172a",
      border: "#262f3b"
    });

    const headlessCanvas = {
      ownerDocument: { defaultView: null },
      transferControlToOffscreen: () => ({ width: 100, height: 40 })
    } as unknown;
    const headlessPort = createPort();
    canvas.connectCanvas(headlessCanvas, { worker: headlessPort });
    assert.deepEqual(headlessPort.messages[0]!.palette, {
      accent: "#5eead4",
      surface: "#12161b",
      border: "#262f3b"
    });
  });

  it("defaults mode to stage and linearizes ring buffer sources", () => {
    const el = mountCanvasHost();
    const port = createPort();
    const ring = canvas.createRingBuffer(3);
    canvas.appendSamples(ring, [1, 2, 3, 4]);
    canvas.connectCanvas(el, { worker: port, buffer: ring });
    assert.equal(port.messages[0]!.mode, "stage");
    assert.equal(port.messages[1]!.mode, "stage");
    assert.deepEqual(Array.from(port.messages[1]!.samples!), [2, 3, 4]);
  });

  it("rejects oversized telemetry buffers", () => {
    const el = mountCanvasHost();
    const huge = { length: 16_777_217 } as unknown as Float32Array;
    assert.throws(() => canvas.connectCanvas(el, { worker: createPort(), buffer: huge }), RangeError);
  });

  it("creates and terminates an owned Worker for validated same-origin URLs, including when transfer is unavailable", () => {
    const created: Array<{ url: string; options: unknown; port: ReturnType<typeof createPort> }> = [];
    const original = (globalThis as Record<string, unknown>).Worker;
    const constructWorker = function (url: string, options: unknown) {
      const port = createPort();
      created.push({ url, options, port });
      return port;
    };
    (globalThis as Record<string, unknown>).Worker = constructWorker;
    try {
      const el = mountCanvasHost();
      const channel = canvas.connectCanvas(el, { workerUrl: "/w.js" });
      assert.ok(channel);
      assert.equal(created.length, 1);
      assert.equal(created[0]!.url, "https://vespoli.local/w.js");
      assert.deepEqual(created[0]!.options, { type: "module" });
      assert.equal(channel.owned, true);
      channel.dispose();
      channel.dispose();
      assert.equal(created[0]!.port.terminated, 1, "dispose is idempotent");

      const untransferable = { ownerDocument: el.ownerDocument } as unknown;
      assert.equal(canvas.connectCanvas(untransferable, { workerUrl: "/w2.js" }), null);
      assert.equal(created[1]!.port.terminated, 1, "owned Worker terminated when transfer missing");

      assert.throws(
        () => canvas.connectCanvas(mountCanvasHost(), { workerUrl: "https://evil.example/w.js" }),
        /cross-origin/
      );
      assert.equal(created.length, 2, "no Worker constructed for rejected URLs");
    } finally {
      (globalThis as Record<string, unknown>).Worker = original;
    }
  });

  it("does not terminate a caller-provided worker on dispose", () => {
    const el = mountCanvasHost();
    const port = createPort();
    const channel = canvas.connectCanvas(el, { worker: port });
    channel.dispose();
    assert.equal(port.terminated, 0);
    assert.equal(channel.owned, false);
  });
});

describe("canvas -- components", () => {
  const WORKER_COMPONENTS: ReadonlyArray<readonly [string, string, string]> = [
    ["CanvasStage", "vui-CanvasStage", "stage"],
    ["HeatmapCanvas", "vui-HeatmapCanvas", "heatmap"]
  ];

  for (const [name, cls, mode] of WORKER_COMPONENTS) {
    it(`${name} renders a canvas via SSR and connects its worker in ${mode} mode`, () => {
      const ssr = renderMarkup(createVNode(canvas[name], { className: "k" }));
      assert.match(ssr, new RegExp(`^<canvas\\b[^>]*\\b${cls} k\\b`));

      const port = createPort();
      const buffer = new Float32Array([0.25, 0.75]);
      const host = createRenderHost();
      const el = host.render(createVNode(canvas[name], { buffer, worker: port, className: "k" }))!;
      assert.equal(el.tagName, "CANVAS");
      assert.equal(el.className, `${cls} k`);
      assert.deepEqual(
        port.messages.map((m) => [m.type, m.mode]),
        [
          ["init", mode],
          ["data", mode]
        ]
      );
      assert.deepEqual(Array.from(port.messages[1]!.samples!), [0.25, 0.75]);
      host.unmount();
    });

    it(`${name} disposes owned Workers on unmount`, () => {
      const created: Array<ReturnType<typeof createPort>> = [];
      const original = (globalThis as Record<string, unknown>).Worker;
      (globalThis as Record<string, unknown>).Worker = function () {
        const p = createPort();
        created.push(p);
        return p;
      };
      try {
        const host = createRenderHost();
        host.render(createVNode(canvas[name], { workerUrl: "/w.js" }));
        assert.equal(created.length, 1);
        assert.equal(created[0]!.terminated, 0);
        host.unmount();
        assert.equal(created[0]!.terminated, 1);
      } finally {
        (globalThis as Record<string, unknown>).Worker = original;
      }
    });

    it(`${name} does not reconnect on re-render with unchanged inputs`, () => {
      const port = createPort();
      const buffer = new Float32Array([1]);
      const host = createRenderHost();
      host.render(createVNode(canvas[name], { buffer, worker: port }));
      host.render(createVNode(canvas[name], { buffer, worker: port }));
      assert.equal(port.messages.length, 2);
    });

    it(`${name} posts fresh data when the buffer identity changes, without a second init`, () => {
      const port = createPort();
      const host = createRenderHost();
      host.render(createVNode(canvas[name], { buffer: new Float32Array([1]), worker: port }));
      host.render(createVNode(canvas[name], { buffer: new Float32Array([2]), worker: port }));
      assert.deepEqual(
        port.messages.map((m) => m.type),
        ["init", "data", "data"]
      );
    });

    it(`${name} forwards function and object refs and strips style`, () => {
      let viaFn: unknown = null;
      const el = mountElement(
        createVNode(canvas[name], {
          ref: (n: unknown) => (viaFn = n),
          style: { width: 1 },
          dangerouslySetInnerHTML: { __html: "x" }
        })
      ).el;
      assert.equal(viaFn, el);
      assert.equal(el.getAttribute("style"), null);
      const objRef: { current: unknown } = { current: null };
      const el2 = mountElement(createVNode(canvas[name], { ref: objRef })).el;
      assert.equal(objRef.current, el2);
    });

    it(`${name} stays inert without a worker (no transferControlToOffscreen, no messages)`, () => {
      const host = createRenderHost();
      const el = host.render(createVNode(canvas[name], { buffer: new Float32Array(2) }))!;
      assert.equal(el.tagName, "CANVAS");
      assert.deepEqual(host.document.cspViolations, []);
      assert.doesNotThrow(
        () => el.transferControlToOffscreen(),
        "OffscreenCanvas transfer must not occur before a worker is supplied"
      );
    });
  }

  it("CanvasStage rejects cross-origin workerUrl at mount time", () => {
    assert.throws(
      () => mountElement(createVNode(canvas.CanvasStage, { workerUrl: "https://evil.example/w.js" })),
      /cross-origin/
    );
  });

  it("RangeBar renders a decorative canvas via SSR, streams range data to an attached channel, and disposes on unmount", () => {
    assert.equal(
      renderMarkup(createVNode(canvas.RangeBar, { className: "k" })),
      '<canvas aria-hidden="true" class="vui-RangeBar k"></canvas>'
    );

    const created: Array<ReturnType<typeof createPort>> = [];
    const original = (globalThis as Record<string, unknown>).Worker;
    (globalThis as Record<string, unknown>).Worker = function () {
      const p = createPort();
      created.push(p);
      return p;
    };
    try {
      const host = createRenderHost();
      let bound = false;
      const attachChannel = (node: unknown) => {
        if (node && !bound) {
          bound = true;
          canvas.connectCanvas(node, { workerUrl: "/range-w.js", mode: "range" });
        }
      };
      const el = host.render(
        createVNode(canvas.RangeBar, {
          buffer: new Float32Array([0.1, 0.9]),
          ref: attachChannel,
          style: { width: 10 },
          dangerouslySetInnerHTML: { __html: "x" }
        })
      )!;
      assert.equal(el.tagName, "CANVAS");
      assert.equal(el.getAttribute("aria-hidden"), "true");
      assert.equal(el.getAttribute("style"), null);
      assert.deepEqual(host.document.cspViolations, []);
      assert.deepEqual(
        created[0]!.messages.map((m) => [m.type, m.mode]),
        [
          ["init", "range"],
          ["data", "range"]
        ]
      );
      host.render(
        createVNode(canvas.RangeBar, {
          buffer: new Float32Array([0.5]),
          ref: attachChannel
        })
      );
      assert.equal(created[0]!.messages.length, 3);
      host.unmount();
      assert.equal(created[0]!.terminated, 1);
    } finally {
      (globalThis as Record<string, unknown>).Worker = original;
    }

    const objRef: { current: unknown } = { current: null };
    const inert = mountElement(
      createVNode(canvas.RangeBar, { buffer: new Float32Array([1, 2]), ref: objRef })
    ).el;
    assert.equal(objRef.current, inert);
  });
});
