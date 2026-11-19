import { stripTypeScriptTypes } from "node:module";
import { TOKEN_LIST } from "../../styled/src/tokens.ts";

export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly fix?: string;
  readonly line?: number;
}

export interface PropDomain {
  readonly name: string;
  readonly kind: "boolean" | "union";
  readonly values: readonly string[];
  readonly defaultValue?: string | boolean;
}

export interface PropRule {
  readonly prop: string;
  readonly matchValue: string | true;
  readonly cssBody: string;
}

export interface MintedVar {
  readonly name: string;
  readonly defaultExpr: string;
  readonly cssProp: string;
}

export interface ComponentAst {
  readonly name: string;
  readonly tag: string;
  readonly baseComponent?: string;
  readonly exported: boolean;
  readonly sourceModule: string;
  readonly attrs: Readonly<Record<string, string | boolean | number>>;
  readonly props: readonly PropDomain[];
  readonly baseCss: string;
  readonly propRules: readonly PropRule[];
  readonly mintedVars: readonly MintedVar[];
}

export interface CompiledModule {
  readonly esmCode: string;
  readonly components: readonly ComponentAst[];
  readonly diagnostics: readonly Diagnostic[];
  readonly perComponentEsm: Readonly<Record<string, string>>;
}

const TOKEN_EXPR_MAP: Readonly<Record<string, string>> = buildTokenExprMap();

function buildTokenExprMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of TOKEN_LIST) {
    const useCssVar =
      entry.path.startsWith("color.") ||
      entry.path.startsWith("font.") ||
      entry.path.startsWith("ease.");
    const scssExpr = useCssVar ? `var(${entry.cssVar})` : `$${entry.scssVar}`;
    if (entry.path.startsWith("space.")) {
      const idx = entry.path.slice("space.".length);
      map[`t.space[${idx}]`] = scssExpr;
      map[`t.space.${idx}`] = scssExpr;
    } else {
      map[`t.${entry.path}`] = scssExpr;
    }
  }
  return map;
}

const TOKEN_SCSS_MAP: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {};
  for (const entry of TOKEN_LIST) {
    map[`var(${entry.cssVar})`] = `$${entry.scssVar}`;
  }
  return map;
})();

const BREAKPOINT_MIN: Readonly<Record<string, string>> = {
  sm: "576px",
  md: "768px",
  lg: "992px",
  xl: "1200px",
  xxl: "1400px"
};

