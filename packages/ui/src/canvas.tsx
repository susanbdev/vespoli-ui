import { useEffect } from "react";
import type { ComponentPropsWithRef, Ref } from "react";
import { styled, t } from "@vespoli/styled";

export interface RingBuffer {
  readonly data: Float32Array;
  readonly capacity: number;
  head: number;
  length: number;
}

export interface CanvasPort {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate?(): void;
}

export interface WorkerChannel {
  readonly port: CanvasPort;
  readonly offscreen: unknown;
  readonly owned: boolean;
  dispose(): void;
}

export type TelemetrySource = Float32Array | Uint32Array | RingBuffer;

export interface BlitTarget {
  drawImage(source: unknown, dx: number, dy: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

const MAX_RING_CAPACITY = 16_777_216;
const MAX_CANVAS_WIDTH_PX = 16_384;

// Law 1 & Law 7.1: Garbage-collected WeakMap ensuring React 19 <StrictMode> double-effect
// invocation reuses the existing OffscreenCanvas WorkerChannel without throwing InvalidStateError.
const canvasChannels = new WeakMap<HTMLCanvasElement, WorkerChannel>();

export function createRingBuffer(capacity: number): RingBuffer {
  if (
    !Number.isFinite(capacity) ||
    capacity < 1 ||
    capacity > MAX_RING_CAPACITY
  ) {
    throw new RangeError(
      `Invalid ring buffer capacity: expected finite number within 1..${MAX_RING_CAPACITY}`
    );
  }
  const safeCap = Math.floor(capacity);
  return {
    data: new Float32Array(safeCap),
    capacity: safeCap,
    head: 0,
    length: 0
  };
}

export function appendSamples(
  ring: RingBuffer,
  incoming: ArrayLike<number>
): RingBuffer {
  const cap = ring.capacity;
  if (!Number.isFinite(cap) || cap < 1 || cap > MAX_RING_CAPACITY) {
    throw new RangeError("Invalid ring buffer state");
  }
  for (let i = 0; i < incoming.length; i += 1) {
    const sample = incoming[i] ?? 0;
    ring.data[ring.head] = Number.isFinite(sample) ? sample : 0;
    ring.head = (ring.head + 1) % cap;
    if (ring.length < cap) {
      ring.length += 1;
    }
  }
  return ring;
}

export function readWindow(ring: RingBuffer, out?: Float32Array): Float32Array {
  const len = ring.length;
  if (!Number.isFinite(len) || len < 0 || len > MAX_RING_CAPACITY) {
    throw new RangeError("Invalid ring buffer window length");
  }
  const target = out && out.length >= len ? out : new Float32Array(len);
  const start = ring.length < ring.capacity ? 0 : ring.head;
  for (let i = 0; i < len; i += 1) {
    target[i] = ring.data[(start + i) % ring.capacity] ?? 0;
  }
  return target.subarray(0, len);
}

export function decimateMinMax(
  samples: Float32Array | Uint32Array,
  widthPx: number,
  outPairs?: Float32Array
): Float32Array {
  if (
    !Number.isFinite(widthPx) ||
    widthPx < 1 ||
    widthPx > MAX_CANVAS_WIDTH_PX
  ) {
    throw new RangeError(
      `Invalid widthPx: expected finite number within 1..${MAX_CANVAS_WIDTH_PX}`
    );
  }
  if (samples.length > MAX_RING_CAPACITY) {
    throw new RangeError(
      `Sample buffer exceeds maximum length (${MAX_RING_CAPACITY})`
    );
  }
  const cols = Math.floor(widthPx);
  const out =
    outPairs && outPairs.length >= cols * 2
      ? outPairs
      : new Float32Array(cols * 2);
  const n = samples.length;
  if (n === 0) {
    out.fill(0, 0, cols * 2);
    return out.subarray(0, cols * 2);
  }

  for (let col = 0; col < cols; col += 1) {
    const start = Math.floor((col * n) / cols);
    const end = Math.max(start + 1, Math.floor(((col + 1) * n) / cols));
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let idx = start; idx < end && idx < n; idx += 1) {
      const val = samples[idx] ?? 0;
      if (!Number.isFinite(val)) continue;
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }
    out[col * 2] = minVal === Infinity ? 0 : minVal;
    out[col * 2 + 1] = maxVal === -Infinity ? 0 : maxVal;
  }

  return out.subarray(0, cols * 2);
}

export function interpolateColumns(
  prevPairs: Float32Array,
  nextPairs: Float32Array,
  progress: number,
  outPairs?: Float32Array
): Float32Array {
  if (!Number.isFinite(progress)) {
    throw new RangeError("Invalid interpolation progress: expected finite number");
  }
  const alpha = progress <= 0 ? 0 : progress >= 1 ? 1 : progress;
  const count = Math.min(prevPairs.length, nextPairs.length);
  if (count > MAX_CANVAS_WIDTH_PX * 2) {
    throw new RangeError("Column pair count exceeds upper bound");
  }
  const out =
    outPairs && outPairs.length >= count ? outPairs : new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const a = prevPairs[i] ?? 0;
    const b = nextPairs[i] ?? 0;
    out[i] = a + (b - a) * alpha;
  }
  return out.subarray(0, count);
}

