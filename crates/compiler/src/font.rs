/// Synthesizes the deterministic < 2 KB Browser-OTS-compliant monochrome WOFF2 subset glyph font
/// (`vui-glyphs.woff2`) mapping PUA codepoints U+E001..U+E008 (`shield`, `branch`, `lock`,
/// `merkle`, `commit`, `snapshot`, `alert`, `terminal`) plus `.notdef` (glyph 0) across all 10
/// canonical TrueType SFNT tables (`OS/2`, `cmap`, `glyf`, `head`, `hhea`, `hmtx`, `loca`, `maxp`,
/// `name`, `post`).
pub fn encode_glyph_font() -> Vec<u8> {
    let specs = define_glyph_specs();
    let (glyf, loca, metrics) = encode_glyf_and_loca(&specs);
    let os2 = build_os2_table();
    let cmap = build_cmap_table();
    let mut head = build_head_table(&metrics, 0);
    let hhea = build_hhea_table(&metrics);
    let hmtx = build_hmtx_table(&metrics);
    let maxp = build_maxp_table(&metrics);
    let name = build_name_table();
    let post = build_post_table();

    let initial_tables: [SfntTable<'_>; 10] = [
        SfntTable {
            tag: *b"OS/2",
            woff2_flags: 6,
            data: &os2,
        },
        SfntTable {
            tag: *b"cmap",
            woff2_flags: 0,
            data: &cmap,
        },
        SfntTable {
            tag: *b"glyf",
            woff2_flags: 10 | 0xC0, // 0xCA: known tag 10 ('glyf') + transform version 3 (null)
            data: &glyf,
        },
        SfntTable {
            tag: *b"head",
            woff2_flags: 1,
            data: &head,
        },
        SfntTable {
            tag: *b"hhea",
            woff2_flags: 2,
            data: &hhea,
        },
        SfntTable {
            tag: *b"hmtx",
            woff2_flags: 3,
            data: &hmtx,
        },
        SfntTable {
            tag: *b"loca",
            woff2_flags: 11 | 0xC0, // 0xCB: known tag 11 ('loca') + transform version 3 (null)
            data: &loca,
        },
        SfntTable {
            tag: *b"maxp",
            woff2_flags: 4,
            data: &maxp,
        },
        SfntTable {
            tag: *b"name",
            woff2_flags: 5,
            data: &name,
        },
        SfntTable {
            tag: *b"post",
            woff2_flags: 7,
            data: &post,
        },
    ];

    let adjustment = compute_head_adjustment(&initial_tables);
    head[8..12].copy_from_slice(&adjustment.to_be_bytes());

    let final_tables: [SfntTable<'_>; 10] = [
        SfntTable {
            tag: *b"OS/2",
            woff2_flags: 6,
            data: &os2,
        },
        SfntTable {
            tag: *b"cmap",
            woff2_flags: 0,
            data: &cmap,
        },
        SfntTable {
            tag: *b"glyf",
            woff2_flags: 0xCA,
            data: &glyf,
        },
        SfntTable {
            tag: *b"head",
            woff2_flags: 1,
            data: &head,
        },
        SfntTable {
            tag: *b"hhea",
            woff2_flags: 2,
            data: &hhea,
        },
        SfntTable {
            tag: *b"hmtx",
            woff2_flags: 3,
            data: &hmtx,
        },
        SfntTable {
            tag: *b"loca",
            woff2_flags: 0xCB,
            data: &loca,
        },
        SfntTable {
            tag: *b"maxp",
            woff2_flags: 4,
            data: &maxp,
        },
        SfntTable {
            tag: *b"name",
            woff2_flags: 5,
            data: &name,
        },
        SfntTable {
            tag: *b"post",
            woff2_flags: 7,
            data: &post,
        },
    ];

    let mut raw_stream = Vec::new();
    let mut dir = Vec::new();
    let mut padded_tables_len = 0usize;
    for entry in &final_tables {
        raw_stream.extend_from_slice(entry.data);
        dir.push(entry.woff2_flags);
        write_base128(&mut dir, entry.data.len() as u32);
        padded_tables_len += align4(entry.data.len());
    }

    let compressed = encode_uncompressed_brotli(&raw_stream);
    let total_length = (48 + dir.len() + compressed.len()) as u32;
    let total_sfnt_size = (12 + final_tables.len() * 16 + padded_tables_len) as u32;

    let mut woff2 = Vec::with_capacity(total_length as usize);
    write_u32(&mut woff2, 0x774F_4632); // 'wOF2'
    write_u32(&mut woff2, 0x0001_0000); // TrueType sfnt flavor
    write_u32(&mut woff2, total_length);
    write_u16(&mut woff2, final_tables.len() as u16);
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

struct GlyphSpec {
    contours: &'static [&'static [(i16, i16)]],
}

struct SfntTable<'a> {
    tag: [u8; 4],
    woff2_flags: u8,
    data: &'a [u8],
}

struct GlyphMetrics {
    num_glyphs: u16,
    max_points: u16,
    max_contours: u16,
    global_xmin: i16,
    global_ymin: i16,
    global_xmax: i16,
    global_ymax: i16,
    lsbs: Vec<i16>,
    min_lsb: i16,
    min_rsb: i16,
    xmax_extent: i16,
}

const NOTDEF_OUTER: &[(i16, i16)] = &[(180, 100), (180, 820), (820, 820), (820, 100)];
const NOTDEF_INNER: &[(i16, i16)] = &[(280, 200), (720, 200), (720, 720), (280, 720)];
const NOTDEF_CONTOURS: &[&[(i16, i16)]] = &[NOTDEF_OUTER, NOTDEF_INNER];

