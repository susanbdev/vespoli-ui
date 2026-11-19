import { TOKEN_LIST } from "../../styled/src/tokens.ts";
import { toKebab } from "./ast-pass.ts";
import type { ComponentAst } from "./ast-pass.ts";

export interface ScssBundle {
  readonly files: Readonly<Record<string, string>>;
  readonly componentPartials: readonly string[];
}

export function emitTokensScss(): string {
  const varLines = TOKEN_LIST.map(
    (entry) => `$${entry.scssVar}: ${entry.darkValue} !default;`
  ).join("\n");

  const darkCustomProps = TOKEN_LIST.map(
    (entry) => `    ${entry.cssVar}: $${entry.scssVar};`
  ).join("\n");

  const lightCustomProps = TOKEN_LIST.filter(
    (entry) => entry.lightValue !== entry.darkValue
  )
    .map((entry) => `    ${entry.cssVar}: ${entry.lightValue};`)
    .join("\n");

  return `${varLines}

@layer vui.tokens {
  :root,
  [data-theme="dark"] {
    color-scheme: dark;
${darkCustomProps}
  }

  [data-theme="light"] {
    color-scheme: light;
${lightCustomProps}
  }
}
`;
}

export function emitMixinsScss(): string {
  return `@use "./tokens" as *;

$FocusRingWidth: 2px !default;
$FocusRingOffset: 2px !default;

@layer vui.reset {
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  @font-face {
    font-family: "vui-glyphs";
    src: url("./fonts/vui-glyphs.woff2") format("woff2");
    font-display: block;
  }

  html {
    font-family: var(--vui-font-sans);
    line-height: 1.5;
    -webkit-text-size-adjust: 100%;
  }

  html,
  body {
    margin: 0;
    background: var(--vui-color-bg);
    color: var(--vui-color-text);
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
    color: inherit;
  }

  :focus-visible {
    outline: $FocusRingWidth solid var(--vui-color-focus);
    outline-offset: $FocusRingOffset;
  }
}
`;
}

export function emitGridScss(): string {
  const breakpoints: ReadonlyArray<{ bp: string; minPx: string; maxW: string }> = [
    { bp: "sm", minPx: "576px", maxW: "$ContainerSm" },
    { bp: "md", minPx: "768px", maxW: "$ContainerMd" },
    { bp: "lg", minPx: "992px", maxW: "$ContainerLg" },
    { bp: "xl", minPx: "1200px", maxW: "$ContainerXl" },
    { bp: "xxl", minPx: "1400px", maxW: "$ContainerXxl" }
  ];

  const xsSpans: string[] = [];
  for (let n = 1; n <= 12; n += 1) {
    xsSpans.push(`  .vui-c-xs-${n} { grid-column: span ${n}; }`);
  }
  xsSpans.push(`  .vui-c-xs-full { grid-column: 1 / -1; }`);
  for (let o = 0; o <= 11; o += 1) {
    xsSpans.push(`  .vui-o-xs-${o} { grid-column-start: ${o + 1}; }`);
  }

  const responsiveBlocks = breakpoints
    .map(({ bp, minPx, maxW }) => {
      const rules: string[] = [
        `    .vui-Container { max-width: ${maxW}; }`,
        `    .vui-Container--fluid-${bp} { max-width: ${maxW}; }`
      ];
      for (let n = 1; n <= 12; n += 1) {
        rules.push(`    .vui-c-${bp}-${n} { grid-column: span ${n}; }`);
      }
      rules.push(`    .vui-c-${bp}-full { grid-column: 1 / -1; }`);
      for (let o = 0; o <= 11; o += 1) {
        rules.push(`    .vui-o-${bp}-${o} { grid-column-start: ${o + 1}; }`);
      }
      return `  @media (min-width: ${minPx}) {\n${rules.join("\n")}\n  }`;
    })
    .join("\n\n");

  const gutterMap: ReadonlyArray<{ g: number; token: string }> = [
    { g: 0, token: "$space-0" },
    { g: 1, token: "$space-1" },
    { g: 2, token: "$space-2" },
    { g: 3, token: "$space-3" },
    { g: 4, token: "$space-4" },
    { g: 5, token: "$space-6" },
    { g: 6, token: "$space-8" }
  ];

  const gutterRules = gutterMap
    .map(
      ({ g, token }) => `  .vui-g-${g} {
    column-gap: ${token};
    row-gap: ${token};
  }
  .vui-gy-${g} {
    row-gap: ${token};
  }`
    )
    .join("\n");

  return `@use "./tokens" as *;

$GridColumns: 12 !default;
$GridGutter: $space-4 !default;
$ContainerSm: 540px !default;
$ContainerMd: 720px !default;
$ContainerLg: 960px !default;
$ContainerXl: 1140px !default;
$ContainerXxl: 1320px !default;

@layer vui.grid {
  .vui-Container {
    width: 100%;
    margin-inline: auto;
    padding-inline: $GridGutter;
  }

  .vui-Row {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    column-gap: $GridGutter;
    row-gap: $GridGutter;
    min-width: 0;
  }

  .vui-Row--align-start {
    align-items: start;
  }
  .vui-Row--align-center {
    align-items: center;
  }
  .vui-Row--align-end {
    align-items: end;
  }
  .vui-Row--align-stretch {
    align-items: stretch;
  }

${gutterRules}

  .vui-Col {
    min-width: 0;
    grid-column: span 12 / span 12;
  }

${xsSpans.join("\n")}

${responsiveBlocks}

  .vui-Container--fluid {
    max-width: 100%;
  }
}
`;
}

