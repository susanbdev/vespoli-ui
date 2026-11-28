import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createVNode,
  loadModule,
  mountElement,
  renderMarkup
} from "./markup.ts";

const layout = await loadModule("layout");

describe("layout -- Shell, SplitView, Card", () => {
  it("Shell renders a div and surfaces loading as aria-busy + data-loading", () => {
    assert.equal(
      renderMarkup(createVNode(layout.Shell, {})),
      '<div class="vui-Shell"></div>'
    );
    const { el } = mountElement(createVNode(layout.Shell, { loading: true }));
    assert.equal(el.getAttribute("aria-busy"), "true");
    assert.equal(el.getAttribute("data-loading"), "true");
    assert.equal(el.getAttribute("loading"), null, "loading must not leak to the DOM");
  });

  it("SplitView maps ratio and collapsed to modifier classes", () => {
    const readSplitClass = (props: Record<string, unknown>) =>
      mountElement(createVNode(layout.SplitView, props)).el.className;
    assert.equal(readSplitClass({}), "vui-SplitView");
    assert.equal(readSplitClass({ ratio: "60-40" }), "vui-SplitView vui-SplitView--ratio-60-40");
    assert.equal(readSplitClass({ ratio: "70-30" }), "vui-SplitView vui-SplitView--ratio-70-30");
    assert.equal(readSplitClass({ ratio: "50-50" }), "vui-SplitView vui-SplitView--ratio-50-50");
    assert.equal(
      readSplitClass({ ratio: "50-50", collapsed: true }),
      "vui-SplitView vui-SplitView--ratio-50-50 vui-SplitView--collapsed"
    );
    assert.equal(readSplitClass({ ratio: "constructor" }), "vui-SplitView");
  });

  it("Card is a section whose md padding is the unmodified default", () => {
    const mountCard = (props: Record<string, unknown>) => mountElement(createVNode(layout.Card, props));
    assert.equal(mountCard({}).el.tagName, "SECTION");
    assert.equal(mountCard({}).el.className, "vui-Card");
    assert.equal(mountCard({ padding: "md" }).el.className, "vui-Card");
    assert.equal(mountCard({ padding: "none" }).el.className, "vui-Card vui-Card--padding-none");
    assert.equal(mountCard({ padding: "sm" }).el.className, "vui-Card vui-Card--padding-sm");
    assert.equal(mountCard({ padding: "lg" }).el.className, "vui-Card vui-Card--padding-lg");
    assert.equal(mountCard({ loading: true }).el.getAttribute("aria-busy"), "true");
  });
});

describe("layout -- Stack and Toolbar", () => {
  it("Stack composes direction, gap, align, justify, and wrap in a fixed order", () => {
    const { el } = mountElement(
      createVNode(layout.Stack, {
        direction: "row",
        gap: 4,
        align: "baseline",
        justify: "between",
        wrap: true,
        className: "k"
      })
    );
    assert.equal(
      el.className,
      "vui-Stack vui-Stack--direction-row vui-Stack--gap-4 vui-Stack--align-baseline " +
        "vui-Stack--justify-between vui-Stack--wrap k"
    );
  });

  it("Stack treats column as default and maps every valid gap (0..8), align, and justify token", () => {
    assert.equal(
      mountElement(createVNode(layout.Stack, { direction: "column" })).el.className,
      "vui-Stack"
    );
    for (const gap of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      assert.equal(
        mountElement(createVNode(layout.Stack, { gap })).el.className,
        `vui-Stack vui-Stack--gap-${gap}`
      );
    }
    for (const align of ["start", "center", "end", "stretch", "baseline"]) {
      assert.equal(
        mountElement(createVNode(layout.Stack, { align })).el.className,
        `vui-Stack vui-Stack--align-${align}`
      );
    }
    for (const justify of ["start", "center", "end", "between"]) {
      assert.equal(
        mountElement(createVNode(layout.Stack, { justify })).el.className,
        `vui-Stack vui-Stack--justify-${justify}`
      );
    }
    assert.equal(
      mountElement(createVNode(layout.Stack, { gap: 9, align: "nope", justify: "around" })).el.className,
      "vui-Stack"
    );
  });

  it("Toolbar defaults role=toolbar, allows role override, and maps all gap/justify tokens", () => {
    const { el } = mountElement(createVNode(layout.Toolbar, { gap: 2, justify: "end" }));
    assert.equal(el.getAttribute("role"), "toolbar");
    assert.equal(el.className, "vui-Toolbar vui-Toolbar--gap-2 vui-Toolbar--justify-end");
    for (const gap of [1, 2, 3, 4]) {
      assert.equal(
        mountElement(createVNode(layout.Toolbar, { gap })).el.className,
        `vui-Toolbar vui-Toolbar--gap-${gap}`
      );
    }
    for (const justify of ["start", "between", "end"]) {
      assert.equal(
        mountElement(createVNode(layout.Toolbar, { justify })).el.className,
        `vui-Toolbar vui-Toolbar--justify-${justify}`
      );
    }
    const group = mountElement(createVNode(layout.Toolbar, { role: "group" })).el;
    assert.equal(group.getAttribute("role"), "group");
    assert.equal(
      mountElement(createVNode(layout.Toolbar, { gap: 5, justify: "center" })).el.className,
      "vui-Toolbar"
    );
  });
});

