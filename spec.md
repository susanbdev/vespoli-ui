# `vespoli-ui` v1.0 — Canonical Architecture & Engineering Specification

**Repository**: `susanbdev/vespoli-ui`  
**Status**: Canonical v1.0 Specification  
**Target Runtime**: React `^18.3.0 || ^19.0.0` (Peer Dependency Only), Modern Evergreen Browsers, SSR/RSC-Safe  
**Runtime Style Overhead**: `0 bytes`  
**SVG Footprint**: `0 elements / 0 files`

---

## 1. Mission & Non-Negotiable First-Principles Laws

`vespoli-ui` is a dumb, stateless, accessible, ultra-fast React component library engineered from first principles for:
1. **Minimum Time-to-First-Paint (TTFP)** and **minimum re-rendered frames**.
2. **Maximum human developer ergonomics** (`0%`, `50%`, or `100%` styling control with zero configuration tax).
3. **Zero-gotcha AI coding agent accuracy** (~100% valid, accessible Turn-1 code generation without hidden conventions).

Every file in this repository **MUST** obey seven architectural laws:

### Law 1 — 100% Dumb, Stateless `1-In → 1-Out` Primitives (`Props → Element`)
* Every component and helper **MUST** be a single-focus `1-in → 1-out` pure function (`Props → JSX.Element`) with zero external runtime dependencies.
* The following APIs are **strictly banned** inside `packages/ui/src/**`: `useState`, `useReducer`, `useContext`, `createContext`, `useSyncExternalStore`, `fetch`, `XMLHttpRequest`, `WebSocket`, timers (`setTimeout`, `setInterval`), and mutable module-level state.
* **Permitted DOM-only synchronization**:
  1. Calling native `HTMLDialogElement.showModal()` / `close()` inside an effect when a controlled `open: boolean` prop changes.
  2. Handing off an `HTMLCanvasElement` via `transferControlToOffscreen()` to a visualization worker.
  3. A single passive capture listener (`pointerdown` / `keydown`) recording a `WeakRef<HTMLElement>` to the last user-activated interactive trigger for origin-bound view transitions (Law 7).

### Law 2 — 1 JSX Tag = 1 Honest Native HTML Element & Domain Noun / Verb Ontology
* Every exported component **MUST** render **exactly one** semantic HTML element matching its name and purpose (`Button` $\to$ `<button>`, `Input` $\to$ `<input>`, `Checkbox` $\to$ `<input type="checkbox">`, `Select` $\to$ `<select>`, `Dialog` $\to$ `<dialog>`, `Disclosure` $\to$ `<details>`, `Summary` $\to$ `<summary>`, `Table` $\to$ `<table>`, `CanvasStage` $\to$ `<canvas>`, `Card` $\to$ `<section>`).
* **Domain Nouns = Components & Data; Verbs = Functions**: Components, props interfaces, and modules are **Domain Nouns** describing what they **are** (`1–2` words by default: `Button`, `IconButton`, `FacetList`, `ChipBar`, `HeaderCell`, `RangeBar`; `3`-word hard ceiling **only** when removing genuine ambiguity). Standalone helpers and transitions are **Verbs** (`transitionTo()`, `trackOrigin()`, `moveFocus()`). Catch-all `utils`, `helpers`, and `common` files are banned.
* **Hidden wrapper `<div>`s are banned.** No component may secretly wrap an `<input>` or `<button>` inside an extra `<div>` or `<span>`.
* **`slots` and `slotClasses` APIs are banned.** Multi-element structures are built strictly through explicit JSX composition (`<Field><Label htmlFor="id">Name</Label><Input id="id" /></Field>`).
* **`*Container`, `*Root`, `*Wrapper`, and `*Contract` suffixes on component/type names or SCSS variables are banned.** The component's PascalCase noun (`Button`, `Input`, `Field`, `Card`) **is always** its outer box.

### Law 3 — Colocated `styled` Templates Extracted Statically to Idiomatic SCSS (`0 B` Runtime)
* Components are authored with colocated `styled.<tag>` tagged template literals (`@vespoli/styled`) using real kebab-case CSS, `&` nesting (`&.active`, `&:checked`, `&[open]`, `&:hover:not(:disabled)`), native CSS `transition` rules, and ~22 flat semantic tokens.
* During compilation (`@vespoli/styled-compiler`), all `styled` and `css` tagged templates **MUST** be statically erased from JavaScript and emitted as:
  1. Modular, human-readable `.scss` partials (`dist/scss/`) with `!default` component variables (`$ButtonPaddingX`, `$InputRadius`, etc.) and CSS `@layer` scoping.
  2. Precompiled, minified `.css` bundles (`dist/styles.css` and per-component `dist/css/<Component>.css`) compiled via Grass (Rust Sass) + LightningCSS.
  3. Zero-dependency ESM JavaScript (`dist/esm/`) containing **zero** runtime CSS parsers, **zero** `<style>` sheet mutations, **zero** runtime prop-filtering loops, and **zero** wrapper Fiber components.