// 1: U+E001 shield (heraldic crest + inner left-facet cutout, 2 contours, 9 pts)
const SHIELD_OUTER: &[(i16, i16)] = &[
    (500, 880),
    (860, 740),
    (820, 380),
    (500, 60),
    (180, 380),
    (140, 740),
];
const SHIELD_INNER: &[(i16, i16)] = &[(500, 730), (270, 580), (500, 210)];
const SHIELD_CONTOURS: &[&[(i16, i16)]] = &[SHIELD_OUTER, SHIELD_INNER];

// 2: U+E002 branch (Git Y-branch trunk + right fork node, 1 contour, 11 pts)
const BRANCH_OUTER: &[(i16, i16)] = &[
    (220, 80),
    (220, 820),
    (290, 870),
    (360, 820),
    (360, 520),
    (640, 760),
    (800, 760),
    (800, 580),
    (660, 580),
    (360, 320),
    (360, 80),
];
const BRANCH_CONTOURS: &[&[(i16, i16)]] = &[BRANCH_OUTER];

// 3: U+E003 lock (padlock body + arched shackle + shackle cutout, 2 contours, 14 pts)
const LOCK_OUTER: &[(i16, i16)] = &[
    (180, 80),
    (180, 500),
    (300, 500),
    (300, 780),
    (380, 860),
    (620, 860),
    (700, 780),
    (700, 500),
    (820, 500),
    (820, 80),
];
const LOCK_INNER: &[(i16, i16)] = &[(400, 510), (600, 510), (600, 740), (400, 740)];
const LOCK_CONTOURS: &[&[(i16, i16)]] = &[LOCK_OUTER, LOCK_INNER];

// 4: U+E004 merkle (root node splitting via bridge into two leaf nodes, 1 contour, 16 pts)
const MERKLE_OUTER: &[(i16, i16)] = &[
    (120, 100),
    (120, 500),
    (440, 500),
    (440, 680),
    (360, 680),
    (360, 860),
    (640, 860),
    (640, 680),
    (560, 680),
    (560, 500),
    (880, 500),
    (880, 100),
    (640, 100),
    (640, 380),
    (360, 380),
    (360, 100),
];
const MERKLE_CONTOURS: &[&[(i16, i16)]] = &[MERKLE_OUTER];

// 5: U+E005 commit (horizontal rail + central octagonal ring + hex core cutout, 2 contours, 18 pts)
const COMMIT_OUTER: &[(i16, i16)] = &[
    (80, 410),
    (80, 530),
    (260, 530),
    (380, 740),
    (620, 740),
    (740, 530),
    (920, 530),
    (920, 410),
    (740, 410),
    (620, 200),
    (380, 200),
    (260, 410),
];
const COMMIT_INNER: &[(i16, i16)] = &[
    (370, 470),
    (435, 330),
    (565, 330),
    (630, 470),
    (565, 610),
    (435, 610),
];
const COMMIT_CONTOURS: &[&[(i16, i16)]] = &[COMMIT_OUTER, COMMIT_INNER];

// 6: U+E006 snapshot (camera body + top viewfinder prism + diamond aperture cutout, 2 contours, 12 pts)
const SNAPSHOT_OUTER: &[(i16, i16)] = &[
    (100, 160),
    (100, 680),
    (320, 680),
    (380, 800),
    (620, 800),
    (680, 680),
    (900, 680),
    (900, 160),
];
const SNAPSHOT_INNER: &[(i16, i16)] = &[(500, 250), (670, 420), (500, 590), (330, 420)];
const SNAPSHOT_CONTOURS: &[&[(i16, i16)]] = &[SNAPSHOT_OUTER, SNAPSHOT_INNER];

// 7: U+E007 alert (warning triangle + exclamation stem + dot cutouts, 3 contours, 13 pts)
const ALERT_OUTER: &[(i16, i16)] = &[(80, 100), (465, 880), (535, 880), (920, 100)];
const ALERT_STEM: &[(i16, i16)] = &[(455, 380), (500, 330), (545, 380), (545, 620), (455, 620)];
const ALERT_DOT: &[(i16, i16)] = &[(455, 190), (545, 190), (545, 280), (455, 280)];
const ALERT_CONTOURS: &[&[(i16, i16)]] = &[ALERT_OUTER, ALERT_STEM, ALERT_DOT];

// 8: U+E008 terminal ('>_' command chevron + underscore cursor bar, 2 contours, 10 pts)
const TERMINAL_CHEVRON: &[(i16, i16)] = &[
    (120, 660),
    (200, 740),
    (480, 480),
    (200, 220),
    (120, 300),
    (310, 480),
];
const TERMINAL_CURSOR: &[(i16, i16)] = &[(520, 200), (520, 310), (880, 310), (880, 200)];
const TERMINAL_CONTOURS: &[&[(i16, i16)]] = &[TERMINAL_CHEVRON, TERMINAL_CURSOR];

fn define_glyph_specs() -> [GlyphSpec; 9] {
    [
        GlyphSpec {
            contours: NOTDEF_CONTOURS,
        },
        GlyphSpec {
            contours: SHIELD_CONTOURS,
        },
        GlyphSpec {
            contours: BRANCH_CONTOURS,
        },
        GlyphSpec {
            contours: LOCK_CONTOURS,
        },
        GlyphSpec {
            contours: MERKLE_CONTOURS,
        },
        GlyphSpec {
            contours: COMMIT_CONTOURS,
        },
        GlyphSpec {
            contours: SNAPSHOT_CONTOURS,
        },
        GlyphSpec {
            contours: ALERT_CONTOURS,
        },
        GlyphSpec {
            contours: TERMINAL_CONTOURS,
        },
    ]
}

