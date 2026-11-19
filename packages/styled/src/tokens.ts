export interface TokenEntry {
  readonly path: string;
  readonly scssVar: string;
  readonly cssVar: string;
  readonly darkValue: string;
  readonly lightValue: string;
}

export const TOKEN_LIST: readonly TokenEntry[] = [
  { path: "color.bg", scssVar: "color-bg", cssVar: "--vui-color-bg", darkValue: "#0b0d10", lightValue: "#f8fafc" },
  { path: "color.surface", scssVar: "color-surface", cssVar: "--vui-color-surface", darkValue: "#12161b", lightValue: "#ffffff" },
  { path: "color.raised", scssVar: "color-raised", cssVar: "--vui-color-raised", darkValue: "#181d24", lightValue: "#f1f5f9" },
  { path: "color.raisedHover", scssVar: "color-raised-hover", cssVar: "--vui-color-raised-hover", darkValue: "#202731", lightValue: "#e2e8f0" },
  { path: "color.overlay", scssVar: "color-overlay", cssVar: "--vui-color-overlay", darkValue: "#161b22", lightValue: "#ffffff" },
  { path: "color.text", scssVar: "color-text", cssVar: "--vui-color-text", darkValue: "#ecf0f5", lightValue: "#0f172a" },
  { path: "color.muted", scssVar: "color-muted", cssVar: "--vui-color-muted", darkValue: "#93a0b0", lightValue: "#475569" },
  { path: "color.border", scssVar: "color-border", cssVar: "--vui-color-border", darkValue: "#262f3b", lightValue: "#cbd5e1" },
  { path: "color.borderStrong", scssVar: "color-border-strong", cssVar: "--vui-color-border-strong", darkValue: "#3a4758", lightValue: "#94a3b8" },
  { path: "color.focus", scssVar: "color-focus", cssVar: "--vui-color-focus", darkValue: "#5eead4", lightValue: "#0f766e" },
  { path: "color.accent", scssVar: "color-accent", cssVar: "--vui-color-accent", darkValue: "#5eead4", lightValue: "#0f766e" },
  { path: "color.accentHover", scssVar: "color-accent-hover", cssVar: "--vui-color-accent-hover", darkValue: "#99f6e4", lightValue: "#115e59" },
  { path: "color.accentInk", scssVar: "color-accent-ink", cssVar: "--vui-color-accent-ink", darkValue: "#06201d", lightValue: "#ffffff" },
  { path: "color.success", scssVar: "color-success", cssVar: "--vui-color-success", darkValue: "#34d399", lightValue: "#047857" },
  { path: "color.successSurface", scssVar: "color-success-surface", cssVar: "--vui-color-success-surface", darkValue: "#08281e", lightValue: "#ecfdf5" },
  { path: "color.successBorder", scssVar: "color-success-border", cssVar: "--vui-color-success-border", darkValue: "#134e3a", lightValue: "#6ee7b7" },
  { path: "color.warn", scssVar: "color-warn", cssVar: "--vui-color-warn", darkValue: "#fbbf24", lightValue: "#b45309" },
  { path: "color.warnSurface", scssVar: "color-warn-surface", cssVar: "--vui-color-warn-surface", darkValue: "#2b1f06", lightValue: "#fffbeb" },
  { path: "color.warnBorder", scssVar: "color-warn-border", cssVar: "--vui-color-warn-border", darkValue: "#5c420d", lightValue: "#fcd34d" },
  { path: "color.danger", scssVar: "color-danger", cssVar: "--vui-color-danger", darkValue: "#f87171", lightValue: "#b91c1c" },
  { path: "color.dangerSurface", scssVar: "color-danger-surface", cssVar: "--vui-color-danger-surface", darkValue: "#2c1014", lightValue: "#fef2f2" },
  { path: "color.dangerBorder", scssVar: "color-danger-border", cssVar: "--vui-color-danger-border", darkValue: "#5f1e26", lightValue: "#fca5a5" },
  { path: "space.0", scssVar: "space-0", cssVar: "--vui-space-0", darkValue: "0", lightValue: "0" },
  { path: "space.1", scssVar: "space-1", cssVar: "--vui-space-1", darkValue: "4px", lightValue: "4px" },
  { path: "space.2", scssVar: "space-2", cssVar: "--vui-space-2", darkValue: "8px", lightValue: "8px" },
  { path: "space.3", scssVar: "space-3", cssVar: "--vui-space-3", darkValue: "12px", lightValue: "12px" },
  { path: "space.4", scssVar: "space-4", cssVar: "--vui-space-4", darkValue: "16px", lightValue: "16px" },
  { path: "space.5", scssVar: "space-5", cssVar: "--vui-space-5", darkValue: "20px", lightValue: "20px" },
  { path: "space.6", scssVar: "space-6", cssVar: "--vui-space-6", darkValue: "24px", lightValue: "24px" },
  { path: "space.7", scssVar: "space-7", cssVar: "--vui-space-7", darkValue: "32px", lightValue: "32px" },
  { path: "space.8", scssVar: "space-8", cssVar: "--vui-space-8", darkValue: "48px", lightValue: "48px" },
  { path: "radius.sm", scssVar: "radius-sm", cssVar: "--vui-radius-sm", darkValue: "4px", lightValue: "4px" },
  { path: "radius.md", scssVar: "radius-md", cssVar: "--vui-radius-md", darkValue: "6px", lightValue: "6px" },
  { path: "radius.lg", scssVar: "radius-lg", cssVar: "--vui-radius-lg", darkValue: "10px", lightValue: "10px" },
  { path: "radius.pill", scssVar: "radius-pill", cssVar: "--vui-radius-pill", darkValue: "9999px", lightValue: "9999px" },
  { path: "size.control.sm", scssVar: "size-control-sm", cssVar: "--vui-size-control-sm", darkValue: "28px", lightValue: "28px" },
  { path: "size.control.md", scssVar: "size-control-md", cssVar: "--vui-size-control-md", darkValue: "34px", lightValue: "34px" },
  { path: "size.control.lg", scssVar: "size-control-lg", cssVar: "--vui-size-control-lg", darkValue: "40px", lightValue: "40px" },
  {
    path: "font.sans",
    scssVar: "font-sans",
    cssVar: "--vui-font-sans",
    darkValue: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    lightValue: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
  },
  {
    path: "font.mono",
    scssVar: "font-mono",
    cssVar: "--vui-font-mono",
    darkValue: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    lightValue: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  },
  {
    path: "ease.outExpo",
    scssVar: "ease-out-expo",
    cssVar: "--vui-ease-out-expo",
    darkValue: "cubic-bezier(0.16, 1, 0.3, 1)",
    lightValue: "cubic-bezier(0.16, 1, 0.3, 1)"
  },
  {
    path: "ease.tactile",
    scssVar: "ease-tactile",
    cssVar: "--vui-ease-tactile",
    darkValue: "cubic-bezier(0.32, 1.25, 0.64, 1)",
    lightValue: "cubic-bezier(0.32, 1.25, 0.64, 1)"
  }
] as const;