export function blitScrollColumn(
  ctx: BlitTarget,
  canvasSurface: { readonly width: number; readonly height: number },
  dx: number,
  minNorm: number,
  maxNorm: number
): void {
  const w = canvasSurface.width;
  const h = canvasSurface.height;
  const safeDx = Number.isFinite(dx) ? dx : 1;
  const shift = Math.max(1, Math.floor(safeDx));
  ctx.drawImage(canvasSurface, -shift, 0);
  ctx.clearRect(w - shift, 0, shift, h);
  const topY = Math.floor((1 - Math.max(minNorm, maxNorm)) * h);
  const bottomY = Math.ceil((1 - Math.min(minNorm, maxNorm)) * h);
  ctx.fillRect(w - shift, topY, shift, Math.max(1, bottomY - topY));
}

function extractPalette(canvas: HTMLCanvasElement): Record<string, string> {
  const win = canvas.ownerDocument?.defaultView;
  if (!win || typeof win.getComputedStyle !== "function") {
    return {
      accent: "#5eead4",
      surface: "#12161b",
      border: "#262f3b"
    };
  }
  const computed = win.getComputedStyle(canvas);
  return {
    accent: computed.getPropertyValue("--vui-color-accent").trim() || "#5eead4",
    surface: computed.getPropertyValue("--vui-color-surface").trim() || "#12161b",
    border: computed.getPropertyValue("--vui-color-border").trim() || "#262f3b"
  };
}

export function validateWorkerUrl(
  workerUrl: string,
  canvas: HTMLCanvasElement
): string {
  if (typeof workerUrl !== "string" || workerUrl.trim().length === 0) {
    throw new Error("Invalid workerUrl: expected non-empty same-origin URL");
  }
  const docWin = canvas.ownerDocument?.defaultView as
    | { location?: { href?: string; origin?: string } }
    | null
    | undefined;
  const globalWin =
    typeof globalThis !== "undefined"
      ? (globalThis as { location?: { href?: string; origin?: string } })
      : undefined;
  const loc = docWin?.location ?? globalWin?.location;
  if (!loc || typeof loc.href !== "string" || typeof loc.origin !== "string") {
    throw new Error("Cannot validate workerUrl without window.location origin");
  }
  const parsed = new URL(workerUrl, loc.href);
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.origin !== loc.origin
  ) {
    throw new Error(
      `Blocked cross-origin or disallowed-scheme workerUrl: ${parsed.protocol}//${parsed.host}`
    );
  }
  return parsed.href;
}

export function connectCanvas(
  canvas: HTMLCanvasElement,
  options: {
    readonly worker?: CanvasPort;
    readonly workerUrl?: string;
    readonly buffer?: TelemetrySource;
    readonly mode?: "stage" | "range" | "heatmap";
  }
): WorkerChannel | null {
  let channel = canvasChannels.get(canvas) ?? null;

  if (!channel) {
    let port: CanvasPort | null = options.worker ?? null;
    let owned = false;

    if (!port && options.workerUrl !== undefined) {
      const validatedHref = validateWorkerUrl(options.workerUrl, canvas);
      if (typeof Worker === "function") {
        port = new Worker(validatedHref, { type: "module" }) as unknown as CanvasPort;
        owned = true;
      }
    }

    const transferFn = (
      canvas as unknown as {
        transferControlToOffscreen?: () => Transferable;
      }
    ).transferControlToOffscreen;

    if (!port || typeof transferFn !== "function") {
      if (owned) {
        port?.terminate?.();
      }
      return null;
    }

    const offscreen = transferFn.call(canvas);
    let disposed = false;
    const activePort = port;
    channel = {
      port: activePort,
      offscreen,
      owned,
      dispose(): void {
        if (disposed) return;
        disposed = true;
        canvasChannels.delete(canvas);
        if (owned) {
          activePort.terminate?.();
        }
      }
    };
    canvasChannels.set(canvas, channel);

    activePort.postMessage(
      {
        type: "init",
        mode: options.mode ?? "stage",
        canvas: offscreen,
        palette: extractPalette(canvas)
      },
      [offscreen]
    );
  }

  if (options.buffer) {
    const samples =
      "data" in options.buffer ? readWindow(options.buffer) : options.buffer;
    if (samples.length > MAX_RING_CAPACITY) {
      throw new RangeError(
        `Telemetry buffer exceeds maximum capacity (${MAX_RING_CAPACITY})`
      );
    }
    channel.port.postMessage({
      type: "data",
      mode: options.mode ?? "stage",
      samples
    });
  }

  return channel;
}

