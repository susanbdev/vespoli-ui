import type { ComponentPropsWithRef, KeyboardEvent, MouseEvent } from "react";
import { styled, css, t } from "@vespoli/styled";

export const FacetBar = styled.aside`
  display: flex;
  flex-direction: column;
  gap: ${t.space[4]};
  padding: ${t.space[4]} ${t.space[4]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.lg};
  background: ${t.color.surface};
  min-width: 0;
`;

export const FacetGroup = styled.fieldset`
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: ${t.space[2]};
  min-width: 0;
`;

const FacetListBox = styled.ul.attrs({ role: "listbox" })`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${t.space[1]};
`;

export interface FacetOption {
  readonly key: string;
  readonly label: string;
  readonly count?: number;
}

export interface FacetListProps extends ComponentPropsWithRef<"ul"> {
  items?: readonly FacetOption[];
  selectedKeys?: ReadonlySet<string> | readonly string[];
  excludedKeys?: ReadonlySet<string> | readonly string[];
  onToggleKey?: (key: string, exclude: boolean) => void;
}

function hasKey(
  collection: ReadonlySet<string> | readonly string[] | undefined,
  key: string
): boolean {
  if (!collection) return false;
  if (Array.isArray(collection)) return collection.includes(key);
  return (collection as ReadonlySet<string>).has(key);
}

export function FacetList({
  items,
  selectedKeys,
  excludedKeys,
  onToggleKey,
  onClick,
  onKeyDown,
  children,
  className,
  ...props
}: FacetListProps) {
  const handleDelegatedClick = (event: MouseEvent<HTMLUListElement>) => {
    onClick?.(event);
    if (!onToggleKey) return;
    const target = event.target as { closest?: (s: string) => HTMLElement | null } | null;
    const optionEl = target?.closest?.("[data-facet-key]");
    const facetKey = optionEl?.getAttribute("data-facet-key");
    if (facetKey) {
      onToggleKey(facetKey, Boolean(event.altKey));
    }
  };

  const handleDelegatedKey = (event: KeyboardEvent<HTMLUListElement>) => {
    onKeyDown?.(event);
    if (!onToggleKey || (event.key !== "Enter" && event.key !== " ")) return;
    const target = event.target as { getAttribute?: (s: string) => string | null } | null;
    const facetKey = target?.getAttribute?.("data-facet-key");
    if (facetKey) {
      event.preventDefault();
      onToggleKey(facetKey, Boolean(event.altKey));
    }
  };

  if (items && items.length > 0) {
    return (
      <FacetListBox
        onClick={handleDelegatedClick}
        onKeyDown={handleDelegatedKey}
        className={className}
        {...props}
      >
        {items.map((item, idx) => {
          const selected = hasKey(selectedKeys, item.key);
          const excluded = hasKey(excludedKeys, item.key);
          return (
            <FacetItem
              key={item.key}
              facetKey={item.key}
              selected={selected}
              excluded={excluded}
              tabIndex={idx === 0 ? 0 : -1}
            >
              <span>{item.label}</span>
              {item.count !== undefined ? <span>{String(item.count)}</span> : null}
            </FacetItem>
          );
        })}
      </FacetListBox>
    );
  }

  return (
    <FacetListBox
      onClick={onToggleKey ? handleDelegatedClick : onClick}
      onKeyDown={onToggleKey ? handleDelegatedKey : onKeyDown}
      className={className}
      {...props}
    >
      {children}
    </FacetListBox>
  );
}

const FacetItemBox = styled.li.attrs({ role: "option" })`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${t.space[2]};
  padding: ${t.space[1]} ${t.space[2]};
  border-radius: ${t.radius.sm};
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &:hover {
    background: ${t.color.raisedHover};
  }

  &[aria-selected="true"] {
    background: ${t.color.raised};
    color: ${t.color.accent};
  }

  &[data-excluded="true"] {
    color: ${t.color.danger};
    text-decoration: line-through;
  }
`;

export interface FacetItemProps extends ComponentPropsWithRef<"li"> {
  facetKey?: string;
  selected?: boolean;
  excluded?: boolean;
}

export function FacetItem({
  facetKey,
  selected = false,
  excluded = false,
  className,
  ...props
}: FacetItemProps) {
  return (
    <FacetItemBox
      data-facet-key={facetKey}
      aria-selected={selected}
      data-excluded={excluded ? "true" : undefined}
      className={className}
      {...props}
    />
  );
}

export const ChipBar = styled.div.attrs({
  role: "region",
  "aria-label": "Active filters"
})`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${t.space[2]};
  min-width: 0;
`;

export interface ChipStyle {
  operator?: "in" | "not";
}

const ChipBox = styled.button.attrs({ type: "button" })<ChipStyle>`
  display: inline-flex;
  align-items: center;
  gap: ${t.space[1]};
  min-height: ${t.size.control.sm};
  padding: 2px ${t.space[2]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.pill};
  background: ${t.color.raised};
  font-size: 0.75rem;
  cursor: pointer;

  ${p => p.operator === "not" && css`
    border-color: ${t.color.dangerBorder};
    background: ${t.color.dangerSurface};
    color: ${t.color.danger};
  `}
`;

export interface ChipProps extends ComponentPropsWithRef<"button"> {
  operator?: "in" | "not";
  onRemove?: () => void;
}

export function Chip({
  operator = "in",
  onRemove,
  onClick,
  className,
  ...props
}: ChipProps) {
  const cls =
    (operator === "not" ? "vui-Chip--operator-not" : "") +
    (className ? (operator === "not" ? " " : "") + className : "");
  return (
    <ChipBox
      onClick={onRemove ?? onClick}
      className={cls || undefined}
      {...props}
    />
  );
}
