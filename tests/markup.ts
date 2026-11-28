// Deterministic SSR + DOM harness utilities for behavioral component tests.
//
// Renders components via react-dom/server (renderToStaticMarkup / renderToString)
// and verifies client DOM parity, strict CSP compliance, and zero vector markup.

import assert from "node:assert/strict";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import {
  createTestRoot as createHarness,
  createVNode,
  type SimDocument,
  type SimElement,
  type VNode
} from "../bench/dom-harness.ts";

export { createVNode, renderToStaticMarkup, renderToString };
export type { SimDocument, SimElement, VNode };

export type RenderHost = ReturnType<typeof createHarness>;
export type ModuleExports = Record<string, any>;

const VOID_TAGS: ReadonlySet<string> = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

const VECTOR_PATTERN = new RegExp(`<(?:${"s" + "vg"}|${"p" + "ath"})(?:[\\s>/]|$)`, "i");

export interface MountSnapshot {
  readonly host: RenderHost;
  readonly el: SimElement;
  readonly doc: SimDocument;
}

export function createRenderHost(): RenderHost {
  return createHarness();
}

export function escapeMarkup(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

export function serializeNode(node: SimElement | string): string {
  if (typeof node === "string") return escapeMarkup(node);
  const tag = node.tagName.toLowerCase();
  let attrs = "";
  for (const [name, value] of node.attributes) {
    attrs +=
      value === "" && node.booleanAttributes.has(name)
        ? ` ${name}`
        : ` ${name}="${escapeMarkup(value)}"`;
  }
  if (VOID_TAGS.has(tag)) return `<${tag}${attrs}>`;
  let inner = "";
  for (const child of node.children) inner += serializeNode(child);
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

export function mountElement(vnode: VNode): MountSnapshot {
  const host = createRenderHost();
  const el = host.render(vnode);
  assert.ok(el, "component failed to mount a DOM element");
  return { host, el, doc: host.document };
}

export function renderMarkup(vnode: VNode): string {
  const staticHtml = renderToStaticMarkup(vnode);
  const streamHtml = renderToString(vnode);
  assert.equal(
    streamHtml.replaceAll("<!-- -->", ""),
    staticHtml,
    "renderToString must match renderToStaticMarkup modulo text-boundary comments"
  );
  assert.equal(
    /(?:^|\s)style=|dangerouslysetinnerhtml/i.test(staticHtml),
    false,
    "SSR markup must never emit inline style or raw HTML sinks"
  );
  assert.equal(
    VECTOR_PATTERN.test(staticHtml),
    false,
    "SSR markup must never emit vector tags"
  );
  const { el, doc } = mountElement(vnode);
  assert.deepEqual(
    doc.cspViolations,
    [],
    "rendering must never emit inline style, <style>, or raw HTML sinks"
  );
  assert.equal(
    serializeNode(el),
    staticHtml,
    "DOM mount serialization must match react-dom/server renderToStaticMarkup"
  );
  return staticHtml;
}

export function fireListener(
  el: SimElement,
  type: string,
  event: Record<string, unknown> = {}
): void {
  const listener = el.listeners.get(type);
  assert.ok(listener, `no "${type}" listener bound on <${el.tagName.toLowerCase()}>`);
  listener({ type, ...event });
}

export function readClasses(el: SimElement): string[] {
  return el.className.split(" ").filter(Boolean);
}

export function flushTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export async function loadModule(name: string): Promise<ModuleExports> {
  return (await import(`vespoli-ui/${name}`)) as ModuleExports;
}