function assignCanvasRef(
  ref: Ref<HTMLCanvasElement> | undefined,
  node: HTMLCanvasElement | null
): void {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(node);
  } else {
    (ref as { current: HTMLCanvasElement | null }).current = node;
  }
}

const CanvasStageBox = styled.canvas`
  display: block;
  width: 100%;
  height: 220px;
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.md};
  background-color: ${t.color.surface};
  background-image: repeating-linear-gradient(0deg, #93a0b012 0 1px, transparent 1px 40px),
    repeating-linear-gradient(90deg, #93a0b012 0 1px, transparent 1px 40px);
`;

export interface CanvasStageProps
  extends Omit<
    ComponentPropsWithRef<"canvas">,
    "style" | "dangerouslySetInnerHTML"
  > {
  buffer?: TelemetrySource;
  workerUrl?: string;
  worker?: CanvasPort;
}

export function CanvasStage({
  buffer,
  workerUrl,
  worker,
  ref,
  className,
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: CanvasStageProps) {
  let canvasNode: HTMLCanvasElement | null = null;

  useEffect(() => {
    const node = canvasNode;
    if (!node) return;
    const channel = connectCanvas(node, {
      worker,
      workerUrl,
      buffer,
      mode: "stage"
    });
    return () => {
      if (!node.isConnected) {
        channel?.dispose();
      }
    };
  }, [buffer, worker, workerUrl]);

  return (
    <CanvasStageBox
      {...props}
      ref={(node: HTMLCanvasElement | null) => {
        canvasNode = node;
        assignCanvasRef(ref, node);
      }}
      className={className}
    />
  );
}

const RangeBarBox = styled.canvas.attrs({ "aria-hidden": "true" })`
  display: block;
  width: 100%;
  height: ${t.size.control.md};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.sm};
  background-color: ${t.color.surface};
  background-image: repeating-linear-gradient(90deg, #93a0b012 0 1px, transparent 1px 40px);
`;

export interface RangeBarProps
  extends Omit<
    ComponentPropsWithRef<"canvas">,
    "style" | "dangerouslySetInnerHTML"
  > {
  buffer?: TelemetrySource;
}

export function RangeBar({
  buffer,
  ref,
  className,
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: RangeBarProps) {
  let canvasNode: HTMLCanvasElement | null = null;

  useEffect(() => {
    const node = canvasNode;
    if (!node || !buffer) return;
    const channel = connectCanvas(node, { buffer, mode: "range" });
    return () => {
      if (!node.isConnected) {
        channel?.dispose();
      }
    };
  }, [buffer]);

  return (
    <RangeBarBox
      {...props}
      ref={(node: HTMLCanvasElement | null) => {
        canvasNode = node;
        assignCanvasRef(ref, node);
      }}
      className={className}
    />
  );
}

const HeatmapCanvasBox = styled.canvas`
  display: block;
  width: 100%;
  height: 220px;
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.md};
  background-color: ${t.color.surface};
  background-image: repeating-linear-gradient(0deg, #93a0b012 0 1px, transparent 1px 40px),
    repeating-linear-gradient(90deg, #93a0b012 0 1px, transparent 1px 40px);
`;

export interface HeatmapCanvasProps
  extends Omit<
    ComponentPropsWithRef<"canvas">,
    "style" | "dangerouslySetInnerHTML"
  > {
  buffer?: TelemetrySource;
  workerUrl?: string;
  worker?: CanvasPort;
}

export function HeatmapCanvas({
  buffer,
  workerUrl,
  worker,
  ref,
  className,
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: HeatmapCanvasProps) {
  let canvasNode: HTMLCanvasElement | null = null;

  useEffect(() => {
    const node = canvasNode;
    if (!node) return;
    const channel = connectCanvas(node, {
      worker,
      workerUrl,
      buffer,
      mode: "heatmap"
    });
    return () => {
      if (!node.isConnected) {
        channel?.dispose();
      }
    };
  }, [buffer, worker, workerUrl]);

  return (
    <HeatmapCanvasBox
      {...props}
      ref={(node: HTMLCanvasElement | null) => {
        canvasNode = node;
        assignCanvasRef(ref, node);
      }}
      className={className}
    />
  );
}
