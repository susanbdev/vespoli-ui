import type { ComponentPropsWithRef } from "react";
import { styled, css, t } from "@vespoli/styled";

export type StatusTone = "neutral" | "accent" | "success" | "warn" | "danger";
export type AlertSeverity = "info" | "warn" | "danger" | "critical";
export type MetricTrend = "up" | "down" | "flat";
export type GlyphName =
  | "chevron-right"
  | "chevron-down"
  | "chevron-left"
  | "chevron-up"
  | "check"
  | "close"
  | "sort"
  | "dot"
  | "shield"
  | "branch"
  | "lock"
  | "merkle"
  | "commit"
  | "snapshot"
  | "alert"
  | "terminal";

export interface BadgeStyleProps {
  tone?: StatusTone;
}

export const Badge = styled.span<BadgeStyleProps>`
  display: inline-flex;
  align-items: center;
  gap: ${t.space[1]};
  padding: 2px ${t.space[2]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.pill};
  background: ${t.color.raised};
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;

  ${p => p.tone === "accent" && css`
    border-color: ${t.color.accent};
    color: ${t.color.accent};
  `}
  ${p => p.tone === "success" && css`
    background: ${t.color.successSurface};
    border-color: ${t.color.successBorder};
    color: ${t.color.success};
  `}
  ${p => p.tone === "warn" && css`
    background: ${t.color.warnSurface};
    border-color: ${t.color.warnBorder};
    color: ${t.color.warn};
  `}
  ${p => p.tone === "danger" && css`
    background: ${t.color.dangerSurface};
    border-color: ${t.color.dangerBorder};
    color: ${t.color.danger};
  `}
`;

export interface ProofBadgeProps {
  tone?: StatusTone;
  verified?: boolean;
}

export const ProofBadge = styled(Badge)<ProofBadgeProps>`
  background: ${t.color.surface};
  color: ${t.color.muted};
  font-family: ${t.font.mono};

  &::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: ${t.radius.pill};
    background: currentColor;
  }

  ${p => p.verified && css`
    background: ${t.color.successSurface};
    border-color: ${t.color.successBorder};
    color: ${t.color.success};
  `}
`;

export interface DigestChipProps {
  tone?: StatusTone;
}

export const DigestChip = styled.button.attrs({ type: "button" })<DigestChipProps>`
  display: inline-flex;
  align-items: center;
  gap: ${t.space[1]};
  min-height: ${t.size.control.sm};
  padding: 2px ${t.space[2]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.sm};
  background: ${t.color.raised};
  font-family: ${t.font.mono};
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &:hover {
    border-color: ${t.color.borderStrong};
  }

  ${p => p.tone === "accent" && css` border-color: ${t.color.accent}; color: ${t.color.accent}; `}
  ${p => p.tone === "success" && css` background: ${t.color.successSurface}; border-color: ${t.color.successBorder}; color: ${t.color.success}; `}
  ${p => p.tone === "warn" && css` background: ${t.color.warnSurface}; border-color: ${t.color.warnBorder}; color: ${t.color.warn}; `}
  ${p => p.tone === "danger" && css` background: ${t.color.dangerSurface}; border-color: ${t.color.dangerBorder}; color: ${t.color.danger}; `}
`;

export interface NoticeStyleProps {
  severity?: AlertSeverity;
}

export const Notice = styled.div.attrs({ role: "status" })<NoticeStyleProps>`
  padding: ${t.space[3]} ${t.space[4]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.md};
  background: ${t.color.surface};
  font-size: 0.875rem;

  ${p => p.severity === "info" && css`
    background: ${t.color.surface};
    border-color: ${t.color.border};
    color: ${t.color.text};
  `}
  ${p => p.severity === "warn" && css`
    background: ${t.color.warnSurface};
    border-color: ${t.color.warnBorder};
    color: ${t.color.warn};
  `}
  ${p => p.severity === "danger" && css`
    background: ${t.color.dangerSurface};
    border-color: ${t.color.dangerBorder};
    color: ${t.color.danger};
  `}
  ${p => p.severity === "critical" && css`
    background: ${t.color.dangerSurface};
    border-color: ${t.color.danger};
    color: ${t.color.danger};
    font-weight: 600;
  `}
`;

