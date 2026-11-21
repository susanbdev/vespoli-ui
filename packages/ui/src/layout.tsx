import type { ComponentPropsWithRef } from "react";
import { styled, css, t } from "@vespoli/styled";

export interface ShellStyleProps {
  loading?: boolean;
}

export const Shell = styled.div<ShellStyleProps>`
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr;
  background: ${t.color.bg};
`;

export interface SplitViewProps {
  ratio?: "60-40" | "70-30" | "50-50";
  collapsed?: boolean;
}

export const SplitView = styled.div<SplitViewProps>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: ${t.space[4]};
  min-width: 0;

  ${p => p.ratio === "60-40" && css`
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  `}

  ${p => p.ratio === "70-30" && css`
    grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);
  `}

  ${p => p.ratio === "50-50" && css`
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  `}

  ${p => p.collapsed && css`
    grid-template-columns: minmax(0, 1fr);
  `}
`;

export interface CardStyleProps {
  padding?: "none" | "sm" | "md" | "lg";
  loading?: boolean;
}

export const Card = styled.section<CardStyleProps>`
  padding: ${t.space[4]} ${t.space[4]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.lg};
  background: ${t.color.surface};
  min-width: 0;

  ${p => p.padding === "none" && css`
    padding: 0;
  `}

  ${p => p.padding === "sm" && css`
    padding: ${t.space[2]} ${t.space[3]};
  `}

  ${p => p.padding === "lg" && css`
    padding: ${t.space[6]} ${t.space[6]};
  `}
`;

export interface StackStyleProps {
  direction?: "column" | "row";
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
}

export const Stack = styled.div<StackStyleProps>`
  display: flex;
  flex-direction: column;
  gap: ${t.space[3]};
  min-width: 0;

  ${p => p.direction === "row" && css`
    flex-direction: row;
  `}
  ${p => p.gap === 0 && css`
    gap: ${t.space[0]};
  `}
  ${p => p.gap === 1 && css`
    gap: ${t.space[1]};
  `}
  ${p => p.gap === 2 && css`
    gap: ${t.space[2]};
  `}
  ${p => p.gap === 3 && css`
    gap: ${t.space[3]};
  `}
  ${p => p.gap === 4 && css`
    gap: ${t.space[4]};
  `}
  ${p => p.gap === 5 && css`
    gap: ${t.space[5]};
  `}
  ${p => p.gap === 6 && css`
    gap: ${t.space[6]};
  `}
  ${p => p.gap === 7 && css`
    gap: ${t.space[7]};
  `}
  ${p => p.gap === 8 && css`
    gap: ${t.space[8]};
  `}
  ${p => p.align === "start" && css`
    align-items: flex-start;
  `}
  ${p => p.align === "center" && css`
    align-items: center;
  `}
  ${p => p.align === "end" && css`
    align-items: flex-end;
  `}
  ${p => p.align === "stretch" && css`
    align-items: stretch;
  `}
  ${p => p.align === "baseline" && css`
    align-items: baseline;
  `}
  ${p => p.justify === "start" && css`
    justify-content: flex-start;
  `}
  ${p => p.justify === "center" && css`
    justify-content: center;
  `}
  ${p => p.justify === "end" && css`
    justify-content: flex-end;
  `}
  ${p => p.justify === "between" && css`
    justify-content: space-between;
  `}
  ${p => p.wrap && css`
    flex-wrap: wrap;
  `}
`;

export interface ToolbarStyleProps {
  gap?: 1 | 2 | 3 | 4;
  justify?: "start" | "between" | "end";
}

export const Toolbar = styled.div.attrs({ role: "toolbar" })<ToolbarStyleProps>`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${t.space[2]};
  min-width: 0;

  ${p => p.gap === 1 && css`
    gap: ${t.space[1]};
  `}
  ${p => p.gap === 2 && css`
    gap: ${t.space[2]};
  `}
  ${p => p.gap === 3 && css`
    gap: ${t.space[3]};
  `}
  ${p => p.gap === 4 && css`
    gap: ${t.space[4]};
  `}
  ${p => p.justify === "start" && css`
    justify-content: flex-start;
  `}
  ${p => p.justify === "between" && css`
    justify-content: space-between;
  `}
  ${p => p.justify === "end" && css`
    justify-content: flex-end;
  `}