### Law 4 — Zero Inline `style` Attributes (Strict `style-src 'self'` CSP + Zero Object Churn)
* Emitting JSX `style={{ ... }}` or DOM `style="..."` attributes is **banned** across all components.
* Dynamic alignment, sizing, and state **MUST** map to typed props compiled into static classes or `data-*` attributes.
* Applications consuming `vespoli-ui` **MUST** function without violation under:
  ```http
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'
  ```

### Law 5 — Hard Zero-SVG Mandate (`svg_count == 0`) & `OffscreenCanvas` Data Viz
* `<svg>`, `<path>`, `.svg` asset files, and `data:image/svg+xml` URIs are **banned** across source, tests, docs, and build outputs.
* **UI Icons & Affordances**: Simple directional/state indicators (chevrons, carets, checkmarks, close `×`, sort indicators, disclosure arrows, status dots) **MUST** use pure CSS geometric borders/transforms on a single `<span>` (`0 B` network cost). Complex monochrome symbols (`shield`, `branch`, `lock`, `merkle`, `commit`, `snapshot`, `alert`, `terminal`) **MUST** use the bundled sub-`2 KB` subset WOFF2 monochrome glyph font (`font-display: block`, `aria-hidden="true"`), rendered via the OS/GPU glyph atlas with native `currentColor` and `forced-colors` support.
* **Inline Branch/Commit Graphs (`DagRail`)**: **MUST** use pure CSS box/arc lane `<span>`s (`::before` solid/dashed hairlines + `::after` `border-radius` quarter-circle connectors + circular node rings).
* **High-Scale Data Visualization (`CanvasStage`, `RangeBar`, `HeatmapCanvas`)**: **MUST** use `styled.canvas` (`1 tag = 1 <canvas>`) with `OffscreenCanvas` worker rendering over binary typed arrays (`Float32Array` / `Uint32Array` `SeriesFrame` buffers wire-compatible with `@susanbdev/shared/primitives/codec`), capable of rendering and smoothly transitioning `100,000+` points at `60–120 fps` with `0` React re-renders.

### Law 6 — Bootstrap-Ergonomic 12-Column Structural Grid (`Container` / `Row` / `Col`)
* Flexbox **MUST NEVER** be used as a 2D page/section column grid (`min-width: auto` content blowouts on long SHAs, URLs, `<pre>` blocks, and wide tables are unacceptable).
* Structural page and section layouts **MUST** use `Container` $\to$ `Row` $\to$ `Col` implementing Bootstrap's 12-column responsive contract (`xs`, `sm`, `md`, `lg`, `xl`, `xxl`, offsets, gutters, `fluid`) over **rigid CSS Grid tracks** (`display: grid; grid-template-columns: repeat(12, minmax(0, 1fr))`) and native `gap`.
* 1D Flexbox primitives (`Stack`, `Toolbar`) **MUST** be used strictly *inside* structured `<Col>` elements for linear alignment and distribution.

### Law 7 — Conservation of UI Matter (Nothing Ever Appears Out of Thin Air)
* Standalone disembodied `<Spinner />` components and teleporting modals/views are **banned**.
* Every reveal, navigation, modal open/close, and async loading state **MUST** physically originate from (and collapse back into) the interactive element the user activated, using native C++ GPU compositor View Transitions (`document.startViewTransition`, `@view-transition`, `:active-view-transition-type(...)`), `@starting-style`, and `transition-behavior: allow-discrete`—with **zero** rubber-stretched text (`overflow: clip; object-fit: none`) and **zero** JS spring/animation libraries.

---

## 2. Repository & Package Architecture

```text
vespoli-ui/
├── spec.md                         # Canonical specification (this file)
├── README.md
├── package.json                    # Workspace root (private)
├── tsconfig.base.json
├── packages/
│   ├── styled/                     # @vespoli/styled — compile-time types & authoring tags (0 B runtime)
│   │   └── src/
│   │       ├── index.ts            # styled.<tag>, styled(Comp), css, media, t
│   │       └── tokens.ts           # ~22 flat semantic token definitions
│   ├── styled-compiler/            # @vespoli/styled-compiler — TS + LightningCSS -> ESM + SCSS + CSS
│   │   └── src/
│   │       ├── ast-pass.ts         # Type-driven prop stripping, JSX fiber inlining, VUIxxx diagnostics
│   │       ├── scss-emitter.ts     # Emits _tokens.scss, _mixins.scss, _<Component>.scss + !default vars
│   │       ├── css-builder.ts      # Grass (Rust Sass) + LightningCSS bundler
│   │       ├── vite.ts             # Optional Vite/Rollup plugin for Tier-3 consumer apps
│   │       └── esbuild.ts          # Optional esbuild plugin for Tier-3 consumer apps
│   └── ui/                         # vespoli-ui — published zero-dependency component library
│       ├── package.json
│       ├── AGENT.md                # < 3 KB (~800 token) machine-readable ground truth for AI agents
│       ├── assets/
│       │   └── vui-glyphs.woff2    # < 2 KB monochrome subset glyph font
│       └── src/
│           ├── index.ts            # Single flat tree-shakeable barrel (sideEffects: false)
│           ├── grid.tsx            # Container, Row, Col (12-col CSS Grid)
│           ├── layout.tsx          # Shell, Card, SplitView, Stack, Toolbar, Heading, Breadcrumbs
│           ├── controls.tsx        # Button, IconButton, Input, Select, Checkbox, Label, Field, Segments, Tabs, Pagination
│           ├── filter.tsx          # FacetBar, FacetGroup, FacetList, ChipBar
│           ├── table.tsx           # Table, TableHead, TableBody, TableRow, HeaderCell, TableCell, VirtualTable, TreeTable
│           ├── data.tsx            # Properties, PropertyItem, Disclosure, Summary, Code, CodeBlock, JsonTree, Empty
│           ├── status.tsx          # Badge, ProofBadge, DigestChip, Notice, AlertBanner, Metrics, MetricItem, Icon
│           ├── overlay.tsx         # Dialog, Inspector
│           ├── canvas.tsx          # CanvasStage, RangeBar, HeatmapCanvas + offscreen worker protocol
│           ├── transitions.ts      # Origin WeakRef tracker, transitionTo(), aperture morph helpers
│           └── a11y.ts             # Pure stateless roving-tabindex & keyboard navigation functions
├── bench/
│   ├── budgets.json                # Enforced byte, render-ms, re-render-count, a11y, CSP, and 0-SVG budgets
│   └── run-bench.ts                # Playwright + Lighthouse + React <Profiler> verification harness
└── scripts/
    ├── check-package.ts            # Verifies 0 runtime style bytes, 0 inline styles, 0 <svg>, export integrity
    └── check-scss.ts               # Compiles every generated _*.scss partial standalone & checks determinism
```

