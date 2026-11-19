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
    let source = fs::read_to_string(path).map_err(|err| {
        CompilerError::create(
            "VUI010",
            format!("unable to read {}: {}", path.display(), err),
        )
    })?;
    let base_dir = path.parent().unwrap_or_else(|| Path::new("."));
    compile_scss_with_base(&source, base_dir)
}

pub fn compile_scss_with_base(source: &str, base_dir: &Path) -> Result<String, CompilerError> {
    let mut env = ScssEnv::default();
    let mut out = String::new();
    evaluate_module(source, base_dir, &mut env, &mut out)?;
    Ok(out)
}

pub fn compile_scss(source: &str) -> Result<String, CompilerError> {
    compile_scss_with_base(source, Path::new("."))
}

pub fn minify_css(css: &str) -> String {
    let stripped = strip_comments(css);
    let mut out = String::with_capacity(stripped.len());
    let mut in_quote: Option<char> = None;
    let mut prev_space = false;

    for ch in stripped.chars() {
        if let Some(q) = in_quote {
            out.push(ch);
            if ch == q {
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
                if b == q && (i == 0 || bytes[i - 1] != b'\\') {
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
                if b == q && (i == 0 || bytes[i - 1] != b'\\') {
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
    base_dir: &Path,
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
                for (var_name, raw_val) in overrides {
                    let resolved = resolve_vars(&raw_val, &env.vars)?;
                    env.vars.entry(var_name).or_insert(resolved);
                }
                let resolved_path = resolve_import_path(base_dir, &target)?;
                let canonical = fs::canonicalize(&resolved_path).unwrap_or(resolved_path.clone());
                if env.visited.insert(canonical) {
                    let child_src = fs::read_to_string(&resolved_path).map_err(|err| {
                        CompilerError::create(
                            "VUI010",
                            format!("failed reading {}: {}", resolved_path.display(), err),
                        )
                    })?;
                    let child_dir = resolved_path.parent().unwrap_or(base_dir);
                    evaluate_module(&child_src, child_dir, env, out)?;
                }
            }
            ScssItem::Statement(stmt) => {
                let resolved = resolve_vars(&stmt, &env.vars)?;
                out.push_str(resolved.trim());
                out.push_str(";\n");
            }
            ScssItem::Declaration { prop, value } => {
                let resolved = resolve_vars(&value, &env.vars)?;
                out.push_str(prop.trim());
                out.push_str(": ");
                out.push_str(resolved.trim());
                out.push_str(";\n");
            }
            ScssItem::Block { header, body } => {
                let resolved_header = resolve_vars(&header, &env.vars)?;
                emit_block(&resolved_header, &body, &[], &[], env, out)?;
            }
        }
    }
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

fn resolve_import_path(base_dir: &Path, target: &str) -> Result<PathBuf, CompilerError> {
    let normalized = target
        .strip_prefix("vespoli-ui/scss/")
        .or_else(|| target.strip_prefix("vespoli-ui/scss"))
        .map(|rest| if rest.is_empty() { "index" } else { rest })
        .unwrap_or(target);

    let rel = Path::new(normalized);
    let parent = rel
        .parent()
        .map(|p| base_dir.join(p))
        .unwrap_or_else(|| base_dir.to_path_buf());
    let stem = rel
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(normalized);
    let clean_stem = stem.strip_suffix(".scss").unwrap_or(stem);

    let candidates = [
        base_dir.join(normalized),
        parent.join(format!("{}.scss", clean_stem)),
        parent.join(format!("_{}.scss", clean_stem)),
        base_dir.join(normalized).join("index.scss"),
    ];

    for cand in &candidates {
        if cand.is_file() {
            return Ok(cand.clone());
        }
    }
    Err(CompilerError::create(
        "VUI010",
        format!(
            "cannot resolve SCSS module '{}' from {}",
            target,
            base_dir.display()
        ),
    ))
}

fn resolve_vars(expr: &str, vars: &BTreeMap<String, String>) -> Result<String, CompilerError> {
    let mut out = String::with_capacity(expr.len());
    let bytes = expr.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'#' && i + 1 < bytes.len() && bytes[i + 1] == b'{' {
            if let Some(end_offset) = expr[i + 2..].find('}') {
                let inner = &expr[i + 2..i + 2 + end_offset];
                let resolved_inner = resolve_vars(inner.trim(), vars)?;
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
                let val = vars.get(name).ok_or_else(|| {
                    CompilerError::create("VUI010", format!("undeclared SCSS variable '${}'", name))
                })?;
                out.push_str(val);
                i = end;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    Ok(out)
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
                if b == q && (i == 0 || bytes[i - 1] != b'\\') {
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
                    return Err(CompilerError::create(
                        "VUI010",
                        format!("unterminated SCSS statement near '{}'", trailing),
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
            CompilerError::create("VUI010", format!("invalid variable declaration '{}'", raw))
        })?;
        let name = rest[..colon].trim().to_string();
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

    let colon = raw.find(':').ok_or_else(|| {
        CompilerError::create("VUI010", format!("invalid CSS declaration '{}'", raw))
    })?;
    let prop = raw[..colon].trim().to_string();
    let value = raw[colon + 1..].trim().to_string();
    Ok(ScssItem::Declaration { prop, value })
}

fn parse_use_rule(raw: &str) -> Result<ScssItem, CompilerError> {
    let first_quote = raw
        .find(['\'', '"'])
        .ok_or_else(|| CompilerError::create("VUI010", format!("missing quote in '{}'", raw)))?;
    let quote_char = raw.as_bytes()[first_quote] as char;
    let rest = &raw[first_quote + 1..];
    let end_quote = rest
        .find(quote_char)
        .ok_or_else(|| CompilerError::create("VUI010", format!("unclosed quote in '{}'", raw)))?;
    let target = rest[..end_quote].to_string();
    let tail = rest[end_quote + 1..].trim();

    let mut overrides = Vec::new();
    if let Some(with_idx) = tail.find("with") {
        let after_with = tail[with_idx + 4..].trim();
        if let (Some(open), Some(close)) = (after_with.find('('), after_with.rfind(')')) {
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

    Ok(ScssItem::UseRule { target, overrides })
}

fn find_matching_brace(src: &str, open_idx: usize) -> Result<usize, CompilerError> {
    let bytes = src.as_bytes();
    let mut depth = 0usize;
    let mut i = open_idx;
    let mut in_quote: Option<u8> = None;

    while i < bytes.len() {
        let b = bytes[i];
        if let Some(q) = in_quote {
            if b == q && (i == 0 || bytes[i - 1] != b'\\') {
                in_quote = None;
            }
            i += 1;
            continue;
        }
        if b == b'#' && i + 1 < bytes.len() && bytes[i + 1] == b'{' {
            if let Some(rel_end) = src[i + 2..].find('}') {
                i += 3 + rel_end;
                continue;
            }
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
            if b == q && (i == 0 || bytes[i - 1] != b'\\') {
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
                i += 1;
            }
            i += 2;
            continue;
        }
        out.push(b as char);
        i += 1;
    }
    out
}