export function auditSourceLaws(
  source: string,
  options: { isUiPackage?: boolean; filePath?: string } = {}
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split("\n");
  const vecOpen = "<" + "svg";
  const vecPath = "<" + "path";
  const vecExt = "." + "svg";
  const vecMime = "image/" + "svg+xml";

  const bannedHooks = [
    "useState",
    "useReducer",
    "useContext",
    "createContext",
    "useSyncExternalStore",
    "XMLHttpRequest",
    "WebSocket",
    "setTimeout",
    "setInterval"
  ];
  const bannedAliases = ["onPress", "isDisabled", "onValueChange", "asChild"];
  const bannedSuffixes = /(?:[A-Z][A-Za-z0-9]*(?:Wrapper|Root|Contract|Manager|Helper|Util|Check)|[A-Z][A-Za-z0-9]+Container)\b/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;

    for (let c = 0; c < line.length; c += 1) {
      const code = line.charCodeAt(c);
      if (code !== 9 && (code < 32 || code > 126)) {
        diagnostics.push({
          code: "VUI009",
          line: lineNo,
          message: `Non-ASCII character (0x${code.toString(16)}) in source.`,
          fix: "Replace non-ASCII punctuation or symbols with 7-bit printable ASCII."
        });
        break;
      }
    }

    const lower = line.toLowerCase();
    if (
      lower.includes(vecOpen) ||
      lower.includes(vecPath) ||
      lower.includes(vecExt) ||
      lower.includes(vecMime)
    ) {
      diagnostics.push({
        code: "VUI003",
        line: lineNo,
        message: "Disallowed vector element or vector asset reference detected (Law 5).",
        fix: "Use <Icon name=\"...\" /> (CSS geometry / WOFF2 glyph) or <CanvasStage />."
      });
    }

    if (options.isUiPackage) {
      if (
        /\bstyle\s*=\s*\{/.test(line) ||
        /\bstyle\s*=\s*["']/.test(line) ||
        /\.setAttribute\(\s*["']style["']/.test(line)
      ) {
        diagnostics.push({
          code: "VUI003",
          line: lineNo,
          message: "Disallowed inline style attribute detected (Law 4 strict style-src 'self' CSP).",
          fix: "Map visual state to typed finite style props or data-* attributes in static SCSS."
        });
      }

      for (const hook of bannedHooks) {
        const re = new RegExp(`\\b${hook}\\b`);
        if (re.test(line)) {
          diagnostics.push({
            code: "VUI002",
            line: lineNo,
            message: `Disallowed stateful or side-effectful API '${hook}' in packages/ui/src (Law 1).`,
            fix: "Accept controlled props and event callbacks from the parent caller."
          });
        }
      }

      if (/\bfetch\s*\(/.test(line)) {
        diagnostics.push({
          code: "VUI002",
          line: lineNo,
          message: "Disallowed network fetch() inside stateless UI primitive (Law 1).",
          fix: "Perform data fetching outside vespoli-ui and pass typed props/typed arrays."
        });
      }

      if (/\b(?:slots|slotClasses)\b/.test(line) || bannedSuffixes.test(line)) {
        diagnostics.push({
          code: "VUI005",
          line: lineNo,
          message: "Disallowed slots API or banned identifier suffix (*Wrapper/*Root/*Contract/*Container) (Law 2).",
          fix: "Compose explicit semantic elements directly using concise 1-2 word Domain Nouns."
        });
      }

      for (const alias of bannedAliases) {
        if (new RegExp(`\\b${alias}\\b`).test(line)) {
          diagnostics.push({
            code: "VUI006",
            line: lineNo,
            message: `Disallowed non-native prop alias '${alias}' (Section 9.1).`,
            fix: "Use standard native HTML prop names (onClick, disabled, onChange, open, onClose)."
          });
        }
      }

      if (/\bSpinner\b/.test(line)) {
        diagnostics.push({
          code: "VUI007",
          line: lineNo,
          message: "Disallowed disembodied Spinner component (Law 7 Conservation of UI Matter).",
          fix: "Use loading={true} on <Button>, <Card>, <Dialog>, <Shell>, or <Table>."
        });
      }
    }

    const iconBtnTags = line.match(/<IconButton\b[^>]*>/g);
    if (iconBtnTags) {
      for (const tag of iconBtnTags) {
        if (!tag.includes("aria-label") && !tag.includes("{...")) {
          diagnostics.push({
            code: "VUI004",
            line: lineNo,
            message: "Missing required 'aria-label' on <IconButton>.",
            fix: "Provide an explicit accessible label: <IconButton aria-label=\"Close\" />."
          });
        }
      }
    }
  }

  return diagnostics;
}

export function parseTypeDomains(source: string): Map<string, PropDomain[]> {
  const result = new Map<string, PropDomain[]>();
  const aliasMap = new Map<string, string[]>();

  const typeAliasRe = /(?:export\s+)?type\s+([A-Za-z0-9_]+)\s*=\s*([^;]+);/g;
  let aliasMatch: RegExpExecArray | null;
  while ((aliasMatch = typeAliasRe.exec(source)) !== null) {
    const aliasName = aliasMatch[1] ?? "";
    const rhs = (aliasMatch[2] ?? "").trim();
    const vals = parseFiniteTypeExpr(rhs, aliasMap);
    if (vals) {
      aliasMap.set(aliasName, vals);
    }
  }

  const ifaceRe = /(?:export\s+)?interface\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ifaceRe.exec(source)) !== null) {
    const ifaceName = match[1] ?? "";
    const body = match[2] ?? "";
    const props: PropDomain[] = [];
    for (const rawLine of body.split(";")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//")) continue;
      const m = /^(?:readonly\s+)?(['"]?[A-Za-z0-9_-]+['"]?)\??\s*:\s*(.+)$/.exec(line);
      if (!m) continue;
      const propName = (m[1] ?? "").replace(/^['"]|['"]$/g, "");
      const typeExpr = (m[2] ?? "").trim();
      if (typeExpr === "boolean") {
        props.push({ name: propName, kind: "boolean", values: ["true", "false"] });
        continue;
      }
      const unionVals = parseFiniteTypeExpr(typeExpr, aliasMap);
      if (unionVals) {
        props.push({ name: propName, kind: "union", values: unionVals });
      } else {
        // Mark unbounded domain with empty values so VUI001 triggers if interpolated in styled CSS
        props.push({ name: propName, kind: "union", values: [] });
      }
    }
    result.set(ifaceName, props);
  }

  return result;
}

function parseFiniteTypeExpr(
  expr: string,
  aliasMap: ReadonlyMap<string, string[]>
): string[] | null {
  const parts = expr.split("|").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const values: string[] = [];
  for (const part of parts) {
    if (part === "undefined") continue;
    if (part === "boolean") {
      values.push("true", "false");
      continue;
    }
    if (/^['"][^'"]+['"]$/.test(part)) {
      values.push(part.slice(1, -1));
      continue;
    }
    if (/^\d+$/.test(part)) {
      values.push(part);
      continue;
    }
    const resolvedAlias = aliasMap.get(part);
    if (resolvedAlias) {
      values.push(...resolvedAlias);
      continue;
    }
    return null;
  }
  return values.length > 0 ? Array.from(new Set(values)) : null;
}

export function compileModule(
  source: string,
  moduleName: string,
  options: {
    isUiPackage?: boolean;
    configOverrides?: ReadonlyMap<string, string>;
  } = {}
): CompiledModule {
  const diagnostics = auditSourceLaws(source, { isUiPackage: options.isUiPackage });
  const typeDomains = parseTypeDomains(source);
  const components: ComponentAst[] = [];
  const localTags = new Map<
    string,
    {
      tag: string;
      className: string;
      attrs?: Readonly<Record<string, string | boolean | number>>;
    }
  >();

  const styledHeaderPattern =
    /(export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*styled(?:\.([a-z0-9]+)|\(\s*([A-Za-z0-9_]+)\s*\))(?:\.attrs\(\s*(\{[\s\S]*?\})\s*\))?(?:<([A-Za-z0-9_]+)>)?\s*`/g;

  const knownStyledNames = new Set<string>();
  let preScan: RegExpExecArray | null;
  while ((preScan = styledHeaderPattern.exec(source)) !== null) {
    if (preScan[2]) knownStyledNames.add(preScan[2]);
    const btIdx = preScan.index + preScan[0].length - 1;
    styledHeaderPattern.lastIndex = skipStringLiteral(source, btIdx);
  }
  styledHeaderPattern.lastIndex = 0;

  let cursor = 0;
  let rewritten = "";
  let m: RegExpExecArray | null;

  while ((m = styledHeaderPattern.exec(source)) !== null) {
    rewritten += source.slice(cursor, m.index);
    const openBacktickIdx = m.index + m[0].length - 1;
    const afterCloseBacktick = skipStringLiteral(source, openBacktickIdx);
    let stmtEnd = afterCloseBacktick;
    while (stmtEnd < source.length && /[ \t]/.test(source[stmtEnd] ?? "")) {
      stmtEnd += 1;
    }
    if (source[stmtEnd] === ";") stmtEnd += 1;
    cursor = stmtEnd;
    styledHeaderPattern.lastIndex = stmtEnd;

    const isExported = Boolean(m[1]);
    const compName = m[2] ?? "";
    const htmlTag = m[3] ?? "";
    const baseComp = m[4];
    const attrsRaw = m[5];
    const typeParam = m[6];
    const templateBody = source.slice(openBacktickIdx + 1, afterCloseBacktick - 1);

    const resolvedTag =
      htmlTag ||
      components.find((c) => c.name === baseComp)?.tag ||
      "div";

    const attrs = attrsRaw ? parseSimpleObjectLiteral(attrsRaw) : {};
    const rawProps = typeParam ? typeDomains.get(typeParam) ?? [] : [];

    const parsed = evaluateStyledTemplate(
      compName,
      templateBody,
      rawProps,
      knownStyledNames,
      diagnostics
    );

    const boxTarget =
      !isExported && compName.endsWith("Box")
        ? compName.slice(0, -3)
        : undefined;
    const backsExportedComp =
      boxTarget !== undefined &&
      new RegExp(`export\\s+(?:function|const)\\s+${boxTarget}\\b`).test(source);
    const effectiveName = backsExportedComp && boxTarget ? boxTarget : compName;

    const extraConfig = options.configOverrides?.get(effectiveName);
    const mergedCss = extraConfig
      ? `${parsed.baseCss}\n${resolveStaticInterpolations(extraConfig, knownStyledNames)}`
      : parsed.baseCss;

    const minted =
      isExported || backsExportedComp
        ? mintDefaultVariables(effectiveName, mergedCss)
        : [];

    const compAst: ComponentAst = {
      name: effectiveName,
      tag: resolvedTag,
      baseComponent: baseComp,
      exported: isExported,
      sourceModule: moduleName,
      attrs,
      props: rawProps.filter((p) => p.values.length > 0),
      baseCss: applyMintedVariables(mergedCss, minted),
      propRules: parsed.propRules,
      mintedVars: minted
    };
    components.push(compAst);

    if (!isExported) {
      localTags.set(compName, {
        tag: resolvedTag,
        className: `vui-${effectiveName}`,
        attrs
      });
    } else {
      rewritten += generateComponentTs(compAst, components);
    }
  }
  rewritten += source.slice(cursor);

  // Erase @vespoli/styled imports completely so 0 B style runtime remains
  rewritten = rewritten.replace(
    /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+["']@vespoli\/styled["'];?\n?/g,
    ""
  );
  rewritten = rewritten.replace(
    /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+["']\.\.\/\.\.\/styled\/src\/index\.ts["'];?\n?/g,
    ""
  );

  // Lower JSX elements (including file-local styled tags -> direct HTML elements)
  const loweredTs = transformJsxToRuntimeCalls(rewritten, localTags);
  const strippedJs = stripTypeScriptTypes(loweredTs, { mode: "strip" });
  const cleanedEsm = finalizeEsmImports(strippedJs);

  const perComponentEsm: Record<string, string> = {};
  for (const comp of components) {
    if (!comp.exported) continue;
    const singleTs = generateComponentTs(comp, components);
    const singleLowered = transformJsxToRuntimeCalls(singleTs, localTags);
    const singleJs = finalizeEsmImports(
      stripTypeScriptTypes(singleLowered, { mode: "strip" })
    );
    perComponentEsm[comp.name] = singleJs;
  }

  return {
    esmCode: cleanedEsm,
    components,
    diagnostics,
    perComponentEsm
  };
}

function parseSimpleObjectLiteral(
  raw: string
): Record<string, string | boolean | number> {
  const out: Record<string, string | boolean | number> = {};
  const inner = raw.trim().replace(/^\{|\}$/g, "");
  for (const part of inner.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const k = trimmed.slice(0, colon).trim().replace(/^['"]|['"]$/g, "");
    const v = trimmed.slice(colon + 1).trim();
    if (v === "true") out[k] = true;
    else if (v === "false") out[k] = false;
    else if (/^-?\d+(\.\d+)?$/.test(v)) out[k] = Number(v);
    else out[k] = v.replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function evaluateStyledTemplate(
  compName: string,
  template: string,
  props: readonly PropDomain[],
  knownStyled: ReadonlySet<string>,
  diagnostics: Diagnostic[]
): { baseCss: string; propRules: PropRule[] } {
  const propMap = new Map<string, PropDomain>();
  for (const p of props) propMap.set(p.name, p);

  const propRules: PropRule[] = [];
  let baseCss = "";
  let i = 0;

  while (i < template.length) {
    const start = template.indexOf("${", i);
    if (start < 0) {
      baseCss += template.slice(i);
      break;
    }
    baseCss += template.slice(i, start);
    const end = findTemplateExprEnd(template, start + 2);
    const expr = template.slice(start + 2, end).trim();
    i = end + 1;

    if (TOKEN_EXPR_MAP[expr]) {
      baseCss += TOKEN_EXPR_MAP[expr];
      continue;
    }

    if (knownStyled.has(expr)) {
      baseCss += `.vui-${expr}`;
      continue;
    }

    const mediaMatch = /^media\.(motionAllowed|reducedMotion|forcedColors|light|up\(['"]([a-z]+)['"]\))`([\s\S]*?)`$/.exec(
      expr
    );
    if (mediaMatch) {
      const kind = mediaMatch[1] ?? "";
      const bp = mediaMatch[2] ?? "";
      const innerRaw = mediaMatch[3] ?? "";
      const innerResolved = resolveStaticInterpolations(innerRaw, knownStyled);
      if (kind === "motionAllowed") {
        baseCss += `@media (prefers-reduced-motion: no-preference) {\n${innerResolved}\n}`;
      } else if (kind === "reducedMotion") {
        baseCss += `@media (prefers-reduced-motion: reduce) {\n${innerResolved}\n}`;
      } else if (kind === "forcedColors") {
        baseCss += `@media (forced-colors: active) {\n${innerResolved}\n}`;
      } else if (kind === "light") {
        baseCss += `@media (prefers-color-scheme: light) {\n${innerResolved}\n}`;
      } else if (bp && BREAKPOINT_MIN[bp]) {
        baseCss += `@media (min-width: ${BREAKPOINT_MIN[bp]}) {\n${innerResolved}\n}`;
      }
      continue;
    }

    // Prop predicate: p => p.variant === 'primary' && css`...` OR p => p.compact && css`...`
    const unionPred =
      /^\(?([A-Za-z0-9_]+)\)?\s*=>\s*\1\.([A-Za-z0-9_]+)\s*===\s*(['"][^'"]+['"]|\d+)\s*&&\s*css`([\s\S]*?)`$/.exec(
        expr
      );
    if (unionPred) {
      const propName = unionPred[2] ?? "";
      const rawVal = (unionPred[3] ?? "").replace(/^['"]|['"]$/g, "");
      const bodyRaw = unionPred[4] ?? "";
      const domain = propMap.get(propName);
      if (!domain || domain.values.length === 0 || !domain.values.includes(rawVal)) {
        diagnostics.push({
          code: "VUI001",
          message: `Style prop '${propName}' on ${compName} must have a finite union type including '${rawVal}'.`,
          fix: `Declare '${propName}?: ${JSON.stringify(rawVal)} | ...' on ${compName}'s style props interface.`
        });
      } else {
        propRules.push({
          prop: propName,
          matchValue: rawVal,
          cssBody: resolveStaticInterpolations(bodyRaw, knownStyled)
        });
      }
      continue;
    }

    const boolPred =
      /^\(?([A-Za-z0-9_]+)\)?\s*=>\s*\1\.([A-Za-z0-9_]+)\s*&&\s*css`([\s\S]*?)`$/.exec(
        expr
      );
    if (boolPred) {
      const propName = boolPred[2] ?? "";
      const bodyRaw = boolPred[3] ?? "";
      const domain = propMap.get(propName);
      if (!domain || domain.kind !== "boolean") {
        diagnostics.push({
          code: "VUI001",
          message: `Boolean style interpolation '${propName}' on ${compName} requires '${propName}?: boolean'.`,
          fix: `Declare '${propName}?: boolean' on ${compName}'s style props interface.`
        });
      } else {
        propRules.push({
          prop: propName,
          matchValue: true,
          cssBody: resolveStaticInterpolations(bodyRaw, knownStyled)
        });
      }
      continue;
    }

    diagnostics.push({
      code: "VUI001",
      message: `Unbounded dynamic interpolation '\${${expr}}' in ${compName} cannot be statically erased.`,
      fix: "Replace runtime expression with a finite literal union or boolean style prop using `p => p.prop === 'val' && css`...``."
    });
  }

  return { baseCss, propRules };
}

function resolveStaticInterpolations(
  raw: string,
  knownStyled: ReadonlySet<string>
): string {
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const start = raw.indexOf("${", i);
    if (start < 0) {
      out += raw.slice(i);
      break;
    }
    out += raw.slice(i, start);
    const end = findTemplateExprEnd(raw, start + 2);
    const expr = raw.slice(start + 2, end).trim();
    i = end + 1;
    if (TOKEN_EXPR_MAP[expr]) {
      out += TOKEN_EXPR_MAP[expr];
    } else if (knownStyled.has(expr)) {
      out += `.vui-${expr}`;
    } else {
      out += expr;
    }
  }
  return out;
}

function findTemplateExprEnd(src: string, startIdx: number): number {
  const end = findBalancedBrace(src, startIdx - 1);
  return end < 0 ? src.length - 1 : end;
}

function countPascalWords(name: string): number {
  const matches = name.match(/[A-Z][a-z0-9]*/g);
  return matches ? matches.length : 1;
}

function mintDefaultVariables(compName: string, baseCss: string): MintedVar[] {
  const minted: MintedVar[] = [];
  const words = countPascalWords(compName);
  const twoWordComp = words >= 2;

  const lines = baseCss.split("\n");
  let braceDepth = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.includes("{")) braceDepth += (line.match(/\{/g) ?? []).length;
    if (line.includes("}")) braceDepth -= (line.match(/\}/g) ?? []).length;
    if (braceDepth !== 0) continue;

    const m = /^([a-z-]+)\s*:\s*([^;]+);$/.exec(line);
    if (!m) continue;
    const prop = m[1] ?? "";
    const val = (m[2] ?? "").trim();

    if (prop === "min-height") {
      minted.push({
        name: twoWordComp ? `${compName}Height` : `${compName}MinHeight`,
        defaultExpr: val,
        cssProp: "min-height"
      });
    } else if (prop === "border-radius") {
      minted.push({
        name: `${compName}Radius`,
        defaultExpr: val,
        cssProp: "border-radius"
      });
    } else if (prop === "gap") {
      minted.push({
        name: `${compName}Gap`,
        defaultExpr: val,
        cssProp: "gap"
      });
    } else if (prop === "padding" && !twoWordComp) {
      const parts = val.split(/\s+/);
      if (parts.length === 2) {
        minted.push({
          name: `${compName}PaddingY`,
          defaultExpr: parts[0] ?? val,
          cssProp: "padding-y"
        });
        minted.push({
          name: `${compName}PaddingX`,
          defaultExpr: parts[1] ?? val,
          cssProp: "padding-x"
        });
      }
    }
  }
  return minted;
}

