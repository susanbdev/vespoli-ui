# vespoli-ui

**Zero-runtime-CSS, stateless `1-In -> 1-Out` React UI primitives, pure-Rust static `styled` compiler, and `OffscreenCanvas` high-density telemetry visualization.**

`vespoli-ui` eliminates runtime style engines, provider trees, hidden component state, inline styles, and vector markup bloat. Every component is a pure function mapping props directly to a single honest native HTML element, backed by layered CSS compiled ahead of time by `@vespoli/styled-compiler` (`#![forbid(unsafe_code)]` Rust + TypeScript AST pipeline).

---

## Seven Architectural Laws

| Law | Guarantee | Enforcement |
| :--- | :--- | :--- |
| **1. Stateless `1-In -> 1-Out`** | `0` `useState`, `useReducer`, `useContext`, network calls, or timers inside `packages/ui`. Identical behavior across React 18/19 SPAs, SSR, and RSC with `0` providers. | `vui-compile audit` + AST gate |
| **2. Honest Native HTML** | `1` JSX tag = `1` semantic native HTML element (`Button` -> `<button>`, `Dialog` -> `<dialog>`, `Disclosure` -> `<details>`, `Table` -> `<table>`, `CanvasStage` -> `<canvas>`). | Static DOM + naming gate |
| **3. `0 B` Runtime Style Engine** | Colocated `styled.<tag>` and `css` templates erase at build time into modular `.scss` partials, `@layer` CSS bundles, and zero-dependency ESM modules. | `check-package.ts` (`styleRuntimeBytes == 0`) |
| **4. Strict `style-src 'self'` CSP** | `0` JSX or DOM inline `style` attributes and `0` `dangerouslySetInnerHTML` across all components and build outputs. | CSP + output scanner |
| **5. Zero Vector Markup & `OffscreenCanvas`** | `0` inline vector markup elements, `0` vector asset files, `< 2 KB` WOFF2 monochrome glyph subset, pure CSS geometric affordances, and `100,000+` point `OffscreenCanvas` ring buffers at `60-120 fps`. | Static asset + bundle gate |
| **6. 12-Column Structural CSS Grid** | 2D page structure uses `Container`, `Row`, and `Col` (`repeat(12, minmax(0, 1fr))` with `min-width: 0`); 1D `Stack` and `Toolbar` compose strictly inside grid tracks. | Layout & SCSS checks |
| **7. Conservation of UI Matter** | `0` standalone `<Spinner />` components. Loading states, dialogs, and inspectors morph continuously from their user-activated origin via native View Transitions and `@starting-style`. | `transitionTo` + `trackOrigin` |

---

## Measured Benchmarks (`bench/run-bench.ts`)

| Metric | Measured | Budget Ceiling |
| :--- | :--- | :--- |
| Full 66-component `styles.css` | `6,122 B` | `<= 6,144 B` |
| Subset monochrome glyph font (`.woff2`) | `551 B` | `<= 2,048 B` |
| Standalone `vespoli-ui/Button` module | `443 B` | `<= 614 B` |
| Runtime style engine overhead | `0 B` | `0 B` |
| Initial component mount (`p95`) | `0.28 ms` | `<= 1.0 ms` |
| `500`-row `Table` single-row update | `2` fiber commits | Row-isolated |
| `100,000+` point `OffscreenCanvas` stream | `0` React commits (`1000 fps`) | `>= 60 fps` |
| CSP & Accessibility violations | `0` | `0` |

---

## Quickstart

### 1. Zero-Config Usage (`0%` Dial)

Import the prebuilt layered stylesheet once and render stateless native primitives with standard HTML attributes:

```tsx
import 'vespoli-ui/styles.css';
import {
  Container,
  Row,
  Col,
  Card,
  Stack,
  Heading,
  Input,
  Button,
  Dialog,
  transitionTo,
} from 'vespoli-ui';

export function AccessPanel({
  query,
  open,
  onQueryChange,
  onToggleDialog,
}: {
  query: string;
  open: boolean;
  onQueryChange: (next: string) => void;
  onToggleDialog: (next: boolean) => void;
}) {
  return (
    <Container>
      <Row>
        <Col xs={12} lg={8}>
          <Card>
            <Stack direction="column" gap="md">
              <Heading level={2}>Active Sessions</Heading>
              <Input
                value={query}
                placeholder="Filter by principal or repo..."
                onChange={(e) => onQueryChange(e.currentTarget.value)}
              />
              <Button
                variant="primary"
                onClick={() => transitionTo(() => onToggleDialog(true))}
              >
                Inspect Policy
              </Button>
            </Stack>
          </Card>
        </Col>
      </Row>

      <Dialog open={open} onClose={() => onToggleDialog(false)}>
        <Heading level={3}>Session Scope</Heading>
      </Dialog>
    </Container>
  );
}
```

