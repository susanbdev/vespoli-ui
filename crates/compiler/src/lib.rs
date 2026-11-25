#![forbid(unsafe_code)]

pub mod audit;
pub mod font;
pub mod scss;

#[cfg(test)]
mod tests {
    use super::audit::audit_ui_source;
    use super::font::encode_glyph_font;
    use super::scss::{compile_scss, minify_css};

    #[test]
    fn compiles_default_variables_and_nested_selectors() {
        let scss = r#"
$ButtonPaddingX: 12px !default;
$color-accent: #5eead4 !default;

@layer vui.components {
  .vui-Button {
    padding-inline: $ButtonPaddingX;
    border: 1px solid $color-accent;
    &:hover:not(:disabled) {
      border-color: #99f6e4;
    }
    @media (prefers-reduced-motion: no-preference) {
      transition: border-color 120ms ease;
    }
  }
}
"#;
        let css = compile_scss(scss).expect("scss compiles");
        assert!(css.contains("@layer vui.components"));
        assert!(css.contains("padding-inline: 12px;"));
        assert!(css.contains(".vui-Button:hover:not(:disabled)"));
        assert!(css.contains("@media (prefers-reduced-motion: no-preference)"));

        let minified_a = minify_css(&css);
        let minified_b = minify_css(&css);
        assert_eq!(minified_a, minified_b);
        assert!(minified_a.contains(".vui-Button{padding-inline:12px;border:1px solid #5eead4}"));
    }

    #[test]
    fn rejects_undeclared_scss_variable() {
        let bad = ".vui-Button { padding: $MissingVar; }";
        let err = compile_scss(bad).expect_err("must reject undeclared variable");
        assert_eq!(err.code, "VUI010");
        assert!(err.message.contains("MissingVar"));
    }

    #[test]
    fn encodes_sub_2kb_woff2_glyph_font() {
        let bytes_a = encode_glyph_font();
        let bytes_b = encode_glyph_font();
        assert_eq!(bytes_a, bytes_b, "WOFF2 output must be deterministic");
        assert_eq!(&bytes_a[0..4], b"wOF2");
        assert!(
            bytes_a.len() < 2048,
            "vui-glyphs.woff2 must stay < 2048 bytes, got {}",
            bytes_a.len()
        );
    }

    #[test]
    fn detects_banned_hooks_inline_styles_and_vectors() {
        let vec_tag = format!("{}svg><{}svg>", '<', "/");
        let sample = format!(
            "const [x, setX] = useState(0);\nreturn <div style={{{{ color: 'red' }}}} onPress={{fn}}>{}</div>;\nexport function Spinner() {{}}",
            vec_tag
        );
        let findings = audit_ui_source(&sample, true);
        let codes: Vec<&str> = findings.iter().map(|f| f.code).collect();
        assert!(codes.contains(&"VUI002"));
        assert!(codes.contains(&"VUI003"));
        assert!(codes.contains(&"VUI006"));
        assert!(codes.contains(&"VUI007"));
    }

    #[test]
    fn rejects_path_traversal_symlinks_and_suppresses_raw_content_in_errors() {
        use super::scss::compile_scss_with_base;
        use std::fs;
        use std::os::unix::fs::symlink;
        use std::path::PathBuf;

        let sandbox =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/scss_confinement_sandbox");
        let _ = fs::remove_dir_all(&sandbox);
        let base_dir = sandbox.join("base");
        let outside_dir = sandbox.join("outside");
        fs::create_dir_all(&base_dir).expect("create base_dir");
        fs::create_dir_all(&outside_dir).expect("create outside_dir");

        let outside_scss = outside_dir.join("_secret.scss");
        fs::write(&outside_scss, "SECRET_CANARY_TOKEN_DO_NOT_LEAK\n").expect("write secret");
        let link_inside = base_dir.join("_linked.scss");
        symlink(&outside_scss, &link_inside).expect("create symlink");

        let err_parent = compile_scss_with_base("@use '../outside/secret';", &base_dir)
            .expect_err("must reject .. traversal");
        assert_eq!(err_parent.code, "VUI010");
        assert!(!err_parent
            .message
            .contains("SECRET_CANARY_TOKEN_DO_NOT_LEAK"));

        let err_abs = compile_scss_with_base("@use '/etc/hosts';", &base_dir)
            .expect_err("must reject absolute path");
        assert_eq!(err_abs.code, "VUI010");

        let err_sym = compile_scss_with_base("@use './linked';", &base_dir)
            .expect_err("must reject symlink target");
        assert_eq!(err_sym.code, "VUI010");
        assert!(!err_sym.message.contains("SECRET_CANARY_TOKEN_DO_NOT_LEAK"));

        let err_raw = compile_scss("RAW_NON_CSS_SECRET_LINE_WITHOUT_COLON")
            .expect_err("must fail on non-CSS content");
        assert_eq!(err_raw.code, "VUI010");
        assert!(
            !err_raw
                .message
                .contains("RAW_NON_CSS_SECRET_LINE_WITHOUT_COLON"),
            "VUI010 must never echo raw non-CSS content: {}",
            err_raw.message
        );

        let _ = fs::remove_dir_all(&sandbox);
    }