function toScssTokenRef(val: string): string {
  let out = val;
  for (const [cssVarExpr, scssVar] of Object.entries(TOKEN_SCSS_MAP)) {
    out = out.split(cssVarExpr).join(scssVar);
  }
  return out;
}

function applyMintedVariables(baseCss: string, minted: readonly MintedVar[]): string {
  if (minted.length === 0) return baseCss;
  const lines = baseCss.split("\n");
  let braceDepth = 0;
  const padY = minted.find((m) => m.cssProp === "padding-y");
  const padX = minted.find((m) => m.cssProp === "padding-x");

  return lines
    .map((rawLine) => {
      const trimmed = rawLine.trim();
      if (trimmed.includes("{")) braceDepth += (trimmed.match(/\{/g) ?? []).length;
      if (trimmed.includes("}")) braceDepth -= (trimmed.match(/\}/g) ?? []).length;
      if (braceDepth !== 0) return rawLine;

      for (const mv of minted) {
        if (
          (mv.cssProp === "min-height" ||
            mv.cssProp === "border-radius" ||
            mv.cssProp === "gap") &&
          new RegExp(`^\\s*${mv.cssProp}\\s*:`).test(rawLine)
        ) {
          return `  ${mv.cssProp}: $${mv.name};`;
        }
      }
      if (padY && padX && /^\s*padding\s*:/.test(rawLine)) {
        return `  padding: $${padY.name} $${padX.name};`;
      }
      return rawLine;
    })
    .join("\n");
}

