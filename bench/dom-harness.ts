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
const REACT_TEXT = Symbol.for("react.text");

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
  text?: string;
  children: FiberInstance[];
  effects: EffectEntry[];
  memoizedProps?: Record<string, unknown>;
  memoizedSelectValues?: ReadonlySet<string> | null;
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
    location: {
      href: "https://vespoli.local/app",
      origin: "https://vespoli.local",
      protocol: "https:",
      host: "vespoli.local"
    },
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
  public readonly booleanAttributes = new Set<string>();
  public readonly managedAttributes = new Set<string>();
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
    this.booleanAttributes.delete(name);
    if (name === "open") this.open = true;
    if (name === "disabled") this.disabled = true;
    if (name === "tabindex") this.tabIndex = Number(val);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    this.booleanAttributes.delete(name);
    if (name === "open") this.open = false;
    if (name === "disabled") this.disabled = false;
    if (name === "tabindex") this.tabIndex = 0;
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
    this.booleanAttributes.add("open");
    this.modalShowCount += 1;
  }

  close(): void {
    this.open = false;
    this.attributes.delete("open");
    this.booleanAttributes.delete("open");
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
      rootFiber = reconcileFiber(rootFiber, vnode, doc, root, pendingEffects, null);
      container.children = [];
      if (rootFiber) {
        appendFiberNodes(rootFiber, container);
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
        unmountFiberSubtree(rootFiber);
        container.children = [];
        rootFiber = null;
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

function unmountFiberSubtree(fiber: FiberInstance): void {
  const stale = collectFibers(fiber);
  for (const f of stale) {
    if (f.dom) {
      f.dom.isConnected = false;
      f.dom.parentElement = null;
      const ref = f.vnode.props.ref;
      if (typeof ref === "function") {
        (ref as (el: SimElement | null) => void)(null);
      } else if (ref && typeof ref === "object") {
        (ref as { current: SimElement | null }).current = null;
      }
    }
  }
  cleanupEffects(stale);
}

function appendFiberNodes(fiber: FiberInstance, parentDom: SimElement): void {
  if (fiber.text !== undefined) {
    if (fiber.text !== "") parentDom.appendChild(fiber.text);
    return;
  }
  if (fiber.dom) {
    parentDom.appendChild(fiber.dom);
    return;
  }
  for (const ch of fiber.children) {
    appendFiberNodes(ch, parentDom);
  }
}

function equalSelectSets(
  a: ReadonlySet<string> | null | undefined,
  b: ReadonlySet<string> | null
): boolean {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function assignHostRef(ref: unknown, node: SimElement | null): void {
  if (typeof ref === "function") {
    (ref as (el: SimElement | null) => void)(node);
  } else if (ref && typeof ref === "object") {
    (ref as { current: SimElement | null }).current = node;
  }
}

function reconcileFiber(
  prevInput: FiberInstance | null,
  vnode: VNode,
  doc: SimDocument,
  root: TestRoot,
  effectQueue: FiberInstance[],
  selectValues: ReadonlySet<string> | null = null
): FiberInstance {
  const type = vnode.type;
  let prev = prevInput;
  if (prev && prev.vnode.type !== type) {
    unmountFiberSubtree(prev);
    prev = null;
  }

  if (type === REACT_TEXT) {
    const text = String(vnode.props.nodeValue ?? "");
    if (prev) {
      prev.vnode = vnode;
      prev.text = text;
      return prev;
    }
    return { vnode, dom: null, text, children: [], effects: [] };
  }

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
    fiber.dom = null;
    fiber.children = reconcileChildList(
      fiber.children,
      childList,
      doc,
      root,
      effectQueue,
      selectValues
    );
    return fiber;
  }

  if (
    typeof type === "object" &&
    type !== null &&
    (type as MemoType).$$typeof === REACT_MEMO
  ) {
    const memoDef = type as MemoType;
    if (
      prev &&
      prev.memoizedProps &&
      equalSelectSets(prev.memoizedSelectValues ?? null, selectValues)
    ) {
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
    fiber.dom = null;
    fiber.memoizedProps = vnode.props;
    fiber.memoizedSelectValues = selectValues;
    const prevActive = activeFiber;
    const prevCursor = effectCursor;
    activeFiber = fiber;
    effectCursor = 0;
    let rendered: unknown;
    try {
      rendered = memoDef.type(vnode.props);
    } finally {
      activeFiber = prevActive;
      effectCursor = prevCursor;
    }
    const childNodes = flattenChildren(rendered);
    fiber.children = reconcileChildList(
      fiber.children,
      childNodes,
      doc,
      root,
      effectQueue,
      selectValues
    );
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
    fiber.dom = null;
    const prevActive = activeFiber;
    const prevCursor = effectCursor;
    activeFiber = fiber;
    effectCursor = 0;
    let rendered: unknown;
    try {
      rendered = fn(vnode.props);
    } finally {
      activeFiber = prevActive;
      effectCursor = prevCursor;
    }
    const childNodes = flattenChildren(rendered);
    fiber.children = reconcileChildList(
      fiber.children,
      childNodes,
      doc,
      root,
      effectQueue,
      selectValues
    );
    if (fiber.effects.length > 0) effectQueue.push(fiber);
    return fiber;
  }

  if (typeof type === "string") {
    const tagLower = type.toLowerCase();
    const dom =
      prev && prev.dom && prev.dom.tagName.toLowerCase() === tagLower
        ? prev.dom
        : doc.createElement(type);
    const prevRef = prev ? prev.vnode.props.ref : undefined;
    const effectiveProps =
      tagLower === "option" && selectValues && vnode.props.selected === undefined
        ? {
            ...vnode.props,
            selected: selectValues.has(readOptionValue(vnode.props))
          }
        : vnode.props;
    applyDomProps(dom, effectiveProps);
    const fiber: FiberInstance = prev ?? {
      vnode,
      dom,
      children: [],
      effects: []
    };
    fiber.vnode = vnode;
    fiber.dom = dom;

    const nextSelect =
      tagLower === "select"
        ? resolveSelectedSet(effectiveProps.value ?? effectiveProps.defaultValue)
        : selectValues;
    const childList =
      tagLower === "textarea" &&
      (effectiveProps.value !== undefined || effectiveProps.defaultValue !== undefined)
        ? flattenChildren(String(effectiveProps.value ?? effectiveProps.defaultValue ?? ""))
        : flattenChildren(effectiveProps.children);
    fiber.children = reconcileChildList(
      fiber.children,
      childList,
      doc,
      root,
      effectQueue,
      nextSelect
    );
    dom.children = [];
    for (const ch of fiber.children) {
      appendFiberNodes(ch, dom);
    }
    if (!prev || prevRef !== effectiveProps.ref) {
      if (prev && prevRef !== undefined) {
        assignHostRef(prevRef, null);
      }
      assignHostRef(effectiveProps.ref, dom);
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
  effectQueue: FiberInstance[],
  selectValues: ReadonlySet<string> | null
): FiberInstance[] {
  const prevByKey = new Map<string, FiberInstance>();
  for (let i = 0; i < prevChildren.length; i += 1) {
    const pf = prevChildren[i]!;
    const k = pf.vnode.key ?? `__idx_${i}`;
    if (!prevByKey.has(k)) {
      prevByKey.set(k, pf);
    }
  }
  const nextFibers = nextVNodes.map((vn, i) => {
    const k = vn.key ?? `__idx_${i}`;
    const matched = prevByKey.get(k) ?? null;
    if (matched) {
      prevByKey.delete(k);
    }
    return reconcileFiber(matched, vn, doc, root, effectQueue, selectValues);
  });
  for (const unmatched of prevByKey.values()) {
    unmountFiberSubtree(unmatched);
  }
  return nextFibers;
}

const CAMEL_ATTR_NAMES: Readonly<Record<string, string>> = {
  htmlFor: "for",
  tabIndex: "tabindex",
  readOnly: "readonly",
  colSpan: "colspan",
  rowSpan: "rowspan",
  autoComplete: "autocomplete",
  maxLength: "maxlength",
  minLength: "minlength",
  spellCheck: "spellcheck",
  contentEditable: "contenteditable",
  httpEquiv: "http-equiv",
  acceptCharset: "accept-charset",
  autoFocus: "autofocus",
  allowFullScreen: "allowfullscreen",
  autoPlay: "autoplay",
  formNoValidate: "formnovalidate",
  isMap: "ismap",
  itemScope: "itemscope",
  noModule: "nomodule",
  noValidate: "novalidate",
  playsInline: "playsinline"
};

const BOOLEAN_ATTRS: ReadonlySet<string> = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected"
]);

const ENUMERATED_BOOLEAN_ATTRS: ReadonlySet<string> = new Set([
  "spellcheck",
  "draggable",
  "contenteditable"
]);

const VALID_ATTR_NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/;

function resolveSelectedSet(raw: unknown): ReadonlySet<string> | null {
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) return new Set(raw.map((v) => String(v)));
  return new Set([String(raw)]);
}

function readOptionValue(props: Record<string, unknown>): string {
  if (props.value !== undefined && props.value !== null) {
    return String(props.value);
  }
  const textParts = expandChildNodes(props.children).filter(
    (item): item is string | number | bigint =>
      typeof item === "string" || typeof item === "number" || typeof item === "bigint"
  );
  return textParts.map(String).join("");
}

function setManagedAttribute(
  dom: SimElement,
  name: string,
  val: string,
  isBoolean = false
): void {
  dom.setAttribute(name, val);
  if (isBoolean) {
    dom.booleanAttributes.add(name);
  }
  dom.managedAttributes.add(name);
}

function applyDomProps(dom: SimElement, props: Record<string, unknown>): void {
  for (const prevAttr of Array.from(dom.managedAttributes)) {
    dom.removeAttribute(prevAttr);
  }
  dom.managedAttributes.clear();
  dom.listeners.clear();
  const tag = dom.tagName.toLowerCase();

  for (const [k, rawVal] of Object.entries(props)) {
    if (k === "children" || k === "ref") continue;
    if (k === "defaultChecked") {
      if (props.checked === undefined && Boolean(rawVal)) {
        setManagedAttribute(dom, "checked", "", true);
      }
      continue;
    }
    if (k === "defaultValue") {
      if (
        tag !== "select" &&
        tag !== "textarea" &&
        props.value === undefined &&
        rawVal !== undefined &&
        rawVal !== null
      ) {
        setManagedAttribute(dom, "value", String(rawVal));
      }
      continue;
    }
    if ((tag === "select" || tag === "textarea") && k === "value") {
      continue;
    }
    if (rawVal === undefined || rawVal === null) {
      continue;
    }
    if (k === "dangerouslySetInnerHTML") {
      dom.ownerDocument.cspViolations.push({
        blockedDirective: "script-src 'self'",
        detail: `dangerouslySetInnerHTML on <${tag}>`
      });
      setManagedAttribute(dom, "dangerouslysetinnerhtml", "[blocked]");
      continue;
    }
    if (/^on[A-Z]/.test(k)) {
      if (typeof rawVal === "function") {
        dom.listeners.set(
          k.slice(2).toLowerCase(),
          rawVal as (ev: Record<string, unknown>) => void
        );
      }
      continue;
    }
    if (typeof rawVal === "function" || typeof rawVal === "symbol") {
      continue;
    }
    if (k === "className") {
      if (rawVal) setManagedAttribute(dom, "class", String(rawVal));
      continue;
    }
    const attrName = Object.hasOwn(CAMEL_ATTR_NAMES, k) ? CAMEL_ATTR_NAMES[k]! : k;
    if (!VALID_ATTR_NAME.test(attrName)) {
      throw new Error(`Invalid HTML attribute name: ${attrName}`);
    }
    if (typeof rawVal === "boolean") {
      if (
        attrName.startsWith("aria-") ||
        attrName.startsWith("data-") ||
        ENUMERATED_BOOLEAN_ATTRS.has(attrName)
      ) {
        setManagedAttribute(dom, attrName, String(rawVal));
      } else if (rawVal) {
        setManagedAttribute(dom, attrName, "", BOOLEAN_ATTRS.has(attrName));
      }
      continue;
    }
    setManagedAttribute(dom, attrName, String(rawVal));
  }
}

function isVNode(val: unknown): val is VNode {
  return (
    typeof val === "object" &&
    val !== null &&
    (val as VNode).$$typeof === REACT_ELEMENT
  );
}

function isIterableCollection(val: unknown): val is Iterable<unknown> {
  return (
    typeof val === "object" &&
    val !== null &&
    !isVNode(val) &&
    typeof (val as Iterable<unknown>)[Symbol.iterator] === "function"
  );
}

function expandChildNodes(raw: unknown): Array<VNode | string | number | bigint> {
  const out: Array<VNode | string | number | bigint> = [];
  const collectItem = (item: unknown): void => {
    if (item === null || item === undefined || typeof item === "boolean") {
      return;
    }
    if (typeof item === "string" || typeof item === "number" || typeof item === "bigint") {
      out.push(item);
      return;
    }
    if (Array.isArray(item) || isIterableCollection(item)) {
      for (const sub of item) collectItem(sub);
      return;
    }
    if (isVNode(item)) {
      out.push(item);
    }
  };
  collectItem(raw);
  return out;
}

function flattenChildren(raw: unknown): VNode[] {
  return expandChildNodes(raw).map((item) =>
    isVNode(item) ? item : createVNode(REACT_TEXT, { nodeValue: String(item) })
  );
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
