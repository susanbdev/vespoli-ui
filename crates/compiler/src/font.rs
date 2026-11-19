/// Synthesizes the deterministic < 2 KB monochrome WOFF2 subset glyph font (`vui-glyphs.woff2`)
/// mapping PUA codepoints U+E001..U+E008 (`shield`, `branch`, `lock`, `merkle`, `commit`,
/// `snapshot`, `alert`, `terminal`) in a compact WOFF2 container (`wOF2` magic `0x774F4632`).
pub fn encode_glyph_font() -> Vec<u8> {
    let cmap = build_cmap_subtable();
    let glyf = build_monochrome_glyf();
    let head = build_head_table();
    let hhea = build_hhea_table();
    let hmtx = build_hmtx_table();
    let maxp = build_maxp_table();
    let post = build_post_table();

    let tables: [(u8, &[u8]); 7] = [
        (0, &cmap),  // cmap
        (1, &head),  // head
        (2, &hhea),  // hhea
        (3, &hmtx),  // hmtx
        (4, &maxp),  // maxp
        (10, &glyf), // glyf (null transform flag 0xC0)
        (12, &post), // post
    ];

    // Uncompressed Brotli stream (RFC 7932 meta-block header for literal raw bytes)
    let mut raw_stream = Vec::new();
    for (_, data) in &tables {
        raw_stream.extend_from_slice(data);
    }
    let compressed = encode_uncompressed_brotli(&raw_stream);

    let mut dir = Vec::new();
    for (known_idx, data) in &tables {
        let flags = if *known_idx == 10 {
            known_idx | 0xC0
        } else {
            *known_idx
        };
        dir.push(flags);
        write_base128(&mut dir, data.len() as u32);
    }

    let total_length = (48 + dir.len() + compressed.len()) as u32;
    let total_sfnt_size = (12 + tables.len() * 16 + raw_stream.len() + 32) as u32;

    let mut woff2 = Vec::with_capacity(total_length as usize);
    write_u32(&mut woff2, 0x774F_4632); // 'wOF2'
    write_u32(&mut woff2, 0x0001_0000); // TrueType flavor
    write_u32(&mut woff2, total_length);
    write_u16(&mut woff2, tables.len() as u16);
    write_u16(&mut woff2, 0); // reserved
    write_u32(&mut woff2, total_sfnt_size);
    write_u32(&mut woff2, compressed.len() as u32);
    write_u16(&mut woff2, 1); // majorVersion
    write_u16(&mut woff2, 0); // minorVersion
    write_u32(&mut woff2, 0); // metaOffset
    write_u32(&mut woff2, 0); // metaLength
    write_u32(&mut woff2, 0); // metaOrigLength
    write_u32(&mut woff2, 0); // privOffset
    write_u32(&mut woff2, 0); // privLength

    woff2.extend_from_slice(&dir);
    woff2.extend_from_slice(&compressed);
    woff2
}

fn encode_uncompressed_brotli(payload: &[u8]) -> Vec<u8> {
    // RFC 7932 Section 9.1 + uncompressed meta-block wrapper
    // WBITS=16 (bit 0 = 1, bits 1..3 = 000 -> 0x01), ISLAST=0, MNIBBLES=4, ISUNCOMPRESSED=1,
    // followed by literal bytes and final ISLAST=1, ISEMPTY=1 trailer.
    let len = payload.len();
    let mlen_minus_1 = len.saturating_sub(1) as u32;
    // Bit 0: WBITS=16 (0), Bit 1: ISLAST=0 (0), Bits 2..3: MNIBBLES=4 (00),
    // Bits 4..19: MLEN-1, Bit 20: ISUNCOMPRESSED=1, Bits 21..23: zero pad.
    let header_bits: u32 = ((mlen_minus_1 & 0xFFFF) << 4) | (1 << 20);

    let mut out = Vec::with_capacity(payload.len() + 6);
    out.push((header_bits & 0xFF) as u8);
    out.push(((header_bits >> 8) & 0xFF) as u8);
    out.push(((header_bits >> 16) & 0xFF) as u8);
    out.extend_from_slice(payload);
    out.push(0x03); // ISLAST = 1, ISEMPTY = 1
    out
}

fn build_cmap_subtable() -> Vec<u8> {
    // Format 4 mapping U+E001..U+E008 -> glyph IDs 1..8
    let mut buf = Vec::new();
    write_u16(&mut buf, 0); // version
    write_u16(&mut buf, 1); // numTables
    write_u16(&mut buf, 3); // platformID Windows
    write_u16(&mut buf, 1); // encodingID Unicode BMP
    write_u32(&mut buf, 12); // offset
    write_u16(&mut buf, 4); // format 4
    write_u16(&mut buf, 32); // length
    write_u16(&mut buf, 0); // language
    write_u16(&mut buf, 4); // segCountX2 (2 segments: E001..E008 and FFFF)
    write_u16(&mut buf, 4); // searchRange
    write_u16(&mut buf, 1); // entrySelector
    write_u16(&mut buf, 0); // rangeShift
    write_u16(&mut buf, 0xE008); // endCode[0]
    write_u16(&mut buf, 0xFFFF); // endCode[1]
    write_u16(&mut buf, 0); // reservedPad
    write_u16(&mut buf, 0xE001); // startCode[0]
    write_u16(&mut buf, 0xFFFF); // startCode[1]
    write_u16(&mut buf, 0x2000); // idDelta[0]: (0xE001 + 0x2000) & 0xFFFF = 1
    write_u16(&mut buf, 1); // idDelta[1]
    write_u16(&mut buf, 0); // idRangeOffset[0]
    write_u16(&mut buf, 0); // idRangeOffset[1]
    buf
}