function generateComponentTs(
  comp: ComponentAst,
  allComponents: readonly ComponentAst[]
): string {
  const baseComp = comp.baseComponent
    ? allComponents.find((c) => c.name === comp.baseComponent)
    : undefined;
  const mergedProps = baseComp
    ? mergePropDomains(baseComp.props, comp.props)
    : comp.props;
  const mergedAttrs = baseComp
    ? { ...baseComp.attrs, ...comp.attrs }
    : comp.attrs;

  const mapDecls: string[] = [];
  const paramEntries: string[] = [];
  const classExprs: string[] = [];
  const baseClass = baseComp
    ? `vui-${baseComp.name} vui-${comp.name}`
    : `vui-${comp.name}`;

  const hasLoading = mergedProps.some((p) => p.name === "loading");
  const hasInvalid = mergedProps.some((p) => p.name === "invalid");
  const isButtonTag = comp.tag === "button";

  for (const prop of mergedProps) {
    if (prop.name === "aria-label") continue;
    if (prop.kind === "boolean") {
      paramEntries.push(`${prop.name} = false`);
      const targetClass = `vui-${comp.name}--${toKebab(prop.name)}`;
      const hasRule =
        comp.propRules.some((r) => r.prop === prop.name && r.matchValue === true) ||
        Boolean(baseComp?.propRules.some((r) => r.prop === prop.name && r.matchValue === true));
      if (hasRule) {
        const cls =
          comp.propRules.some((r) => r.prop === prop.name && r.matchValue === true)
            ? targetClass
            : `vui-${baseComp!.name}--${toKebab(prop.name)}`;
        classExprs.push(`(${prop.name} ? " ${cls}" : "")`);
      }
    } else if (prop.kind === "union" && prop.values.length > 0) {
      const mapIdent = `_${comp.name}_${prop.name}`;
      const entries: string[] = [];
      for (const val of prop.values) {
        const ownRule = comp.propRules.some(
          (r) => r.prop === prop.name && r.matchValue === val
        );
        const baseRule = baseComp?.propRules.some(
          (r) => r.prop === prop.name && r.matchValue === val
        );
        if (ownRule) {
          entries.push(
            `  ${JSON.stringify(val)}: " vui-${comp.name}--${toKebab(prop.name)}-${val}"`
          );
        } else if (baseRule && baseComp) {
          entries.push(
            `  ${JSON.stringify(val)}: " vui-${baseComp.name}--${toKebab(prop.name)}-${val}"`
          );
        } else {
          entries.push(`  ${JSON.stringify(val)}: ""`);
        }
      }
      mapDecls.push(`const ${mapIdent}: Record<string, string> = {\n${entries.join(",\n")}\n};`);
      const defaultUnion =
        prop.name === "variant" && prop.values.includes("secondary")
          ? ` = "secondary"`
          : "";
      paramEntries.push(`${prop.name}${defaultUnion}`);
      classExprs.push(
        `(${prop.name} !== undefined ? (${mapIdent}[String(${prop.name})] || "") : "")`
      );
    }
  }

  for (const [attrKey, attrVal] of Object.entries(mergedAttrs)) {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(attrKey)) {
      paramEntries.push(`${attrKey} = ${JSON.stringify(attrVal)}`);
    }
  }

  if (hasLoading && isButtonTag) {
    paramEntries.push("disabled");
  }
  paramEntries.push("className");
  paramEntries.push("...props");

  const jsxProps: string[] = [];
  for (const [attrKey, attrVal] of Object.entries(mergedAttrs)) {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(attrKey)) {
      jsxProps.push(`    ${attrKey}`);
    } else {
      jsxProps.push(`    ${JSON.stringify(attrKey)}: ${JSON.stringify(attrVal)}`);
    }
  }

  if (hasLoading) {
    if (isButtonTag) {
      jsxProps.push("    disabled: Boolean(disabled || loading)");
    }
    jsxProps.push('    "aria-busy": loading ? true : undefined');
    jsxProps.push('    "data-loading": loading ? "true" : undefined');
  }
  if (hasInvalid) {
    jsxProps.push('    "aria-invalid": invalid ? true : undefined');
  }

  const fullClassExpr = [
    JSON.stringify(baseClass),
    ...classExprs,
    '(className ? " " + className : "")'
  ].join(" + ");

  jsxProps.push(`    className: ${fullClassExpr}`);
  jsxProps.push("    ...props");

  const prefix = mapDecls.length > 0 ? mapDecls.join("\n") + "\n" : "";
  return `${prefix}export function ${comp.name}({ ${paramEntries.join(", ")} }: Record<string, any>) {\n  return _jsx(${JSON.stringify(comp.tag)}, {\n${jsxProps.join(",\n")}\n  });\n}\n`;
}

