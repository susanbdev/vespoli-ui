import type { ComponentPropsWithRef } from "react";

export type GridSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | "full";
export type GridOffset = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type GutterScale = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type FluidMode = boolean | "sm" | "md" | "lg" | "xl" | "xxl";
export type RowAlign = "start" | "center" | "end" | "stretch";

const FLUID_CLASS_MAP: Readonly<Record<string, string>> = Object.freeze({
  __proto__: null,
  sm: " vui-Container--fluid-sm",
  md: " vui-Container--fluid-md",
  lg: " vui-Container--fluid-lg",
  xl: " vui-Container--fluid-xl",
  xxl: " vui-Container--fluid-xxl"
} as unknown as Record<string, string>);

const GUTTER_MAP: Readonly<Record<string, string>> = Object.freeze({
  __proto__: null,
  "0": "0",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6"
} as unknown as Record<string, string>);

const ROW_ALIGN_MAP: Readonly<Record<string, string>> = Object.freeze({
  __proto__: null,
  start: " vui-Row--align-start",
  center: " vui-Row--align-center",
  end: " vui-Row--align-end",
  stretch: " vui-Row--align-stretch"
} as unknown as Record<string, string>);

const VALID_SPAN_MAP: Readonly<Record<string, string>> = Object.freeze({
  __proto__: null,
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  "11": "11",
  "12": "12",
  full: "full"
} as unknown as Record<string, string>);

const VALID_OFFSET_MAP: Readonly<Record<string, string>> = Object.freeze({
  __proto__: null,
  "0": "0",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  "11": "11"
} as unknown as Record<string, string>);

function spanCls(bp: string, val: GridSpan | undefined): string {
  if (val === undefined) return "";
  const key = String(val);
  return Object.hasOwn(VALID_SPAN_MAP, key) ? ` vui-c-${bp}-${VALID_SPAN_MAP[key]}` : "";
}

function offsetCls(bp: string, val: GridOffset | undefined): string {
  if (val === undefined) return "";
  const key = String(val);
  return Object.hasOwn(VALID_OFFSET_MAP, key) ? ` vui-o-${bp}-${VALID_OFFSET_MAP[key]}` : "";
}

export interface ContainerProps
  extends Omit<
    ComponentPropsWithRef<"div">,
    "style" | "dangerouslySetInnerHTML"
  > {
  fluid?: FluidMode;
}

export function Container({
  fluid = false,
  className,
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: ContainerProps) {
  const fluidCls =
    fluid === true
      ? " vui-Container--fluid"
      : typeof fluid === "string" && Object.hasOwn(FLUID_CLASS_MAP, fluid)
        ? FLUID_CLASS_MAP[fluid]!
        : "";
  return (
    <div
      {...props}
      className={"vui-Container" + fluidCls + (className ? " " + className : "")}
    />
  );
}

export interface RowProps
  extends Omit<
    ComponentPropsWithRef<"div">,
    "style" | "dangerouslySetInnerHTML"
  > {
  gutter?: GutterScale;
  rowGutter?: GutterScale;
  align?: RowAlign;
}

export function Row({
  gutter,
  rowGutter,
  align,
  className,
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: RowProps) {
  const gTok =
    gutter !== undefined && Object.hasOwn(GUTTER_MAP, String(gutter))
      ? ` vui-g-${GUTTER_MAP[String(gutter)]}`
      : "";
  const gyTok =
    rowGutter !== undefined && Object.hasOwn(GUTTER_MAP, String(rowGutter))
      ? ` vui-gy-${GUTTER_MAP[String(rowGutter)]}`
      : "";
  const alignTok =
    align !== undefined && Object.hasOwn(ROW_ALIGN_MAP, String(align))
      ? ROW_ALIGN_MAP[String(align)]!
      : "";
  const cls =
    "vui-Row" + gTok + gyTok + alignTok + (className ? " " + className : "");
  return <div {...props} className={cls} />;
}

export interface ColProps
  extends Omit<
    ComponentPropsWithRef<"div">,
    "style" | "dangerouslySetInnerHTML"
  > {
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
  style: _style,
  dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
  ...props
}: ColProps) {
  const cls =
    "vui-Col" +
    spanCls("xs", xs) +
    spanCls("sm", sm) +
    spanCls("md", md) +
    spanCls("lg", lg) +
    spanCls("xl", xl) +
    spanCls("xxl", xxl) +
    offsetCls("xs", offsetXs) +
    offsetCls("sm", offsetSm) +
    offsetCls("md", offsetMd) +
    offsetCls("lg", offsetLg) +
    offsetCls("xl", offsetXl) +
    offsetCls("xxl", offsetXxl) +
    (className ? " " + className : "");
  return <div {...props} className={cls} />;
}
