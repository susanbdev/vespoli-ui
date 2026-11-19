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
}

export type TelemetrySource = Float32Array | Uint32Array | RingBuffer;

export interface BlitTarget {
  drawImage(source: unknown, dx: number, dy: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

// Law 1 & Law 7.1: Garbage-collected WeakMap ensuring React 19 <StrictMode> double-effect
// invocation reuses the existing OffscreenCanvas WorkerChannel without throwing InvalidStateError.
const canvasChannels = new WeakMap<HTMLCanvasElement, WorkerChannel>();

export function createRingBuffer(capacity: number): RingBuffer {
  const safeCap = Math.max(1, Math.floor(capacity));
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
  for (let i = 0; i < incoming.length; i += 1) {
    ring.data[ring.head] = incoming[i] ?? 0;
    ring.head = (ring.head + 1) % cap;
    if (ring.length < cap) {
      ring.length += 1;
    }
  }
  return ring;
}

export function readWindow(ring: RingBuffer, out?: Float32Array): Float32Array {
  const len = ring.length;
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
  const cols = Math.max(1, Math.floor(widthPx));
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
  const alpha = progress <= 0 ? 0 : progress >= 1 ? 1 : progress;
  const count = Math.min(prevPairs.length, nextPairs.length);
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
  const shift = Math.max(1, Math.floor(dx));
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
  const style = win.getComputedStyle(canvas);
  return {
    accent: style.getPropertyValue("--vui-color-accent").trim() || "#5eead4",
    surface: style.getPropertyValue("--vui-color-surface").trim() || "#12161b",
    border: style.getPropertyValue("--vui-color-border").trim() || "#262f3b"
  };
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
    const port: CanvasPort | null =
      options.worker ??
      (options.workerUrl && typeof Worker === "function"
        ? (new Worker(options.workerUrl, { type: "module" }) as unknown as CanvasPort)
        : null);

    const transferFn = (
      canvas as unknown as {
        transferControlToOffscreen?: () => Transferable;
      }
    ).transferControlToOffscreen;

    if (!port || typeof transferFn !== "function") {
      return null;
    }

    const offscreen = transferFn.call(canvas);
    channel = { port, offscreen };
    canvasChannels.set(canvas, channel);

    port.postMessage(
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

export interface CanvasStageProps extends ComponentPropsWithRef<"canvas"> {
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
  ...props
}: CanvasStageProps) {
  let canvasNode: HTMLCanvasElement | null = null;

  useEffect(() => {
    if (canvasNode) {
      connectCanvas(canvasNode, { worker, workerUrl, buffer, mode: "stage" });
    }
  }, [buffer, worker, workerUrl]);

  return (
    <CanvasStageBox
      ref={(node: HTMLCanvasElement | null) => {
        canvasNode = node;
        assignCanvasRef(ref, node);
      }}
      className={className}
      {...props}
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

export interface RangeBarProps extends ComponentPropsWithRef<"canvas"> {
  buffer?: TelemetrySource;
}

export function RangeBar({ buffer, ref, className, ...props }: RangeBarProps) {
  let canvasNode: HTMLCanvasElement | null = null;

  useEffect(() => {
    if (canvasNode && buffer) {
      connectCanvas(canvasNode, { buffer, mode: "range" });
    }
  }, [buffer]);

  return (
    <RangeBarBox
      ref={(node: HTMLCanvasElement | null) => {
        canvasNode = node;
        assignCanvasRef(ref, node);
      }}
      className={className}
      {...props}
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

export interface HeatmapCanvasProps extends ComponentPropsWithRef<"canvas"> {
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
  ...props
}: HeatmapCanvasProps) {
  let canvasNode: HTMLCanvasElement | null = null;

  useEffect(() => {
    if (canvasNode) {
      connectCanvas(canvasNode, { worker, workerUrl, buffer, mode: "heatmap" });
    }
  }, [buffer, worker, workerUrl]);

  return (
    <HeatmapCanvasBox
      ref={(node: HTMLCanvasElement | null) => {
        canvasNode = node;
        assignCanvasRef(ref, node);
      }}
      className={className}
      {...props}
    />
  );
}