    #[test]
    fn blocks_billion_laughs_and_deep_var_recursion() {
        let mut bomb = String::from("$v0: \"aaaaaaaaaaaaaaaa\";\n");
        for i in 1..=12 {
            let prev = i - 1;
            bomb.push_str(&format!(
                "$v{}: \"#{{$v{}}}#{{$v{}}}#{{$v{}}}#{{$v{}}}\";\n",
                i, prev, prev, prev, prev
            ));
        }
        bomb.push_str(".x { content: $v12; }\n");
        let err = compile_scss(&bomb).expect_err("must block billion laughs > 64 KiB");
        assert_eq!(err.code, "VUI010");

        let mut nested = String::from("$base: 4px;\n.x { padding: ");
        for _ in 0..18 {
            nested.push_str("#{");
        }
        nested.push_str("$base");
        for _ in 0..18 {
            nested.push('}');
        }
        nested.push_str("; }\n");
        let depth_err = compile_scss(&nested).expect_err("must block recursion depth > 16");
        assert_eq!(depth_err.code, "VUI010");
    }

    #[test]
    fn handles_even_and_odd_escaped_backslashes_and_scss_multiplication() {
        let scss = r#"
$RowHeight: 40px !default;
.box {
  content: "\\"; /* comment after closed string with escaped backslash */
  height: $RowHeight * 4;
}
.escaped-quote {
  content: "\"}";
  width: 12px;
}
"#;
        let css = compile_scss(scss).expect("scss with escaped backslashes and * compiles");
        assert!(css.contains("height: 160px;"), "got: {}", css);
        assert!(css.contains("width: 12px;"), "got: {}", css);
        let mini = minify_css(&css);
        assert!(mini.contains("height:160px"));
        assert!(mini.contains("width:12px"));
    }

    #[test]
    fn catches_crlf_effect_hooks_beacons_multiline_fetch_styles_and_iconbutton() {
        let crlf_src = "export const X = 1;\r\n";
        let crlf_findings = audit_ui_source(crlf_src, true);
        assert!(crlf_findings
            .iter()
            .any(|f| f.code == "VUI009" && f.line == 1));

        let bypass_src = r#"
import { useEffect, useLayoutEffect, useInsertionEffect, useRef, useImperativeHandle } from "react";
export function Sneaky(el) {
  useEffect(() => {}, []);
  useLayoutEffect(() => {}, []);
  useInsertionEffect(() => {}, []);
  const r = useRef(null);
  useImperativeHandle(r, () => ({}));
  navigator.sendBeacon("/leak");
  new EventSource("/sse");
  new BroadcastChannel("ch");
  globalThis["fetch"]("/x");
  fetch
    ("/multiline");
  el.style.color = "red";
  return (
    <div style = {{ color: "blue" }}>
      <span style='top:0' />
      <IconButton
        onClick={() => {}}
      />
    </div>
  );
}
"#;
        let findings = audit_ui_source(bypass_src, true);
        let vui002_count = findings.iter().filter(|f| f.code == "VUI002").count();
        let vui003_count = findings.iter().filter(|f| f.code == "VUI003").count();
        let vui004_count = findings.iter().filter(|f| f.code == "VUI004").count();
        assert!(
            vui002_count >= 10,
            "expected >= 10 VUI002 findings, got {:?}",
            findings
        );
        assert!(
            vui003_count >= 3,
            "expected >= 3 VUI003 findings, got {:?}",
            findings
        );
        assert_eq!(
            vui004_count, 1,
            "expected VUI004 for multi-line IconButton, got {:?}",
            findings
        );
    }
}