### 2. Token & SCSS Customization (`50%` Dial)

Override `--vui-*` custom properties in CSS or configure SCSS `!default` module variables at build time:

```scss
@use 'vespoli-ui/scss' with (
  $ButtonPaddingX: 10px,
  $color-accent: #38bdf8
);
```

### 3. Cascade & Static Compiler Overrides (`100%` Dial)

Every component ships inside `@layer vui.reset, vui.tokens, vui.grid, vui.components, vui.transitions, vui.utilities;`. Standard unlayered `.vui-Button { ... }` rules override component defaults naturally without `!important`, or author zero-runtime extensions with `@vespoli/styled`:

```tsx
import { styled, t } from '@vespoli/styled';
import { Button } from 'vespoli-ui';

export const CommandTrigger = styled(Button)`
  padding-inline: ${t.spaceMd};
  border-color: ${t.colorAccent};
`;
```

---

## 66 Stateless Primitives & Ergonomic Helpers

| Category | Exported Primitives |
| :--- | :--- |
| **Grid & Structure** | `Shell`, `Container`, `Row`, `Col`, `Stack`, `Toolbar`, `SplitView`, `Card`, `Empty` |
| **Actions & Navigation** | `Button`, `IconButton`, `Tabs`, `Tab`, `TabPanel`, `Segments`, `Segment`, `Breadcrumbs`, `Crumb`, `Pagination` |
| **Forms & Filtering** | `Field`, `Label`, `FieldHint`, `FieldError`, `Input`, `Select`, `Checkbox`, `RangeField`, `Chip`, `ChipBar`, `FacetBar`, `FacetGroup`, `FacetList`, `FacetItem` |
| **Data & Provenance** | `Table`, `VirtualTable`, `TreeTable`, `TableHead`, `TableBody`, `TableRow`, `TreeRow`, `VirtualSpacer`, `HeaderCell`, `TableCell`, `Properties`, `PropertyItem`, `JsonTree`, `DagRail`, `DagLane`, `DigestChip`, `ProofBadge` |
| **Overlays & Feedback** | `Dialog`, `Inspector`, `Disclosure`, `Summary`, `AlertBanner`, `Notice`, `Badge`, `Metrics`, `MetricItem`, `Heading`, `Code`, `CodeBlock`, `Icon` |
| **Canvas & Motion** | `CanvasStage`, `HeatmapCanvas`, `RangeBar`, `transitionTo`, `trackOrigin`, `moveFocus`, `decimateMinMax` |

Full prop, element, and SCSS variable signatures are cataloged in [`packages/ui/REFERENCE.md`](packages/ui/REFERENCE.md).

---

## Workspace Architecture

- `crates/compiler` -- `#![forbid(unsafe_code)]` pure-Rust SCSS compiler, CSS minifier, WOFF2 subset glyph generator, and source-law auditor (`vui-compile`).
- `packages/styled` -- `@vespoli/styled` authoring tags (`styled`, `css`, `media`, `t`, `configure`) and 42 semantic design tokens.
- `packages/styled-compiler` -- `@vespoli/styled-compiler` TypeScript AST extractor, SCSS partial emitter, CSS bundle builder, and Vite/esbuild plugins.
- `packages/ui` -- `vespoli-ui` 66 stateless primitives, View Transition origin tracking, roving-focus keyboard navigation, and `OffscreenCanvas` workers.
- `bench/` -- Bundle-budget, React `<Profiler>` row-isolation, strict CSP, and accessibility verification benchmarks.
- `scripts/` -- Deterministic build (`build.ts`), package/CSP gate (`check-package.ts`), SCSS partial gate (`check-scss.ts`), and end-to-end `./scripts/check`.

---

## Offline Verification

Requires Node.js `>= 22.6.0` and a Rust toolchain:

```sh
./scripts/check
```

Enforces pure 7-bit ASCII hygiene, workflow pin verification, `cargo fmt --check`, `cargo clippy -- -D warnings`, Rust compiler unit tests, `vui-compile audit`, zero-runtime ESM/SCSS determinism, and performance/accessibility budgets completely offline.

---

## License

**Free for personal, educational, and individual non-commercial use.** Commercial and enterprise use requires a paid commercial license -- see [`LICENSE`](LICENSE) for full terms.
