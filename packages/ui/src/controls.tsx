import type { ComponentPropsWithRef } from "react";
import { styled, css, media, t } from "@vespoli/styled";

export interface ButtonStyleProps {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  compact?: boolean;
  loading?: boolean;
}

export const Button = styled.button.attrs({ type: "button" })<ButtonStyleProps>`
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
  font-size: 0.875rem;
  font-weight: 500;
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

  ${p => p.variant === "primary" && css`
    background: ${t.color.accent};
    color: ${t.color.accentInk};
    border-color: ${t.color.accent};
    font-weight: 600;
    &:hover:not(:disabled) {
      background: ${t.color.accentHover};
    }
  `}

  ${p => p.variant === "quiet" && css`
    background: transparent;
    border-color: transparent;
    color: ${t.color.muted};
    &:hover:not(:disabled) {
      color: ${t.color.text};
      background: ${t.color.raised};
    }
  `}

  ${p => p.variant === "danger" && css`
    background: ${t.color.dangerSurface};
    color: ${t.color.danger};
    border-color: ${t.color.dangerBorder};
  `}

  ${p => p.compact && css`
    min-height: ${t.size.control.sm};
    padding: ${t.space[1]} ${t.space[2]};
    font-size: 0.8125rem;
  `}
`;

export interface IconButtonProps {
  "aria-label": string;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  compact?: boolean;
  loading?: boolean;
}

export const IconButton = styled(Button)<IconButtonProps>`
  padding: ${t.space[1]};
  aspect-ratio: 1 / 1;
`;

export interface InputStyleProps {
  compact?: boolean;
  invalid?: boolean;
  mono?: boolean;
}

export const Input = styled.input<InputStyleProps>`
  min-height: ${t.size.control.md};
  padding: ${t.space[1]} ${t.space[3]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.md};
  background: ${t.color.raised};
  font-size: 0.875rem;
  width: 100%;
  min-width: 0;

  &:focus {
    border-color: ${t.color.borderStrong};
  }

  &[aria-invalid="true"] {
    border-color: ${t.color.danger};
  }

  ${p => p.compact && css`
    min-height: ${t.size.control.sm};
    padding: ${t.space[1]} ${t.space[2]};
    font-size: 0.8125rem;
  `}

  ${p => p.mono && css`
    font-family: ${t.font.mono};
    font-variant-numeric: tabular-nums;
  `}
`;

export interface SelectStyleProps {
  compact?: boolean;
  invalid?: boolean;
}

export const Select = styled.select<SelectStyleProps>`
  appearance: none;
  min-height: ${t.size.control.md};
  padding: ${t.space[1]} ${t.space[6]} ${t.space[1]} ${t.space[3]};
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.md};
  background: ${t.color.raised} no-repeat;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%;
  background-size: 5px 5px;
  font-size: 0.875rem;
  width: 100%;
  min-width: 0;
  cursor: pointer;

  &[aria-invalid="true"] {
    border-color: ${t.color.danger};
  }

  ${p => p.compact && css`
    min-height: ${t.size.control.sm};
    padding: ${t.space[1]} ${t.space[5]} ${t.space[1]} ${t.space[2]};
    font-size: 0.8125rem;
  `}
`;

export interface CheckboxStyleProps {
  invalid?: boolean;
}

export const Checkbox = styled.input.attrs({ type: "checkbox" })<CheckboxStyleProps>`
  appearance: none;
  display: inline-grid;
  place-content: center;
  width: 16px;
  height: 16px;
  margin: 0;
  border: 1px solid ${t.color.borderStrong};
  border-radius: ${t.radius.sm};
  background: ${t.color.raised};
  cursor: pointer;

  &::after {
    content: "";
    width: 9px;
    height: 5px;
    border-left: 2px solid ${t.color.accentInk};
    border-bottom: 2px solid ${t.color.accentInk};
    transform: rotate(-45deg) scale(0);
  }

  &:checked {
    background: ${t.color.accent};
    border-color: ${t.color.accent};
  }

  &:checked::after {
    transform: rotate(-45deg) scale(1);
  }

  &[aria-invalid="true"] {
    border-color: ${t.color.danger};
  }

  ${media.motionAllowed`
    &::after {
      transition: transform 100ms ${t.ease.tactile};
    }
  `}
`;

export interface LabelStyleProps {
  muted?: boolean;
}

export const Label = styled.label<LabelStyleProps>`
  display: inline-block;
  color: ${t.color.text};
  font-size: 0.8125rem;
  font-weight: 500;

  ${p => p.muted && css`
    color: ${t.color.muted};
  `}
`;

