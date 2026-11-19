import fs from "node:fs";
import { compileModule } from "./ast-pass.ts";

export interface EsbuildPluginOptions {
  readonly overrides?: Readonly<Record<string, string>>;
}

export interface EsbuildBuild {
  onLoad(
    opts: { filter: RegExp },
    cb: (args: { path: string }) => { contents: string; loader: "js" } | undefined
  ): void;
}

export interface EsbuildPlugin {
  readonly name: string;
  setup(build: EsbuildBuild): void;
}

export function createEsbuildPlugin(
  options: EsbuildPluginOptions = {}
): EsbuildPlugin {
  const configMap = new Map<string, string>(
    Object.entries(options.overrides ?? {})
  );

  return {
    name: "vespoli-styled",
    setup(build: EsbuildBuild): void {
      build.onLoad({ filter: /\.(tsx|ts)$/ }, (args) => {
        const source = fs.readFileSync(args.path, "utf8");
        if (!source.includes("@vespoli/styled")) return undefined;

        const configRe =
          /configure\(\s*['"]([A-Za-z0-9_]+)['"]\s*,\s*`([\s\S]*?)`\s*\);?/g;
        let cm: RegExpExecArray | null;
        while ((cm = configRe.exec(source)) !== null) {
          if (cm[1] && cm[2]) {
            configMap.set(cm[1], cm[2]);
          }
        }
        const cleaned = source.replace(configRe, "");

        const compiled = compileModule(cleaned, args.path, {
          configOverrides: configMap
        });
        if (compiled.diagnostics.length > 0) {
          const first = compiled.diagnostics[0]!;
          throw new Error(`${first.code}: ${first.message}`);
        }
        return { contents: compiled.esmCode, loader: "js" };
      });
    }
  };
}

export default createEsbuildPlugin;