---

## 3. Semantic Token System (Flat, Context-Free, ~22 Tokens Total)

Fat nested JavaScript theme objects and `<ThemeProvider>` components are **prohibited**. `vespoli-ui` defines a flat set of semantic tokens in `dist/scss/_tokens.scss` (with `!default` flags for compile-time SCSS overrides) mirrored to `--vui-*` CSS custom properties inside `@layer vui.tokens`:

| Token (`t.*`) | SCSS Variable (`!default`) | CSS Custom Property | Default Dark-First Value | Semantic Role |
| :--- | :--- | :--- | :--- | :--- |
| `t.color.bg` | `$color-bg` | `--vui-color-bg` | `#0b0d10` | App canvas background |
| `t.color.surface` | `$color-surface` | `--vui-color-surface` | `#12161b` | Primary card / table / panel surface |
| `t.color.raised` | `$color-raised` | `--vui-color-raised` | `#181d24` | Interactive control resting fill |
| `t.color.raisedHover` | `$color-raised-hover` | `--vui-color-raised-hover` | `#202731` | Interactive control hover fill |
| `t.color.overlay` | `$color-overlay` | `--vui-color-overlay` | `#161b22` | Top-layer `<dialog>` / popover surface |
| `t.color.text` | `$color-text` | `--vui-color-text` | `#ecf0f5` | Primary ink (WCAG AAA contrast on `bg`/`surface`) |
| `t.color.muted` | `$color-muted` | `--vui-color-muted` | `#93a0b0` | Secondary metadata ink (`>= 4.8:1` contrast) |
| `t.color.border` | `$color-border` | `--vui-color-border` | `#262f3b` | Hairline structural border |
| `t.color.borderStrong` | `$color-border-strong` | `--vui-color-border-strong` | `#3a4758` | Emphasized / active input border |
| `t.color.focus` | `$color-focus` | `--vui-color-focus` | `#5eead4` | `2px` `:focus-visible` ring color |
| `t.color.accent` | `$color-accent` | `--vui-color-accent` | `#5eead4` | Primary brand / active state accent |
| `t.color.accentHover` | `$color-accent-hover` | `--vui-color-accent-hover` | `#99f6e4` | Primary accent hover |
| `t.color.accentInk` | `$color-accent-ink` | `--vui-color-accent-ink` | `#06201d` | High-contrast ink on `$color-accent` |
| `t.color.success` / `warn` / `danger` | `$color-success`, `$color-warn`, `$color-danger` | `--vui-color-success`, `--vui-color-warn`, `--vui-color-danger` | `#34d399` / `#fbbf24` / `#f87171` | Semantic status & triage severity inks (with matching `*-surface` & `*-border` pairs) |
| `t.space[0..8]` | `$space-0` .. `$space-8` | `--vui-space-0` .. `--vui-space-8` | `0, 4px, 8px, 12px, 16px, 20px, 24px, 32px, 48px` | Spacing & gutter scale |
| `t.radius.{sm,md,lg,pill}` | `$radius-sm..pill` | `--vui-radius-sm..pill` | `4px, 6px, 10px, 9999px` | Corner radius scale |
| `t.size.control.{sm,md,lg}` | `$size-control-sm..lg` | `--vui-size-control-sm..lg` | `28px, 34px, 40px` | Interactive control heights |
| `t.font.{sans,mono}` | `$font-sans`, `$font-mono` | `--vui-font-sans`, `--vui-font-mono` | System UI stack / Tabular monospace stack | Typography families |
| `t.ease.{outExpo,tactile}` | `$EaseOutExpo`, `$EaseTactile` | `--vui-ease-out-expo`, `--vui-ease-tactile` | `cubic-bezier(0.16, 1, 0.3, 1)`, `cubic-bezier(0.32, 1.25, 0.64, 1)` | Spatial & interactive transition physics |

