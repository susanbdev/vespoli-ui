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
            bytes_a.len() <= 2048,
            "vui-glyphs.woff2 must stay <= 2048 bytes, got {}",
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
}