export interface AlertBannerProps {
  severity?: AlertSeverity;
}

export const AlertBanner = styled(Notice).attrs({ role: "alert" })<AlertBannerProps>`
  border-color: ${t.color.dangerBorder};
  background: ${t.color.dangerSurface};
  color: ${t.color.danger};
`;

export const Metrics = styled.section`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: ${t.space[3]};
  min-width: 0;
`;

export interface MetricItemProps {
  trend?: MetricTrend;
}

export const MetricItem = styled.article<MetricItemProps>`
  display: flex;
  flex-direction: column;
  gap: ${t.space[1]};
  padding: ${t.space[3]} ${t.space[4]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.md};
  background: ${t.color.surface};
  font-variant-numeric: tabular-nums;

  ${p => p.trend === "up" && css`
    border-left: 3px solid ${t.color.success};
  `}
  ${p => p.trend === "down" && css`
    border-left: 3px solid ${t.color.danger};
  `}
  ${p => p.trend === "flat" && css`
    border-left: 3px solid ${t.color.muted};
  `}
`;

const IconBox = styled.span.attrs({ "aria-hidden": "true" })`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  font-size: 16px;
  line-height: 1;
  color: currentColor;
  flex-shrink: 0;

  &.vui-Icon--size-sm { font-size: 12px; }
  &.vui-Icon--size-md { font-size: 16px; }
  &.vui-Icon--size-lg { font-size: 20px; }

  &[data-glyph="font"] {
    font-family: "vui-glyphs";
    font-style: normal;
    font-weight: 400;
  }

  &[data-icon^="chevron-"]::before {
    content: "";
    width: 6px;
    height: 6px;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
  }
  &[data-icon="chevron-right"]::before { transform: rotate(-45deg); }
  &[data-icon="chevron-down"]::before { transform: rotate(45deg); }
  &[data-icon="chevron-left"]::before { transform: rotate(135deg); }
  &[data-icon="chevron-up"]::before { transform: rotate(-135deg); }

  &[data-icon="check"]::before {
    content: "";
    width: 9px;
    height: 5px;
    border-left: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(-45deg);
  }

  &[data-icon="close"]::before,
  &[data-icon="close"]::after {
    content: "";
    position: absolute;
    width: 12px;
    height: 2px;
    background: currentColor;
  }
  &[data-icon="close"]::before { transform: rotate(45deg); }
  &[data-icon="close"]::after { transform: rotate(-45deg); }

  &[data-icon="sort"]::before {
    content: "";
    width: 6px;
    height: 6px;
    border-top: 2px solid currentColor;
    border-right: 2px solid currentColor;
    transform: rotate(-45deg);
  }

  &[data-icon="dot"]::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: ${t.radius.pill};
    background: currentColor;
  }
`;

const GLYPH_CHAR_MAP: Readonly<Record<string, string>> = {
  shield: String.fromCharCode(0xe001),
  branch: String.fromCharCode(0xe002),
  lock: String.fromCharCode(0xe003),
  merkle: String.fromCharCode(0xe004),
  commit: String.fromCharCode(0xe005),
  snapshot: String.fromCharCode(0xe006),
  alert: String.fromCharCode(0xe007),
  terminal: String.fromCharCode(0xe008)
};

export interface IconProps extends ComponentPropsWithRef<"span"> {
  name: GlyphName;
  size?: "sm" | "md" | "lg";
}

export function Icon({ name, size = "md", className, ...props }: IconProps) {
  const glyphChar = GLYPH_CHAR_MAP[name];
  const cls =
    `vui-Icon--size-${size}` + (className ? " " + className : "");
  return (
    <IconBox
      data-icon={name}
      data-glyph={glyphChar ? "font" : "css"}
      className={cls}
      {...props}
    >
      {glyphChar ?? null}
    </IconBox>
  );
}