fn encode_glyf_and_loca(specs: &[GlyphSpec]) -> (Vec<u8>, Vec<u8>, GlyphMetrics) {
    let mut glyf = Vec::new();
    let mut loca = Vec::with_capacity((specs.len() + 1) * 2);

    let mut max_points = 0u16;
    let mut max_contours = 0u16;
    let mut global_xmin = i16::MAX;
    let mut global_ymin = i16::MAX;
    let mut global_xmax = i16::MIN;
    let mut global_ymax = i16::MIN;
    let mut lsbs = Vec::with_capacity(specs.len());
    let mut min_lsb = i16::MAX;
    let mut min_rsb = i16::MAX;
    let mut xmax_extent = i16::MIN;

    for spec in specs {
        debug_assert_eq!(glyf.len() % 4, 0);
        write_u16(&mut loca, (glyf.len() / 2) as u16);

        let num_contours = spec.contours.len() as u16;
        max_contours = max_contours.max(num_contours);

        let mut pts: Vec<(i16, i16)> = Vec::new();
        let mut end_pts: Vec<u16> = Vec::with_capacity(spec.contours.len());
        for contour in spec.contours {
            pts.extend_from_slice(contour);
            end_pts.push((pts.len() - 1) as u16);
        }

        let num_points = pts.len() as u16;
        max_points = max_points.max(num_points);

        let mut xmin = i16::MAX;
        let mut ymin = i16::MAX;
        let mut xmax = i16::MIN;
        let mut ymax = i16::MIN;
        for &(x, y) in &pts {
            xmin = xmin.min(x);
            ymin = ymin.min(y);
            xmax = xmax.max(x);
            ymax = ymax.max(y);
        }

        global_xmin = global_xmin.min(xmin);
        global_ymin = global_ymin.min(ymin);
        global_xmax = global_xmax.max(xmax);
        global_ymax = global_ymax.max(ymax);

        let lsb = xmin;
        let rsb = 1000i16 - lsb - (xmax - xmin);
        let extent = lsb + (xmax - xmin);
        lsbs.push(lsb);
        min_lsb = min_lsb.min(lsb);
        min_rsb = min_rsb.min(rsb);
        xmax_extent = xmax_extent.max(extent);

        write_i16(&mut glyf, num_contours as i16);
        write_i16(&mut glyf, xmin);
        write_i16(&mut glyf, ymin);
        write_i16(&mut glyf, xmax);
        write_i16(&mut glyf, ymax);

        for &ep in &end_pts {
            write_u16(&mut glyf, ep);
        }
        write_u16(&mut glyf, 0); // instructionLength = 0

        // Explicit on-curve points (0x01) with 16-bit relative deltas
        glyf.resize(glyf.len() + pts.len(), 0x01);

        let mut prev_x = 0i16;
        for &(x, _) in &pts {
            write_i16(&mut glyf, x - prev_x);
            prev_x = x;
        }
        let mut prev_y = 0i16;
        for &(_, y) in &pts {
            write_i16(&mut glyf, y - prev_y);
            prev_y = y;
        }

        while glyf.len() % 4 != 0 {
            glyf.push(0);
        }
    }

    write_u16(&mut loca, (glyf.len() / 2) as u16);

    let metrics = GlyphMetrics {
        num_glyphs: specs.len() as u16,
        max_points,
        max_contours,
        global_xmin,
        global_ymin,
        global_xmax,
        global_ymax,
        lsbs,
        min_lsb,
        min_rsb,
        xmax_extent,
    };
    (glyf, loca, metrics)
}

fn build_os2_table() -> Vec<u8> {
    // OS/2 version 4 (exact 96 bytes)
    let mut buf = Vec::with_capacity(96);
    write_u16(&mut buf, 4); // version
    write_i16(&mut buf, 1000); // xAvgCharWidth
    write_u16(&mut buf, 400); // usWeightClass (Regular)
    write_u16(&mut buf, 5); // usWidthClass (Medium)
    write_u16(&mut buf, 0); // fsType (Installable)
    write_i16(&mut buf, 650); // ySubscriptXSize
    write_i16(&mut buf, 600); // ySubscriptYSize
    write_i16(&mut buf, 0); // ySubscriptXOffset
    write_i16(&mut buf, 75); // ySubscriptYOffset
    write_i16(&mut buf, 650); // ySuperscriptXSize
    write_i16(&mut buf, 600); // ySuperscriptYSize
    write_i16(&mut buf, 0); // ySuperscriptXOffset
    write_i16(&mut buf, 350); // ySuperscriptYOffset
    write_i16(&mut buf, 50); // yStrikeoutSize
    write_i16(&mut buf, 300); // yStrikeoutPosition
    write_i16(&mut buf, 0); // sFamilyClass
    buf.extend_from_slice(&[0u8; 10]); // panose[10]
    write_u32(&mut buf, 0); // ulUnicodeRange1
    write_u32(&mut buf, 1 << 28); // ulUnicodeRange2 (bit 60 = Private Use Area)
    write_u32(&mut buf, 0); // ulUnicodeRange3
    write_u32(&mut buf, 0); // ulUnicodeRange4
    buf.extend_from_slice(b"VUI "); // achVendID
    write_u16(&mut buf, 0x0040); // fsSelection (REGULAR)
    write_u16(&mut buf, 0xE001); // usFirstCharIndex
    write_u16(&mut buf, 0xE008); // usLastCharIndex
    write_i16(&mut buf, 920); // sTypoAscender
    write_i16(&mut buf, -80); // sTypoDescender
    write_i16(&mut buf, 0); // sTypoLineGap
    write_u16(&mut buf, 920); // usWinAscent
    write_u16(&mut buf, 80); // usWinDescent
    write_u32(&mut buf, 1); // ulCodePageRange1
    write_u32(&mut buf, 0); // ulCodePageRange2
    write_i16(&mut buf, 500); // sxHeight
    write_i16(&mut buf, 760); // sCapHeight
    write_u16(&mut buf, 0); // usDefaultChar
    write_u16(&mut buf, 0x0020); // usBreakChar
    write_u16(&mut buf, 0); // usMaxContext
    buf
}

