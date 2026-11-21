import { memo } from "react";
import type { ComponentPropsWithRef, KeyboardEvent, MouseEvent } from "react";
import { styled, css, t } from "@vespoli/styled";

export interface TableStyleProps {
  loading?: boolean;
}

export const Table = styled.table<TableStyleProps>`
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  font-size: 0.8125rem;
  color: ${t.color.text};
`;

export const TableHead = styled.thead`
  background: ${t.color.surface};
  border-bottom: 1px solid ${t.color.border};
`;

const TableBodyBox = styled.tbody`
  & > tr + tr {
    border-top: 1px solid ${t.color.border};
  }
`;

export interface TableBodyProps
  extends Omit<
    ComponentPropsWithRef<"tbody">,
    "style" | "dangerouslySetInnerHTML"
  > {
  onRowActivate?: (rowKey: string, event: MouseEvent<HTMLTableSectionElement> | KeyboardEvent<HTMLTableSectionElement>) => void;
}

export function TableBody({
  onRowActivate,
  onClick,
  onKeyDown,
  className,
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: TableBodyProps) {
  const handleClick = (event: MouseEvent<HTMLTableSectionElement>) => {
    onClick?.(event);
    if (!onRowActivate) return;
    const target = event.target as { closest?: (s: string) => HTMLElement | null } | null;
    const row = target?.closest?.("tr[data-row-key]");
    const rowKey = row?.getAttribute("data-row-key");
    if (rowKey) {
      onRowActivate(rowKey, event);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    onKeyDown?.(event);
    if (!onRowActivate || (event.key !== "Enter" && event.key !== " ")) return;
    const target = event.target as { closest?: (s: string) => HTMLElement | null } | null;
    const row = target?.closest?.("tr[data-row-key]");
    const rowKey = row?.getAttribute("data-row-key");
    if (rowKey) {
      event.preventDefault();
      onRowActivate(rowKey, event);
    }
  };

  return (
    <TableBodyBox
      {...props}
      onClick={onRowActivate ? handleClick : onClick}
      onKeyDown={onRowActivate ? handleKeyDown : onKeyDown}
      className={className}
    />
  );
}

const TableRowBox = styled.tr`
  background: transparent;

  &:hover {
    background: ${t.color.raisedHover};
  }

  &[aria-selected="true"] {
    background: ${t.color.raised};
  }
`;

export interface TableRowProps
  extends Omit<
    ComponentPropsWithRef<"tr">,
    "style" | "dangerouslySetInnerHTML"
  > {
  rowKey?: string;
  selected?: boolean;
}

function renderTableRow({
  rowKey,
  selected = false,
  className,
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: TableRowProps) {
  return (
    <TableRowBox
      {...props}
      data-row-key={rowKey}
      aria-selected={selected ? true : undefined}
      className={className}
    />
  );
}

export const TableRow = memo(renderTableRow);

export interface TableCellProps {
  align?: "left" | "center" | "right";
  width?: "xs" | "sm" | "md" | "lg" | "auto";
}

export const TableCell = styled.td<TableCellProps>`
  padding: ${t.space[2]} ${t.space[3]};
  text-align: left;
  vertical-align: middle;

  ${p => p.align === "center" && css`
    text-align: center;
  `}
  ${p => p.align === "right" && css`
    text-align: right;
    font-variant-numeric: tabular-nums;
  `}
  ${p => p.width === "xs" && css`
    width: 64px;
  `}
  ${p => p.width === "sm" && css`
    width: 120px;
  `}
  ${p => p.width === "md" && css`
    width: 200px;
  `}
  ${p => p.width === "lg" && css`
    width: 320px;
  `}
`;

export type HeaderCellProps = TableCellProps;

export const HeaderCell = styled.th.attrs({ scope: "col" })<TableCellProps>`
  padding: ${t.space[2]} ${t.space[3]};
  color: ${t.color.muted};
  font-weight: 600;
  text-align: left;
  white-space: nowrap;

  ${p => p.align === "center" && css`
    text-align: center;
  `}
  ${p => p.align === "right" && css`
    text-align: right;
    font-variant-numeric: tabular-nums;
  `}
  ${p => p.width === "xs" && css`
    width: 64px;
  `}
  ${p => p.width === "sm" && css`
    width: 120px;
  `}
  ${p => p.width === "md" && css`
    width: 200px;
  `}
  ${p => p.width === "lg" && css`
    width: 320px;
  `}
`;

export interface VirtualTableProps {
  loading?: boolean;
}

export const VirtualTable = styled(Table)<VirtualTableProps>`
  table-layout: fixed;
`;

export type SpacerBit =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17;

const VirtualSpacerBox = styled.tr.attrs({ "aria-hidden": "true" })`
  border: 0;
  pointer-events: none;
`;

export interface VirtualSpacerProps
  extends Omit<
    ComponentPropsWithRef<"tr">,
    "style" | "dangerouslySetInnerHTML"
  > {
  bit: SpacerBit;
}

export function VirtualSpacer({
  bit,
  className,
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: VirtualSpacerProps) {
  const safeBit =
    Number.isInteger(bit) && bit >= 0 && bit <= 17 ? bit : 0;
  return (
    <VirtualSpacerBox
      {...props}
      data-bit={String(safeBit)}
      className={className}
    />
  );
}

export function decomposeOffset(rowCount: number): SpacerBit[] {
  const safeCount = Number.isFinite(rowCount) ? rowCount : 0;
  const clamped = Math.max(0, Math.min(262143, Math.floor(safeCount)));
  const bits: SpacerBit[] = [];
  for (let b = 0; b <= 17; b += 1) {
    if ((clamped & (1 << b)) !== 0) {
      bits.push(b as SpacerBit);
    }
  }
  return bits;
}

export const TreeTable = styled(Table).attrs({ role: "treegrid" })`
  position: relative;
`;

const TreeRowBox = styled.tr.attrs({ role: "row" })`
  border-bottom: 1px solid ${t.color.border};

  &[data-level="2"] > :first-child { padding-left: 24px; }
  &[data-level="3"] > :first-child { padding-left: 40px; }
  &[data-level="4"] > :first-child { padding-left: 56px; }
  &[data-level="5"] > :first-child { padding-left: 72px; }
  &[data-level="6"] > :first-child { padding-left: 88px; }
  &[data-level="7"] > :first-child { padding-left: 104px; }
  &[data-level="8"] > :first-child { padding-left: 120px; }
`;

export type TreeDepth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface TreeRowProps
  extends Omit<
    ComponentPropsWithRef<"tr">,
    "style" | "dangerouslySetInnerHTML"
  > {
  level: TreeDepth;
  expanded?: boolean;
}

export function TreeRow({
  level,
  expanded,
  className,
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: TreeRowProps) {
  const safeLevel =
    Number.isInteger(level) && level >= 1 && level <= 8 ? level : 1;
  return (
    <TreeRowBox
      {...props}
      aria-level={safeLevel}
      aria-expanded={expanded}
      data-level={String(safeLevel)}
      className={className}
    />
  );
}

export const DagRail = styled.div`
  display: inline-flex;
  align-items: stretch;
  height: 28px;
  vertical-align: middle;
`;

export interface DagLaneProps {
  edge?: "straight" | "fork-right" | "merge-left" | "ghost";
  node?: "commit" | "merge" | "head" | "ghost";
}

export const DagLane = styled.span.attrs({ "aria-hidden": "true" })<DagLaneProps>`
  position: relative;
  display: inline-block;
  width: 16px;
  height: 100%;

  &::before {
    content: "";
    position: absolute;
    left: 7px;
    inset-block: 0;
    border-left: 2px solid ${t.color.borderStrong};
  }

  &::after {
    position: absolute;
  }

  &[class*="--node-"]::after {
    content: "";
    left: 4px;
    top: calc(50% - 4px);
    width: 8px;
    height: 8px;
    border-radius: ${t.radius.pill};
  }

  ${p => p.edge === "ghost" && css`
    &::before { border-left: 2px dashed ${t.color.danger}; }
  `}

  ${p => p.edge === "fork-right" && css`
    &::after {
      content: "";
      left: 7px;
      top: 50%;
      width: 9px;
      height: 50%;
      border-top: 2px solid ${t.color.accent};
      border-left: 2px solid ${t.color.accent};
      border-top-left-radius: 6px;
    }
  `}

  ${p => p.edge === "merge-left" && css`
    &::after {
      content: "";
      left: 0;
      bottom: 50%;
      width: 9px;
      height: 50%;
      border-bottom: 2px solid ${t.color.accent};
      border-right: 2px solid ${t.color.accent};
      border-bottom-right-radius: 6px;
    }
  `}

  ${p => p.node === "commit" && css`
    &::after { background: ${t.color.text}; }
  `}

  ${p => p.node === "head" && css`
    &::after { border: 2px solid ${t.color.accent}; background: ${t.color.bg}; }
  `}

  ${p => p.node === "merge" && css`
    &::after { border: 2px solid ${t.color.success}; background: ${t.color.surface}; }
  `}

  ${p => p.node === "ghost" && css`
    &::after { border: 1px dashed ${t.color.danger}; background: ${t.color.dangerSurface}; }
  `}
`;