export function emitTransitionsScss(): string {
  return `@use "./tokens" as *;

@layer vui.transitions {
  @view-transition {
    navigation: auto;
  }

  [data-vui-morph="active"] {
    view-transition-name: vui-focal-morph;
    opacity: 1;
    transition: none;
  }

  [data-vui-morph-hidden="true"] {
    visibility: hidden;
  }

  ::view-transition-group(vui-focal-morph) {
    animation-duration: 220ms;
    animation-timing-function: var(--vui-ease-out-expo);
  }

  ::view-transition-old(vui-focal-morph),
  ::view-transition-new(vui-focal-morph) {
    height: 100%;
    width: 100%;
    overflow: clip;
    object-fit: none;
    object-position: top left;
  }

  ::view-transition-old(vui-focal-morph) {
    animation-duration: 55ms;
  }

  @keyframes vui-slide-left {
    from { transform: translateX(24px) scale(0.97); opacity: 0; }
  }
  @keyframes vui-slide-right {
    from { transform: translateX(-24px) scale(0.97); opacity: 0; }
  }
  @keyframes vui-slide-up {
    from { transform: translateY(18px) scale(0.97); opacity: 0; }
  }
  @keyframes vui-slide-down {
    from { transform: translateY(-18px) scale(0.97); opacity: 0; }
  }
  @keyframes vui-iris-open {
    from { clip-path: inset(35% round var(--vui-radius-lg)); opacity: 0.4; }
  }
  @keyframes vui-shimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
  }

  html:active-view-transition-type(left, right, up, down, iris)::view-transition-new(root) {
    animation-duration: 200ms;
    animation-timing-function: var(--vui-ease-out-expo);
  }
  html:active-view-transition-type(left)::view-transition-new(root) { animation-name: vui-slide-left; }
  html:active-view-transition-type(right)::view-transition-new(root) { animation-name: vui-slide-right; }
  html:active-view-transition-type(up)::view-transition-new(root) { animation-name: vui-slide-up; }
  html:active-view-transition-type(down)::view-transition-new(root) { animation-name: vui-slide-down; }
  html:active-view-transition-type(iris)::view-transition-new(root) { animation-name: vui-iris-open; }

  @media (prefers-reduced-motion: no-preference) {
    html:not(:active-view-transition) dialog[open]:not([data-vui-morph="active"]),
    html:not(:active-view-transition) dialog[open]::backdrop {
      opacity: 1;
      transition: opacity 160ms var(--vui-ease-out-expo), display 160ms allow-discrete, overlay 160ms allow-discrete;
      @starting-style {
        opacity: 0;
      }
    }

    details[open]::details-content {
      opacity: 1;
      transition: opacity 140ms var(--vui-ease-out-expo), content-visibility 140ms allow-discrete;
      @starting-style {
        opacity: 0;
      }
    }

    [data-loading="true"] {
      background-image: linear-gradient(90deg, transparent, #5eead424, transparent);
      background-size: 200% 100%;
      animation: vui-shimmer 1.2s linear infinite;
    }
  }
}

@layer vui.utilities {
  .vui-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
`;
}

