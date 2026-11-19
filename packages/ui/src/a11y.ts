export type Axis = "horizontal" | "vertical" | "both";

export interface FocusHost {
  querySelectorAll(selector: string): ArrayLike<FocusItem>;
}

export interface FocusItem {
  tabIndex: number;
  disabled?: boolean;
  focus(): void;
  getAttribute?(name: string): string | null;
}

export interface KeyInput {
  readonly key: string;
  readonly currentTarget: FocusHost;
  readonly target: unknown;
  preventDefault(): void;
}

const DEFAULT_SELECTOR =
  '[role="tab"]:not([disabled]), [role="radio"]:not([disabled]), [role="option"]:not([disabled]), [role="treeitem"]:not([disabled]), button:not([disabled]), [data-roving-item]:not([disabled])';

export function resolveNextIndex(
  currentIndex: number,
  count: number,
  key: string,
  axis: Axis = "horizontal"
): number | null {
  if (count <= 0) return null;
  const clamped = currentIndex < 0 ? 0 : currentIndex % count;

  if (key === "Home") return 0;
  if (key === "End") return count - 1;

  const forward =
    (axis !== "vertical" && key === "ArrowRight") ||
    (axis !== "horizontal" && key === "ArrowDown");
  if (forward) {
    return (clamped + 1) % count;
  }

  const backward =
    (axis !== "vertical" && key === "ArrowLeft") ||
    (axis !== "horizontal" && key === "ArrowUp");
  if (backward) {
    return (clamped - 1 + count) % count;
  }

  return null;
}

export function moveFocus(
  host: FocusHost,
  nextIndex: number,
  selector: string = DEFAULT_SELECTOR
): FocusItem | null {
  const raw = host.querySelectorAll(selector);
  const items: FocusItem[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const candidate = raw[i];
    if (candidate && !candidate.disabled) {
      items.push(candidate);
    }
  }
  if (items.length === 0) return null;

  const normalized = ((nextIndex % items.length) + items.length) % items.length;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    item.tabIndex = i === normalized ? 0 : -1;
  }
  const active = items[normalized]!;
  active.focus();
  return active;
}

export function delegateRovingKey(
  event: KeyInput,
  axis: Axis = "horizontal",
  selector: string = DEFAULT_SELECTOR
): FocusItem | null {
  const raw = event.currentTarget.querySelectorAll(selector);
  const items: FocusItem[] = [];
  let currentIdx = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const candidate = raw[i];
    if (candidate && !candidate.disabled) {
      if (candidate === event.target || candidate.tabIndex === 0) {
        currentIdx = items.length;
      }
      items.push(candidate);
    }
  }
  const nextIdx = resolveNextIndex(currentIdx, items.length, event.key, axis);
  if (nextIdx === null) return null;
  event.preventDefault();
  return moveFocus(event.currentTarget, nextIdx, selector);
}
