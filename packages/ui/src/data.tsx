import type { ComponentPropsWithRef, JSX, ReactNode } from "react";
import { styled, css, t } from "@vespoli/styled";

export const Properties = styled.dl`
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: ${t.space[3]};
  min-width: 0;
`;

export interface PropertyStyle {
  mono?: boolean;
}

const PropertyItemBox = styled.div<PropertyStyle>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  & > dt {
    color: ${t.color.muted};
    font-size: 0.75rem;
  }

  & > dd {
    margin: 0;
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }

  ${p => p.mono && css`
    & > dd {
      font-family: ${t.font.mono};
      font-variant-numeric: tabular-nums;
    }
  `}
`;

export interface PropertyItemProps
  extends Omit<
    ComponentPropsWithRef<"div">,
    "style" | "dangerouslySetInnerHTML"
  > {
  mono?: boolean;
  term?: ReactNode;
  value?: ReactNode;
}

export function PropertyItem({
  mono = false,
  term,
  value,
  children,
  className,
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: PropertyItemProps) {
  const cls =
    (mono ? "vui-PropertyItem--mono" : "") +
    (className ? (mono ? " " : "") + className : "");
  if (term !== undefined || value !== undefined) {
    return (
      <PropertyItemBox {...props} className={cls || undefined}>
        <dt>{term}</dt>
        <dd>{value}</dd>
      </PropertyItemBox>
    );
  }
  return (
    <PropertyItemBox {...props} className={cls || undefined}>
      {children}
    </PropertyItemBox>
  );
}

export const Disclosure = styled.details`
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.md};
  background: ${t.color.surface};
  padding: ${t.space[2]} ${t.space[3]};
`;

export const Summary = styled.summary`
  cursor: pointer;
  font-weight: 500;
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${t.space[2]};

  &::-webkit-details-marker {
    display: none;
  }

  &::after {
    content: "";
    width: 6px;
    height: 6px;
    border-right: 2px solid ${t.color.muted};
    border-bottom: 2px solid ${t.color.muted};
    transform: rotate(-45deg);
  }

  details[open] > &::after {
    transform: rotate(45deg);
  }
`;

export const Code = styled.code`
  padding: 1px ${t.space[1]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.sm};
  background: ${t.color.raised};
  font-family: ${t.font.mono};
  font-size: 0.8125em;
`;

export interface CodeBlockProps {
  wrap?: boolean;
}

export const CodeBlock = styled.pre<CodeBlockProps>`
  margin: 0;
  padding: ${t.space[3]} ${t.space[4]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.md};
  background: ${t.color.bg};
  font-family: ${t.font.mono};
  font-size: 0.8125rem;
  overflow-x: auto;
  min-width: 0;

  ${p => p.wrap && css`
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  `}
`;

const JsonTreeBox = styled.ul.attrs({ role: "tree" })`
  list-style: none;
  margin: 0;
  padding: ${t.space[3]} ${t.space[4]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.md};
  background: ${t.color.bg};
  font-family: ${t.font.mono};
  font-size: 0.8125rem;

  & ul {
    list-style: none;
    margin: 0;
    padding-left: ${t.space[4]};
  }
`;

const MAX_JSON_TREE_DEPTH = 32;

export interface JsonTreeProps
  extends Omit<
    ComponentPropsWithRef<"ul">,
    "style" | "dangerouslySetInnerHTML"
  > {
  data?: unknown;
  maxDepth?: number;
}

function formatJsonLeaf(val: unknown): string {
  if (typeof val === "bigint") return `${val}n`;
  if (typeof val === "symbol" || typeof val === "function") return String(val);
  if (val === undefined) return "undefined";
  return JSON.stringify(val) ?? String(val);
}

function renderJsonEntry(
  label: string,
  val: unknown,
  depth: number,
  limit: number,
  seen: WeakSet<object>
): JSX.Element {
  if (val !== null && typeof val === "object") {
    if (seen.has(val)) {
      return (
        <li key={label} role="treeitem">
          <span>{label}: </span>
          <span>"[Circular]"</span>
        </li>
      );
    }
    if (depth >= limit) {
      return (
        <li key={label} role="treeitem">
          <span>{label}: </span>
          <span>{Array.isArray(val) ? "[Array]" : "[Object]"}</span>
        </li>
      );
    }
    seen.add(val);
    const entries = Array.isArray(val)
      ? val.map((item, i) => [String(i), item] as const)
      : Object.entries(val as Record<string, unknown>);
    const renderedKids = entries.map(([k, v]) =>
      renderJsonEntry(k, v, depth + 1, limit, seen)
    );
    seen.delete(val);
    return (
      <li key={label} role="treeitem" aria-expanded={true}>
        <span>{label}:</span>
        <ul role="group">{renderedKids}</ul>
      </li>
    );
  }
  return (
    <li key={label} role="treeitem">
      <span>{label}: </span>
      <span>{formatJsonLeaf(val)}</span>
    </li>
  );
}

export function JsonTree({
  data,
  maxDepth = MAX_JSON_TREE_DEPTH,
  children,
  className,
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: JsonTreeProps) {
  if (data === undefined) {
    return (
      <JsonTreeBox {...props} className={className}>
        {children}
      </JsonTreeBox>
    );
  }
  const safeLimit = Number.isFinite(maxDepth)
    ? Math.max(1, Math.min(MAX_JSON_TREE_DEPTH, Math.floor(maxDepth)))
    : MAX_JSON_TREE_DEPTH;
  const seen = new WeakSet<object>();
  let topEntries: ReadonlyArray<readonly [string, unknown]>;
  if (data !== null && typeof data === "object") {
    seen.add(data);
    topEntries = Array.isArray(data)
      ? data.map((item, i) => [String(i), item] as const)
      : Object.entries(data as Record<string, unknown>);
  } else {
    topEntries = [["value", data] as const];
  }

  return (
    <JsonTreeBox {...props} className={className}>
      {topEntries.map(([k, v]) => renderJsonEntry(k, v, 1, safeLimit, seen))}
    </JsonTreeBox>
  );
}

export const Empty = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${t.space[2]};
  padding: ${t.space[7]} ${t.space[4]};
  border: 1px dashed ${t.color.border};
  border-radius: ${t.radius.lg};
  color: ${t.color.muted};
  text-align: center;
`;