fn build_cmap_table() -> Vec<u8> {
    // Format 4 mapping U+E001..U+E008 -> glyph IDs 1..8 (exact 44 bytes)
    let mut buf = Vec::with_capacity(44);
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
    write_u16(&mut buf, 1); // idDelta[1]: (0xFFFF + 1) & 0xFFFF = 0
    write_u16(&mut buf, 0); // idRangeOffset[0]
    write_u16(&mut buf, 0); // idRangeOffset[1]
    buf
}

fn build_head_table(metrics: &GlyphMetrics, check_sum_adjustment: u32) -> Vec<u8> {
    // TrueType head table (exact 54 bytes)
    let mut buf = Vec::with_capacity(54);
    write_u32(&mut buf, 0x0001_0000); // majorVersion 1, minorVersion 0
    write_u32(&mut buf, 0x0001_0000); // fontRevision 1.0
    write_u32(&mut buf, check_sum_adjustment);
    write_u32(&mut buf, 0x5F0F_3CF5); // magicNumber
    write_u16(&mut buf, 0x000B); // flags (baseline y=0, lsb at x=minX, integer ppem)
    write_u16(&mut buf, 1000); // unitsPerEm
    write_u32(&mut buf, 0); // created hi
    write_u32(&mut buf, 0xE1B6_8E00); // created lo (2024-01-01T00:00:00Z since 1904 epoch)
    write_u32(&mut buf, 0); // modified hi
    write_u32(&mut buf, 0xE1B6_8E00); // modified lo
    write_i16(&mut buf, metrics.global_xmin);
    write_i16(&mut buf, metrics.global_ymin);
    write_i16(&mut buf, metrics.global_xmax);
    write_i16(&mut buf, metrics.global_ymax);
    write_u16(&mut buf, 0); // macStyle (Regular)
    write_u16(&mut buf, 8); // lowestRecPPEM
    write_i16(&mut buf, 2); // fontDirectionHint
    write_i16(&mut buf, 0); // indexToLocFormat (0 = short uint16 offsets / 2)
    write_i16(&mut buf, 0); // glyphDataFormat
    buf
}

fn build_hhea_table(metrics: &GlyphMetrics) -> Vec<u8> {
    // Horizontal header table (exact 36 bytes)
    let mut buf = Vec::with_capacity(36);
    write_u32(&mut buf, 0x0001_0000); // version 1.0
    write_i16(&mut buf, 920); // ascender
    write_i16(&mut buf, -80); // descender
    write_i16(&mut buf, 0); // lineGap
    write_u16(&mut buf, 1000); // advanceWidthMax
    write_i16(&mut buf, metrics.min_lsb); // minLeftSideBearing
    write_i16(&mut buf, metrics.min_rsb); // minRightSideBearing
    write_i16(&mut buf, metrics.xmax_extent); // xMaxExtent
    write_i16(&mut buf, 1); // caretSlopeRise
    write_i16(&mut buf, 0); // caretSlopeRun
    write_i16(&mut buf, 0); // caretOffset
    write_i16(&mut buf, 0); // reserved0
    write_i16(&mut buf, 0); // reserved1
    write_i16(&mut buf, 0); // reserved2
    write_i16(&mut buf, 0); // reserved3
    write_i16(&mut buf, 0); // metricDataFormat
    write_u16(&mut buf, metrics.num_glyphs); // numberOfHMetrics
    buf
}

fn build_hmtx_table(metrics: &GlyphMetrics) -> Vec<u8> {
    let mut buf = Vec::with_capacity(metrics.lsbs.len() * 4);
    for &lsb in &metrics.lsbs {
        write_u16(&mut buf, 1000); // advanceWidth
        write_i16(&mut buf, lsb); // leftSideBearing == xMin
    }
    buf
}

fn build_maxp_table(metrics: &GlyphMetrics) -> Vec<u8> {
    // TrueType maxp version 1.0 (exact 32 bytes; v0.5 is invalid for TrueType outlines in OTS)
    let mut buf = Vec::with_capacity(32);
    write_u32(&mut buf, 0x0001_0000); // version 1.0
    write_u16(&mut buf, metrics.num_glyphs);
    write_u16(&mut buf, metrics.max_points);
    write_u16(&mut buf, metrics.max_contours);
    write_u16(&mut buf, 0); // maxCompositePoints
    write_u16(&mut buf, 0); // maxCompositeContours
    write_u16(&mut buf, 1); // maxZones (1 = no twilight zone)
    write_u16(&mut buf, 0); // maxTwilightPoints
    write_u16(&mut buf, 0); // maxStorage
    write_u16(&mut buf, 0); // maxFunctionDefs
    write_u16(&mut buf, 0); // maxInstructionDefs
    write_u16(&mut buf, 0); // maxStackElements
    write_u16(&mut buf, 0); // maxSizeOfInstructions
    write_u16(&mut buf, 0); // maxComponentElements
    write_u16(&mut buf, 0); // maxComponentDepth
    buf
}

