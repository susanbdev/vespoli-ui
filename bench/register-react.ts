import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..");
const HARNESS_URL = pathToFileURL(path.join(THIS_DIR, "dom-harness.ts")).href;

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
    return nextLoad(url, context);
  }
});
