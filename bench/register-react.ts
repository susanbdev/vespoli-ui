import { execFileSync } from "node:child_process";
import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..");
const HARNESS_URL = pathToFileURL(path.join(THIS_DIR, "dom-harness.ts")).href;

if (!fs.existsSync(path.join(REPO_ROOT, "dist", "esm", "index.js"))) {
  execFileSync(
    process.execPath,
    ["--experimental-strip-types", path.join(REPO_ROOT, "scripts", "build.ts")],
    { cwd: REPO_ROOT, stdio: "inherit" }
  );
}

const REACT_MODULE_SOURCE = `
import {
  Fragment,
  Profiler,
  StrictMode,
  createElement,
  memo,
  useEffect
} from ${JSON.stringify(HARNESS_URL)};

export { Fragment, Profiler, StrictMode, createElement, memo, useEffect };
export default { Fragment, Profiler, StrictMode, createElement, memo, useEffect };
`;

const JSX_RUNTIME_SOURCE = `
import { Fragment, createVNode } from ${JSON.stringify(HARNESS_URL)};
export { Fragment };
export const jsx = createVNode;
export const jsxs = createVNode;
export const jsxDEV = createVNode;
`;

const REACT_DOM_SERVER_SOURCE = `
import {
  REACT_ELEMENT,
  REACT_FRAGMENT,
  REACT_MEMO,
  REACT_PROFILER,
  REACT_STRICT_MODE
} from ${JSON.stringify(HARNESS_URL)};

const VOID_TAGS = new Set([
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

const BOOLEAN_ATTRS = new Set([
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

const ENUMERATED_BOOLEAN_ATTRS = new Set([
  "spellcheck",
  "draggable",
  "contenteditable"
]);

const CAMEL_ATTR_NAMES = {
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

const RCDATA_TAGS = new Set(["textarea", "title"]);
const VALID_ATTR_NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/;
const BANNED_VECTOR_TAGS = new Set(["s" + "vg", "p" + "ath"]);

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

function isElementNode(val) {
  return typeof val === "object" && val !== null && val.$$typeof === REACT_ELEMENT;
}

function isIterableNode(val) {
  return (
    typeof val === "object" &&
    val !== null &&
    !isElementNode(val) &&
    typeof val[Symbol.iterator] === "function"
  );
}

function resolveSelectedSet(raw) {
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) return new Set(raw.map((v) => String(v)));
  return new Set([String(raw)]);
}

function collectOptionText(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") {
    return String(node);
  }
  if (Array.isArray(node) || isIterableNode(node)) {
    let out = "";
    for (const sub of node) out += collectOptionText(sub);
    return out;
  }
  return "";
}

function serializeTree(node, withComments, state, selectValues) {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") {
    const str = String(node);
    if (str === "") return "";
    const prefix = withComments && state.prevWasText ? "<!-- -->" : "";
    state.prevWasText = true;
    return prefix + escapeHtml(str);
  }
  if (Array.isArray(node) || isIterableNode(node)) {
    let out = "";
    for (const item of node) {
      out += serializeTree(item, withComments, state, selectValues);
    }
    return out;
  }
  if (isElementNode(node)) {
    const { type, props } = node;
    if (
      type === REACT_FRAGMENT ||
      type === REACT_STRICT_MODE ||
      type === REACT_PROFILER
    ) {
      return serializeTree(props?.children, withComments, state, selectValues);
    }
    if (typeof type === "object" && type !== null && type.$$typeof === REACT_MEMO) {
      return serializeTree(type.type(props ?? {}), withComments, state, selectValues);
    }
    if (typeof type === "function") {
      return serializeTree(type(props ?? {}), withComments, state, selectValues);
    }
    if (typeof type === "string") {
      const tag = type.toLowerCase();
      if (tag === "style") {
        throw new Error("CSP violation: dynamic <style> element blocked");
      }
      if (BANNED_VECTOR_TAGS.has(tag)) {
        throw new Error("Law 5 violation: vector markup tag blocked");
      }
      const rawProps = props ?? {};
      const effectiveProps =
        tag === "option" && selectValues && rawProps.selected === undefined
          ? {
              ...rawProps,
              selected: selectValues.has(
                rawProps.value !== undefined && rawProps.value !== null
                  ? String(rawProps.value)
                  : collectOptionText(rawProps.children)
              )
            }
          : rawProps;

      const attrs = new Map();
      for (const [k, v] of Object.entries(effectiveProps)) {
        if (k === "children" || k === "ref") {
          continue;
        }
        if (k === "defaultChecked") {
          if (effectiveProps.checked === undefined && Boolean(v)) {
            attrs.set("checked", null);
          }
          continue;
        }
        if (k === "defaultValue") {
          if (
            tag !== "select" &&
            tag !== "textarea" &&
            effectiveProps.value === undefined &&
            v !== undefined &&
            v !== null
          ) {
            attrs.set("value", String(v));
          }
          continue;
        }
        if ((tag === "select" || tag === "textarea") && k === "value") {
          continue;
        }
        if (v === undefined || v === null) {
          continue;
        }
        if (k === "dangerouslySetInnerHTML") {
          throw new Error("CSP violation: dangerouslySetInnerHTML blocked");
        }
        if (k.toLowerCase() === "style") {
          throw new Error("CSP violation: inline style attribute blocked");
        }
        if (/^on[A-Z]/.test(k) || typeof v === "function" || typeof v === "symbol") {
          continue;
        }
        if (k === "className") {
          if (v) attrs.set("class", String(v));
          continue;
        }
        const attrName = Object.hasOwn(CAMEL_ATTR_NAMES, k) ? CAMEL_ATTR_NAMES[k] : k;
        if (!VALID_ATTR_NAME.test(attrName)) {
          throw new Error(\`Invalid HTML attribute name: \${attrName}\`);
        }
        if (typeof v === "boolean") {
          if (
            attrName.startsWith("aria-") ||
            attrName.startsWith("data-") ||
            ENUMERATED_BOOLEAN_ATTRS.has(attrName)
          ) {
            attrs.set(attrName, String(v));
          } else if (v) {
            attrs.set(attrName, BOOLEAN_ATTRS.has(attrName) ? null : "");
          }
          continue;
        }
        attrs.set(attrName, String(v));
      }

      let attrText = "";
      for (const [name, value] of attrs) {
        attrText += value === null ? \` \${name}\` : \` \${name}="\${escapeHtml(value)}"\`;
      }
      state.prevWasText = false;
      if (VOID_TAGS.has(tag)) {
        return \`<\${tag}\${attrText}>\`;
      }
      if (
        tag === "textarea" &&
        (effectiveProps.value !== undefined || effectiveProps.defaultValue !== undefined)
      ) {
        const body = escapeHtml(String(effectiveProps.value ?? effectiveProps.defaultValue ?? ""));
        return \`<\${tag}\${attrText}>\${body}</\${tag}>\`;
      }
      const nextSelect =
        tag === "select"
          ? resolveSelectedSet(effectiveProps.value ?? effectiveProps.defaultValue)
          : selectValues;
      const innerComments = RCDATA_TAGS.has(tag) ? false : withComments;
      const inner = serializeTree(
        effectiveProps.children,
        innerComments,
        { prevWasText: false },
        nextSelect
      );
      return \`<\${tag}\${attrText}>\${inner}</\${tag}>\`;
    }
  }
  return "";
}

export function renderToStaticMarkup(node) {
  return serializeTree(node, false, { prevWasText: false }, null);
}

export function renderToString(node) {
  return serializeTree(node, true, { prevWasText: false }, null);
}

export default { renderToStaticMarkup, renderToString };
`;

