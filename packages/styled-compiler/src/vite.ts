import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileModule } from "./ast-pass.ts";
import { compileScssInline } from "./css-builder.ts";
import { emitComponentScss, emitTokensScss } from "./scss-emitter.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");

export interface VitePluginOptions {
  readonly overrides?: Readonly<Record<string, string>>;
  readonly minify?: boolean;
}

export interface VitePlugin {
  readonly name: string;
  readonly enforce: "pre";
  transform(code: string, id: string): { code: string; map: null } | null;
  resolveId(id: string): string | null;
  load(id: string): string | null;
}

const VIRTUAL_CSS_ID = "virtual:vespoli-styled.css";
const RESOLVED_VIRTUAL_ID = "\0virtual:vespoli-styled.css";

function stripQuery(id: string): string {
  const qIdx = id.indexOf("?");
  return qIdx >= 0 ? id.slice(0, qIdx) : id;
}

export function createVitePlugin(options: VitePluginOptions = {}): VitePlugin {
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

  return {
    name: "vespoli-styled",
    enforce: "pre",
    resolveId(id: string): string | null {
      return stripQuery(id) === VIRTUAL_CSS_ID ? RESOLVED_VIRTUAL_ID : null;
    },
    load(id: string): string | null {
      if (stripQuery(id) !== RESOLVED_VIRTUAL_ID) {
        return null;
      }
      if (moduleScss.size === 0) {
        return "";
      }
      const partials = Array.from(moduleScss.values())
        .map((s) => s.replace(/@use\s+["']\.\.\/tokens["']\s+as\s+\*;\s*/g, ""))
        .join("\n");
      const fullScss = `${emitTokensScss()}\n${partials}`;
      return compileScssInline(fullScss, REPO_ROOT, Boolean(options.minify));
    },
    transform(code: string, id: string): { code: string; map: null } | null {
      const cleanId = stripQuery(id);
      if (!/\.(tsx|ts)$/.test(cleanId)) {
        return null;
      }
      if (!code.includes("@vespoli/styled")) {
        moduleScss.delete(cleanId);
        moduleConfigs.delete(cleanId);
        return null;
      }

      const configRe = /configure\(\s*['"]([A-Za-z0-9_]+)['"]\s*,\s*`([\s\S]*?)`\s*\);?/g;
      const localCfg = new Map<string, string>();
      let cm: RegExpExecArray | null;
      while ((cm = configRe.exec(code)) !== null) {
        if (cm[1] && cm[2]) {
          localCfg.set(cm[1], cm[2]);
        }
      }
      moduleConfigs.set(cleanId, localCfg);
      const cleaned = code.replace(configRe, "");

      const compiled = compileModule(cleaned, cleanId, {
        configOverrides: buildEffectiveConfigMap()
      });
      if (compiled.diagnostics.length > 0) {
        const first = compiled.diagnostics[0]!;
        throw new Error(`${first.code}: ${first.message}`);
      }
      const chunks = compiled.components.map((comp) => emitComponentScss(comp));
      if (chunks.length > 0) {
        moduleScss.set(cleanId, chunks.join("\n"));
      } else {
        moduleScss.delete(cleanId);
      }
      return { code: compiled.esmCode, map: null };
    }
  };
}

export default createVitePlugin;