---

## 4. `@vespoli/styled-compiler` — Transpile-Time `styled` $\to$ SCSS Specification

### 4.1 Authoring Syntax
Authors write standard `styled-components` tagged templates with typed style props—**without** `$prop` prefixes:

```tsx
import { styled, css, media, t } from '@vespoli/styled';

export interface ButtonStyleProps {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  compact?: boolean;
  loading?: boolean;
}

export const Button = styled.button.attrs({ type: 'button' })<ButtonStyleProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${t.space[2]};
  min-height: ${t.size.control.md};
  padding: ${t.space[2]} ${t.space[3]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.md};
  background: ${t.color.raised};
  color: ${t.color.text};
  cursor: pointer;
  white-space: nowrap;
  text-decoration: none;

  &:hover:not(:disabled) {
    background: ${t.color.raisedHover};
  }

  &.active {
    border-color: ${t.color.accent};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  ${media.motionAllowed`
    transition: background 120ms ${t.ease.outExpo}, color 120ms ${t.ease.outExpo}, border-color 120ms ${t.ease.outExpo};
  `}

  ${media.forcedColors`
    border: 1px solid ButtonText;
  `}

  ${p => p.variant === 'primary' && css`
    background: ${t.color.accent};
    color: ${t.color.accentInk};
    border-color: ${t.color.accent};
    font-weight: 600;
    &:hover:not(:disabled) {
      background: ${t.color.accentHover};
    }
  `}

  ${p => p.variant === 'quiet' && css`
    background: transparent;
    border-color: transparent;
    color: ${t.color.muted};
  `}

  ${p => p.variant === 'danger' && css`
    background: ${t.color.dangerSurface};
    color: ${t.color.danger};
    border-color: ${t.color.dangerBorder};
  `}

  ${p => p.compact && css`
    min-height: ${t.size.control.sm};
    padding: ${t.space[1]} ${t.space[2]};
  `}
`;
```

### 4.2 Deterministic AST Transformation Rules
1. **Compile-Time Style-Prop Stripping (Zero `$` Prefix Tax)**:
   * `@vespoli/styled-compiler` inspects the generic type parameter `<ButtonStyleProps>` via the TypeScript TypeChecker.
   * Every property declared on `<ButtonStyleProps>` (`variant`, `compact`, `loading`) MUST have a finite boolean or string/number literal union domain (`'primary' | 'secondary' | ...`, `1 | 2 | ... | 12`).
   * If an interpolation references an unbounded dynamic type (`number`, `string`) or runtime function call, compilation **MUST** fail with `VUI001` and an explicit fix suggestion.
   * Extracted style props are destructured out of the generated React function parameters so they **never** forward onto the underlying HTML element (`variant` never leaks onto `<button>`).
2. **Auto-Minted `$ComponentProperty: ... !default` SCSS Variables**:
   * For every exported `const <ComponentName> = styled.<tag>...`, root-level box declarations (`padding` $\to$ `$<ComponentName>PaddingY` / `$<ComponentName>PaddingX`, `min-height` $\to$ `$<ComponentName>MinHeight`, `border-radius` $\to$ `$<ComponentName>Radius`, `gap` $\to$ `$<ComponentName>Gap`) are automatically hoisted as `!default` SCSS variables at the top of `dist/scss/components/_<kebab-name>.scss`.
3. **Component Selector Interpolation & Extension**:
   * `& > ${Button} { ... }` resolves statically to `& > .vui-Button { ... }`.
   * `const CustomBtn = styled(Button)\`...\`` emits `.vui-CustomBtn` composed after `.vui-Button` with zero nested React Fiber wrappers.
4. **File-Local JSX Fiber Inlining**:
   * Any non-exported `const Inner = styled.<tag>\`...\`` referenced as `<Inner />` inside the same file compiles directly to `_jsx("<tag>", { className: "vui-Inner" })`—creating **zero** intermediate React component function calls.

### 4.3 Required Compiler Outputs (Example: `Button`)
* **JavaScript Output (`dist/esm/controls/Button.js`)**:
  ```js
  import { jsx as _jsx } from "react/jsx-runtime";
  const _variant = {
    primary: " vui-Button--variant-primary",
    secondary: "",
    quiet: " vui-Button--variant-quiet",
    danger: " vui-Button--variant-danger",
  };
  export function Button({
    variant = "secondary",
    compact = false,
    loading = false,
    type = "button",
    disabled,
    className,
    ...props
  }) {
    return _jsx("button", {
      type,
      disabled: disabled || loading,
      "aria-busy": loading || undefined,
      "data-loading": loading ? "true" : undefined,
      className:
        "vui-Button" +
        (_variant[variant] || "") +
        (compact ? " vui-Button--compact" : "") +
        (className ? " " + className : ""),
      ...props,
    });
  }
  ```
