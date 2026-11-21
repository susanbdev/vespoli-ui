use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompilerError {
    pub code: &'static str,
    pub message: String,
}

impl CompilerError {
    pub fn create(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

const MAX_VAR_DEPTH: usize = 16;
const MAX_EXPANDED_BYTES: usize = 64 * 1024;
const MAX_OUTPUT_CSS_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, Default)]
pub struct ScssEnv {
    pub vars: BTreeMap<String, String>,
    pub visited: BTreeSet<PathBuf>,
}

#[derive(Debug, Clone)]
enum ScssItem {
    VarDecl {
        name: String,
        value: String,
        is_default: bool,
    },
    UseRule {
        target: String,
        overrides: Vec<(String, String)>,
    },
    Statement(String),
    Declaration {
        prop: String,
        value: String,
    },
    Block {
        header: String,
        body: Vec<ScssItem>,
    },
}

pub fn compile_scss_file(path: &Path) -> Result<String, CompilerError> {
    let base_dir = path.parent().unwrap_or_else(|| Path::new("."));
    compile_scss_file_with_base(path, base_dir)
}

pub fn compile_scss_file_with_base(path: &Path, base_dir: &Path) -> Result<String, CompilerError> {
    if path.extension().and_then(|s| s.to_str()) != Some("scss") {
        return Err(CompilerError::create(
            "VUI010",
            "SCSS input file must use .scss extension",
        ));
    }
    let canonical_root = ensure_canonical_base_dir(base_dir)?;
    reject_symlinks_along_path(&canonical_root, path)?;
    let meta = fs::symlink_metadata(path).map_err(|_| {
        CompilerError::create("VUI010", "unable to inspect SCSS input file metadata")
    })?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err(CompilerError::create(
            "VUI010",
            "SCSS input path must be a regular non-symlink file",
        ));
    }
    let canonical_file = fs::canonicalize(path)
        .map_err(|_| CompilerError::create("VUI010", "unable to canonicalize SCSS input file"))?;
    if !canonical_file.starts_with(&canonical_root) {
        return Err(CompilerError::create(
            "VUI010",
            "SCSS input file escapes canonical base_dir",
        ));
    }
    let source = fs::read_to_string(&canonical_file)
        .map_err(|_| CompilerError::create("VUI010", "unable to read SCSS input file"))?;
    let current_dir = canonical_file.parent().unwrap_or(&canonical_root);
    let mut env = ScssEnv::default();
    env.visited.insert(canonical_file.clone());
    let mut out = String::new();
    evaluate_module(&source, &canonical_root, current_dir, &mut env, &mut out)?;
    Ok(out)
}

pub fn compile_scss_with_base(source: &str, base_dir: &Path) -> Result<String, CompilerError> {
    let mut env = ScssEnv::default();
    let mut out = String::new();
    evaluate_module(source, base_dir, base_dir, &mut env, &mut out)?;
    Ok(out)
}

pub fn compile_scss(source: &str) -> Result<String, CompilerError> {
    compile_scss_with_base(source, Path::new("."))
}

pub fn minify_css(css: &str) -> String {
    let stripped = strip_comments(css);
    let raw_bytes = stripped.as_bytes();
    let mut out = String::with_capacity(stripped.len());
    let mut in_quote: Option<char> = None;
    let mut prev_space = false;

    for (idx, ch) in stripped.char_indices() {
        if let Some(q) = in_quote {
            out.push(ch);
            if ch == q && is_unescaped(raw_bytes, idx) {
                in_quote = None;
            }
            continue;
        }
        if ch == '"' || ch == '\'' {
            if prev_space && needs_space_before_quote(&out) {
                out.push(' ');
            }
            prev_space = false;
            in_quote = Some(ch);
            out.push(ch);
            continue;
        }
        if ch.is_ascii_whitespace() {
            prev_space = true;
            continue;
        }
        if matches!(ch, '{' | '}' | ';' | ':' | ',' | '(' | ')' | '/' | '>') {
            prev_space = false;
            if ch == '}' && out.ends_with(';') {
                out.pop();
            }
            out.push(ch);
            continue;
        }
        if prev_space {
            if let Some(last) = out.chars().last() {
                if !matches!(last, '{' | '}' | ';' | ':' | ',' | '(' | '/' | '>') {
                    out.push(' ');
                }
            }
            prev_space = false;
        }
        out.push(ch);
    }
    let compact = coalesce_at_blocks(out.trim());
    strip_leading_zero_decimals(&compact)
}

