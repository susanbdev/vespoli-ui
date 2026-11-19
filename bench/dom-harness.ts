// Minimal, deterministic React 19 + DOM + StrictMode + Profiler + CSP + WCAG verification runtime
// used by standalone offline Node tests and benchmarks (0 external npm packages).

export interface VNode {
  readonly $$typeof: symbol;
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly key: string | null;
}

export const REACT_ELEMENT = Symbol.for("react.transitional.element");
export const REACT_FRAGMENT = Symbol.for("react.fragment");
export const REACT_MEMO = Symbol.for("react.memo");
export const REACT_PROFILER = Symbol.for("react.profiler");
export const REACT_STRICT_MODE = Symbol.for("react.strict_mode");

export interface MemoType {
  readonly $$typeof: symbol;
  readonly type: (props: Record<string, unknown>) => unknown;
  readonly compare?: (
    prev: Record<string, unknown>,
    next: Record<string, unknown>
  ) => boolean;
}

interface EffectEntry {
  deps: readonly unknown[] | undefined;
  create: () => void | (() => void);
  cleanup?: void | (() => void);
}

interface FiberInstance {
  vnode: VNode;
  dom: SimElement | null;
  children: FiberInstance[];
  effects: EffectEntry[];
  memoizedProps?: Record<string, unknown>;
}

let activeFiber: FiberInstance | null = null;
let effectCursor = 0;

export function createVNode(
  type: unknown,
  rawProps: Record<string, unknown> | null | undefined,
  key?: unknown
): VNode {
  const props = { ...(rawProps ?? {}) };
  let resolvedKey: string | null = key !== undefined && key !== null ? String(key) : null;
  if (resolvedKey === null && props.key !== undefined && props.key !== null) {
    resolvedKey = String(props.key);
  }
  delete props.key;
  return {
    $$typeof: REACT_ELEMENT,
    type,
    props,
    key: resolvedKey
  };
}

export function createElement(
  type: unknown,
  rawProps?: Record<string, unknown> | null,
  ...children: unknown[]
): VNode {
  const props: Record<string, unknown> = { ...(rawProps ?? {}) };
  if (children.length === 1) {
    props.children = children[0];
  } else if (children.length > 1) {
    props.children = children;
  }
  return createVNode(type, props);
}

export function memo<P extends Record<string, unknown>>(
  fn: (props: P) => unknown,
  compare?: (prev: P, next: P) => boolean
): MemoType {
  return {
    $$typeof: REACT_MEMO,
    type: fn as (props: Record<string, unknown>) => unknown,
    compare: compare as MemoType["compare"]
  };
}

export function useEffect(
  create: () => void | (() => void),
  deps?: readonly unknown[]
): void {
  if (!activeFiber) return;
  const idx = effectCursor;
  effectCursor += 1;
  const prev = activeFiber.effects[idx];
  if (!prev) {
    activeFiber.effects.push({ deps, create });
    return;
  }
  const unchanged =
    deps !== undefined &&
    prev.deps !== undefined &&
    deps.length === prev.deps.length &&
    deps.every((val, i) => Object.is(val, prev.deps![i]));
  if (!unchanged) {
    prev.deps = deps;
    prev.create = create;
    (prev as { dirty?: boolean }).dirty = true;
  }
}

export const Fragment = REACT_FRAGMENT;
export const Profiler = REACT_PROFILER;
export const StrictMode = REACT_STRICT_MODE;

export interface CspEvent {
  readonly blockedDirective: string;
  readonly detail: string;
}

export class SimDocument {
  public readonly body: SimElement;
  public readonly cspViolations: CspEvent[] = [];
  public reducedMotion = false;
  public viewTransitionCalls: Array<{ types?: readonly string[] }> = [];
  private listeners = new Map<string, Set<(ev: Record<string, unknown>) => void>>();

  public readonly defaultView = {
    matchMedia: (query: string) => ({
      matches:
        query.includes("prefers-reduced-motion: reduce") && this.reducedMotion
    }),
    getComputedStyle: (_el: SimElement) => ({
      getPropertyValue: (prop: string) => {
        if (prop === "--vui-color-accent") return "#5eead4";
        if (prop === "--vui-color-surface") return "#12161b";
        if (prop === "--vui-color-border") return "#262f3b";
        return "";
      }
    })
  };

  constructor() {
    this.body = new SimElement("body", this);
  }

  createElement(tag: string): SimElement {
    const lower = tag.toLowerCase();
    if (lower === "style") {
      this.cspViolations.push({
        blockedDirective: "style-src 'self'",
        detail: "dynamic <style> element creation blocked"
      });
    }
    return new SimElement(lower, this);
  }