* **SCSS Output (`dist/scss/components/_button.scss`)**:
  * Declares `$ButtonMinHeight`, `$ButtonPaddingY`, `$ButtonPaddingX`, `$ButtonRadius` with `!default`.
  * Scopes `.vui-Button` inside `@layer vui.components`.
  * Compiles standalone via `sass dist/scss/components/_button.scss` with zero undeclared symbols.

### 4.4 Cascade Layer Order & The 0% / 50% / 100% Consumer Customization Dial
`dist/scss/index.scss` and `dist/styles.css` **MUST** declare the exact cascade order:
```scss
@layer vui.reset, vui.tokens, vui.grid, vui.components, vui.transitions, vui.utilities;
```
* **0% Customization (None — Zero Config)**: Consumer imports `'vespoli-ui/styles.css'` and renders components directly. Zero bundler plugins, zero `<ThemeProvider>`.
* **50% Customization (Half — Token or Variable Override)**:
  * Plain CSS: `:root { --vui-color-accent: #38bdf8; }`
  * SCSS: `@use 'vespoli-ui/scss' with ($ButtonPaddingX: 10px, $color-accent: #38bdf8);`
* **100% Customization (Full — Complete CSS Ownership)**:
  * Any unlayered CSS/SCSS rule (`.vui-Button { padding: 0 10px; &.active { ... } }`) automatically overrides `@layer vui.components` with **zero `!important`** and without wrapping `<Button>` imports.
  * Consumers opting into `@vespoli/styled/vite` or `@vespoli/styled/esbuild` also gain `configure('Button', \`padding: 0 10px; &.active { ... }\`)` (global build-time override for every `<Button />` app-wide) and `styled(Button)\`...\`` (new composed primitive) at `0 B` runtime cost.

---

## 5. 12-Column Structural Grid (`Container`, `Row`, `Col`)

### 5.1 Breakpoints & Configurable SCSS Defaults
* Breakpoints (`$GridBreakpoints !default`): `xs: 0`, `sm: 576px`, `md: 768px`, `lg: 992px`, `xl: 1200px`, `xxl: 1400px`.
* Max container widths (`$ContainerMaxWidths !default`): `sm: 540px`, `md: 720px`, `lg: 960px`, `xl: 1140px`, `xxl: 1320px`.
* Grid defaults: `$GridColumns: 12 !default`, `$GridGutter: $space-4 !default`.

### 5.2 Structural CSS Grid Implementation
* **`Container` (`styled.div`)**: Centered block container with `padding-inline: $GridGutter`; `fluid?: boolean | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'` switches to `max-width: 100%` below or across all breakpoints.
* **`Row` (`styled.div`)**: `display: grid; grid-template-columns: repeat(12, minmax(0, 1fr));` with `gutter?: 0 | 1 | 2 | 3 | 4 | 5 | 6` and `rowGutter?: 0 | 1 | 2 | 3 | 4 | 5 | 6` mapped to static gap classes (zero negative margins).
* **`Col` (`styled.div`)**: Accepts `xs`, `sm`, `md`, `lg`, `xl`, `xxl` (`1..12 | 'full'`) mapped to `grid-column: span N / span N` (defaulting to `span 12` at `xs` when only a larger breakpoint is specified, matching Bootstrap mobile-first behavior), plus `offsetXs`..`offsetXxl` (`0..11` mapped to `grid-column-start: N + 1`), and `min-width: 0` so overflowing inner content (`<code>`, SHA digests, wide tables) **never** expands column tracks.

---

## 6. Conservation of UI Matter — Spatial, Origin-Bound & Async Transitions

### 6.1 Non-Stretching Origin-to-Container Aperture Morphing
1. **Passive Origin Tracker (`vespoli-ui/transitions`)**:
   * A single capture-phase listener on `document` (`pointerdown` and `keydown` for `Enter`/`Space`) stores a `WeakRef<HTMLElement>` to `event.target.closest('button, a, summary, tr[data-row-key], [data-vui-interactive]')`.
2. **Immediate Container Mount + Compositor Shutter Illusion**:
   * When `<Dialog open={true}>` opens or `transitionTo(updateFn, options?)` executes:
     * If `prefers-reduced-motion: reduce` is active or `document.startViewTransition` is unavailable, `updateFn()` runs synchronously with zero motion.
     * Otherwise:
       1. Before snapshot `old`: the tracked origin element receives `data-vui-morph="active"` (`view-transition-name: vui-focal-morph` in `@layer vui.transitions`).
       2. Inside the `startViewTransition` callback (`t = 0ms`): `data-vui-morph` is removed from the origin element (which receives `data-vui-morph-hidden="true"` $\to$ `visibility: hidden` so toolbar/table layout does not shift `1px`), React immediately mounts the real destination container (`<Dialog>`, `<Card>`, `<Shell>`) at its final layout size, and stamps `data-vui-morph="active"` on that destination container (storing the origin `WeakRef` on the container instance for reverse collapse).
       3. During the `220ms` `$EaseOutExpo` flight: `::view-transition-group(vui-focal-morph)` animates geometry and `border-radius` from the trigger's exact box to the container's final box, while `::view-transition-old(vui-focal-morph)` and `::view-transition-new(vui-focal-morph)` enforce:
          ```scss
          height: 100%;
          width: 100%;
          overflow: clip;
          object-fit: none;
          object-position: top left;
          ```
          The trigger's label fades out in `55ms` while the expanding frame acts as a crisp hardware shutter revealing the unstretched destination container underneath.
       4. On `<Dialog open={false}>` or back-navigation, the exact reverse transition folds the container frame back into the stored origin `WeakRef` before restoring origin visibility.