export function emitComponentScss(comp: ComponentAst): string {
  const varHeader = comp.mintedVars
    .map((mv) => `$${mv.name}: ${mv.defaultExpr} !default;`)
    .join("\n");

  const ruleBlocks: string[] = [];
  for (const rule of comp.propRules) {
    const modClass =
      rule.matchValue === true
        ? `.vui-${comp.name}--${toKebab(rule.prop)}`
        : `.vui-${comp.name}--${toKebab(rule.prop)}-${rule.matchValue}`;
    ruleBlocks.push(`  ${modClass} {\n${indentLines(rule.cssBody, 4)}\n  }`);
  }

  const baseBlock =
    comp.baseCss.trim().length > 0
      ? `  .vui-${comp.name} {\n${indentLines(comp.baseCss, 4)}\n  }`
      : "";
  const extraSpacerRules =
    comp.name === "VirtualSpacer"
      ? Array.from(
          { length: 18 },
          (_, b) => `  [data-bit="${b}"] { height: ${36 * 2 ** b}px; }`
        ).join("\n")
      : "";
  const allBlocks = [baseBlock, extraSpacerRules, ...ruleBlocks].filter(
    (s) => s.length > 0
  );

  const rowHeightHeader =
    comp.name === "VirtualSpacer" ? "$RowHeight: 36px !default;\n" : "";
  const combinedVars = [rowHeightHeader, varHeader]
    .filter((s) => s.length > 0)
    .join("\n");
  const prefix = combinedVars ? `${combinedVars}\n\n` : "";
  return `@use "../tokens" as *;

${prefix}@layer vui.components {
${allBlocks.join("\n\n")}
}
`;
}

export function emitScssBundle(components: readonly ComponentAst[]): ScssBundle {
  const files: Record<string, string> = {
    "_tokens.scss": emitTokensScss(),
    "_mixins.scss": emitMixinsScss(),
    "_grid.scss": emitGridScss(),
    "_transitions.scss": emitTransitionsScss()
  };

  const componentPartials: string[] = [];
  const seenNames = new Set<string>();

  for (const comp of components) {
    if (seenNames.has(comp.name)) continue;
    seenNames.add(comp.name);
    // Grid primitives live in `@layer vui.grid` (`_grid.scss`); skip duplicating empty shells unless custom CSS exists
    if (
      (comp.name === "Container" || comp.name === "Row" || comp.name === "Col") &&
      comp.baseCss.trim().length === 0 &&
      comp.propRules.length === 0
    ) {
      continue;
    }
    const kebab = toKebab(comp.name);
    const relPath = `components/_${kebab}.scss`;
    files[relPath] = emitComponentScss(comp);
    componentPartials.push(relPath);
  }

  const useStatements = [
    '@use "./tokens" as *;',
    '@use "./mixins";',
    '@use "./grid";',
    ...componentPartials.map(
      (p) => `@use "./${p.replace("components/_", "components/").replace(/\.scss$/, "")}";`
    ),
    '@use "./transitions";'
  ].join("\n");

  files["index.scss"] = `@layer vui.reset, vui.tokens, vui.grid, vui.components, vui.transitions, vui.utilities;
${useStatements}
`;

  return { files, componentPartials };
}

function indentLines(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .trim()
    .split("\n")
    .map((line) => (line.trim().length > 0 ? `${pad}${line.trim()}` : ""))
    .filter((l) => l.length > 0)
    .join("\n");
}