fn build_name_table() -> Vec<u8> {
    // OpenType name table format 0 with sorted Windows Unicode BMP (3, 1, 0x0409) UTF-16BE records
    let records: [(u16, &str); 6] = [
        (1, "vui-glyphs"),
        (2, "Regular"),
        (3, "vui-glyphs-1.0"),
        (4, "vui-glyphs Regular"),
        (5, "Version 1.0"),
        (6, "vui-glyphs-Regular"),
    ];

    let count = records.len() as u16;
    let string_offset = 6 + count * 12;
    let mut storage = Vec::new();
    let mut header = Vec::with_capacity(string_offset as usize);

    write_u16(&mut header, 0); // format 0
    write_u16(&mut header, count);
    write_u16(&mut header, string_offset);

    for &(name_id, ascii_val) in &records {
        let offset = storage.len() as u16;
        for b in ascii_val.bytes() {
            storage.push(0);
            storage.push(b);
        }
        let byte_len = (ascii_val.len() * 2) as u16;
        write_u16(&mut header, 3); // platformID Windows
        write_u16(&mut header, 1); // encodingID Unicode BMP
        write_u16(&mut header, 0x0409); // languageID en-US
        write_u16(&mut header, name_id);
        write_u16(&mut header, byte_len);
        write_u16(&mut header, offset);
    }

    header.extend_from_slice(&storage);
    header
}

fn build_post_table() -> Vec<u8> {
    // post format 3.0 (exact 32 bytes, zero PostScript glyph name overhead)
    let mut buf = Vec::with_capacity(32);
    write_u32(&mut buf, 0x0003_0000); // format 3.0
    write_u32(&mut buf, 0); // italicAngle
    write_i16(&mut buf, -100); // underlinePosition
    write_i16(&mut buf, 50); // underlineThickness
    write_u32(&mut buf, 1); // isFixedPitch (monospace 1000 UPM icons)
    write_u32(&mut buf, 0); // minMemType42
    write_u32(&mut buf, 0); // maxMemType42
    write_u32(&mut buf, 0); // minMemType1
    write_u32(&mut buf, 0); // maxMemType1
    buf
}

fn compute_sfnt_checksum(data: &[u8]) -> u32 {
    let mut sum = 0u32;
    let (chunks, rem) = data.as_chunks::<4>();
    for &chunk in chunks {
        sum = sum.wrapping_add(u32::from_be_bytes(chunk));
    }
    if !rem.is_empty() {
        let mut tail = [0u8; 4];
        tail[..rem.len()].copy_from_slice(rem);
        sum = sum.wrapping_add(u32::from_be_bytes(tail));
    }
    sum
}