fn build_monochrome_glyf() -> Vec<u8> {
    // Compact monochrome 1000-UPM contour definitions for .notdef + 8 glyphs:
    // 1: shield, 2: branch, 3: lock, 4: merkle, 5: commit, 6: snapshot, 7: alert, 8: terminal
    let glyph_boxes: [(i16, i16, i16, i16); 9] = [
        (0, 0, 0, 0),
        (120, 80, 880, 920),  // shield
        (140, 100, 860, 900), // branch
        (180, 100, 820, 880), // lock
        (100, 120, 900, 880), // merkle
        (160, 160, 840, 840), // commit
        (120, 140, 880, 860), // snapshot
        (100, 100, 900, 900), // alert
        (120, 160, 880, 840), // terminal
    ];

    let mut out = Vec::new();
    for (idx, &(xmin, ymin, xmax, ymax)) in glyph_boxes.iter().enumerate() {
        if idx == 0 {
            write_u32(&mut out, 0);
            continue;
        }
        write_u16(&mut out, 1); // 1 contour
        write_u16(&mut out, xmin as u16);
        write_u16(&mut out, ymin as u16);
        write_u16(&mut out, xmax as u16);
        write_u16(&mut out, ymax as u16);
        write_u16(&mut out, 3); // endPtsOfContours = [3] (quad / diamond / geometric polygon)
        write_u16(&mut out, 0); // instructionLength = 0
        out.extend_from_slice(&[0x01, 0x01, 0x01, 0x01]); // on-curve flags
        write_u16(&mut out, xmin as u16);
        write_u16(&mut out, (xmax - xmin) as u16);
        write_u16(&mut out, 0);
        write_u16(&mut out, (xmin - xmax) as u16);
        write_u16(&mut out, ymin as u16);
        write_u16(&mut out, 0);
        write_u16(&mut out, (ymax - ymin) as u16);
        write_u16(&mut out, 0);
    }
    out
}

fn build_head_table() -> Vec<u8> {
    let mut buf = Vec::with_capacity(54);
    write_u32(&mut buf, 0x0001_0000); // version
    write_u32(&mut buf, 0x0001_0000); // fontRevision
    write_u32(&mut buf, 0); // checkSumAdjustment
    write_u32(&mut buf, 0x5F0F_3CF5); // magicNumber
    write_u16(&mut buf, 0x000B); // flags
    write_u16(&mut buf, 1000); // unitsPerEm
    buf.extend_from_slice(&[0u8; 16]); // created/modified
    write_u16(&mut buf, 0);
    write_u16(&mut buf, 0);
    write_u16(&mut buf, 1000);
    write_u16(&mut buf, 1000);
    write_u16(&mut buf, 0); // macStyle
    write_u16(&mut buf, 8); // lowestRecPPEM
    write_u16(&mut buf, 2); // fontDirectionHint
    write_u16(&mut buf, 0); // indexToLocFormat
    write_u16(&mut buf, 0); // glyphDataFormat
    buf
}

fn build_hhea_table() -> Vec<u8> {
    let mut buf = Vec::with_capacity(36);
    write_u32(&mut buf, 0x0001_0000);
    write_u16(&mut buf, 880); // ascender
    write_u16(&mut buf, (-120i16) as u16); // descender
    write_u16(&mut buf, 0); // lineGap
    write_u16(&mut buf, 1000); // advanceWidthMax
    buf.extend_from_slice(&[0u8; 22]);
    write_u16(&mut buf, 9); // numberOfHMetrics (9 glyphs: .notdef + 8 icons)
    buf
}

fn build_hmtx_table() -> Vec<u8> {
    let mut buf = Vec::with_capacity(36);
    for idx in 0..9 {
        write_u16(&mut buf, 1000);
        write_u16(&mut buf, if idx == 0 { 0 } else { 100 });
    }
    buf
}

fn build_maxp_table() -> Vec<u8> {
    let mut buf = Vec::with_capacity(6);
    write_u32(&mut buf, 0x0000_5000);
    write_u16(&mut buf, 9); // 9 glyphs
    buf
}

fn build_post_table() -> Vec<u8> {
    let mut buf = Vec::with_capacity(32);
    write_u32(&mut buf, 0x0003_0000); // format 3.0 (no postscript glyph names -> ultra-compact)
    buf.extend_from_slice(&[0u8; 28]);
    buf
}

fn write_u16(out: &mut Vec<u8>, val: u16) {
    out.extend_from_slice(&val.to_be_bytes());
}

fn write_u32(out: &mut Vec<u8>, val: u32) {
    out.extend_from_slice(&val.to_be_bytes());
}

fn write_base128(out: &mut Vec<u8>, mut val: u32) {
    let mut bytes = [0u8; 5];
    let mut count = 0usize;
    loop {
        bytes[count] = (val & 0x7F) as u8;
        val >>= 7;
        count += 1;
        if val == 0 {
            break;
        }
    }
    for idx in (0..count).rev() {
        let mut b = bytes[idx];
        if idx > 0 {
            b |= 0x80;
        }
        out.push(b);
    }
}
