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
    audit_ui_source_for_path(source.as_bytes(), is_ui_package, None)
}

pub fn audit_ui_source_for_path(
    raw_bytes: &[u8],
    is_ui_package: bool,
    file_path: Option<&str>,
) -> Vec<AuditFinding> {
    let mut findings = Vec::new();
    let vec_open = format!("{}svg", '<');
    let vec_path = format!("{}path", '<');
    let vec_ext = format!("{}svg", '.');
    let vec_mime = format!("image/{}+xml", "svg");

    let allow_dom_sync_effect = file_path.is_some_and(|p| {
        p.ends_with("overlay.tsx") || p.ends_with("canvas.tsx") || p == "overlay" || p == "canvas"
    });

    let banned_hooks = [
        "useState",
        "useReducer",
        "useContext",
        "createContext",
        "useSyncExternalStore",
        "useLayoutEffect",
        "useInsertionEffect",
        "useRef",
        "useImperativeHandle",
        "XMLHttpRequest",
        "WebSocket",
        "EventSource",
        "BroadcastChannel",
        "setTimeout",
        "setInterval",
        "sendBeacon",
    ];
    let banned_aliases = [
        "onPress",
        "isDisabled",
        "onValueChange",
        "asChild",
        "slotClasses",
    ];

    // 1. Raw byte scan splitting strictly on LF (0x0A) so CR (0x0D) and non-ASCII bytes are caught.
    for (idx, line_bytes) in raw_bytes.split(|&b| b == b'\n').enumerate() {
        let line_no = idx + 1;
        if let Some(&bad_byte) = line_bytes
            .iter()
            .find(|&&b| b != b'\t' && !(0x20..=0x7E).contains(&b))
        {
            findings.push(AuditFinding {
                code: "VUI009",
                line: line_no,
                detail: format!(
                    "disallowed byte 0x{:02X} detected (pure 7-bit LF ASCII required)",
                    bad_byte
                ),
            });
        }
    }

    let lossy = String::from_utf8_lossy(raw_bytes);
    let source = lossy.as_ref();

    for (idx, line) in source.split('\n').enumerate() {
        let line_no = idx + 1;
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
            if has_inline_style_mutation(line) {
                findings.push(AuditFinding {
                    code: "VUI003",
                    line: line_no,
                    detail: "banned inline style attribute or DOM .style mutation detected"
                        .to_string(),
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

            if !allow_dom_sync_effect && contains_identifier(line, "useEffect") {
                findings.push(AuditFinding {
                    code: "VUI002",
                    line: line_no,
                    detail: "banned 'useEffect' in stateless UI primitive".to_string(),
                });
            }

            if has_string_api_bypass(line, "fetch") || has_string_api_bypass(line, "sendBeacon") {
                findings.push(AuditFinding {
                    code: "VUI002",
                    line: line_no,
                    detail: "banned dynamic network API reference in stateless UI package"
                        .to_string(),
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

    if is_ui_package {
        for line_no in find_multiline_fetch_lines(source) {
            findings.push(AuditFinding {
                code: "VUI002",
                line: line_no,
                detail: "banned network call 'fetch' in stateless UI package".to_string(),
            });
        }
        for line_no in find_multiline_style_attr_lines(source) {
            if !findings
                .iter()
                .any(|f| f.code == "VUI003" && f.line == line_no)
            {
                findings.push(AuditFinding {
                    code: "VUI003",
                    line: line_no,
                    detail: "banned multi-line style/dangerouslySetInnerHTML attribute detected"
                        .to_string(),
                });
            }
        }
    }

    for line_no in find_unlabeled_icon_buttons(source) {
        findings.push(AuditFinding {
            code: "VUI004",
            line: line_no,
            detail: "missing required 'aria-label' on <IconButton>".to_string(),
        });
    }

    findings
}

fn line_at_offset(src: &str, byte_offset: usize) -> usize {
    1 + src[..byte_offset.min(src.len())]
        .bytes()
        .filter(|&b| b == b'\n')
        .count()
}

fn has_inline_style_mutation(line: &str) -> bool {
    if line.contains(".style.") || line.contains(".style[") {
        return true;
    }
    if let Some(idx) = line.find("setAttribute(") {
        let rest = line[idx + "setAttribute(".len()..].trim_start();
        if rest.starts_with("\"style\"")
            || rest.starts_with("'style'")
            || rest.starts_with("`style`")
        {
            return true;
        }
    }
    has_attr_assignment_on_line(line, "style")
        || has_attr_assignment_on_line(line, "dangerouslySetInnerHTML")
}

fn has_attr_assignment_on_line(line: &str, attr_name: &str) -> bool {
    let bytes = line.as_bytes();
    let needle = attr_name.as_bytes();
    let mut pos = 0usize;
    while let Some(rel) = line[pos..].find(attr_name) {
        let start = pos + rel;
        let end = start + needle.len();
        let prev_ok = start == 0 || (!is_ident_byte(bytes[start - 1]) && bytes[start - 1] != b'-');
        let next_ok = end == bytes.len() || (!is_ident_byte(bytes[end]) && bytes[end] != b'-');
        if prev_ok && next_ok {
            let mut k = end;
            while k < bytes.len() && bytes[k].is_ascii_whitespace() {
                k += 1;
            }
            if k < bytes.len() && bytes[k] == b'=' && (k + 1 >= bytes.len() || bytes[k + 1] != b'=')
            {
                let mut v = k + 1;
                while v < bytes.len() && bytes[v].is_ascii_whitespace() {
                    v += 1;
                }
                if v < bytes.len() && matches!(bytes[v], b'{' | b'"' | b'\'' | b'`') {
                    return true;
                }
            }
        }
        pos = start + 1;
    }
    false
}

fn find_multiline_style_attr_lines(src: &str) -> Vec<usize> {
    let mut lines = Vec::new();
    for attr in ["style", "dangerouslySetInnerHTML"] {
        let bytes = src.as_bytes();
        let needle = attr.as_bytes();
        let mut pos = 0usize;
        while let Some(rel) = src[pos..].find(attr) {
            let start = pos + rel;
            let end = start + needle.len();
            let prev_ok =
                start == 0 || (!is_ident_byte(bytes[start - 1]) && bytes[start - 1] != b'-');
            let next_ok = end == bytes.len() || (!is_ident_byte(bytes[end]) && bytes[end] != b'-');
            if prev_ok && next_ok {
                let mut k = end;
                while k < bytes.len() && bytes[k].is_ascii_whitespace() {
                    k += 1;
                }
                if k < bytes.len()
                    && bytes[k] == b'='
                    && (k + 1 >= bytes.len() || bytes[k + 1] != b'=')
                {
                    let mut v = k + 1;
                    while v < bytes.len() && bytes[v].is_ascii_whitespace() {
                        v += 1;
                    }
                    if v < bytes.len() && matches!(bytes[v], b'{' | b'"' | b'\'' | b'`') {
                        lines.push(line_at_offset(src, start));
                    }
                }
            }
            pos = start + 1;
        }
    }
    lines
}

fn has_string_api_bypass(line: &str, api: &str) -> bool {
    let dq = format!("\"{}\"", api);
    let sq = format!("'{}'", api);
    let bq = format!("`{}`", api);
    if line.contains(&format!("[{}]", dq))
        || line.contains(&format!("[{}]", sq))
        || line.contains(&format!("[{}]", bq))
    {
        return true;
    }
    let dot = format!(".{}", api);
    if let Some(idx) = line.find(&dot) {
        let after = idx + dot.len();
        if after == line.len() || !is_ident_byte(line.as_bytes()[after]) {
            return true;
        }
    }
    false
}

fn find_multiline_fetch_lines(src: &str) -> Vec<usize> {
    let mut out = Vec::new();
    let bytes = src.as_bytes();
    let needle = b"fetch";
    let mut pos = 0usize;
    while let Some(rel) = src[pos..].find("fetch") {
        let start = pos + rel;
        let end = start + needle.len();
        let prev_ok = start == 0 || !is_ident_byte(bytes[start - 1]);
        let next_ok = end == bytes.len() || !is_ident_byte(bytes[end]);
        if prev_ok && next_ok {
            let mut k = end;
            while k < bytes.len() && bytes[k].is_ascii_whitespace() {
                k += 1;
            }
            if k < bytes.len() && (bytes[k] == b'(' || bytes[k] == b'`') {
                out.push(line_at_offset(src, start));
            }
        }
        pos = start + 1;
    }
    out
}

fn find_unlabeled_icon_buttons(src: &str) -> Vec<usize> {
    let mut out = Vec::new();
    let bytes = src.as_bytes();
    let tag_open = "<IconButton";
    let mut pos = 0usize;
    while let Some(rel) = src[pos..].find(tag_open) {
        let start = pos + rel;
        let after_name = start + tag_open.len();
        if after_name < bytes.len() {
            let next_b = bytes[after_name];
            if next_b.is_ascii_whitespace() || next_b == b'/' || next_b == b'>' {
                if let Some(tag_end) = find_jsx_opening_tag_end(bytes, after_name) {
                    let tag_slice = &src[start..=tag_end];
                    if !tag_slice.contains("aria-label") && !tag_slice.contains("{...") {
                        out.push(line_at_offset(src, start));
                    }
                    pos = tag_end + 1;
                    continue;
                }
            }
        }
        pos = after_name;
    }
    out
}

fn find_jsx_opening_tag_end(bytes: &[u8], start_idx: usize) -> Option<usize> {
    let mut i = start_idx;
    let mut brace_depth = 0usize;
    let mut in_quote: Option<u8> = None;
    while i < bytes.len() {
        let b = bytes[i];
        if let Some(q) = in_quote {
            if b == q {
                let mut bs = 0usize;
                let mut k = i;
                while k > 0 && bytes[k - 1] == b'\\' {
                    bs += 1;
                    k -= 1;
                }
                if (bs & 1) == 0 {
                    in_quote = None;
                }
            }
            i += 1;
            continue;
        }
        match b {
            b'"' | b'\'' | b'`' => in_quote = Some(b),
            b'{' => brace_depth += 1,
            b'}' => brace_depth = brace_depth.saturating_sub(1),
            b'>' if brace_depth == 0 => return Some(i),
            _ => {}
        }
        i += 1;
    }
    None
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