### 6.2 Remote Async Continuum (`Trigger -> Living Skeleton -> Content`, Zero Spinners)
* Standalone `<Spinner />` components **MUST NOT** exist.
* **Inline Action Loading (`<Button loading>`, `<IconButton loading>`)**: Sets `aria-busy="true"` and `data-loading="true"`, animating a compositor-friendly directional shimmer across the control's own border/background (`background-position` / `opacity`) while preserving exact dimensions.
* **Container / Remote View Loading (`<Card loading>`, `<Dialog loading>`, `<Shell loading>`, `<Table loading>`)**: Immediately receives the origin aperture morph on click; while `loading={true}`, renders a deterministic CSS skeleton surface shimmer (`[data-loading="true"]`) inside the real container bounds, then transitions smoothly (`opacity` + `@starting-style`) into hydrated children when `loading` becomes `false`.

### 6.3 4-Way Directional Choreography & Discrete Entry/Exit CSS
* `transitionTo(updateFn, { direction?: 'left' | 'right' | 'up' | 'down' | 'iris' })` passes `types: [direction]` to `document.startViewTransition({ update, types })`, driving `:active-view-transition-type(left | right | up | down | iris)` rules combining directional translation with subtle z-depth `scale(0.97)` recession and `clip-path: inset(...)` iris reveals.
* Multi-page navigations opt in via `@view-transition { navigation: auto; }`.
* Native `<dialog>` (`&[open]`, `&::backdrop`) and `<details>` (`::details-content`) animate both entry and exit from `display: none` / `overlay` using pure CSS `@starting-style` and `transition-behavior: allow-discrete`—zero JS unmount timers.

---

## 7. High-Scale `<canvas>` Telemetry Primitives (`100k+` Points, `0` React Re-Renders)

### 7.1 `CanvasStage`, `RangeBar`, and `HeatmapCanvas`
* Each visualization component renders a single `styled.canvas` element (`1 JSX tag = 1 <canvas>`), styled in `@layer vui.components` with surface fill, hairline border, and Frame-0 CSS `repeating-linear-gradient` gridlines so SSR/initial paint never flashes an empty void.
* On mount, `CanvasStage` calls `canvas.transferControlToOffscreen()` and posts the `OffscreenCanvas` + computed theme token palette (`getComputedStyle` read once and updated on theme class change) to a dedicated Web Worker.
* **Data Ingestion & Animation Protocol (Zero Main-Thread Load)**:
  1. **Typed-Array Ring Buffer**: Worker maintains pre-allocated `Float32Array` / `Uint32Array` ring buffers—never JS object arrays in React state.
  2. **Live Stream Scroll-Blitting**: Appending live telemetry blits the existing GPU texture left (`ctx.drawImage(canvas, -dx, 0)`) and rasterizes only the newly arrived pixel columns (`< 0.05 ms`/frame).
  3. **Pixel-Column Min/Max Decimation & `120ms` Filter Transitions**: Datasets of `100,000–1,000,000+` points are decimated in a single linear pass to `<= physicalWidthPx` min/max column pairs and interpolated (`lerp` in 2D `OffscreenCanvas` or `mix(prevY, nextY, t)` in WebGL2) over `120ms` at `< 1%` CPU with **zero** React `<Profiler>` commits.
* **Accessibility Pairing**: Interactive range selection on `RangeBar` pairs the `<canvas>` (`aria-hidden="true"`) with dual semantic `<input type="range">` / ARIA slider handles and screen-reader summary attributes.

---

## 8. Complete v1.0 Component Specification

Every component forwards native HTML attributes and `ref` (React 19 `ref` prop) directly to its underlying element:

