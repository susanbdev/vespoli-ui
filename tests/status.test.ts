import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createVNode,
  loadModule,
  mountElement,
  renderMarkup
} from "./markup.ts";

const status = await loadModule("status");

const FONT_GLYPHS: ReadonlyArray<readonly [string, number]> = [
  ["shield", 0xe001],
  ["branch", 0xe002],
  ["lock", 0xe003],
  ["merkle", 0xe004],
  ["commit", 0xe005],
  ["snapshot", 0xe006],
  ["alert", 0xe007],
  ["terminal", 0xe008]
];

const CSS_GLYPHS: readonly string[] = [
  "chevron-right",
  "chevron-down",
  "chevron-left",
  "chevron-up",
  "check",
  "close",
  "sort",
  "dot"
];

describe("status -- Badge, ProofBadge, DigestChip", () => {
  it("Badge maps tones and treats neutral as the unmodified default", () => {
    const readBadgeClass = (tone: unknown) =>
      mountElement(createVNode(status.Badge, { tone })).el.className;
    assert.equal(readBadgeClass(undefined), "vui-Badge");
    assert.equal(readBadgeClass("neutral"), "vui-Badge");
    assert.equal(readBadgeClass("accent"), "vui-Badge vui-Badge--tone-accent");
    assert.equal(readBadgeClass("success"), "vui-Badge vui-Badge--tone-success");
    assert.equal(readBadgeClass("warn"), "vui-Badge vui-Badge--tone-warn");
    assert.equal(readBadgeClass("danger"), "vui-Badge vui-Badge--tone-danger");
    assert.equal(readBadgeClass("constructor"), "vui-Badge");
    assert.equal(mountElement(createVNode(status.Badge, {})).el.tagName, "SPAN");
  });

  it("ProofBadge composes Badge classes with the verified modifier", () => {
    assert.equal(
      renderMarkup(createVNode(status.ProofBadge, { tone: "success", verified: true, children: "ok" })),
      '<span class="vui-Badge vui-ProofBadge vui-Badge--tone-success vui-ProofBadge--verified">ok</span>'
    );
    assert.equal(
      mountElement(createVNode(status.ProofBadge, {})).el.className,
      "vui-Badge vui-ProofBadge"
    );
    assert.equal(
      mountElement(createVNode(status.ProofBadge, { verified: true })).el.getAttribute("verified"),
      null,
      "verified must not leak as an attribute"
    );
  });

  it("DigestChip is a type=button button with its own tone namespace", () => {
    const { el } = mountElement(
      createVNode(status.DigestChip, { tone: "warn", children: "sha256:ab12" })
    );
    assert.equal(el.tagName, "BUTTON");
    assert.equal(el.getAttribute("type"), "button");
    assert.equal(el.className, "vui-DigestChip vui-DigestChip--tone-warn");
    for (const tone of ["accent", "success", "warn", "danger"]) {
      assert.equal(
        mountElement(createVNode(status.DigestChip, { tone })).el.className,
        `vui-DigestChip vui-DigestChip--tone-${tone}`
      );
    }
    assert.equal(
      mountElement(createVNode(status.DigestChip, { type: "submit" })).el.getAttribute("type"),
      "submit"
    );
    assert.equal(
      mountElement(createVNode(status.DigestChip, { tone: "neutral" })).el.className,
      "vui-DigestChip"
    );
    assert.equal(
      mountElement(createVNode(status.DigestChip, { tone: "constructor" })).el.className,
      "vui-DigestChip"
    );
  });
});

describe("status -- Notice and AlertBanner", () => {
  it("Notice defaults to role=status and maps severities", () => {
    const { el } = mountElement(createVNode(status.Notice, { severity: "danger" }));
    assert.equal(el.getAttribute("role"), "status");
    assert.equal(el.className, "vui-Notice vui-Notice--severity-danger");
    for (const sev of ["info", "warn", "danger", "critical"]) {
      assert.equal(
        mountElement(createVNode(status.Notice, { severity: sev })).el.className,
        `vui-Notice vui-Notice--severity-${sev}`
      );
    }
    assert.equal(mountElement(createVNode(status.Notice, {})).el.className, "vui-Notice");
    assert.equal(
      mountElement(createVNode(status.Notice, { severity: "constructor" })).el.className,
      "vui-Notice"
    );
  });

  it("AlertBanner is an assertive alert built on the Notice styling across all severities", () => {
    assert.equal(
      renderMarkup(createVNode(status.AlertBanner, { severity: "critical", children: "Breach" })),
      '<div role="alert" class="vui-Notice vui-AlertBanner vui-Notice--severity-critical">Breach</div>'
    );
    for (const sev of ["info", "warn", "danger", "critical"]) {
      assert.equal(
        mountElement(createVNode(status.AlertBanner, { severity: sev })).el.className,
        `vui-Notice vui-AlertBanner vui-Notice--severity-${sev}`
      );
    }
    assert.equal(
      mountElement(createVNode(status.AlertBanner, {})).el.className,
      "vui-Notice vui-AlertBanner"
    );
    assert.equal(
      mountElement(createVNode(status.AlertBanner, { role: "status" })).el.getAttribute("role"),
      "status"
    );
  });
});

