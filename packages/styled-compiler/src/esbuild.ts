import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileModule } from "./ast-pass.ts";
import { compileScssInline } from "./css-builder.ts";
import { emitComponentScss, emitTokensScss } from "./scss-emitter.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");
const VIRTUAL_CSS_NS = "vespoli-styled-css";

export interface EsbuildPluginOptions {
  readonly overrides?: Readonly<Record<string, string>>;
  readonly cssOutfile?: string;
  readonly minify?: boolean;
  readonly injectCssImport?: boolean;
}

export interface EsbuildBuild {
  onResolve?(
    opts: { filter: RegExp },
    cb: (args: { path: string }) => { path: string; namespace: string } | undefined
  ): void;
  onLoad(
    opts: { filter: RegExp; namespace?: string },
    cb: (args: { path: string }) => { contents: string; loader: "js" | "css" } | undefined
  ): void;
  onEnd?(cb: () => void): void;
}

export interface EsbuildPlugin {
  readonly name: string;
  setup(build: EsbuildBuild): void;
  getCss(): string;
}

export function createEsbuildPlugin(
  options: EsbuildPluginOptions = {}
): EsbuildPlugin {
  const baseOverrides = options.overrides ?? {};
  const moduleConfigs = new Map<string, Map<string, string>>();
  const moduleScss = new Map<string, string>();

  function buildEffectiveConfigMap(): Map<string, string> {
    const merged = new Map<string, string>(Object.entries(baseOverrides));
    for (const perMod of moduleConfigs.values()) {
      for (const [k, v] of perMod.entries()) {
        merged.set(k, v);
      }
    }
    return merged;
  }

  function renderCss(): string {
    if (moduleScss.size === 0) {
      return "";
    }
    const partials = Array.from(moduleScss.values())
      .map((s) => s.replace(/@use\s+["']\.\.\/tokens["']\s+as\s+\*;\s*/g, ""))
      .join("\n");
    const fullScss = `${emitTokensScss()}\n${partials}`;
    return compileScssInline(fullScss, REPO_ROOT, Boolean(options.minify));
  }

  return {
    name: "vespoli-styled",
    getCss(): string {
      return renderCss();
    },
    setup(build: EsbuildBuild): void {
      build.onResolve?.({ filter: /^virtual:vespoli-styled\.css$/ }, (args) => ({
        path: args.path,
        namespace: VIRTUAL_CSS_NS
      }));

      build.onLoad({ filter: /\.(tsx|ts)$/ }, (args) => {
        const cleanPath = path.resolve(args.path.split("?", 1)[0] ?? args.path);
        const source = fs.readFileSync(cleanPath, "utf8");
        if (!source.includes("@vespoli/styled")) {
          moduleScss.delete(cleanPath);
          moduleConfigs.delete(cleanPath);
          return undefined;
        }

        const configRe =
          /configure\(\s*['"]([A-Za-z0-9_]+)['"]\s*,\s*`([\s\S]*?)`\s*\);?/g;
        const localCfg = new Map<string, string>();
        let cm: RegExpExecArray | null;
        while ((cm = configRe.exec(source)) !== null) {
          if (cm[1] && cm[2]) {
            localCfg.set(cm[1], cm[2]);
          }
        }
        moduleConfigs.set(cleanPath, localCfg);
        const cleaned = source.replace(configRe, "");

        const compiled = compileModule(cleaned, cleanPath, {
          configOverrides: buildEffectiveConfigMap()
        });
        if (compiled.diagnostics.length > 0) {
          const first = compiled.diagnostics[0]!;
          throw new Error(`${first.code}: ${first.message}`);
        }
        const chunks = compiled.components.map((comp) => emitComponentScss(comp));
        if (chunks.length > 0) {
          moduleScss.set(cleanPath, chunks.join("\n"));
        } else {
          moduleScss.delete(cleanPath);
        }
        const injectPrefix =
          options.injectCssImport && chunks.length > 0
            ? `import "virtual:vespoli-styled.css";\n`
            : "";
        return { contents: `${injectPrefix}${compiled.esmCode}`, loader: "js" };
      });

      if (build.onResolve) {
        build.onLoad({ filter: /.*/, namespace: VIRTUAL_CSS_NS }, () => ({
          contents: renderCss(),
          loader: "css"
        }));
      }

      if (options.cssOutfile) {
        const outTarget = options.cssOutfile;
        build.onEnd?.(() => {
          const css = renderCss();
          fs.mkdirSync(path.dirname(outTarget), { recursive: true });
          fs.writeFileSync(outTarget, css, "utf8");
        });
      }
    }
  };
}

export default createEsbuildPlugin;