function mergePropDomains(
  baseProps: readonly PropDomain[],
  ownProps: readonly PropDomain[]
): PropDomain[] {
  const map = new Map<string, PropDomain>();
  for (const p of baseProps) map.set(p.name, p);
  for (const p of ownProps) map.set(p.name, p);
  return Array.from(map.values());
}

export function toKebab(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

export interface LocalTag {
  readonly tag: string;
  readonly className: string;
  readonly attrs?: Readonly<Record<string, string | boolean | number>>;
}

export function transformJsxToRuntimeCalls(
  code: string,
  localTags: ReadonlyMap<string, LocalTag>
): string {
  let out = "";
  let i = 0;

  while (i < code.length) {
    const ch = code[i] ?? "";
    if (ch === '"' || ch === "'" || ch === "`") {
      const endStr = skipStringLiteral(code, i);
      out += code.slice(i, endStr);
      i = endStr;
      continue;
    }
    if (ch === "/" && code[i + 1] === "/") {
      const nl = code.indexOf("\n", i);
      const end = nl < 0 ? code.length : nl;
      out += code.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      const close = code.indexOf("*/", i + 2);
      const end = close < 0 ? code.length : close + 2;
      out += code.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "<" && isJsxStart(code, i, out)) {
      const parsed = parseJsxElement(code, i, localTags);
      if (parsed) {
        out += parsed.expr;
        i = parsed.nextIndex;
        continue;
      }
    }
    out += ch;
    i += 1;
  }

  return out;
}

function isJsxStart(code: string, idx: number, precedingOut: string): boolean {
  const next = code[idx + 1] ?? "";
  if (!/[A-Za-z>]/.test(next)) return false;

  const trimmedBefore = precedingOut.trimEnd();
  if (trimmedBefore.length === 0) return true;
  const lastChar = trimmedBefore[trimmedBefore.length - 1] ?? "";
  if (/[=(\[{,:?&|!;]/.test(lastChar) || trimmedBefore.endsWith("=>")) {
    return true;
  }
  if (/\b(?:return|case)\s*$/.test(trimmedBefore)) {
    return true;
  }
  return false;
}

function parseJsxElement(
  code: string,
  startIdx: number,
  localTags: ReadonlyMap<string, LocalTag>
): { expr: string; nextIndex: number } | null {
  let i = startIdx + 1;
  if (code[i] === ">") {
    i += 1;
    const children = parseJsxChildren(code, i, "", localTags);
    if (!children) return null;
    return {
      expr: formatJsxCall("_Fragment", [], children.items),
      nextIndex: children.nextIndex
    };
  }

  const nameMatch = /^[A-Za-z_$][A-Za-z0-9_$.-]*/.exec(code.slice(i));
  if (!nameMatch) return null;
  const rawTagName = nameMatch[0];
  i += rawTagName.length;

  const attrsResult = parseJsxAttributes(code, i, localTags);
  if (!attrsResult) return null;
  i = attrsResult.nextIndex;

  const localInfo = localTags.get(rawTagName);
  const targetExpr = localInfo
    ? JSON.stringify(localInfo.tag)
    : /^[a-z]/.test(rawTagName)
      ? JSON.stringify(rawTagName)
      : rawTagName;

  const propEntries = localInfo
    ? injectLocalClass(attrsResult.entries, localInfo.className, localInfo.attrs)
    : attrsResult.entries;

  if (attrsResult.selfClosing) {
    return {
      expr: formatJsxCall(targetExpr, propEntries, []),
      nextIndex: i
    };
  }

  const children = parseJsxChildren(code, i, rawTagName, localTags);
  if (!children) return null;
  return {
    expr: formatJsxCall(targetExpr, propEntries, children.items),
    nextIndex: children.nextIndex
  };
}

type JsxAttrEntry =
  | { kind: "prop"; key: string; valExpr: string }
  | { kind: "spread"; expr: string };

function injectLocalClass(
  entries: readonly JsxAttrEntry[],
  baseClass: string,
  defaultAttrs?: Readonly<Record<string, string | boolean | number>>
): JsxAttrEntry[] {
  const defaultEntries: JsxAttrEntry[] = [];
  if (defaultAttrs) {
    for (const [k, v] of Object.entries(defaultAttrs)) {
      defaultEntries.push({
        kind: "prop",
        key: k,
        valExpr: JSON.stringify(v)
      });
    }
  }
  const existingIdx = entries.findIndex(
    (e) => e.kind === "prop" && e.key === "className"
  );
  if (existingIdx < 0) {
    return [
      ...defaultEntries,
      { kind: "prop", key: "className", valExpr: JSON.stringify(baseClass) },
      ...entries
    ];
  }
  return [
    ...defaultEntries,
    ...entries.map((entry, idx) => {
      if (idx !== existingIdx || entry.kind !== "prop") return entry;
      return {
        kind: "prop",
        key: "className",
        valExpr: `${JSON.stringify(baseClass)} + (${entry.valExpr} ? " " + (${entry.valExpr}) : "")`
      };
    })
  ];
}

function parseJsxAttributes(
  code: string,
  startIdx: number,
  localTags: ReadonlyMap<string, LocalTag>
): { entries: JsxAttrEntry[]; selfClosing: boolean; nextIndex: number } | null {
  const entries: JsxAttrEntry[] = [];
  let i = startIdx;

  while (i < code.length) {
    while (i < code.length && /\s/.test(code[i] ?? "")) i += 1;
    if (code[i] === "/" && code[i + 1] === ">") {
      return { entries, selfClosing: true, nextIndex: i + 2 };
    }
    if (code[i] === ">") {
      return { entries, selfClosing: false, nextIndex: i + 1 };
    }
    if (code[i] === "{") {
      const braceEnd = findBalancedBrace(code, i);
      if (braceEnd < 0) return null;
      const inner = code.slice(i + 1, braceEnd).trim();
      if (inner.startsWith("...")) {
        entries.push({
          kind: "spread",
          expr: transformJsxToRuntimeCalls(inner.slice(3).trim(), localTags)
        });
      }
      i = braceEnd + 1;
      continue;
    }

    const attrMatch = /^[A-Za-z_:][A-Za-z0-9_.:-]*/.exec(code.slice(i));
    if (!attrMatch) return null;
    const attrName = attrMatch[0];
    i += attrName.length;
    while (i < code.length && /\s/.test(code[i] ?? "")) i += 1;

    if (code[i] !== "=") {
      entries.push({ kind: "prop", key: attrName, valExpr: "true" });
      continue;
    }
    i += 1;
    while (i < code.length && /\s/.test(code[i] ?? "")) i += 1;

    const valChar = code[i] ?? "";
    if (valChar === '"' || valChar === "'") {
      const strEnd = skipStringLiteral(code, i);
      entries.push({
        kind: "prop",
        key: attrName,
        valExpr: code.slice(i, strEnd)
      });
      i = strEnd;
    } else if (valChar === "{") {
      const braceEnd = findBalancedBrace(code, i);
      if (braceEnd < 0) return null;
      const rawExpr = code.slice(i + 1, braceEnd).trim();
      entries.push({
        kind: "prop",
        key: attrName,
        valExpr: transformJsxToRuntimeCalls(rawExpr, localTags)
      });
      i = braceEnd + 1;
    } else {
      return null;
    }
  }
  return null;
}

function parseJsxChildren(
  code: string,
  startIdx: number,
  tagName: string,
  localTags: ReadonlyMap<string, LocalTag>
): { items: string[]; nextIndex: number } | null {
  const items: string[] = [];
  let i = startIdx;
  let textStart = i;

  const flushText = (endIdx: number) => {
    const raw = code.slice(textStart, endIdx);
    const normalized = normalizeJsxText(raw);
    if (normalized.length > 0) {
      items.push(JSON.stringify(normalized));
    }
  };

  while (i < code.length) {
    if (code[i] === "<" && code[i + 1] === "/") {
      flushText(i);
      const closeEnd = code.indexOf(">", i + 2);
      if (closeEnd < 0) return null;
      const closedName = code.slice(i + 2, closeEnd).trim();
      if (closedName !== tagName) return null;
      return { items, nextIndex: closeEnd + 1 };
    }
    if (code[i] === "<") {
      flushText(i);
      const child = parseJsxElement(code, i, localTags);
      if (!child) return null;
      items.push(child.expr);
      i = child.nextIndex;
      textStart = i;
      continue;
    }
    if (code[i] === "{") {
      flushText(i);
      const braceEnd = findBalancedBrace(code, i);
      if (braceEnd < 0) return null;
      const expr = code.slice(i + 1, braceEnd).trim();
      if (expr.length > 0 && !/^\/\*[\s\S]*\*\/$/.test(expr)) {
        items.push(transformJsxToRuntimeCalls(expr, localTags));
      }
      i = braceEnd + 1;
      textStart = i;
      continue;
    }
    i += 1;
  }
  return null;
}

function normalizeJsxText(raw: string): string {
  if (!raw.includes("\n")) return raw;
  const lines = raw.split("\n").map((line, idx, arr) => {
    let s = line;
    if (idx > 0) s = s.trimStart();
    if (idx < arr.length - 1) s = s.trimEnd();
    return s;
  });
  return lines.filter((l) => l.length > 0).join(" ");
}

function formatJsxCall(
  targetExpr: string,
  entries: readonly JsxAttrEntry[],
  children: readonly string[]
): string {
  let keyExpr: string | undefined;
  const propParts: string[] = [];

  for (const entry of entries) {
    if (entry.kind === "spread") {
      propParts.push(`...${entry.expr}`);
    } else if (entry.key === "key") {
      keyExpr = entry.valExpr;
    } else {
      const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entry.key)
        ? entry.key
        : JSON.stringify(entry.key);
      propParts.push(`${safeKey}: ${entry.valExpr}`);
    }
  }

  let fnName = "_jsx";
  if (children.length === 1) {
    propParts.push(`children: ${children[0]}`);
  } else if (children.length > 1) {
    fnName = "_jsxs";
    propParts.push(`children: [${children.join(", ")}]`);
  }

  const propsObj = propParts.length > 0 ? `{ ${propParts.join(", ")} }` : "{}";
  if (keyExpr !== undefined) {
    return `${fnName}(${targetExpr}, ${propsObj}, ${keyExpr})`;
  }
  return `${fnName}(${targetExpr}, ${propsObj})`;
}

function skipStringLiteral(code: string, startIdx: number): number {
  const quote = code[startIdx] ?? '"';
  let i = startIdx + 1;
  while (i < code.length) {
    const ch = code[i] ?? "";
    if (quote === "`" && ch === "$" && code[i + 1] === "{") {
      const end = findBalancedBrace(code, i + 1);
      i = end < 0 ? code.length : end + 1;
      continue;
    }
    if (ch === quote && code[i - 1] !== "\\") {
      return i + 1;
    }
    i += 1;
  }
  return code.length;
}

function findBalancedBrace(code: string, openBraceIdx: number): number {
  let depth = 0;
  let i = openBraceIdx;
  while (i < code.length) {
    const ch = code[i] ?? "";
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipStringLiteral(code, i);
      continue;
    }
    if (ch === "/" && code[i + 1] === "/") {
      const nl = code.indexOf("\n", i);
      i = nl < 0 ? code.length : nl + 1;
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      const close = code.indexOf("*/", i + 2);
      i = close < 0 ? code.length : close + 2;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

function finalizeEsmImports(jsCode: string): string {
  const usesJsx = /\b_jsx\s*\(/.test(jsCode);
  const usesJsxs = /\b_jsxs\s*\(/.test(jsCode);
  const usesFragment = /\b_Fragment\b/.test(jsCode);

  const runtimeSpecs: string[] = [];
  if (usesJsx) runtimeSpecs.push("jsx as _jsx");
  if (usesJsxs) runtimeSpecs.push("jsxs as _jsxs");
  if (usesFragment) runtimeSpecs.push("Fragment as _Fragment");

  // Rewrite internal .ts / .tsx relative imports to .js for compiled dist/esm
  const rewrittenImports = jsCode
    .replace(/(from\s+["']\.[^"']*?)\.(?:tsx|ts)(["'])/g, "$1.js$2")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, idx, arr) => !(line === "" && (arr[idx - 1] ?? "") === ""))
    .join("\n")
    .trim();

  const header =
    runtimeSpecs.length > 0
      ? `import { ${runtimeSpecs.join(", ")} } from "react/jsx-runtime";\n`
      : "";

  return (header + rewrittenImports).trim() + "\n";
}