export interface FieldStyleProps {
  gap?: 1 | 2 | 3;
}

export const Field = styled.div<FieldStyleProps>`
  display: flex;
  flex-direction: column;
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
`;

export const FieldHint = styled.p`
  margin: 0;
  color: ${t.color.muted};
  font-size: 0.75rem;
`;

export const FieldError = styled.p.attrs({ role: "alert" })`
  margin: 0;
  color: ${t.color.danger};
  font-size: 0.75rem;
  font-weight: 500;
`;

export interface RangeFieldProps {
  compact?: boolean;
}

export const RangeField = styled.div<RangeFieldProps>`
  display: grid;
  align-items: center;
  min-height: ${t.size.control.lg};
  position: relative;
  min-width: 0;

  & > * {
    grid-area: 1 / 1;
  }

  & > input[type="range"] {
    pointer-events: none;
    background: transparent;
    border: 0;
    margin: 0;
    width: 100%;
  }

  ${p => p.compact && css`
    min-height: ${t.size.control.md};
  `}
`;

export interface SegmentsStyleProps {
  compact?: boolean;
}

export const Segments = styled.div.attrs({ role: "radiogroup" })<SegmentsStyleProps>`
  display: inline-flex;
  align-items: center;
  gap: ${t.space[1]};
  padding: 2px;
  border: 1px solid ${t.color.border};
  border-radius: ${t.radius.md};
  background: ${t.color.surface};
`;

const SegmentBox = styled.button.attrs({ type: "button", role: "radio" })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: ${t.size.control.sm};
  padding: ${t.space[1]} ${t.space[3]};
  border: 0;
  border-radius: ${t.radius.sm};
  background: transparent;
  color: ${t.color.muted};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;

  &[aria-checked="true"] {
    background: ${t.color.raised};
    color: ${t.color.text};
  }

  &.vui-Segment--compact {
    padding: 2px ${t.space[2]};
  }
`;

export interface SegmentProps extends ComponentPropsWithRef<"button"> {
  active?: boolean;
  compact?: boolean;
}

export function Segment({
  active = false,
  compact = false,
  className,
  ...props
}: SegmentProps) {
  const cls =
    (compact ? "vui-Segment--compact" : "") +
    (className ? (compact ? " " : "") + className : "");
  return (
    <SegmentBox
      aria-checked={active}
      tabIndex={active ? 0 : -1}
      className={cls || undefined}
      {...props}
    />
  );
}

export const Tabs = styled.div.attrs({ role: "tablist" })`
  display: flex;
  align-items: center;
  gap: ${t.space[1]};
  border-bottom: 1px solid ${t.color.border};
`;

const TabBox = styled.button.attrs({ type: "button", role: "tab" })`
  display: inline-flex;
  align-items: center;
  gap: ${t.space[2]};
  min-height: ${t.size.control.md};
  padding: ${t.space[2]} ${t.space[3]};
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: ${t.color.muted};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;

  &[aria-selected="true"] {
    color: ${t.color.text};
    border-bottom-color: ${t.color.accent};
  }
`;

export interface TabProps extends ComponentPropsWithRef<"button"> {
  active?: boolean;
}

export function Tab({ active = false, className, ...props }: TabProps) {
  return (
    <TabBox
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className={className}
      {...props}
    />
  );
}

export const TabPanel = styled.section.attrs({ role: "tabpanel", tabIndex: 0 })`
  padding: ${t.space[4]} ${t.space[0]};
  min-width: 0;
`;

const PaginationBox = styled.nav.attrs({ "aria-label": "Pagination" })`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${t.space[3]};
  font-size: 0.8125rem;
  color: ${t.color.muted};
`;

export interface PaginationProps extends ComponentPropsWithRef<"nav"> {
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  summary?: string;
}

export function Pagination({
  hasPrev = false,
  hasNext = false,
  onPrev,
  onNext,
  summary,
  children,
  className,
  ...props
}: PaginationProps) {
  if (children !== undefined) {
    return (
      <PaginationBox className={className} {...props}>
        {children}
      </PaginationBox>
    );
  }
  if (!onPrev && !onNext && !summary) {
    return <PaginationBox className={className} {...props} />;
  }
  return (
    <PaginationBox className={className} {...props}>
      <button
        type="button"
        className="vui-Button vui-Button--compact"
        disabled={!hasPrev}
        onClick={onPrev}
      >
        Previous
      </button>
      {summary ? <span>{summary}</span> : null}
      <button
        type="button"
        className="vui-Button vui-Button--compact"
        disabled={!hasNext}
        onClick={onNext}
      >
        Next
      </button>
    </PaginationBox>
  );
}
