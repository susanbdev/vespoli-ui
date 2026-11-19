export type MorphDirection = "left" | "right" | "up" | "down" | "iris";

export interface TransitionOptions {
  readonly direction?: MorphDirection;
  readonly doc?: Document;
  readonly target?: HTMLElement | null;
}

interface TransitionHandle {
  readonly finished: Promise<unknown>;
}

type TransitionRunner = (
  arg: (() => void) | { update: () => void; types?: readonly string[] }
) => TransitionHandle;

const INTERACTIVE_SELECTOR =
  "button, a, summary, tr[data-row-key], [data-vui-interactive]";

// Law 1 & Law 6.1: Sole permitted Document-scoped WeakMaps for passive origin tracking & reverse morphs.
const documentOrigins = new WeakMap<Document, WeakRef<HTMLElement>>();
const attachedDocuments = new WeakSet<Document>();
const containerOrigins = new WeakMap<HTMLElement, WeakRef<HTMLElement>>();

export function trackOrigin(doc?: Document): void {
  const targetDoc =
    doc ?? (typeof document !== "undefined" ? document : undefined);
  if (!targetDoc || attachedDocuments.has(targetDoc)) return;
  attachedDocuments.add(targetDoc);

  const captureTrigger = (event: Event) => {
    if (event.type === "keydown") {
      const key = (event as KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") return;
    }
    const rawTarget = event.target as { closest?: (s: string) => HTMLElement | null } | null;
    if (!rawTarget || typeof rawTarget.closest !== "function") return;
    const trigger = rawTarget.closest(INTERACTIVE_SELECTOR);
    if (trigger) {
      documentOrigins.set(targetDoc, new WeakRef(trigger));
    }
  };

  targetDoc.addEventListener("pointerdown", captureTrigger, {
    capture: true,
    passive: true
  });
  targetDoc.addEventListener("keydown", captureTrigger, {
    capture: true,
    passive: true
  });
}

export function recordOrigin(doc: Document, trigger: HTMLElement): void {
  documentOrigins.set(doc, new WeakRef(trigger));
}

export function readOrigin(doc?: Document): HTMLElement | null {
  const targetDoc =
    doc ?? (typeof document !== "undefined" ? document : undefined);
  if (!targetDoc) return null;
  const ref = documentOrigins.get(targetDoc);
  const el = ref?.deref() ?? null;
  if (el && "isConnected" in el && el.isConnected === false) {
    return null;
  }
  return el;
}

export function clearOrigin(doc?: Document): void {
  const targetDoc =
    doc ?? (typeof document !== "undefined" ? document : undefined);
  if (!targetDoc) return;
  documentOrigins.delete(targetDoc);
  scrubMorphTokens(targetDoc);
}

function prefersReducedMotion(doc: Document): boolean {
  const win = doc.defaultView;
  if (!win || typeof win.matchMedia !== "function") return false;
  return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrubMorphTokens(doc: Document): void {
  if (typeof doc.querySelectorAll !== "function") return;
  const active = doc.querySelectorAll("[data-vui-morph], [data-vui-morph-hidden]");
  for (let i = 0; i < active.length; i += 1) {
    const node = active[i] as HTMLElement | undefined;
    node?.removeAttribute("data-vui-morph");
    node?.removeAttribute("data-vui-morph-hidden");
  }
}

export function transitionTo(
  updateFn: () => void,
  options: TransitionOptions = {}
): Promise<void> {
  const doc =
    options.doc ?? (typeof document !== "undefined" ? document : undefined);
  const startVt = (doc as unknown as { startViewTransition?: TransitionRunner } | undefined)
    ?.startViewTransition;

  if (!doc || typeof startVt !== "function" || prefersReducedMotion(doc)) {
    updateFn();
    return Promise.resolve();
  }

  // Clear any in-flight morph tokens so overlapping activations never collide on view-transition-name
  scrubMorphTokens(doc);

  const origin = readOrigin(doc);
  if (origin) {
    origin.setAttribute("data-vui-morph", "active");
  }

  const runUpdate = () => {
    if (origin) {
      origin.removeAttribute("data-vui-morph");
      origin.setAttribute("data-vui-morph-hidden", "true");
    }
    updateFn();
    const dest =
      options.target ??
      (typeof doc.querySelector === "function"
        ? (doc.querySelector("[data-vui-morph-target]") as HTMLElement | null)
        : null);
    if (dest) {
      dest.setAttribute("data-vui-morph", "active");
      if (origin) {
        containerOrigins.set(dest, new WeakRef(origin));
      }
    }
  };

  let handle: TransitionHandle;
  try {
    if (options.direction) {
      handle = startVt.call(doc, {
        update: runUpdate,
        types: [options.direction]
      });
    } else {
      handle = startVt.call(doc, runUpdate);
    }
  } catch {
    handle = startVt.call(doc, runUpdate);
  }

  return Promise.resolve(handle?.finished)
    .catch(() => undefined)
    .finally(() => {
      scrubMorphTokens(doc);
    });
}

export function morphOpen(
  containerEl: HTMLElement,
  openDomFn: () => void
): Promise<void> {
  const doc = containerEl.ownerDocument;
  const startVt = (doc as unknown as { startViewTransition?: TransitionRunner } | undefined)
    ?.startViewTransition;

  if (!doc || typeof startVt !== "function" || prefersReducedMotion(doc)) {
    openDomFn();
    return Promise.resolve();
  }

  scrubMorphTokens(doc);
  const origin = readOrigin(doc);
  if (origin) {
    origin.setAttribute("data-vui-morph", "active");
    containerOrigins.set(containerEl, new WeakRef(origin));
  }

  const handle = startVt.call(doc, () => {
    if (origin) {
      origin.removeAttribute("data-vui-morph");
      origin.setAttribute("data-vui-morph-hidden", "true");
    }
    openDomFn();
    containerEl.setAttribute("data-vui-morph", "active");
  });

  return Promise.resolve(handle?.finished)
    .catch(() => undefined)
    .finally(() => {
      containerEl.removeAttribute("data-vui-morph");
    });
}

export function morphClose(
  containerEl: HTMLElement,
  closeDomFn: () => void
): Promise<void> {
  const doc = containerEl.ownerDocument;
  const origin = containerOrigins.get(containerEl)?.deref() ?? null;
  const startVt = (doc as unknown as { startViewTransition?: TransitionRunner } | undefined)
    ?.startViewTransition;

  if (!doc || typeof startVt !== "function" || prefersReducedMotion(doc) || !origin) {
    closeDomFn();
    origin?.removeAttribute("data-vui-morph-hidden");
    return Promise.resolve();
  }

  scrubMorphTokens(doc);
  containerEl.setAttribute("data-vui-morph", "active");
  origin.setAttribute("data-vui-morph-hidden", "true");

  const handle = startVt.call(doc, () => {
    containerEl.removeAttribute("data-vui-morph");
    closeDomFn();
    origin.removeAttribute("data-vui-morph-hidden");
    origin.setAttribute("data-vui-morph", "active");
  });

  return Promise.resolve(handle?.finished)
    .catch(() => undefined)
    .finally(() => {
      origin.removeAttribute("data-vui-morph");
      origin.removeAttribute("data-vui-morph-hidden");
    });
}