`;

export type HeadingRank = 1 | 2 | 3 | 4 | 5 | 6;
export type HeadingScale = "xs" | "sm" | "md" | "lg" | "xl";

export interface HeadingStyleProps {
  size?: HeadingScale;
}

const HeadingBox = styled.h2<HeadingStyleProps>`
  margin: 0;
  font-weight: 600;
  letter-spacing: -0.015em;
  line-height: 1.25;

  ${p => p.size === "xs" && css` font-size: 0.8125rem; `}
  ${p => p.size === "sm" && css` font-size: 0.9375rem; `}
  ${p => p.size === "md" && css` font-size: 1.125rem; `}
  ${p => p.size === "lg" && css` font-size: 1.375rem; `}
  ${p => p.size === "xl" && css` font-size: 1.75rem; `}
`;

const HEADING_SIZE_MAP: Readonly<Record<string, string>> = Object.freeze({
  __proto__: null,
  xs: "vui-Heading--size-xs",
  sm: "vui-Heading--size-sm",
  md: "vui-Heading--size-md",
  lg: "vui-Heading--size-lg",
  xl: "vui-Heading--size-xl"
} as unknown as Record<string, string>);

export interface HeadingProps
  extends Omit<
    ComponentPropsWithRef<"h2">,
    "style" | "dangerouslySetInnerHTML"
  > {
  level?: HeadingRank;
  size?: HeadingScale;
}

export function Heading({
  level = 2,
  size = "md",
  className,
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: HeadingProps) {
  const sizeCls = Object.hasOwn(HEADING_SIZE_MAP, String(size))
    ? HEADING_SIZE_MAP[String(size)]!
    : HEADING_SIZE_MAP.md!;
  const cls =
    "vui-Heading " + sizeCls + (className ? " " + className : "");
  if (level === 1) return <h1 {...props} className={cls} />;
  if (level === 3) return <h3 {...props} className={cls} />;
  if (level === 4) return <h4 {...props} className={cls} />;
  if (level === 5) return <h5 {...props} className={cls} />;
  if (level === 6) return <h6 {...props} className={cls} />;
  return (
    <HeadingBox
      {...props}
      className={sizeCls + (className ? " " + className : "")}
    />
  );
}

export const Breadcrumbs = styled.nav.attrs({ "aria-label": "Breadcrumb" })`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${t.space[2]};
  color: ${t.color.muted};
  font-size: 0.875rem;
`;

const CrumbBox = styled.a`
  display: inline-flex;
  align-items: center;
  gap: ${t.space[2]};
  color: ${t.color.muted};
  text-decoration: none;

  &:hover {
    color: ${t.color.text};
  }

  &[aria-current="page"] {
    color: ${t.color.text};
    font-weight: 600;
  }
`;

export function sanitizeHref(rawHref: string | undefined): string | undefined {
  if (typeof rawHref !== "string") return undefined;
  let cleaned = "";
  for (let i = 0; i < rawHref.length; i += 1) {
    const code = rawHref.charCodeAt(i);
    if (code <= 32 || code === 127) continue;
    cleaned += rawHref[i];
  }
  if (cleaned.length === 0) return undefined;
  if (cleaned.startsWith("/")) {
    if (cleaned.startsWith("//") || cleaned.startsWith("/\\")) {
      return undefined;
    }
    return cleaned;
  }
  if (cleaned.startsWith("#") || cleaned.startsWith("?")) {
    return cleaned;
  }
  const lower = cleaned.toLowerCase();
  if (
    lower.startsWith("https:") ||
    lower.startsWith("http:") ||
    lower.startsWith("mailto:")
  ) {
    return cleaned;
  }
  return undefined;
}

export interface CrumbProps
  extends Omit<ComponentPropsWithRef<"a">, "style" | "dangerouslySetInnerHTML"> {
  current?: boolean;
}

export function Crumb({
  current = false,
  href,
  className,
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: CrumbProps) {
  const ariaCurrent = current ? "page" : undefined;
  const safeHref = sanitizeHref(href);
  if (!safeHref) {
    const spanProps = props as Omit<
      ComponentPropsWithRef<"span">,
      "style" | "dangerouslySetInnerHTML"
    >;
    return (
      <span
        {...spanProps}
        aria-current={ariaCurrent}
        className={"vui-Crumb" + (className ? " " + className : "")}
      />
    );
  }
  return (
    <CrumbBox
      {...props}
      href={safeHref}
      aria-current={ariaCurrent}
      className={className}
    />
  );
}
