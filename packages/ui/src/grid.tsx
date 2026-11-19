import type { ComponentPropsWithRef } from "react";

export type GridSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | "full";
export type GridOffset = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type GutterScale = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type FluidMode = boolean | "sm" | "md" | "lg" | "xl" | "xxl";
export type RowAlign = "start" | "center" | "end" | "stretch";

export interface ContainerProps extends ComponentPropsWithRef<"div"> {
  fluid?: FluidMode;
}

export function Container({
  fluid = false,
  className,
  ...props
}: ContainerProps) {
  const fluidCls =
    fluid === true
      ? " vui-Container--fluid"
      : typeof fluid === "string"
        ? ` vui-Container--fluid-${fluid}`
        : "";
  return (
    <div
      className={"vui-Container" + fluidCls + (className ? " " + className : "")}
      {...props}
    />
  );
}

export interface RowProps extends ComponentPropsWithRef<"div"> {
  gutter?: GutterScale;
  rowGutter?: GutterScale;
  align?: RowAlign;
}

export function Row({
  gutter,
  rowGutter,
  align,
  className,
  ...props
}: RowProps) {
  const cls =
    "vui-Row" +
    (gutter !== undefined ? ` vui-g-${gutter}` : "") +
    (rowGutter !== undefined ? ` vui-gy-${rowGutter}` : "") +
    (align ? ` vui-Row--align-${align}` : "") +
    (className ? " " + className : "");
  return <div className={cls} {...props} />;
}

export interface ColProps extends ComponentPropsWithRef<"div"> {
  xs?: GridSpan;
  sm?: GridSpan;
  md?: GridSpan;
  lg?: GridSpan;
  xl?: GridSpan;
  xxl?: GridSpan;
  offsetXs?: GridOffset;
  offsetSm?: GridOffset;
  offsetMd?: GridOffset;
  offsetLg?: GridOffset;
  offsetXl?: GridOffset;
  offsetXxl?: GridOffset;
}

export function Col({
  xs,
  sm,
  md,
  lg,
  xl,
  xxl,
  offsetXs,
  offsetSm,
  offsetMd,
  offsetLg,
  offsetXl,
  offsetXxl,
  className,
  ...props
}: ColProps) {
  const cls =
    "vui-Col" +
    (xs !== undefined ? ` vui-c-xs-${xs}` : "") +
    (sm !== undefined ? ` vui-c-sm-${sm}` : "") +
    (md !== undefined ? ` vui-c-md-${md}` : "") +
    (lg !== undefined ? ` vui-c-lg-${lg}` : "") +
    (xl !== undefined ? ` vui-c-xl-${xl}` : "") +
    (xxl !== undefined ? ` vui-c-xxl-${xxl}` : "") +
    (offsetXs !== undefined ? ` vui-o-xs-${offsetXs}` : "") +
    (offsetSm !== undefined ? ` vui-o-sm-${offsetSm}` : "") +
    (offsetMd !== undefined ? ` vui-o-md-${offsetMd}` : "") +
    (offsetLg !== undefined ? ` vui-o-lg-${offsetLg}` : "") +
    (offsetXl !== undefined ? ` vui-o-xl-${offsetXl}` : "") +
    (offsetXxl !== undefined ? ` vui-o-xxl-${offsetXxl}` : "") +
    (className ? " " + className : "");
  return <div className={cls} {...props} />;
}