| Component | Exact HTML Tag | Style / Behavior Props (Compiled & Stripped) | Notes & Performance Contract |
| :--- | :--- | :--- | :--- |
| `Container` | `<div>` | `fluid?: boolean \| Breakpoint` | Centered max-width or full-bleed grid container |
| `Row` | `<div>` | `gutter?: 0..6`, `rowGutter?: 0..6`, `align?: 'start' \| 'center' \| 'end' \| 'stretch'` | `repeat(12, minmax(0, 1fr))` CSS Grid row |
| `Col` | `<div>` | `xs..xxl?: 1..12`, `offsetXs..offsetXxl?: 0..11` | `min-width: 0` structural track span |
| `Shell` | `<div>` | `loading?: boolean` | Top-level application landmark layout |
| `SplitView` | `<div>` | `ratio?: '60-40' \| '70-30' \| '50-50'`, `collapsed?: boolean` | Master-detail CSS Grid split pane |
| `Card` | `<section>` | `padding?: 'none' \| 'sm' \| 'md' \| 'lg'`, `loading?: boolean` | Surface container + living skeleton shimmer |
| `Stack` | `<div>` | `direction?: 'column' \| 'row'`, `gap?: 0..8`, `align?`, `justify?`, `wrap?: boolean` | 1D Flexbox strictly for use inside `Col`s |
| `Toolbar` | `<div role="toolbar">` | `gap?: 1..4`, `justify?: 'start' \| 'between' \| 'end'` | 1D action/filter bar with roving focus support |
| `Heading` | `<h1>`..`<h6>` (`level?: 1..6`) | `size?: 'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | Decouples semantic heading rank from visual scale |
| `Breadcrumbs` / `Crumb` | `<nav>` / `<a>` or `<span>` | `current?: boolean` | Sets `aria-label="Breadcrumb"` and `aria-current="page"` |
| `Button` | `<button>` | `variant?: 'primary' \| 'secondary' \| 'quiet' \| 'danger'`, `compact?: boolean`, `loading?: boolean` | Defaults `type="button"`; shimmer border on `loading` |
| `IconButton` | `<button>` | Same as `Button` + **required** `'aria-label': string` | Compile error (`VUI004`) if `'aria-label'` is omitted |
| `Input` | `<input>` | `compact?: boolean`, `invalid?: boolean`, `mono?: boolean` | Sets `aria-invalid` when `invalid={true}` |
| `Select` | `<select>` | `compact?: boolean`, `invalid?: boolean` | `appearance: none` + pure CSS chevron border |
| `Checkbox` | `<input type="checkbox">` | `invalid?: boolean` | `appearance: none` + `&::after` CSS checkmark transition |
| `Label` | `<label>` | `muted?: boolean` | Explicit `htmlFor` composition |
| `Field` / `FieldHint` / `FieldError` | `<div>` / `<p>` / `<p role="alert">` | `gap?: 1..3` | Pure composition wrapper for form controls |
| `Segments` / `Segment` | `<div role="radiogroup">` / `<button role="radio">` | `active?: boolean`, `compact?: boolean` | Stateless exclusive toggle group |
| `Tabs` / `Tab` / `TabPanel` | `<div role="tablist">` / `<button role="tab">` / `<section role="tabpanel">` | `active?: boolean` | Pairs with `vespoli-ui/a11y` roving-tabindex helpers |
| `Pagination` | `<nav>` | `hasPrev: boolean`, `hasNext: boolean`, `onPrev`, `onNext`, `summary?: string` | Cursor/page stateless navigation controls |
| `FacetBar` / `FacetGroup` / `FacetList` | `<aside>` or `<div>` / `<fieldset>` / `<ul role="listbox">` | `selectedKeys`, `excludedKeys`, `onToggleKey` | Delegated event handling + live facet count badges |
| `ChipBar` / `Chip` | `<div role="region">` / `<button>` | `operator?: 'in' \| 'not'`, `onRemove` | Active filter predicate chips |
| `Table` / `TableHead` / `TableBody` / `TableRow` / `HeaderCell` / `TableCell` | `<table>` / `<thead>` / `<tbody>` / `<tr>` / `<th>` / `<td>` | `align?: 'left' \| 'center' \| 'right'`, `width?: 'xs' \| 'sm' \| 'md' \| 'lg' \| 'auto'`, `selected?: boolean`, `onRowActivate` | Single delegated listener on `<tbody>`; `React.memo` row isolation; `tabular-nums` on right-aligned cells |
| `VirtualTable` | `<table>` | `totalRows: number`, `offsetPx: number`, `afterPx: number` | Stateless spacer-row windowing (`data-spacer` quantized heights or CSS custom scroll window) at `60 fps` for `100k+` rows |
| `TreeTable` / `TreeRow` | `<table role="treegrid">` / `<tr role="row">` | `level: 1..8`, `expanded?: boolean` | Hierarchical manifest/file browser (`aria-level`, `aria-expanded`) |
| `DagRail` / `DagLane` | `<div>` / `<span>` | `edge: 'straight' \| 'fork-right' \| 'merge-left' \| 'ghost'`, `node?: 'commit' \| 'merge' \| 'head' \| 'ghost'` | Zero-SVG pure CSS box/arc commit & force-push lineage cell |
| `Properties` / `PropertyItem` | `<dl>` / `<div>` | `mono?: boolean` | Compact key-value metadata definition list |
| `Disclosure` / `Summary` | `<details>` / `<summary>` | Controlled or native `open` | Animated via `::details-content` + `@starting-style` |
| `Code` / `CodeBlock` / `JsonTree` | `<code>` / `<pre>` / `<ul role="tree">` | `wrap?: boolean` | Stateless structured payload & code viewers |
| `Badge` / `ProofBadge` / `DigestChip` | `<span>` / `<span>` / `<button>` | `tone?: 'neutral' \| 'accent' \| 'success' \| 'warn' \| 'danger'`, `verified?: boolean` | Cryptographic state pills & tabular-hex SHA chips |
| `Notice` / `AlertBanner` / `Empty` | `<div role="status">` / `<div role="alert">` / `<section>` | `severity?: 'info' \| 'warn' \| 'danger' \| 'critical'` | Triage alerts & empty states |
| `Metrics` / `MetricItem` | `<section>` / `<article>` | `trend?: 'up' \| 'down' \| 'flat'` | High-density KPI strip |
| `Icon` | `<span aria-hidden="true">` | `name: GlyphName`, `size?: 'sm' \| 'md' \| 'lg'` | Pure CSS geometric primitive or `< 2 KB` WOFF2 glyph |
| `Dialog` / `Inspector` | `<dialog>` | `open: boolean`, `onClose: () => void`, `loading?: boolean`, `drawer?: 'right' \| 'bottom'` | Origin-aperture morph open/close + native `::backdrop` |
| `CanvasStage` / `RangeBar` / `HeatmapCanvas` | `<canvas>` | `buffer`, `onBrushChange` | `OffscreenCanvas` ring-buffer `100k+` point renderers |

---

## 9. Agent-First Zero-Gotcha Contract & Package Exports

### 9.1 Five Guarantees for AI Coding Agents
1. **100% Native HTML Prop Vocabulary**: Standard DOM prop names (`onClick`, `disabled`, `value`, `onChange`, `open`, `onClose`) are used everywhere. Custom aliases (`onPress`, `isDisabled`, `onValueChange`, `asChild`) are prohibited.
2. **Zero Provider / SSR / RSC Traps**: Every component renders in isolation in Vitest/Playwright, Node/Edge SSR, React Server Components (for non-event primitives), and client SPAs without any surrounding Context provider.
3. **Predictable Dual Import Resolution (`package.json` `exports`)**:
   * Flat barrel: `import { Container, Row, Col, Button, Table, Dialog, transitionTo } from 'vespoli-ui';` (`"sideEffects": ["*.css", "*.scss"]` so JS tree-shakes cleanly).
   * 1:1 PascalCase subpaths: `import { Button } from 'vespoli-ui/Button';`
   * Stylesheets: `'vespoli-ui/styles.css'`, `'vespoli-ui/css/*'`, `'vespoli-ui/scss'`, `'vespoli-ui/scss/components/*'`.
   * Agent manifest: `'vespoli-ui/AGENT.md'` and `'vespoli-ui/manifest.json'`.
4. **Actionable Compiler & Type Diagnostics (`VUI001`–`VUI010`)**:
   * `VUI001`: Unbounded dynamic interpolation in `styled` template $\to$ convert prop to finite union/boolean.
   * `VUI002`: Disallowed stateful hook or Context import in `packages/ui/src`.
   * `VUI003`: Disallowed inline `style` prop or `<svg>` element detected.
   * `VUI004`: Missing required `'aria-label'` on `<IconButton>` or unassociated form control.
5. **Shipped `< 3 KB` `AGENT.md` & `dist/manifest.json`**:
   * Generated automatically from TypeScript AST + SCSS emitter output during `npm run build` so documentation can **never** drift from code. Lists every component, its exact HTML tag, its stripped style props, and its `$ComponentProperty` SCSS variables in `< 800` tokens.

---

## 10. Accessibility, Performance & CI Verification Gates

Every pull request and `main` build **MUST** pass all automated gates before publish/merge:

1. **Static Package & Security Gate (`scripts/check-package.ts`)**:
   * `style_runtime_bytes == 0` across `dist/esm/**`.
   * `inline_style_attr_count == 0` across `packages/ui/src/**` and `dist/esm/**`.
   * `svg_count == 0` (zero `<svg`, `<path`, `.svg`, or `image/svg+xml` tokens across `packages/**`, `bench/**`, `scripts/**`, and `dist/**`).
   * `stateful_hook_count == 0` (`useState`, `useReducer`, `useContext`, `createContext` absent from `packages/ui/src/**`).
2. **Standalone SCSS Determinism Gate (`scripts/check-scss.ts`)**:
   * Compiles `dist/scss/index.scss` (both default and with `@use ... with (...)` variable overrides) and every `dist/scss/components/_*.scss` partial individually via Grass.
   * Verifies byte-for-byte deterministic compilation across runs.
3. **Playwright + Lighthouse + React `<Profiler>` Benchmark Gate (`bench/budgets.json`)**:
   * **Bundle Budgets**: Core `styles.css` gzipped `<= 6.0 KB`; `vui-glyphs.woff2` `<= 2.0 KB`; single `Button` tree-shaken JS gzipped `<= 0.6 KB`.
   * **Render & Re-Render Budgets**: Primitive mount `p95 <= 1.5 ms`; `500`-row `Table` single-row selection change re-renders **at most 2 rows** (`rerender_unchanged_row_count == 0`); `100,000`-point `CanvasStage` `120ms` transition triggers **`0` React commits** and maintains `>= 60 fps`.
   * **Strict CSP Gate**: Playwright runs all component and transition suites under the locked `style-src 'self'; script-src 'self'` header with `0` `securitypolicyviolation` events.
   * **Accessibility Gate**: Lighthouse `accessibility == 100`, `axe-core` `0` violations in dark, light, and `@media (forced-colors: active)` modes, `200%` zoom reflow pass, and reduced-motion verification.
