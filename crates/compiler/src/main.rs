#![forbid(unsafe_code)]

use std::env;
use std::fs;
use std::io::{self, Read};
use std::path::Path;
use std::process;

use compiler::audit::audit_ui_source_for_path;
use compiler::font::encode_glyph_font;
use compiler::scss::{
    compile_scss_file, compile_scss_file_with_base, compile_scss_with_base, minify_css,
};

fn main() {
    if let Err(msg) = run_cli() {
        eprintln!("{}", msg);
        process::exit(1);
    }
}

fn run_cli() -> Result<(), String> {
    let args: Vec<String> = env::args().skip(1).collect();
    let Some(cmd) = args.first().map(String::as_str) else {
        return Err("usage: vui-compile <scss|scss-inline|font|audit> [options]".to_string());
    };

    match cmd {
        "scss" => {
            let mut input_path: Option<&str> = None;
            let mut base_path: Option<&str> = None;
            let mut out_path: Option<&str> = None;
            let mut minify = false;
            let mut idx = 1usize;
            while idx < args.len() {
                match args[idx].as_str() {
                    "--minify" => minify = true,
                    "--base" => {
                        idx += 1;
                        base_path = args.get(idx).map(String::as_str);
                    }
                    "--out" => {
                        idx += 1;
                        out_path = args.get(idx).map(String::as_str);
                    }
                    other => input_path = Some(other),
                }
                idx += 1;
            }
            let target = input_path.ok_or_else(|| "missing <input.scss>".to_string())?;
            let css = if let Some(base) = base_path {
                compile_scss_file_with_base(Path::new(target), Path::new(base))
            } else {
                compile_scss_file(Path::new(target))
            }
            .map_err(|e| format!("{}: {}", e.code, e.message))?;
            let final_css = if minify { minify_css(&css) } else { css };
            if let Some(dest) = out_path {
                if let Some(parent) = Path::new(dest).parent() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                fs::write(dest, final_css).map_err(|e| e.to_string())?;
            } else {
                print!("{}", final_css);
            }
            Ok(())
        }
        "scss-inline" => {
            let base = args.get(1).map(String::as_str).unwrap_or(".");
            let minify = args.iter().any(|a| a == "--minify");
            let mut src = String::new();
            io::stdin()
                .read_to_string(&mut src)
                .map_err(|e| e.to_string())?;
            let css = compile_scss_with_base(&src, Path::new(base))
                .map_err(|e| format!("{}: {}", e.code, e.message))?;
            let final_css = if minify { minify_css(&css) } else { css };
            print!("{}", final_css);
            Ok(())
        }
        "font" => {
            let dest = args
                .get(1)
                .ok_or_else(|| "missing <output.woff2>".to_string())?;
            if let Some(parent) = Path::new(dest).parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let bytes = encode_glyph_font();
            fs::write(dest, bytes).map_err(|e| e.to_string())?;
            Ok(())
        }
        "audit" => {
            let mut total_findings = 0usize;
            for target in &args[1..] {
                let raw_bytes = fs::read(target).map_err(|e| e.to_string())?;
                let is_ui = target.contains("packages/ui/");
                let findings = audit_ui_source_for_path(&raw_bytes, is_ui, Some(target));
                for f in findings {
                    eprintln!("{}:{}: {} {}", target, f.line, f.code, f.detail);
                    total_findings += 1;
                }
            }
            if total_findings > 0 {
                return Err(format!("audit failed with {} finding(s)", total_findings));
            }
            Ok(())
        }
        other => Err(format!("unknown subcommand '{}'", other)),
    }
}