fn strip_leading_zero_decimals(css: &str) -> String {
    let bytes = css.as_bytes();
    let mut out = String::with_capacity(css.len());
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'0'
            && i + 2 < bytes.len()
            && bytes[i + 1] == b'.'
            && bytes[i + 2].is_ascii_digit()
            && (i == 0 || !bytes[i - 1].is_ascii_alphanumeric())
        {
            i += 1;
            continue;
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

fn coalesce_at_blocks(css: &str) -> String {
    let mut entries: Vec<(Option<String>, String)> = Vec::new();
    let bytes = css.as_bytes();
    let mut i = 0usize;

    while i < bytes.len() {
        let start = i;
        let mut in_quote: Option<u8> = None;
        let mut delim: Option<u8> = None;

        while i < bytes.len() {
            let b = bytes[i];
            if let Some(q) = in_quote {
                if b == q && is_unescaped(bytes, i) {
                    in_quote = None;
                }
                i += 1;
                continue;
            }
            match b {
                b'"' | b'\'' => in_quote = Some(b),
                b';' | b'{' => {
                    delim = Some(b);
                    break;
                }
                _ => {}
            }
            i += 1;
        }

        match delim {
            Some(b';') => {
                entries.push((None, css[start..=i].to_string()));
                i += 1;
            }
            Some(b'{') => {
                let header = css[start..i].to_string();
                if let Ok(close_idx) = find_matching_brace(css, i) {
                    let raw_inner = &css[i + 1..close_idx];
                    let is_mergeable =
                        header.starts_with("@layer ") || header.starts_with("@media");
                    let inner = if is_mergeable {
                        coalesce_at_blocks(raw_inner)
                    } else {
                        raw_inner.to_string()
                    };
                    if is_mergeable {
                        if let Some((Some(prev_hdr), prev_body)) = entries.last_mut() {
                            if prev_hdr == &header {
                                prev_body.push_str(&inner);
                                i = close_idx + 1;
                                continue;
                            }
                        }
                        entries.push((Some(header), inner));
                    } else {
                        entries.push((None, format!("{}{{{}}}", header, inner)));
                    }
                    i = close_idx + 1;
                } else {
                    entries.push((None, css[start..].to_string()));
                    break;
                }
            }
            _ => {
                if start < bytes.len() {
                    entries.push((None, css[start..].to_string()));
                }
                break;
            }
        }
    }

    let mut merged = String::with_capacity(css.len());
    for (hdr, body) in entries {
        if let Some(h) = hdr {
            let final_body = coalesce_inner_once(&body);
            merged.push_str(&h);
            merged.push('{');
            merged.push_str(&final_body);
            merged.push('}');
        } else {
            merged.push_str(&body);
        }
    }
    merged
}

fn coalesce_inner_once(body: &str) -> String {
    if !body.contains("@media") && !body.contains("@layer") {
        return merge_identical_rules(body);
    }
    let coalesced = coalesce_at_blocks(body);
    merge_identical_rules(&coalesced)
}

fn merge_identical_rules(css: &str) -> String {
    let mut rules: Vec<(Option<String>, String)> = Vec::new();
    let bytes = css.as_bytes();
    let mut i = 0usize;

    while i < bytes.len() {
        let start = i;
        let mut in_quote: Option<u8> = None;
        let mut delim: Option<u8> = None;
        while i < bytes.len() {
            let b = bytes[i];
            if let Some(q) = in_quote {
                if b == q && is_unescaped(bytes, i) {
                    in_quote = None;
                }
                i += 1;
                continue;
            }
            match b {
                b'"' | b'\'' => in_quote = Some(b),
                b';' | b'{' => {
                    delim = Some(b);
                    break;
                }
                _ => {}
            }
            i += 1;
        }
        match delim {
            Some(b'{') => {
                let sel = css[start..i].to_string();
                if let Ok(close_idx) = find_matching_brace(css, i) {
                    let decls = css[i + 1..close_idx].to_string();
                    if !sel.starts_with('@') && !decls.contains('{') {
                        if let Some((existing_sels, Some(prev_decls))) =
                            rules.iter_mut().find_map(|(s, d)| {
                                if s.is_some() && d == &decls {
                                    Some((s, Some(d)))
                                } else {
                                    None
                                }
                            })
                        {
                            let _ = prev_decls;
                            if let Some(s) = existing_sels {
                                s.push(',');
                                s.push_str(&sel);
                                i = close_idx + 1;
                                continue;
                            }
                        }
                        rules.push((Some(sel), decls));
                    } else if sel.starts_with("@media") {
                        let inner_merged = merge_identical_rules(&decls);
                        rules.push((None, format!("{}{{{}}}", sel, inner_merged)));
                    } else {
                        rules.push((None, format!("{}{{{}}}", sel, decls)));
                    }
                    i = close_idx + 1;
                } else {
                    rules.push((None, css[start..].to_string()));
                    break;
                }
            }
            Some(b';') => {
                rules.push((None, css[start..=i].to_string()));
                i += 1;
            }
            _ => {
                if start < bytes.len() {
                    rules.push((None, css[start..].to_string()));
                }
                break;
            }
        }
    }

    let mut out = String::with_capacity(css.len());
    for (sel, body) in rules {
        if let Some(s) = sel {
            out.push_str(&s);
            out.push('{');
            out.push_str(&body);
            out.push('}');
        } else {
            out.push_str(&body);
        }
    }
    out
}

fn needs_space_before_quote(prefix: &str) -> bool {
    if let Some(last) = prefix.chars().last() {
        !matches!(last, '{' | '}' | ';' | ':' | ',' | '(' | '=')
    } else {
        false
    }
}

fn evaluate_module(
    source: &str,
    root_dir: &Path,
    current_dir: &Path,
    env: &mut ScssEnv,
    out: &mut String,
) -> Result<(), CompilerError> {
    let cleaned = strip_comments(source);
    let items = parse_items(&cleaned)?;
    for item in items {
        match item {
            ScssItem::VarDecl {
                name,
                value,
                is_default,
            } => {
                if is_default && env.vars.contains_key(&name) {
                    continue;
                }
                let resolved = resolve_vars(&value, &env.vars)?;
                env.vars.insert(name, resolved);
            }
            ScssItem::UseRule { target, overrides } => {
                let canonical_root = ensure_canonical_base_dir(root_dir)?;
                let canonical_current = ensure_canonical_subdir(&canonical_root, current_dir)?;
                for (var_name, raw_val) in overrides {
                    let resolved = resolve_vars(&raw_val, &env.vars)?;
                    env.vars.entry(var_name).or_insert(resolved);
                }
                let resolved_path =
                    resolve_import_path(&canonical_root, &canonical_current, &target)?;
                if env.visited.insert(resolved_path.clone()) {
                    let child_src = fs::read_to_string(&resolved_path).map_err(|_| {
                        CompilerError::create("VUI010", "failed reading resolved SCSS partial")
                    })?;
                    let child_dir = resolved_path.parent().unwrap_or(&canonical_root);
                    evaluate_module(&child_src, &canonical_root, child_dir, env, out)?;
                }
            }
            ScssItem::Statement(stmt) => {
                let resolved = resolve_vars(&stmt, &env.vars)?;
                push_bounded_output(out, resolved.trim())?;
                push_bounded_output(out, ";\n")?;
            }
            ScssItem::Declaration { prop, value } => {
                let resolved = resolve_vars(&value, &env.vars)?;
                push_bounded_output(out, prop.trim())?;
                push_bounded_output(out, ": ")?;
                push_bounded_output(out, resolved.trim())?;
                push_bounded_output(out, ";\n")?;
            }
            ScssItem::Block { header, body } => {
                let resolved_header = resolve_vars(&header, &env.vars)?;
                emit_block(&resolved_header, &body, &[], &[], env, out)?;
            }
        }
    }
    Ok(())
}

fn push_bounded_output(out: &mut String, chunk: &str) -> Result<(), CompilerError> {
    if out.len().saturating_add(chunk.len()) > MAX_OUTPUT_CSS_BYTES {
        return Err(CompilerError::create(
            "VUI010",
            "compiled CSS output exceeded maximum size budget",
        ));
    }
    out.push_str(chunk);
    Ok(())
}

fn emit_block(
    header: &str,
    body: &[ScssItem],
    selectors: &[String],
    at_wrappers: &[String],
    env: &mut ScssEnv,
    out: &mut String,
) -> Result<(), CompilerError> {
    let trimmed = header.trim();
    if trimmed.starts_with("@keyframes")
        || trimmed.starts_with("@font-face")
        || trimmed.starts_with("@view-transition")
    {
        let mut inner = String::new();
        for item in body {
            match item {
                ScssItem::Declaration { prop, value } => {
                    let val = resolve_vars(value, &env.vars)?;
                    inner.push_str("  ");
                    inner.push_str(prop.trim());
                    inner.push_str(": ");
                    inner.push_str(val.trim());
                    inner.push_str(";\n");
                }
                ScssItem::Block {
                    header: step_hdr,
                    body: step_body,
                } => {
                    inner.push_str("  ");
                    inner.push_str(step_hdr.trim());
                    inner.push_str(" {\n");
                    for sub in step_body {
                        if let ScssItem::Declaration { prop, value } = sub {
                            let val = resolve_vars(value, &env.vars)?;
                            inner.push_str("    ");
                            inner.push_str(prop.trim());
                            inner.push_str(": ");
                            inner.push_str(val.trim());
                            inner.push_str(";\n");
                        }
                    }
                    inner.push_str("  }\n");
                }
                _ => {}
            }
        }
        let wrapped = wrap_with_at_rules(at_wrappers, &format!("{} {{\n{}}}\n", trimmed, inner));
        out.push_str(&wrapped);
        return Ok(());
    }

    if trimmed.starts_with('@') {
        let mut next_wrappers = at_wrappers.to_vec();
        next_wrappers.push(trimmed.to_string());
        let mut direct_decls = Vec::new();
        let mut child_blocks = Vec::new();
        let mut statements = Vec::new();

        for item in body {
            match item {
                ScssItem::VarDecl {
                    name,
                    value,
                    is_default,
                } => {
                    if !(*is_default && env.vars.contains_key(name)) {
                        let resolved = resolve_vars(value, &env.vars)?;
                        env.vars.insert(name.clone(), resolved);
                    }
                }
                ScssItem::Declaration { prop, value } => {
                    let resolved = resolve_vars(value, &env.vars)?;
                    direct_decls.push((prop.trim().to_string(), resolved));
                }
                ScssItem::Statement(stmt) => {
                    let resolved = resolve_vars(stmt, &env.vars)?;
                    statements.push(resolved);
                }
                ScssItem::Block {
                    header: sub_h,
                    body: sub_b,
                } => {
                    let resolved_h = resolve_vars(sub_h, &env.vars)?;
                    child_blocks.push((resolved_h, sub_b.clone()));
                }
                ScssItem::UseRule { .. } => {}
            }
        }

        if !statements.is_empty() {
            let mut stmt_buf = String::new();
            for s in statements {
                stmt_buf.push_str("  ");
                stmt_buf.push_str(s.trim());
                stmt_buf.push_str(";\n");
            }
            out.push_str(&wrap_with_at_rules(&next_wrappers, &stmt_buf));
        }

        if !direct_decls.is_empty() && !selectors.is_empty() {
            let rule = format_rule(&selectors.join(", "), &direct_decls);
            out.push_str(&wrap_with_at_rules(&next_wrappers, &rule));
        }

        for (sub_h, sub_b) in child_blocks {
            emit_block(&sub_h, &sub_b, selectors, &next_wrappers, env, out)?;
        }
        return Ok(());
    }

    let next_selectors = combine_selectors(selectors, trimmed);
    let mut direct_decls = Vec::new();
    let mut child_blocks = Vec::new();

    for item in body {
        match item {
            ScssItem::VarDecl {
                name,
                value,
                is_default,
            } => {
                if !(*is_default && env.vars.contains_key(name)) {
                    let resolved = resolve_vars(value, &env.vars)?;
                    env.vars.insert(name.clone(), resolved);
                }
            }
            ScssItem::Declaration { prop, value } => {
                let resolved = resolve_vars(value, &env.vars)?;
                direct_decls.push((prop.trim().to_string(), resolved));
            }
            ScssItem::Block {
                header: sub_h,
                body: sub_b,
            } => {
                let resolved_h = resolve_vars(sub_h, &env.vars)?;
                child_blocks.push((resolved_h, sub_b.clone()));
            }
            _ => {}
        }
    }

    if !direct_decls.is_empty() {
        let rule = format_rule(&next_selectors.join(", "), &direct_decls);
        out.push_str(&wrap_with_at_rules(at_wrappers, &rule));
    }

    for (sub_h, sub_b) in child_blocks {
        emit_block(&sub_h, &sub_b, &next_selectors, at_wrappers, env, out)?;
    }
    Ok(())
}

fn format_rule(selector: &str, decls: &[(String, String)]) -> String {
    let mut buf = String::new();
    buf.push_str(selector);
    buf.push_str(" {\n");
    for (prop, val) in decls {
        buf.push_str("  ");
        buf.push_str(prop);
        buf.push_str(": ");
        buf.push_str(val.trim());
        buf.push_str(";\n");
    }
    buf.push_str("}\n");
    buf
}

fn wrap_with_at_rules(wrappers: &[String], inner: &str) -> String {
    let mut current = inner.to_string();
    for wrapper in wrappers.iter().rev() {
        let mut indented = String::new();
        for line in current.lines() {
            if !line.is_empty() {
                indented.push_str("  ");
                indented.push_str(line);
                indented.push('\n');
            }
        }
        current = format!("{} {{\n{}}}\n", wrapper, indented);
    }
    current
}

fn combine_selectors(parents: &[String], current: &str) -> Vec<String> {
    let parts = split_top_level_commas(current);
    if parents.is_empty() {
        return parts;
    }
    let mut combined = Vec::new();
    for parent in parents {
        for part in &parts {
            if part.contains('&') {
                combined.push(part.replace('&', parent));
            } else {
                combined.push(format!("{} {}", parent, part));
            }
        }
    }
    combined
}

fn split_top_level_commas(input: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0usize;
    let mut start = 0usize;
    for (idx, ch) in input.char_indices() {
        match ch {
            '(' | '[' => depth += 1,
            ')' | ']' => depth = depth.saturating_sub(1),
            ',' if depth == 0 => {
                let piece = input[start..idx].trim();
                if !piece.is_empty() {
                    out.push(piece.to_string());
                }
                start = idx + 1;
            }
            _ => {}
        }
    }
    let tail = input[start..].trim();
    if !tail.is_empty() {
        out.push(tail.to_string());
    }
    out
}

fn ensure_canonical_base_dir(base_dir: &Path) -> Result<PathBuf, CompilerError> {
    let meta = fs::symlink_metadata(base_dir)
        .map_err(|_| CompilerError::create("VUI010", "unable to inspect SCSS base_dir metadata"))?;
    if meta.file_type().is_symlink() || !meta.is_dir() {
        return Err(CompilerError::create(
            "VUI010",
            "SCSS base_dir must be a regular non-symlink directory",
        ));
    }
    fs::canonicalize(base_dir)
        .map_err(|_| CompilerError::create("VUI010", "unable to canonicalize SCSS base_dir"))
}

fn ensure_canonical_subdir(
    canonical_root: &Path,
    current_dir: &Path,
) -> Result<PathBuf, CompilerError> {
    reject_symlinks_along_path(canonical_root, current_dir)?;
    let canon = fs::canonicalize(current_dir)
        .map_err(|_| CompilerError::create("VUI010", "unable to canonicalize SCSS module dir"))?;
    if !canon.starts_with(canonical_root) {
        return Err(CompilerError::create(
            "VUI010",
            "SCSS module directory escapes canonical base_dir",
        ));
    }
    Ok(canon)
}

fn reject_symlinks_along_path(
    canonical_root: &Path,
    target_path: &Path,
) -> Result<(), CompilerError> {
    if let Ok(rel) = target_path.strip_prefix(canonical_root) {
        let mut cur = canonical_root.to_path_buf();
        for comp in rel.components() {
            if let std::path::Component::Normal(seg) = comp {
                cur.push(seg);
                if let Ok(meta) = fs::symlink_metadata(&cur) {
                    if meta.file_type().is_symlink() {
                        return Err(CompilerError::create(
                            "VUI010",
                            "symlink disallowed in SCSS path",
                        ));
                    }
                }
            }
        }
    } else if let Ok(meta) = fs::symlink_metadata(target_path) {
        if meta.file_type().is_symlink() {
            return Err(CompilerError::create(
                "VUI010",
                "symlink disallowed in SCSS path",
            ));
        }
    }
    Ok(())
}

fn resolve_import_path(
    canonical_root: &Path,
    canonical_current: &Path,
    target: &str,
) -> Result<PathBuf, CompilerError> {
    if target.is_empty()
        || target.contains('\0')
        || target.contains('\\')
        || target.contains(':')
        || target.starts_with('/')
    {
        return Err(CompilerError::create(
            "VUI010",
            "disallowed absolute, scheme, or backslash path in SCSS @use/@forward",
        ));
    }

    let (normalized, from_pkg_root) = if let Some(rest) = target
        .strip_prefix("vespoli-ui/scss/")
        .or_else(|| target.strip_prefix("vespoli-ui/scss"))
    {
        (if rest.is_empty() { "index" } else { rest }, true)
    } else {
        (target, false)
    };

    if normalized.is_empty() || normalized.starts_with('/') {
        return Err(CompilerError::create(
            "VUI010",
            "disallowed absolute SCSS @use/@forward specifier",
        ));
    }

    let mut stack: Vec<String> = Vec::new();
    if !from_pkg_root {
        let rel_current = canonical_current
            .strip_prefix(canonical_root)
            .map_err(|_| {
                CompilerError::create("VUI010", "SCSS module directory outside base_dir")
            })?;
        for comp in rel_current.components() {
            if let std::path::Component::Normal(seg) = comp {
                let s = seg.to_str().ok_or_else(|| {
                    CompilerError::create("VUI010", "non-UTF8 SCSS directory segment")
                })?;
                stack.push(s.to_string());
            }
        }
    }

    for comp in Path::new(normalized).components() {
        match comp {
            std::path::Component::CurDir => {}
            std::path::Component::Normal(seg) => {
                let s = seg.to_str().ok_or_else(|| {
                    CompilerError::create("VUI010", "invalid SCSS @use/@forward segment")
                })?;
                if s.is_empty() {
                    return Err(CompilerError::create(
                        "VUI010",
                        "empty segment in SCSS @use/@forward",
                    ));
                }
                stack.push(s.to_string());
            }
            std::path::Component::ParentDir => {
                if stack.pop().is_none() {
                    return Err(CompilerError::create(
                        "VUI010",
                        "SCSS @use/@forward path traversal escapes base_dir",
                    ));
                }
            }
            std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                return Err(CompilerError::create(
                    "VUI010",
                    "absolute path disallowed in SCSS @use/@forward",
                ));
            }
        }
    }

    let Some(last_seg) = stack.pop() else {
        return Err(CompilerError::create(
            "VUI010",
            "SCSS @use/@forward target resolves to empty filename",
        ));
    };
    let clean_stem = last_seg.strip_suffix(".scss").unwrap_or(&last_seg);

    let candidate_tails: Vec<Vec<String>> = if last_seg.ends_with(".scss") {
        let mut exact = stack.clone();
        exact.push(last_seg.clone());
        let mut partial = stack;
        if !last_seg.starts_with('_') {
            partial.push(format!("_{}", last_seg));
            vec![exact, partial]
        } else {
            vec![exact]
        }
    } else {
        let mut direct = stack.clone();
        direct.push(format!("{}.scss", clean_stem));
        let mut partial = stack.clone();
        partial.push(format!("_{}.scss", clean_stem));
        let mut idx_file = stack.clone();
        idx_file.push(clean_stem.to_string());
        idx_file.push("index.scss".to_string());
        let mut partial_idx = stack;
        partial_idx.push(clean_stem.to_string());
        partial_idx.push("_index.scss".to_string());
        vec![direct, partial, idx_file, partial_idx]
    };

    for segments in &candidate_tails {
        let mut cur = canonical_root.to_path_buf();
        let mut missing = false;
        for seg in segments {
            cur.push(seg);
            match fs::symlink_metadata(&cur) {
                Ok(meta) => {
                    if meta.file_type().is_symlink() {
                        return Err(CompilerError::create(
                            "VUI010",
                            "symlink disallowed in SCSS @use/@forward path",
                        ));
                    }
                }
                Err(_) => {
                    missing = true;
                    break;
                }
            }
        }
        if missing {
            continue;
        }
        let Ok(meta) = fs::symlink_metadata(&cur) else {
            continue;
        };
        if meta.file_type().is_symlink() {
            return Err(CompilerError::create(
                "VUI010",
                "symlink disallowed in SCSS @use/@forward target",
            ));
        }
        if meta.is_file() && cur.extension().and_then(|s| s.to_str()) == Some("scss") {
            let canon = fs::canonicalize(&cur).map_err(|_| {
                CompilerError::create("VUI010", "failed to canonicalize SCSS partial")
            })?;
            if !canon.starts_with(canonical_root) {
                return Err(CompilerError::create(
                    "VUI010",
                    "resolved SCSS partial escapes canonical base_dir",
                ));
            }
            return Ok(canon);
        }
    }

    Err(CompilerError::create(
        "VUI010",
        "cannot resolve confined SCSS partial within base_dir",
    ))
}

fn resolve_vars(expr: &str, vars: &BTreeMap<String, String>) -> Result<String, CompilerError> {
    let expanded = resolve_vars_bounded(expr, vars, 0)?;
    let computed = eval_scss_arithmetic(&expanded);
    if computed.len() > MAX_EXPANDED_BYTES {
        return Err(CompilerError::create(
            "VUI010",
            "SCSS variable expansion exceeded 64 KiB limit",
        ));
    }
    Ok(computed)
}

fn resolve_vars_bounded(
    expr: &str,
    vars: &BTreeMap<String, String>,
    depth: usize,
) -> Result<String, CompilerError> {
    if depth > MAX_VAR_DEPTH {
        return Err(CompilerError::create(
            "VUI010",
            "SCSS variable expansion exceeded max recursion depth of 16",
        ));
    }
    if expr.len() > MAX_EXPANDED_BYTES {
        return Err(CompilerError::create(
            "VUI010",
            "SCSS variable expression exceeded 64 KiB limit",
        ));
    }
    let mut out = String::with_capacity(expr.len().min(MAX_EXPANDED_BYTES));
    let bytes = expr.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'#' && i + 1 < bytes.len() && bytes[i + 1] == b'{' {
            if let Some(end_offset) = expr[i + 2..].find('}') {
                let inner = &expr[i + 2..i + 2 + end_offset];
                let resolved_inner = resolve_vars_bounded(inner.trim(), vars, depth + 1)?;
                if out.len().saturating_add(resolved_inner.len()) > MAX_EXPANDED_BYTES {
                    return Err(CompilerError::create(
                        "VUI010",
                        "SCSS variable expansion exceeded 64 KiB limit",
                    ));
                }
                out.push_str(&resolved_inner);
                i += 3 + end_offset;
                continue;
            }
        }
        if bytes[i] == b'$' {
            let start = i + 1;
            let mut end = start;
            while end < bytes.len()
                && (bytes[end].is_ascii_alphanumeric() || bytes[end] == b'-' || bytes[end] == b'_')
            {
                end += 1;
            }
            if end > start {
                let name = &expr[start..end];
                let raw_val = vars.get(name).ok_or_else(|| {
                    CompilerError::create("VUI010", format!("undeclared SCSS variable '${}'", name))
                })?;
                let expanded_val = if raw_val.contains('$') || raw_val.contains("#{") {
                    resolve_vars_bounded(raw_val, vars, depth + 1)?
                } else {
                    if raw_val.len() > MAX_EXPANDED_BYTES {
                        return Err(CompilerError::create(
                            "VUI010",
                            "SCSS variable expansion exceeded 64 KiB limit",
                        ));
                    }
                    raw_val.clone()
                };
                if out.len().saturating_add(expanded_val.len()) > MAX_EXPANDED_BYTES {
                    return Err(CompilerError::create(
                        "VUI010",
                        "SCSS variable expansion exceeded 64 KiB limit",
                    ));
                }
                out.push_str(&expanded_val);
                i = end;
                continue;
            }
        }
        if out.len() + 1 > MAX_EXPANDED_BYTES {
            return Err(CompilerError::create(
                "VUI010",
                "SCSS variable expansion exceeded 64 KiB limit",
            ));
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    Ok(out)
}

fn eval_scss_arithmetic(expr: &str) -> String {
    let trimmed = expr.trim();
    if !trimmed.contains('*') {
        return expr.to_string();
    }
    let bytes = trimmed.as_bytes();
    let mut factors: Vec<&str> = Vec::new();
    let mut start = 0usize;
    let mut paren_depth = 0usize;
    let mut in_quote: Option<u8> = None;

    for (idx, &b) in bytes.iter().enumerate() {
        if let Some(q) = in_quote {
            if b == q && is_unescaped(bytes, idx) {
                in_quote = None;
            }
            continue;
        }
        match b {
            b'"' | b'\'' => in_quote = Some(b),
            b'(' => paren_depth += 1,
            b')' => paren_depth = paren_depth.saturating_sub(1),
            b'*' if paren_depth == 0 => {
                let piece = trimmed[start..idx].trim();
                if piece.is_empty() {
                    return expr.to_string();
                }
                factors.push(piece);
                start = idx + 1;
            }
            _ => {}
        }
    }
    if factors.is_empty() || in_quote.is_some() || paren_depth != 0 {
        return expr.to_string();
    }
    let tail = trimmed[start..].trim();
    if tail.is_empty() {
        return expr.to_string();
    }
    factors.push(tail);

    let mut product = 1.0_f64;
    let mut chosen_unit: Option<&str> = None;
    let mut all_dimensions = true;

    for f in &factors {
        if let Some((num, unit)) = parse_css_dimension(f) {
            product *= num;
            if !unit.is_empty() {
                match chosen_unit {
                    None => chosen_unit = Some(unit),
                    Some(prev) if prev == unit => {
                        all_dimensions = false;
                        break;
                    }
                    Some(_) => {
                        all_dimensions = false;
                        break;
                    }
                }
            }
        } else {
            all_dimensions = false;
            break;
        }
    }

    if all_dimensions && product.is_finite() {
        let unit = chosen_unit.unwrap_or("");
        let formatted_num = if (product - product.round()).abs() < 1e-9 && product.abs() < 1e15 {
            format!("{}", product.round() as i64)
        } else {
            let s = format!("{:.6}", product);
            s.trim_end_matches('0').trim_end_matches('.').to_string()
        };
        return format!("{}{}", formatted_num, unit);
    }

    let all_calc_compatible = factors.iter().all(|f| {
        parse_css_dimension(f).is_some() || f.starts_with("var(") || f.starts_with("calc(")
    });
    if all_calc_compatible {
        return format!("calc({})", factors.join(" * "));
    }

    expr.to_string()
}

fn parse_css_dimension(token: &str) -> Option<(f64, &str)> {
    let t = token.trim();
    if t.is_empty() {
        return None;
    }
    let bytes = t.as_bytes();
    let mut idx = 0usize;
    if bytes[idx] == b'+' || bytes[idx] == b'-' {
        idx += 1;
    }
    let num_start = idx;
    let mut saw_digit = false;
    let mut saw_dot = false;
    while idx < bytes.len() {
        let b = bytes[idx];
        if b.is_ascii_digit() {
            saw_digit = true;
            idx += 1;
        } else if b == b'.' && !saw_dot {
            saw_dot = true;
            idx += 1;
        } else {
            break;
        }
    }
    if !saw_digit || idx == num_start {
        return None;
    }
    let num: f64 = t[..idx].parse().ok()?;
    if !num.is_finite() {
        return None;
    }
    let unit = &t[idx..];
    if !unit.is_empty() && !unit.bytes().all(|b| b.is_ascii_alphabetic() || b == b'%') {
        return None;
    }
    Some((num, unit))
}

fn parse_items(src: &str) -> Result<Vec<ScssItem>, CompilerError> {
    let mut items = Vec::new();
    let bytes = src.as_bytes();
    let mut i = 0usize;

    while i < bytes.len() {
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= bytes.len() {
            break;
        }

        let start = i;
        let mut paren_depth = 0usize;
        let mut in_quote: Option<u8> = None;
        let mut delim: Option<u8> = None;

        while i < bytes.len() {
            let b = bytes[i];
            if let Some(q) = in_quote {
                if b == q && is_unescaped(bytes, i) {
                    in_quote = None;
                }
                i += 1;
                continue;
            }
            match b {
                b'"' | b'\'' => in_quote = Some(b),
                b'(' => paren_depth += 1,
                b')' => paren_depth = paren_depth.saturating_sub(1),
                b';' | b'{' if paren_depth == 0 => {
                    delim = Some(b);
                    break;
                }
                _ => {}
            }
            i += 1;
        }

        match delim {
            Some(b';') => {
                let raw = src[start..i].trim();
                i += 1;
                if !raw.is_empty() {
                    items.push(classify_statement(raw)?);
                }
            }
            Some(b'{') => {
                let header = src[start..i].trim().to_string();
                let block_start = i + 1;
                let block_end = find_matching_brace(src, i)?;
                let body_str = &src[block_start..block_end];
                let body = parse_items(body_str)?;
                items.push(ScssItem::Block { header, body });
                i = block_end + 1;
            }
            _ => {
                let trailing = src[start..].trim();
                if !trailing.is_empty() {
                    let line_no = 1 + src[..start].bytes().filter(|&b| b == b'\n').count();
                    return Err(CompilerError::create(
                        "VUI010",
                        format!("unterminated SCSS statement at line {}", line_no),
                    ));
                }
                break;
            }
        }
    }

    Ok(items)
}

fn classify_statement(raw: &str) -> Result<ScssItem, CompilerError> {
    if let Some(rest) = raw.strip_prefix('$') {
        let colon = rest.find(':').ok_or_else(|| {
            CompilerError::create("VUI010", "invalid SCSS variable declaration syntax")
        })?;
        let name = rest[..colon].trim().to_string();
        if name.is_empty()
            || !name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err(CompilerError::create(
                "VUI010",
                "invalid SCSS variable identifier",
            ));
        }
        let rhs = rest[colon + 1..].trim();
        let (value, is_default) = if let Some(stripped) = rhs.strip_suffix("!default") {
            (stripped.trim().to_string(), true)
        } else {
            (rhs.to_string(), false)
        };
        return Ok(ScssItem::VarDecl {
            name,
            value,
            is_default,
        });
    }

    if raw.starts_with("@use ") || raw.starts_with("@forward ") {
        return parse_use_rule(raw);
    }

    if raw.starts_with('@') {
        return Ok(ScssItem::Statement(raw.to_string()));
    }

    let colon = raw
        .find(':')
        .ok_or_else(|| CompilerError::create("VUI010", "invalid CSS declaration syntax"))?;
    let prop = raw[..colon].trim().to_string();
    let value = raw[colon + 1..].trim().to_string();
    Ok(ScssItem::Declaration { prop, value })
}

fn parse_use_rule(raw: &str) -> Result<ScssItem, CompilerError> {
    let bytes = raw.as_bytes();
    let first_quote = raw
        .find(['\'', '"'])
        .ok_or_else(|| CompilerError::create("VUI010", "missing quote in @use/@forward rule"))?;
    let quote_byte = bytes[first_quote];
    let mut cursor = first_quote + 1;
    let mut end_quote_opt: Option<usize> = None;
    while cursor < bytes.len() {
        if bytes[cursor] == quote_byte && is_unescaped(bytes, cursor) {
            end_quote_opt = Some(cursor);
            break;
        }
        cursor += 1;
    }
    let end_quote = end_quote_opt
        .ok_or_else(|| CompilerError::create("VUI010", "unclosed quote in @use/@forward rule"))?;
    let target = raw[first_quote + 1..end_quote].to_string();
    let tail = raw[end_quote + 1..].trim();

    let mut overrides = Vec::new();
    if let Some(with_idx) = tail.find("with") {
        let after_with = tail[with_idx + 4..].trim();
        if let (Some(open), Some(close)) = (after_with.find('('), after_with.rfind(')')) {
            if open < close {
                let inner = &after_with[open + 1..close];
                for entry in split_top_level_commas(inner) {
                    let trimmed = entry.trim();
                    if let Some(stripped) = trimmed.strip_prefix('$') {
                        if let Some(colon) = stripped.find(':') {
                            let k = stripped[..colon].trim().to_string();
                            let v = stripped[colon + 1..].trim().to_string();
                            overrides.push((k, v));
                        }
                    }
                }
            }
        }
    }

    Ok(ScssItem::UseRule { target, overrides })
}

fn is_unescaped(bytes: &[u8], idx: usize) -> bool {
    let mut backslash_count = 0usize;
    let mut k = idx;
    while k > 0 && bytes[k - 1] == b'\\' {
        backslash_count += 1;
        k -= 1;
    }
    (backslash_count & 1) == 0
}

fn find_matching_brace(src: &str, open_idx: usize) -> Result<usize, CompilerError> {
    let bytes = src.as_bytes();
    let mut depth = 0usize;
    let mut i = open_idx;
    let mut in_quote: Option<u8> = None;

    while i < bytes.len() {
        let b = bytes[i];
        if let Some(q) = in_quote {
            if b == q && is_unescaped(bytes, i) {
                in_quote = None;
            }
            i += 1;
            continue;
        }
        match b {
            b'"' | b'\'' => in_quote = Some(b),
            b'{' => depth += 1,
            b'}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Ok(i);
                }
            }
            _ => {}
        }
        i += 1;
    }

    Err(CompilerError::create(
        "VUI010",
        "unbalanced '{' in SCSS input",
    ))
}

fn strip_comments(src: &str) -> String {
    let mut out = String::with_capacity(src.len());
    let bytes = src.as_bytes();
    let mut i = 0usize;
    let mut in_quote: Option<u8> = None;

    while i < bytes.len() {
        let b = bytes[i];
        if let Some(q) = in_quote {
            out.push(b as char);
            if b == q && is_unescaped(bytes, i) {
                in_quote = None;
            }
            i += 1;
            continue;
        }
        if b == b'"' || b == b'\'' {
            in_quote = Some(b);
            out.push(b as char);
            i += 1;
            continue;
        }
        if b == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        if b == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                if bytes[i] == b'\n' {
                    out.push('\n');
                }
                i += 1;
            }
            i = (i + 2).min(bytes.len());
            continue;
        }
        out.push(b as char);
        i += 1;
    }
    out
}
