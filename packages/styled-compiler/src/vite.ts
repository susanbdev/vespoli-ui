import { compileModule } from "./ast-pass.ts";
import { emitComponentScss } from "./scss-emitter.ts";

export interface VitePluginOptions {
  readonly overrides?: Readonly<Record<string, string>>;
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

export function createVitePlugin(options: VitePluginOptions = {}): VitePlugin {
  const configMap = new Map<string, string>(
    Object.entries(options.overrides ?? {})
  );
  const extractedScss: string[] = [];

  return {
    name: "vespoli-styled",
    enforce: "pre",
    resolveId(id: string): string | null {
      return id === VIRTUAL_CSS_ID ? RESOLVED_VIRTUAL_ID : null;
    },
    load(id: string): string | null {
      return id === RESOLVED_VIRTUAL_ID ? extractedScss.join("\n") : null;
    },
    transform(code: string, id: string): { code: string; map: null } | null {
      if (!/\.(tsx|ts)$/.test(id) || !code.includes("@vespoli/styled")) {
        return null;
      }

      // Extract build-time configure('Button', `...`) calls
      const configRe = /configure\(\s*['"]([A-Za-z0-9_]+)['"]\s*,\s*`([\s\S]*?)`\s*\);?/g;
      let cm: RegExpExecArray | null;
      while ((cm = configRe.exec(code)) !== null) {
        if (cm[1] && cm[2]) {
          configMap.set(cm[1], cm[2]);
        }
      }
      const cleaned = code.replace(configRe, "");

      const compiled = compileModule(cleaned, id, {
        configOverrides: configMap
      });
      if (compiled.diagnostics.length > 0) {
        const first = compiled.diagnostics[0]!;
        throw new Error(`${first.code}: ${first.message}`);
      }
      for (const comp of compiled.components) {
        extractedScss.push(emitComponentScss(comp));
      }
      return { code: compiled.esmCode, map: null };
    }
  };
}

export default createVitePlugin;