fn compute_head_adjustment(tables: &[SfntTable<'_>]) -> u32 {
    let num_tables = tables.len() as u16;
    let mut max_pow2 = 1u16;
    let mut entry_selector = 0u16;
    while max_pow2 * 2 <= num_tables {
        max_pow2 *= 2;
        entry_selector += 1;
    }
    let search_range = max_pow2 * 16;
    let range_shift = num_tables * 16 - search_range;

    let mut sfnt_header = Vec::with_capacity(12 + tables.len() * 16);
    write_u32(&mut sfnt_header, 0x0001_0000);
    write_u16(&mut sfnt_header, num_tables);
    write_u16(&mut sfnt_header, search_range);
    write_u16(&mut sfnt_header, entry_selector);
    write_u16(&mut sfnt_header, range_shift);

    let mut offset = (12 + tables.len() * 16) as u32;
    let mut total_sum = 0u32;

    for t in tables {
        let csum = compute_sfnt_checksum(t.data);
        sfnt_header.extend_from_slice(&t.tag);
        write_u32(&mut sfnt_header, csum);
        write_u32(&mut sfnt_header, offset);
        write_u32(&mut sfnt_header, t.data.len() as u32);
        offset += align4(t.data.len()) as u32;
        total_sum = total_sum.wrapping_add(csum);
    }

    total_sum = total_sum.wrapping_add(compute_sfnt_checksum(&sfnt_header));
    0xB1B0_AFBAu32.wrapping_sub(total_sum)
}

fn encode_uncompressed_brotli(payload: &[u8]) -> Vec<u8> {
    // RFC 7932 Section 9.1/9.2 uncompressed meta-block + empty final meta-block:
    // Bit 0 = 0 (WBITS=16), Bit 1 = 0 (ISLAST=0), Bits 2..3 = 00 (MNIBBLES=4 -> 16-bit MLEN-1),
    // Bits 4..19 = MLEN-1, Bit 20 = 1 (ISUNCOMPRESSED=1), Bits 21..23 = 000 pad,
    // followed by raw payload bytes and 0x03 (ISLAST=1, ISEMPTY=1).
    assert!(
        !payload.is_empty() && payload.len() <= 65_536,
        "Brotli single uncompressed meta-block requires 1..=65536 bytes"
    );
    let mlen_minus_1 = (payload.len() - 1) as u32;
    let header_bits: u32 = ((mlen_minus_1 & 0xFFFF) << 4) | (1 << 20);

    let mut out = Vec::with_capacity(payload.len() + 4);
    out.push((header_bits & 0xFF) as u8);
    out.push(((header_bits >> 8) & 0xFF) as u8);
    out.push(((header_bits >> 16) & 0xFF) as u8);
    out.extend_from_slice(payload);
    out.push(0x03);
    out
}

fn align4(len: usize) -> usize {
    (len + 3) & !3
}

fn write_i16(out: &mut Vec<u8>, val: i16) {
    out.extend_from_slice(&val.to_be_bytes());
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

#[cfg(test)]
mod tests {
    use super::{align4, compute_sfnt_checksum, encode_glyph_font};
    use std::collections::BTreeSet;

    struct Woff2DirEntry {
        flags: u8,
        tag: [u8; 4],
        orig_len: usize,
    }

    #[derive(Clone, Debug, PartialEq, Eq)]
    struct DecodedGlyph {
        num_contours: i16,
        bbox: (i16, i16, i16, i16),
        contours: Vec<Vec<(i16, i16)>>,
    }

    fn read_u16(buf: &[u8], off: usize) -> u16 {
        u16::from_be_bytes([buf[off], buf[off + 1]])
    }

    fn read_i16(buf: &[u8], off: usize) -> i16 {
        i16::from_be_bytes([buf[off], buf[off + 1]])
    }

    fn read_u32(buf: &[u8], off: usize) -> u32 {
        u32::from_be_bytes([buf[off], buf[off + 1], buf[off + 2], buf[off + 3]])
    }

    fn read_base128(buf: &[u8], pos: &mut usize) -> u32 {
        let mut accum = 0u32;
        for idx in 0..5 {
            let b = buf[*pos];
            *pos += 1;
            if idx == 0 {
                assert_ne!(b, 0x80, "UIntBase128 must not have leading 0x80");
            }
            accum = (accum << 7) | u32::from(b & 0x7F);
            if (b & 0x80) == 0 {
                return accum;
            }
        }
        panic!("UIntBase128 exceeded 5 bytes");
    }

    fn resolve_known_tag(known_idx: u8) -> [u8; 4] {
        match known_idx {
            0 => *b"cmap",
            1 => *b"head",
            2 => *b"hhea",
            3 => *b"hmtx",
            4 => *b"maxp",
            5 => *b"name",
            6 => *b"OS/2",
            7 => *b"post",
            8 => *b"cvt ",
            9 => *b"fpgm",
            10 => *b"glyf",
            11 => *b"loca",
            12 => *b"prep",
            other => panic!("unexpected WOFF2 known table index {}", other),
        }
    }

    fn decode_uncompressed_brotli(stream: &[u8]) -> Vec<u8> {
        assert!(stream.len() >= 5, "Brotli stream too short");
        let hdr = u32::from(stream[0]) | (u32::from(stream[1]) << 8) | (u32::from(stream[2]) << 16);
        assert_eq!(hdr & 1, 0, "expected WBITS=16");
        assert_eq!((hdr >> 1) & 1, 0, "expected ISLAST=0 on data meta-block");
        assert_eq!((hdr >> 2) & 0x03, 0, "expected MNIBBLES=4");
        assert_eq!((hdr >> 20) & 1, 1, "expected ISUNCOMPRESSED=1");
        assert_eq!(
            (hdr >> 21) & 0x07,
            0,
            "expected zero pad bits before raw bytes"
        );
        let mlen = (((hdr >> 4) & 0xFFFF) as usize) + 1;
        assert_eq!(stream.len(), 3 + mlen + 1, "exact Brotli framing length");
        assert_eq!(
            stream[3 + mlen],
            0x03,
            "expected ISLAST=1, ISEMPTY=1 trailer"
        );
        stream[3..3 + mlen].to_vec()
    }

    fn parse_woff2_tables(woff2: &[u8]) -> Vec<(Woff2DirEntry, Vec<u8>)> {
        assert_eq!(&woff2[0..4], b"wOF2");
        assert_eq!(read_u32(woff2, 4), 0x0001_0000);
        let total_len = read_u32(woff2, 8) as usize;
        assert_eq!(total_len, woff2.len());
        assert!(
            woff2.len() < 2048,
            "WOFF2 bundle must stay strictly < 2048 bytes, got {}",
            woff2.len()
        );

        let num_tables = read_u16(woff2, 12) as usize;
        assert_eq!(num_tables, 10);
        assert_eq!(read_u16(woff2, 14), 0);
        let declared_sfnt_size = read_u32(woff2, 16) as usize;
        let compressed_len = read_u32(woff2, 20) as usize;

        let mut pos = 48usize;
        let mut entries = Vec::with_capacity(num_tables);
        for _ in 0..num_tables {
            let flags = woff2[pos];
            pos += 1;
            let known_idx = flags & 0x3F;
            let xform_ver = (flags >> 6) & 0x03;
            let tag = resolve_known_tag(known_idx);
            if tag == *b"glyf" || tag == *b"loca" {
                assert_eq!(
                    xform_ver, 3,
                    "glyf/loca must set explicit null-transform version 3 (0xCA / 0xCB)"
                );
            } else {
                assert_eq!(xform_ver, 0, "non-glyf/loca tables must use version 0");
            }
            let orig_len = read_base128(woff2, &mut pos) as usize;
            entries.push(Woff2DirEntry {
                flags,
                tag,
                orig_len,
            });
        }

        assert_eq!(pos + compressed_len, woff2.len());
        let raw = decode_uncompressed_brotli(&woff2[pos..]);

        let expected_sfnt_size =
            12 + num_tables * 16 + entries.iter().map(|e| align4(e.orig_len)).sum::<usize>();
        assert_eq!(declared_sfnt_size, expected_sfnt_size);

        let mut raw_pos = 0usize;
        let mut out = Vec::with_capacity(num_tables);
        for entry in entries {
            let slice = raw[raw_pos..raw_pos + entry.orig_len].to_vec();
            raw_pos += entry.orig_len;
            out.push((entry, slice));
        }
        assert_eq!(raw_pos, raw.len());
        out
    }

    fn decode_simple_glyph(slice: &[u8]) -> DecodedGlyph {
        assert!(slice.len() >= 10, "simple glyph header requires >= 10B");
        let num_contours = read_i16(slice, 0);
        assert!(num_contours >= 1, "expected positive simple glyph contours");
        let xmin = read_i16(slice, 2);
        let ymin = read_i16(slice, 4);
        let xmax = read_i16(slice, 6);
        let ymax = read_i16(slice, 8);

        let c_count = num_contours as usize;
        let mut pos = 10usize;
        let mut end_pts = Vec::with_capacity(c_count);
        for _ in 0..c_count {
            end_pts.push(read_u16(slice, pos) as usize);
            pos += 2;
        }
        for w in end_pts.windows(2) {
            assert!(w[0] < w[1], "endPtsOfContours must strictly increase");
        }

        let insn_len = read_u16(slice, pos) as usize;
        assert_eq!(insn_len, 0);
        pos += 2;

        let num_pts = end_pts[c_count - 1] + 1;
        let flags = &slice[pos..pos + num_pts];
        for &f in flags {
            assert_eq!(f, 0x01, "all points use explicit on-curve 16-bit deltas");
        }
        pos += num_pts;

        let mut xs = Vec::with_capacity(num_pts);
        let mut cur_x = 0i16;
        for _ in 0..num_pts {
            cur_x = cur_x.checked_add(read_i16(slice, pos)).expect("x overflow");
            xs.push(cur_x);
            pos += 2;
        }

        let mut ys = Vec::with_capacity(num_pts);
        let mut cur_y = 0i16;
        for _ in 0..num_pts {
            cur_y = cur_y.checked_add(read_i16(slice, pos)).expect("y overflow");
            ys.push(cur_y);
            pos += 2;
        }

        assert!(slice.len() - pos < 4, "at most 3 zero-padding bytes");
        for &pad in &slice[pos..] {
            assert_eq!(pad, 0, "glyf padding bytes must be zero");
        }

        assert_eq!(xmin, *xs.iter().min().unwrap());
        assert_eq!(xmax, *xs.iter().max().unwrap());
        assert_eq!(ymin, *ys.iter().min().unwrap());
        assert_eq!(ymax, *ys.iter().max().unwrap());

        let mut contours = Vec::with_capacity(c_count);
        let mut start = 0usize;
        for &ep in &end_pts {
            let mut c = Vec::with_capacity(ep - start + 1);
            for idx in start..=ep {
                c.push((xs[idx], ys[idx]));
            }
            assert!(c.len() >= 3, "polygon contour must have >= 3 vertices");
            contours.push(c);
            start = ep + 1;
        }

        DecodedGlyph {
            num_contours,
            bbox: (xmin, ymin, xmax, ymax),
            contours,
        }
    }

    fn compute_signed_area2(contour: &[(i16, i16)]) -> i64 {
        let mut area2 = 0i64;
        for idx in 0..contour.len() {
            let (x0, y0) = contour[idx];
            let (x1, y1) = contour[(idx + 1) % contour.len()];
            area2 += i64::from(x0) * i64::from(y1) - i64::from(x1) * i64::from(y0);
        }
        area2
    }

    #[test]
    fn emits_browser_ots_compliant_woff2_with_loca_and_8_distinct_glyphs() {
        let woff2 = encode_glyph_font();
        assert_eq!(woff2, encode_glyph_font(), "must be deterministic");
        assert!(woff2.len() < 2048);

        let parsed = parse_woff2_tables(&woff2);
        let expected_tags_and_flags: [([u8; 4], u8); 10] = [
            (*b"OS/2", 0x06),
            (*b"cmap", 0x00),
            (*b"glyf", 0xCA),
            (*b"head", 0x01),
            (*b"hhea", 0x02),
            (*b"hmtx", 0x03),
            (*b"loca", 0xCB),
            (*b"maxp", 0x04),
            (*b"name", 0x05),
            (*b"post", 0x07),
        ];

        for (idx, ((entry, _), (exp_tag, exp_flags))) in parsed
            .iter()
            .zip(expected_tags_and_flags.iter())
            .enumerate()
        {
            assert_eq!(
                &entry.tag, exp_tag,
                "canonical tag order mismatch at {}",
                idx
            );
            assert_eq!(entry.flags, *exp_flags, "WOFF2 flags mismatch at {}", idx);
        }

        let find_table = |tag: &[u8; 4]| -> &[u8] {
            parsed
                .iter()
                .find(|(e, _)| &e.tag == tag)
                .map(|(_, d)| d.as_slice())
                .expect("missing required SFNT table")
        };

        let os2 = find_table(b"OS/2");
        let cmap = find_table(b"cmap");
        let glyf = find_table(b"glyf");
        let head = find_table(b"head");
        let hhea = find_table(b"hhea");
        let hmtx = find_table(b"hmtx");
        let loca = find_table(b"loca");
        let maxp = find_table(b"maxp");
        let name = find_table(b"name");
        let post = find_table(b"post");

        assert_eq!(os2.len(), 96);
        assert_eq!(cmap.len(), 44);
        assert_eq!(head.len(), 54);
        assert_eq!(hhea.len(), 36);
        assert_eq!(hmtx.len(), 36);
        assert_eq!(loca.len(), 20);
        assert_eq!(maxp.len(), 32);
        assert_eq!(post.len(), 32);
        assert!(name.len() > 78);

        // Verify head magicNumber, indexToLocFormat=0, and whole-SFNT checksum == 0xB1B0AFBA
        assert_eq!(read_u32(head, 12), 0x5F0F_3CF5);
        assert_eq!(read_u16(head, 18), 1000);
        assert_eq!(read_i16(head, 50), 0); // short loca

        let mut reconstructed_sfnt = Vec::new();
        reconstructed_sfnt.extend_from_slice(&0x0001_0000u32.to_be_bytes());
        reconstructed_sfnt.extend_from_slice(&10u16.to_be_bytes());
        reconstructed_sfnt.extend_from_slice(&128u16.to_be_bytes());
        reconstructed_sfnt.extend_from_slice(&3u16.to_be_bytes());
        reconstructed_sfnt.extend_from_slice(&32u16.to_be_bytes());

        let mut tbl_off = (12 + 10 * 16) as u32;
        for (entry, data) in &parsed {
            let csum = if &entry.tag == b"head" {
                let mut head_zeroed = data.clone();
                head_zeroed[8..12].copy_from_slice(&[0, 0, 0, 0]);
                compute_sfnt_checksum(&head_zeroed)
            } else {
                compute_sfnt_checksum(data)
            };
            reconstructed_sfnt.extend_from_slice(&entry.tag);
            reconstructed_sfnt.extend_from_slice(&csum.to_be_bytes());
            reconstructed_sfnt.extend_from_slice(&tbl_off.to_be_bytes());
            reconstructed_sfnt.extend_from_slice(&(data.len() as u32).to_be_bytes());
            tbl_off += align4(data.len()) as u32;
        }
        for (_, data) in &parsed {
            reconstructed_sfnt.extend_from_slice(data);
            while reconstructed_sfnt.len() % 4 != 0 {
                reconstructed_sfnt.push(0);
            }
        }
        assert_eq!(
            compute_sfnt_checksum(&reconstructed_sfnt),
            0xB1B0_AFBA,
            "whole-SFNT checksum must equal OpenType magic 0xB1B0AFBA"
        );

        // Verify maxp v1.0 & hhea
        assert_eq!(read_u32(maxp, 0), 0x0001_0000);
        let num_glyphs = read_u16(maxp, 4) as usize;
        let max_points = read_u16(maxp, 6) as usize;
        let max_contours = read_u16(maxp, 8) as usize;
        assert_eq!(num_glyphs, 9);
        assert_eq!(read_u16(hhea, 34) as usize, num_glyphs);

        // Verify loca monotonic 4-byte-aligned offsets matching glyf.len()
        assert_eq!(glyf.len() % 4, 0);
        let mut offsets = Vec::with_capacity(num_glyphs + 1);
        for idx in 0..=num_glyphs {
            offsets.push((read_u16(loca, idx * 2) as usize) * 2);
        }
        assert_eq!(offsets[0], 0);
        assert_eq!(*offsets.last().unwrap(), glyf.len());
        for w in offsets.windows(2) {
            assert!(w[0] < w[1], "every glyph 0..8 must be non-empty");
            assert_eq!(w[0] % 4, 0, "glyf offsets must be 4-byte aligned");
        }

        // Decode all 9 glyphs and verify winding, metrics, and pairwise distinctness of 1..=8
        let mut glyphs = Vec::with_capacity(num_glyphs);
        let mut obs_max_pts = 0usize;
        let mut obs_max_contours = 0usize;
        for gid in 0..num_glyphs {
            let decoded = decode_simple_glyph(&glyf[offsets[gid]..offsets[gid + 1]]);
            let pts_count: usize = decoded.contours.iter().map(Vec::len).sum();
            obs_max_pts = obs_max_pts.max(pts_count);
            obs_max_contours = obs_max_contours.max(decoded.num_contours as usize);

            // Outer contour (index 0) must be TrueType clockwise (signed_area2 < 0)
            assert!(
                compute_signed_area2(&decoded.contours[0]) < 0,
                "glyph {} outer contour must be clockwise",
                gid
            );
            // For terminal (gid 8), contour 1 is the disjoint '_' bar (CW); for hollow glyphs, cutouts are CCW (> 0)
            if gid == 8 {
                assert!(compute_signed_area2(&decoded.contours[1]) < 0);
            } else {
                for hole in &decoded.contours[1..] {
                    assert!(
                        compute_signed_area2(hole) > 0,
                        "glyph {} inner cutout contour must be counter-clockwise",
                        gid
                    );
                }
            }

            // Verify hmtx lsb == xMin
            assert_eq!(read_u16(hmtx, gid * 4), 1000);
            assert_eq!(read_i16(hmtx, gid * 4 + 2), decoded.bbox.0);

            glyphs.push(decoded);
        }

        assert_eq!(max_points, obs_max_pts);
        assert_eq!(max_contours, obs_max_contours);

        // Verify all 8 PUA glyphs (1..=8, U+E001..U+E008) are pairwise-distinct in contours, point count, and bbox
        let mut bboxes = BTreeSet::new();
        let mut point_counts = BTreeSet::new();
        for i in 1..=8 {
            assert!(
                bboxes.insert(glyphs[i].bbox),
                "duplicate bbox at glyph {}",
                i
            );
            let pts: usize = glyphs[i].contours.iter().map(Vec::len).sum();
            assert!(
                point_counts.insert(pts),
                "duplicate point count at glyph {}",
                i
            );
            for j in (i + 1)..=8 {
                assert_ne!(
                    glyphs[i].contours, glyphs[j].contours,
                    "glyphs {} and {} must have distinct contour geometries",
                    i, j
                );
            }
        }
    }
}
