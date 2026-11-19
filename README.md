# vespoli-ui

Stateless, accessible, zero-runtime-overhead React UI primitives, static `styled -> SCSS` compiler, and `OffscreenCanvas` telemetry visualization engine.

## Core Guarantees

- **0 B Runtime Style Overhead**: Colocated `styled.<tag>` templates in `@vespoli/styled` compile statically via `@vespoli/styled-compiler` (`#![forbid(unsafe_code)]` Rust SCSS/CSS + WOFF2 engine and TypeScript AST extractor) into modular `.scss` partials, layered `.css` bundles, and zero-dependency ESM modules.
- **100% Dumb Stateless Primitives (`1-In -> 1-Out`)**: Zero `useState`, `useReducer`, `useContext`, `createContext`, network calls, or timers inside `packages/ui`. Works identically in React 18/19 SPAs, SSR, and RSC without providers.
- **1 JSX Tag = 1 Native HTML Element**: `Button` renders `<button>`, `Select` renders `<select>`, `Dialog` renders `<dialog>`, `Disclosure` renders `<details>`, `Table` renders `<table>`, `CanvasStage` renders `<canvas>`.
- **Strict `style-src 'self'` CSP & Zero Vector Bloat**: Zero inline `style` attributes, zero vector markup elements/files, pure CSS geometric indicators, `< 2 KB` WOFF2 monochrome glyph font, and `100,000+` point `OffscreenCanvas` typed-array ring-buffer rendering at `60-120 fps` with `0` React commits.
- **0% / 50% / 100% Customization Dial**:
  - **0%**: `import 'vespoli-ui/styles.css'` and render components with zero config.
  - **50%**: Override `--vui-*` CSS custom properties or `@use 'vespoli-ui/scss' with ($ButtonPaddingX: 10px, $color-accent: #38bdf8);`.
  - **100%**: Unlayered `.vui-Button { ... }` CSS naturally overrides `@layer vui.components` without `!important`, or use build-time `configure('Button', ...)` and `styled(Button)`.

## Workspace Layout

- `crates/compiler` -- `#![forbid(unsafe_code)]` pure-Rust SCSS compiler, CSS minifier, WOFF2 subset glyph generator, and law verifier (`vui-compile`).
- `packages/styled` -- `@vespoli/styled` authoring tags (`styled`, `css`, `media`, `t`, `configure`) and 42 flat semantic tokens.
- `packages/styled-compiler` -- `@vespoli/styled-compiler` TypeScript AST pass, SCSS emitter, CSS builder, and Vite/esbuild plugins.
- `packages/ui` -- `vespoli-ui` 66 stateless primitives, View Transition aperture morphing (`transitionTo`, `trackOrigin`), roving-focus accessibility (`moveFocus`), and `OffscreenCanvas` telemetry workers.
- `bench/` -- Performance, bundle-budget, `<Profiler>` row-isolation, CSP, and accessibility verification suite.
- `scripts/` -- Build pipeline (`build.ts`), static package gate (`check-package.ts`), SCSS determinism gate (`check-scss.ts`), and full verification gate (`check`).

## Verification

```sh
./scripts/check
```