describe("layout -- Heading", () => {
  it("maps level to the matching h1..h6 element and defaults to h2", () => {
    const readHeadingTag = (level?: number) =>
      mountElement(createVNode(layout.Heading, level === undefined ? {} : { level })).el.tagName;
    assert.equal(readHeadingTag(), "H2");
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(readHeadingTag), ["H1", "H2", "H3", "H4", "H5", "H6"]);
    assert.equal(readHeadingTag(7), "H2", "out-of-range level falls back to h2");
  });

  it("applies size classes, falls back to md, and never leaks size/level to the DOM", () => {
    for (const size of ["xs", "sm", "md", "lg", "xl"]) {
      const { el } = mountElement(createVNode(layout.Heading, { level: 3, size }));
      assert.equal(el.className, `vui-Heading vui-Heading--size-${size}`);
      assert.equal(el.getAttribute("size"), null);
      assert.equal(el.getAttribute("level"), null);
    }
    assert.equal(
      mountElement(createVNode(layout.Heading, { size: "huge" })).el.className,
      "vui-Heading vui-Heading--size-md"
    );
    assert.equal(
      mountElement(createVNode(layout.Heading, { size: "constructor", className: "x" })).el.className,
      "vui-Heading vui-Heading--size-md x"
    );
  });

  it("renders text children", () => {
    assert.equal(
      renderMarkup(createVNode(layout.Heading, { level: 1, children: "Title <b>" })),
      '<h1 class="vui-Heading vui-Heading--size-md">Title &lt;b&gt;</h1>'
    );
  });
});

describe("layout -- Breadcrumbs, Crumb, sanitizeHref", () => {
  it("Breadcrumbs is a nav with a fixed Breadcrumb landmark label", () => {
    const { el } = mountElement(
      createVNode(layout.Breadcrumbs, { "aria-label": "spoofed" })
    );
    assert.equal(el.tagName, "NAV");
    assert.equal(el.getAttribute("aria-label"), "Breadcrumb");
    assert.equal(el.className, "vui-Breadcrumbs");
  });

  it("sanitizeHref accepts only same-origin paths, fragments, queries, http(s), and mailto while stripping control chars", () => {
    const ok: Array<[string, string]> = [
      ["/repos/a", "/repos/a"],
      ["#frag", "#frag"],
      ["?q=1", "?q=1"],
      ["https://susanb.dev/x", "https://susanb.dev/x"],
      ["HTTP://susanb.dev", "HTTP://susanb.dev"],
      ["mailto:a@b.dev", "mailto:a@b.dev"],
      ["  https://a.dev/ \n", "https://a.dev/"],
      ["/pa th", "/path"],
      ["/repo\u007fname", "/reponame"]
    ];
    for (const [input, expected] of ok) {
      assert.equal(layout.sanitizeHref(input), expected, `input ${JSON.stringify(input)}`);
    }
  });

  it("sanitizeHref rejects scripts, data URLs, protocol-relative and relative links", () => {
    const bad: unknown[] = [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "java\u0000script:alert(1)",
      "java\u007fscript:alert(1)",
      " \n javascript:alert(1)",
      "data:text/html,x",
      "vbscript:x",
      "//evil.example/x",
      "/\\evil.example",
      "relative/path",
      "ftp://a.dev",
      "",
      "   ",
      undefined,
      null,
      42,
      {}
    ];
    for (const input of bad) {
      assert.equal(layout.sanitizeHref(input), undefined, `input ${JSON.stringify(input)}`);
    }
  });

  it("Crumb renders an anchor for safe hrefs and marks the current page", () => {
    const html = renderMarkup(
      createVNode(layout.Crumb, { href: "/repos", current: true, children: "Repos" })
    );
    assert.equal(
      html,
      '<a href="/repos" aria-current="page" class="vui-Crumb">Repos</a>'
    );
  });

  it("Crumb degrades unsafe or missing hrefs to a span without any href", () => {
    for (const href of ["javascript:alert(1)", "//evil.example", undefined, "nope"]) {
      const { el } = mountElement(createVNode(layout.Crumb, { href, children: "x" }));
      assert.equal(el.tagName, "SPAN");
      assert.equal(el.getAttribute("href"), null);
      assert.equal(el.getAttribute("aria-current"), null);
      assert.equal(el.className, "vui-Crumb");
    }
    const last = mountElement(createVNode(layout.Crumb, { current: true, className: "k" })).el;
    assert.equal(last.tagName, "SPAN");
    assert.equal(last.getAttribute("aria-current"), "page");
    assert.equal(last.className, "vui-Crumb k");
  });

  it("every layout primitive strips style and raw HTML sinks at runtime", () => {
    for (const name of ["Shell", "SplitView", "Card", "Stack", "Toolbar", "Heading", "Breadcrumbs", "Crumb"]) {
      const { el, doc } = mountElement(
        createVNode(layout[name], {
          style: { color: "red" },
          dangerouslySetInnerHTML: { __html: "<i>x</i>" }
        })
      );
      assert.equal(el.getAttribute("style"), null, name);
      assert.equal(el.getAttribute("dangerouslysetinnerhtml"), null, name);
      assert.deepEqual(doc.cspViolations, [], name);
    }
  });
});
