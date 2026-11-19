#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditFinding {
    pub code: &'static str,
    pub line: usize,
    pub detail: String,
}

/// Audits UI source or compiled ESM text against Laws 1, 2, 4, 5, 7, and 7-bit ASCII hygiene.
/// Note: Vector token patterns are assembled dynamically so this file itself contains zero literal
/// vector markup substrings.
pub fn audit_ui_source(source: &str, is_ui_package: bool) -> Vec<AuditFinding> {
    let mut findings = Vec::new();
    let vec_open = format!("{}svg", '<');
    let vec_path = format!("{}path", '<');
    let vec_ext = format!("{}svg", '.');
    let vec_mime = format!("image/{}+xml", "svg");

    let banned_hooks = [
        "useState",
        "useReducer",
        "useContext",
        "createContext",
        "useSyncExternalStore",
        "XMLHttpRequest",
        "WebSocket",
        "setTimeout",
        "setInterval",
    ];
    let banned_aliases = [
        "onPress",
        "isDisabled",
        "onValueChange",
        "asChild",
        "slotClasses",
    ];

    for (idx, line) in source.lines().enumerate() {
        let line_no = idx + 1;

        if !line
            .bytes()
            .all(|b| b == b'\t' || (0x20..=0x7E).contains(&b))
        {
            findings.push(AuditFinding {
                code: "VUI009",
                line: line_no,
                detail: "non-ASCII byte detected".to_string(),
            });
        }

        let lower = line.to_ascii_lowercase();
        if lower.contains(&vec_open)
            || lower.contains(&vec_path)
            || lower.contains(&vec_ext)
            || lower.contains(&vec_mime)
        {
            findings.push(AuditFinding {
                code: "VUI003",
                line: line_no,
                detail: "banned vector markup or asset token detected".to_string(),
            });
        }

        if is_ui_package {
            if line.contains("style={{") || line.contains("style=\"") || line.contains("style={") {
                findings.push(AuditFinding {
                    code: "VUI003",
                    line: line_no,
                    detail: "banned inline style attribute detected".to_string(),
                });
            }

            for hook in &banned_hooks {
                if contains_identifier(line, hook) {
                    findings.push(AuditFinding {
                        code: "VUI002",
                        line: line_no,
                        detail: format!("banned stateful/effectful API '{}'", hook),
                    });
                }
            }

            if contains_identifier(line, "fetch") && line.contains("fetch(") {
                findings.push(AuditFinding {
                    code: "VUI002",
                    line: line_no,
                    detail: "banned network call 'fetch' in stateless UI package".to_string(),
                });
            }

            for alias in &banned_aliases {
                if contains_identifier(line, alias) {
                    findings.push(AuditFinding {
                        code: "VUI006",
                        line: line_no,
                        detail: format!("banned non-native prop alias '{}'", alias),
                    });
                }
            }

            if contains_identifier(line, "Spinner") {
                findings.push(AuditFinding {
                    code: "VUI007",
                    line: line_no,
                    detail: "banned disembodied Spinner primitive (Law 7)".to_string(),
                });
            }
        }
    }

    findings
}

fn contains_identifier(haystack: &str, ident: &str) -> bool {
    let bytes = haystack.as_bytes();
    let needle = ident.as_bytes();
    if needle.is_empty() || bytes.len() < needle.len() {
        return false;
    }
    let mut pos = 0usize;
    while let Some(rel) = haystack[pos..].find(ident) {
        let start = pos + rel;
        let end = start + needle.len();
        let prev_ok = start == 0 || !is_ident_byte(bytes[start - 1]);
        let next_ok = end == bytes.len() || !is_ident_byte(bytes[end]);
        if prev_ok && next_ok {
            return true;
        }
        pos = start + 1;
    }
    false
}

fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}