  addEventListener(
    type: string,
    fn: (ev: Record<string, unknown>) => void
  ): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }

  dispatchCapture(type: string, ev: Record<string, unknown>): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of set) fn({ type, ...ev });
  }

  querySelector(selector: string): SimElement | null {
    return this.body.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): SimElement[] {
    return this.body.querySelectorAll(selector);
  }

  startViewTransition(
    arg: (() => void) | { update: () => void; types?: readonly string[] }
  ): { finished: Promise<void> } {
    if (typeof arg === "function") {
      this.viewTransitionCalls.push({});
      arg();
    } else {
      this.viewTransitionCalls.push({ types: arg.types });
      arg.update();
    }
    return { finished: Promise.resolve() };
  }
}

export class SimElement {
  public readonly tagName: string;
  public readonly ownerDocument: SimDocument;
  public readonly attributes = new Map<string, string>();
  public readonly listeners = new Map<string, (ev: Record<string, unknown>) => void>();
  public children: Array<SimElement | string> = [];
  public parentElement: SimElement | null = null;
  public tabIndex = 0;
  public disabled = false;
  public open = false;
  public focused = false;
  public isConnected = true;
  public modalShowCount = 0;
  public modalCloseCount = 0;
  private offscreenTransferred = false;

  constructor(tag: string, doc: SimDocument) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
  }

  setAttribute(name: string, val: string): void {
    if (name.toLowerCase() === "style") {
      this.ownerDocument.cspViolations.push({
        blockedDirective: "style-src 'self'",
        detail: `inline style attribute on <${this.tagName.toLowerCase()}>`
      });
    }
    this.attributes.set(name, val);
    if (name === "open") this.open = true;
    if (name === "disabled") this.disabled = true;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === "open") this.open = false;
    if (name === "disabled") this.disabled = false;
  }

  appendChild(child: SimElement | string): void {
    if (typeof child !== "string") {
      child.parentElement = this;
      child.isConnected = true;
    }
    this.children.push(child);
  }

  focus(): void {
    this.focused = true;
  }

  showModal(): void {
    this.open = true;
    this.attributes.set("open", "");
    this.modalShowCount += 1;
  }

  close(): void {
    this.open = false;
    this.attributes.delete("open");
    this.modalCloseCount += 1;
  }

  transferControlToOffscreen(): { readonly width: number; readonly height: number } {
    if (this.offscreenTransferred) {
      const err = new Error(
        "InvalidStateError: Cannot transfer control from a canvas for more than one time."
      );
      err.name = "InvalidStateError";
      throw err;
    }
    this.offscreenTransferred = true;
    return { width: 800, height: 220 };
  }

  closest(selector: string): SimElement | null {
    let cur: SimElement | null = this;
    while (cur) {
      if (matchesSimpleSelector(cur, selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  querySelectorAll(selector: string): SimElement[] {
    const out: SimElement[] = [];
    for (const child of this.children) {
      if (typeof child !== "string") {
        if (matchesSimpleSelector(child, selector)) {
          out.push(child);
        }
        out.push(...child.querySelectorAll(selector));
      }
    }
    return out;
  }

  get elementChildren(): SimElement[] {
    return this.children.filter((c): c is SimElement => typeof c !== "string");
  }

  get className(): string {
    return this.attributes.get("class") ?? "";
  }
}

function matchesSimpleSelector(el: SimElement, selectorList: string): boolean {
  const parts = selectorList.split(",").map((s) => s.trim()).filter(Boolean);
  const tagLower = el.tagName.toLowerCase();

  for (const sel of parts) {
    if (sel.includes(":not([disabled])") && el.disabled) continue;
    const base = sel.replace(":not([disabled])", "").trim();

    if (base === tagLower) return true;

    const tagAttr = /^([a-z0-9]+)?\[([a-z0-9-]+)(?:="([^"]*)")?\]$/i.exec(base);
    if (tagAttr) {
      const reqTag = tagAttr[1]?.toLowerCase();
      const attrName = tagAttr[2]!;
      const attrVal = tagAttr[3];
      if (reqTag && reqTag !== tagLower) continue;
      if (!el.attributes.has(attrName)) continue;
      if (attrVal !== undefined && el.attributes.get(attrName) !== attrVal) {
        continue;
      }
      return true;
    }
  }
  return false;
}

export interface TestRoot {
  readonly document: SimDocument;
  readonly container: SimElement;
  profilerCommits: number;
  memoRowRenders: number;
  render(vnode: VNode): SimElement | null;
  unmount(): void;
}

export function createTestRoot(options: { strictMode?: boolean } = {}): TestRoot {
  const doc = new SimDocument();
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  let rootFiber: FiberInstance | null = null;
  let strictDone = false;

  const root: TestRoot = {
    document: doc,
    container,
    profilerCommits: 0,
    memoRowRenders: 0,
    render(vnode: VNode): SimElement | null {
      const pendingEffects: FiberInstance[] = [];
      rootFiber = reconcileFiber(rootFiber, vnode, doc, root, pendingEffects);
      container.children = [];
      if (rootFiber?.dom) {
        container.appendChild(rootFiber.dom);
      } else if (rootFiber) {
        for (const ch of rootFiber.children) {
          if (ch.dom) container.appendChild(ch.dom);
        }
      }

      runPendingEffects(pendingEffects);

      // Simulate React 19 <StrictMode> initial mount -> cleanup -> second effect invocation
      if (options.strictMode && !strictDone) {
        strictDone = true;
        cleanupEffects(pendingEffects);
        for (const f of pendingEffects) {
          for (const eff of f.effects) {
            (eff as { dirty?: boolean }).dirty = true;
          }
        }
        runPendingEffects(pendingEffects);
      }

      return container.elementChildren[0] ?? null;
    },
    unmount(): void {
      if (rootFiber) {
        const all = collectFibers(rootFiber);
        cleanupEffects(all);
        rootFiber = null;
        container.children = [];
      }
    }
  };

  return root;
}

function shallowEqualProps(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}

function reconcileFiber(
  prev: FiberInstance | null,
  vnode: VNode,
  doc: SimDocument,
  root: TestRoot,
  effectQueue: FiberInstance[]
): FiberInstance {
  const type = vnode.type;

  if (type === REACT_FRAGMENT || type === REACT_STRICT_MODE || type === REACT_PROFILER) {
    if (type === REACT_PROFILER) {
      root.profilerCommits += 1;
      const onRender = vnode.props.onRender as ((...args: unknown[]) => void) | undefined;
      onRender?.(vnode.props.id ?? "profiler", prev ? "update" : "mount", 0.1);
    }
    const childList = flattenChildren(vnode.props.children);
    const fiber: FiberInstance = prev ?? {
      vnode,
      dom: null,
      children: [],
      effects: []
    };
    fiber.vnode = vnode;
    fiber.children = reconcileChildList(
      fiber.children,
      childList,
      doc,
      root,
      effectQueue
    );
    return fiber;
  }

  if (
    typeof type === "object" &&
    type !== null &&
    (type as MemoType).$$typeof === REACT_MEMO
  ) {
    const memoDef = type as MemoType;
    if (prev && prev.vnode.type === type && prev.memoizedProps) {
      const isEqual = memoDef.compare
        ? memoDef.compare(prev.memoizedProps, vnode.props)
        : shallowEqualProps(prev.memoizedProps, vnode.props);
      if (isEqual) {
        return prev;
      }
    }
    root.memoRowRenders += 1;
    const fiber: FiberInstance = prev ?? {
      vnode,
      dom: null,
      children: [],
      effects: []
    };
    fiber.vnode = vnode;
    fiber.memoizedProps = vnode.props;
    activeFiber = fiber;
    effectCursor = 0;
    const rendered = memoDef.type(vnode.props);
    activeFiber = null;
    const childNodes = flattenChildren(rendered);
    fiber.children = reconcileChildList(
      fiber.children,
      childNodes,
      doc,
      root,
      effectQueue
    );
    fiber.dom = fiber.children[0]?.dom ?? null;
    if (fiber.effects.length > 0) effectQueue.push(fiber);
    return fiber;
  }

  if (typeof type === "function") {
    const fn = type as (props: Record<string, unknown>) => unknown;
    const fiber: FiberInstance = prev ?? {
      vnode,
      dom: null,
      children: [],
      effects: []
    };
    fiber.vnode = vnode;
    activeFiber = fiber;
    effectCursor = 0;
    const rendered = fn(vnode.props);
    activeFiber = null;
    const childNodes = flattenChildren(rendered);
    fiber.children = reconcileChildList(
      fiber.children,
      childNodes,
      doc,
      root,
      effectQueue
    );
    fiber.dom = fiber.children[0]?.dom ?? null;
    if (fiber.effects.length > 0) effectQueue.push(fiber);
    return fiber;
  }

  if (typeof type === "string") {
    const dom =
      prev && prev.dom && prev.dom.tagName.toLowerCase() === type.toLowerCase()
        ? prev.dom
        : doc.createElement(type);
    applyDomProps(dom, vnode.props);
    const fiber: FiberInstance = prev ?? {
      vnode,
      dom,
      children: [],
      effects: []
    };
    fiber.vnode = vnode;
    fiber.dom = dom;

    const rawKids = Array.isArray(vnode.props.children)
      ? vnode.props.children
      : vnode.props.children !== undefined
        ? [vnode.props.children]
        : [];
    dom.children = [];
    const nextChildFibers: FiberInstance[] = [];
    let fiberIdx = 0;
    for (const item of rawKids) {
      if (item === null || item === undefined || typeof item === "boolean") {
        continue;
      }
      if (typeof item === "string" || typeof item === "number") {
        dom.appendChild(String(item));
      } else if (isVNode(item)) {
        const sub = reconcileFiber(
          fiber.children[fiberIdx] ?? null,
          item,
          doc,
          root,
          effectQueue
        );
        fiberIdx += 1;
        nextChildFibers.push(sub);
        if (sub.dom) {
          dom.appendChild(sub.dom);
        } else {
          for (const grand of sub.children) {
            if (grand.dom) dom.appendChild(grand.dom);
          }
        }
      }
    }
    fiber.children = nextChildFibers;
    if (typeof vnode.props.ref === "function") {
      (vnode.props.ref as (el: SimElement | null) => void)(dom);
    } else if (vnode.props.ref && typeof vnode.props.ref === "object") {
      (vnode.props.ref as { current: SimElement | null }).current = dom;
    }
    return fiber;
  }

  return { vnode, dom: null, children: [], effects: [] };
}

function reconcileChildList(
  prevChildren: FiberInstance[],
  nextVNodes: VNode[],
  doc: SimDocument,
  root: TestRoot,
  effectQueue: FiberInstance[]
): FiberInstance[] {
  const prevByKey = new Map<string, FiberInstance>();
  for (let i = 0; i < prevChildren.length; i += 1) {
    const pf = prevChildren[i]!;
    const k = pf.vnode.key ?? `__idx_${i}`;
    prevByKey.set(k, pf);
  }
  return nextVNodes.map((vn, i) => {
    const k = vn.key ?? `__idx_${i}`;
    const matched = prevByKey.get(k) ?? null;
    return reconcileFiber(matched, vn, doc, root, effectQueue);
  });
}

function applyDomProps(dom: SimElement, props: Record<string, unknown>): void {
  dom.attributes.clear();
  dom.listeners.clear();
  dom.disabled = false;

  for (const [k, v] of Object.entries(props)) {
    if (k === "children" || k === "ref" || v === undefined || v === null) {
      continue;
    }
    if (k.startsWith("on") && typeof v === "function") {
      dom.listeners.set(k.slice(2).toLowerCase(), v as (ev: Record<string, unknown>) => void);
      continue;
    }
    if (k === "className") {
      if (v) dom.setAttribute("class", String(v));
      continue;
    }
    if (k === "htmlFor") {
      dom.setAttribute("for", String(v));
      continue;
    }
    if (k === "tabIndex") {
      dom.tabIndex = Number(v);
      dom.setAttribute("tabindex", String(v));
      continue;
    }
    if (typeof v === "boolean") {
      if (k.startsWith("aria-") || k.startsWith("data-")) {
        dom.setAttribute(k, String(v));
      } else if (v) {
        dom.setAttribute(k, "");
      }
      continue;
    }
    dom.setAttribute(k, String(v));
  }
}

function isVNode(val: unknown): val is VNode {
  return (
    typeof val === "object" &&
    val !== null &&
    (val as VNode).$$typeof === REACT_ELEMENT
  );
}

function flattenChildren(raw: unknown): VNode[] {
  const out: VNode[] = [];
  const push = (item: unknown) => {
    if (Array.isArray(item)) {
      for (const sub of item) push(sub);
    } else if (isVNode(item)) {
      out.push(item);
    }
  };
  push(raw);
  return out;
}

function runPendingEffects(fibers: readonly FiberInstance[]): void {
  for (const f of fibers) {
    for (const eff of f.effects) {
      const isNew = eff.cleanup === undefined && !(eff as { ran?: boolean }).ran;
      const isDirty = Boolean((eff as { dirty?: boolean }).dirty);
      if (isNew || isDirty) {
        if (typeof eff.cleanup === "function") eff.cleanup();
        eff.cleanup = eff.create();
        (eff as { ran?: boolean; dirty?: boolean }).ran = true;
        (eff as { dirty?: boolean }).dirty = false;
      }
    }
  }
}

function cleanupEffects(fibers: readonly FiberInstance[]): void {
  for (const f of fibers) {
    for (const eff of f.effects) {
      if (typeof eff.cleanup === "function") {
        eff.cleanup();
      }
      eff.cleanup = undefined;
    }
  }
}

function collectFibers(root: FiberInstance): FiberInstance[] {
  const out: FiberInstance[] = [root];
  for (const ch of root.children) {
    out.push(...collectFibers(ch));
  }
  return out;
}

// WCAG 2.1 relative luminance & contrast ratio calculator
export function computeContrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