module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react") {
      return { url: "virtual:react", shortCircuit: true };
    }
    if (
      specifier === "react/jsx-runtime" ||
      specifier === "react/jsx-dev-runtime"
    ) {
      return { url: "virtual:react-jsx-runtime", shortCircuit: true };
    }
    if (specifier === "react-dom/server") {
      return { url: "virtual:react-dom-server", shortCircuit: true };
    }
    if (specifier === "@vespoli/styled") {
      return {
        url: pathToFileURL(
          path.join(REPO_ROOT, "packages", "styled", "src", "index.ts")
        ).href,
        shortCircuit: true
      };
    }
    if (specifier === "@vespoli/styled-compiler") {
      return {
        url: pathToFileURL(
          path.join(REPO_ROOT, "packages", "styled-compiler", "src", "index.ts")
        ).href,
        shortCircuit: true
      };
    }
    if (specifier === "vespoli-ui") {
      return {
        url: pathToFileURL(path.join(REPO_ROOT, "dist", "esm", "index.js")).href,
        shortCircuit: true
      };
    }
    if (specifier.startsWith("vespoli-ui/")) {
      const sub = specifier.slice("vespoli-ui/".length);
      const subpathFile = path.join(
        REPO_ROOT,
        "dist",
        "esm",
        "subpaths",
        `${sub}.js`
      );
      if (fs.existsSync(subpathFile)) {
        return { url: pathToFileURL(subpathFile).href, shortCircuit: true };
      }
      const directFile = path.join(REPO_ROOT, "dist", "esm", `${sub}.js`);
      if (fs.existsSync(directFile)) {
        return { url: pathToFileURL(directFile).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "virtual:react") {
      return { format: "module", source: REACT_MODULE_SOURCE, shortCircuit: true };
    }
    if (url === "virtual:react-jsx-runtime") {
      return { format: "module", source: JSX_RUNTIME_SOURCE, shortCircuit: true };
    }
    if (url === "virtual:react-dom-server") {
      return { format: "module", source: REACT_DOM_SERVER_SOURCE, shortCircuit: true };
    }
    return nextLoad(url, context);
  }
});