export const t = {
  color: {
    bg: "var(--vui-color-bg)",
    surface: "var(--vui-color-surface)",
    raised: "var(--vui-color-raised)",
    raisedHover: "var(--vui-color-raised-hover)",
    overlay: "var(--vui-color-overlay)",
    text: "var(--vui-color-text)",
    muted: "var(--vui-color-muted)",
    border: "var(--vui-color-border)",
    borderStrong: "var(--vui-color-border-strong)",
    focus: "var(--vui-color-focus)",
    accent: "var(--vui-color-accent)",
    accentHover: "var(--vui-color-accent-hover)",
    accentInk: "var(--vui-color-accent-ink)",
    success: "var(--vui-color-success)",
    successSurface: "var(--vui-color-success-surface)",
    successBorder: "var(--vui-color-success-border)",
    warn: "var(--vui-color-warn)",
    warnSurface: "var(--vui-color-warn-surface)",
    warnBorder: "var(--vui-color-warn-border)",
    danger: "var(--vui-color-danger)",
    dangerSurface: "var(--vui-color-danger-surface)",
    dangerBorder: "var(--vui-color-danger-border)"
  },
  space: {
    0: "var(--vui-space-0)",
    1: "var(--vui-space-1)",
    2: "var(--vui-space-2)",
    3: "var(--vui-space-3)",
    4: "var(--vui-space-4)",
    5: "var(--vui-space-5)",
    6: "var(--vui-space-6)",
    7: "var(--vui-space-7)",
    8: "var(--vui-space-8)"
  },
  radius: {
    sm: "var(--vui-radius-sm)",
    md: "var(--vui-radius-md)",
    lg: "var(--vui-radius-lg)",
    pill: "var(--vui-radius-pill)"
  },
  size: {
    control: {
      sm: "var(--vui-size-control-sm)",
      md: "var(--vui-size-control-md)",
      lg: "var(--vui-size-control-lg)"
    }
  },
  font: {
    sans: "var(--vui-font-sans)",
    mono: "var(--vui-font-mono)"
  },
  ease: {
    outExpo: "var(--vui-ease-out-expo)",
    tactile: "var(--vui-ease-tactile)"
  }
} as const;

export type Tokens = typeof t;
