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

export interface PropertyItemProps extends ComponentPropsWithRef<"div"> {
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
  ...props
}: PropertyItemProps) {
  const cls =
    (mono ? "vui-PropertyItem--mono" : "") +
    (className ? (mono ? " " : "") + className : "");
  if (term !== undefined || value !== undefined) {
    return (
      <PropertyItemBox className={cls || undefined} {...props}>
        <dt>{term}</dt>
        <dd>{value}</dd>
      </PropertyItemBox>
    );
  }
  return (
    <PropertyItemBox className={cls || undefined} {...props}>
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

export interface JsonTreeProps extends ComponentPropsWithRef<"ul"> {
  data?: unknown;
}

function renderJsonEntry(label: string, val: unknown, depth: number): JSX.Element {
  if (val !== null && typeof val === "object" && depth < 6) {
    const entries = Array.isArray(val)
      ? val.map((item, i) => [String(i), item] as const)
      : Object.entries(val as Record<string, unknown>);
    return (
      <li key={label} role="treeitem" aria-expanded={true}>
        <span>{label}:</span>
        <ul role="group">
          {entries.map(([k, v]) => renderJsonEntry(k, v, depth + 1))}
        </ul>
      </li>
    );
  }
  return (
    <li key={label} role="treeitem">
      <span>{label}: </span>
      <span>{JSON.stringify(val)}</span>
    </li>
  );
}

export function JsonTree({
  data,
  children,
  className,
  ...props
}: JsonTreeProps) {
  if (data === undefined) {
    return (
      <JsonTreeBox className={className} {...props}>
        {children}
      </JsonTreeBox>
    );
  }
  const topEntries =
    data !== null && typeof data === "object"
      ? Array.isArray(data)
        ? data.map((item, i) => [String(i), item] as const)
        : Object.entries(data as Record<string, unknown>)
      : [["value", data] as const];

  return (
    <JsonTreeBox className={className} {...props}>
      {topEntries.map(([k, v]) => renderJsonEntry(k, v, 1))}
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
