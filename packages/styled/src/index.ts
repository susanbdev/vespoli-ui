import type { ComponentPropsWithRef, ElementType, JSX } from "react";
import { TOKEN_LIST, t } from "./tokens.ts";
import type { TokenEntry, Tokens } from "./tokens.ts";

export { TOKEN_LIST, t };
export type { TokenEntry, Tokens };

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

export type StyleChunk<P = Record<string, unknown>> =
  | string
  | number
  | false
  | null
  | undefined
  | ((props: P) => string | false | null | undefined)
  | StyledComponent<ElementType, Record<string, unknown>>;

export type StyledComponent<
  T extends ElementType,
  S extends object = Record<never, never>
> = ((props: Omit<ComponentPropsWithRef<T>, keyof S> & S) => JSX.Element) & {
  readonly vuiSelector?: string;
};

export interface StyledTag<T extends ElementType> {
  <S extends object = Record<never, never>>(
    strings: TemplateStringsArray,
    ...values: ReadonlyArray<StyleChunk<S>>
  ): StyledComponent<T, S>;
  attrs<A extends Partial<ComponentPropsWithRef<T>>>(
    defaultAttrs: A
  ): <S extends object = Record<never, never>>(
    strings: TemplateStringsArray,
    ...values: ReadonlyArray<StyleChunk<S>>
  ) => StyledComponent<T, S>;
}

const HTML_TAGS = [
  "a",
  "article",
  "aside",
  "button",
  "canvas",
  "code",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "input",
  "label",
  "legend",
  "li",
  "main",
  "nav",
  "ol",
  "option",
  "p",
  "pre",
  "section",
  "select",
  "span",
  "summary",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul"
] as const;

export type HtmlTagName = (typeof HTML_TAGS)[number];

export type StyledFactory = {
  <BaseProps extends object>(
    base: (props: BaseProps) => JSX.Element
  ): <S extends object = Record<never, never>>(
    strings: TemplateStringsArray,
    ...values: ReadonlyArray<StyleChunk<S>>
  ) => (props: Omit<BaseProps, keyof S> & S) => JSX.Element;
} & {
  readonly [K in HtmlTagName]: StyledTag<K>;
};

export function css(
  strings: TemplateStringsArray,
  ...values: ReadonlyArray<unknown>
): string {
  let out = "";
  for (let i = 0; i < strings.length; i += 1) {
    out += strings[i] ?? "";
    if (i < values.length) {
      const val = values[i];
      out += typeof val === "string" || typeof val === "number" ? String(val) : "";
    }
  }
  return out;
}

const BREAKPOINT_PX: Record<Exclude<Breakpoint, "xs">, string> = {
  sm: "576px",
  md: "768px",
  lg: "992px",
  xl: "1200px",
  xxl: "1400px"
};

export const media = {
  motionAllowed(strings: TemplateStringsArray, ...values: ReadonlyArray<unknown>): string {
    return `@media (prefers-reduced-motion: no-preference) {\n${css(strings, ...values)}\n}`;
  },
  reducedMotion(strings: TemplateStringsArray, ...values: ReadonlyArray<unknown>): string {
    return `@media (prefers-reduced-motion: reduce) {\n${css(strings, ...values)}\n}`;
  },
  forcedColors(strings: TemplateStringsArray, ...values: ReadonlyArray<unknown>): string {
    return `@media (forced-colors: active) {\n${css(strings, ...values)}\n}`;
  },
  light(strings: TemplateStringsArray, ...values: ReadonlyArray<unknown>): string {
    return `@media (prefers-color-scheme: light) {\n${css(strings, ...values)}\n}`;
  },
  up(bp: Exclude<Breakpoint, "xs">) {
    return (strings: TemplateStringsArray, ...values: ReadonlyArray<unknown>): string =>
      `@media (min-width: ${BREAKPOINT_PX[bp]}) {\n${css(strings, ...values)}\n}`;
  }
} as const;

export interface ConfigRule {
  readonly componentName: string;
  readonly scssBody: string;
}

export function configure(
  componentName: string,
  strings: TemplateStringsArray | string,
  ...values: ReadonlyArray<unknown>
): ConfigRule {
  const scssBody =
    typeof strings === "string" ? strings : css(strings, ...values);
  return { componentName, scssBody };
}

function createCompileTimeTag<T extends ElementType>(_tag: T): StyledTag<T> {
  const builder = (<S extends object = Record<never, never>>(
    _strings: TemplateStringsArray,
    ..._values: ReadonlyArray<StyleChunk<S>>
  ): StyledComponent<T, S> => {
    const stub = (() => {
      throw new Error(
        "VUI000: @vespoli/styled templates must be compiled via @vespoli/styled-compiler"
      );
    }) as unknown as StyledComponent<T, S>;
    return stub;
  }) as StyledTag<T>;

  builder.attrs = <A extends Partial<ComponentPropsWithRef<T>>>(_defaultAttrs: A) => {
    return <S extends object = Record<never, never>>(
      _strings: TemplateStringsArray,
      ..._values: ReadonlyArray<StyleChunk<S>>
    ): StyledComponent<T, S> => {
      const stub = (() => {
        throw new Error(
          "VUI000: @vespoli/styled templates must be compiled via @vespoli/styled-compiler"
        );
      }) as unknown as StyledComponent<T, S>;
      return stub;
    };
  };

  return builder;
}

function createStyledFactory(): StyledFactory {
  const fn = (<BaseProps extends object>(
    _base: (props: BaseProps) => JSX.Element
  ) => {
    return <S extends object = Record<never, never>>(
      _strings: TemplateStringsArray,
      ..._values: ReadonlyArray<StyleChunk<S>>
    ) => {
      return (() => {
        throw new Error(
          "VUI000: @vespoli/styled templates must be compiled via @vespoli/styled-compiler"
        );
      }) as unknown as (props: Omit<BaseProps, keyof S> & S) => JSX.Element;
    };
  }) as unknown as Record<string, unknown>;

  for (const tag of HTML_TAGS) {
    fn[tag] = createCompileTimeTag(tag);
  }
  return fn as unknown as StyledFactory;
}

export const styled: StyledFactory = createStyledFactory();