describe("status -- Metrics and MetricItem", () => {
  it("Metrics is a section and MetricItem an article with trend modifiers", () => {
    assert.equal(mountElement(createVNode(status.Metrics, {})).el.tagName, "SECTION");
    assert.equal(mountElement(createVNode(status.Metrics, {})).el.className, "vui-Metrics");
    const readMetricClass = (trend: unknown) =>
      mountElement(createVNode(status.MetricItem, { trend })).el.className;
    assert.equal(readMetricClass(undefined), "vui-MetricItem");
    assert.equal(readMetricClass("up"), "vui-MetricItem vui-MetricItem--trend-up");
    assert.equal(readMetricClass("down"), "vui-MetricItem vui-MetricItem--trend-down");
    assert.equal(readMetricClass("flat"), "vui-MetricItem vui-MetricItem--trend-flat");
    assert.equal(readMetricClass("sideways"), "vui-MetricItem");
    assert.equal(mountElement(createVNode(status.MetricItem, {})).el.tagName, "ARTICLE");
  });
});

describe("status -- Icon", () => {
  it("maps each named WOFF2 glyph to its private-use code point and font mode", () => {
    for (const [name, codePoint] of FONT_GLYPHS) {
      const { el } = mountElement(createVNode(status.Icon, { name }));
      assert.equal(el.tagName, "SPAN");
      assert.equal(el.getAttribute("data-icon"), name);
      assert.equal(el.getAttribute("data-glyph"), "font");
      assert.equal(el.getAttribute("aria-hidden"), "true");
      assert.equal(el.children.length, 1);
      assert.equal((el.children[0] as string).codePointAt(0), codePoint, name);
      assert.equal((el.children[0] as string).length, 1);
    }
    const unique = new Set(
      FONT_GLYPHS.map(([name]) => mountElement(createVNode(status.Icon, { name })).el.children[0])
    );
    assert.equal(unique.size, 8, "glyphs must be distinct");
  });

  it("renders all 8 pure-CSS geometric affordances with data-glyph=css and empty content", () => {
    for (const name of CSS_GLYPHS) {
      assert.equal(
        renderMarkup(createVNode(status.Icon, { name })),
        `<span aria-hidden="true" data-icon="${name}" data-glyph="css" class="vui-Icon vui-Icon--size-md"></span>`
      );
    }
  });

  it("falls back to CSS-only rendering for unknown or prototype-key names", () => {
    for (const name of ["missing", "constructor", "__proto__", "toString", undefined]) {
      const { el } = mountElement(createVNode(status.Icon, { name }));
      assert.equal(el.getAttribute("data-glyph"), "css", String(name));
      assert.equal(el.children.length, 0, String(name));
    }
  });

  it("maps size with an md fallback and appends className", () => {
    const readIconClass = (props: Record<string, unknown>) =>
      mountElement(createVNode(status.Icon, { name: "lock", ...props })).el.className;
    assert.equal(readIconClass({}), "vui-Icon vui-Icon--size-md");
    assert.equal(readIconClass({ size: "sm" }), "vui-Icon vui-Icon--size-sm");
    assert.equal(readIconClass({ size: "lg", className: "k" }), "vui-Icon vui-Icon--size-lg k");
    assert.equal(readIconClass({ size: "xl" }), "vui-Icon vui-Icon--size-md");
    assert.equal(readIconClass({ size: "constructor" }), "vui-Icon vui-Icon--size-md");
  });

  it("is decorative by default but lets callers override aria-hidden", () => {
    assert.equal(
      mountElement(createVNode(status.Icon, { name: "alert", "aria-hidden": "false", role: "img" })).el
        .getAttribute("aria-hidden"),
      "false"
    );
  });
});

describe("status -- security", () => {
  it("every status primitive strips style and dangerouslySetInnerHTML", () => {
    const names = [
      "Badge",
      "ProofBadge",
      "DigestChip",
      "Notice",
      "AlertBanner",
      "Metrics",
      "MetricItem",
      "Icon"
    ];
    for (const name of names) {
      const { el, doc } = mountElement(
        createVNode(status[name], {
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
