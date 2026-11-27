/*
 * Lớp từ file của người dùng: KML / KMZ (WGS84), DXF (AutoCAD), DGN V7 và V8 (MicroStation) — toạ độ
 * VN-2000 đổi sang WGS84 bằng đúng hàm chuyển đổi của ứng dụng (VN.vn2000ToWgs84), kinh tuyến trục do
 * người dùng chọn mỗi lần mở file.
 *
 * File chỉ đọc trong trình duyệt, không gửi đi đâu. DGN V8 không có tài liệu công khai: bộ đọc ở đây tự giải mã
 * từ file mẫu (xem parseDgnV8). DWG chưa đọc được → báo cách lưu sang DXF.
 *
 * Phần phân tích file (parseKml, parseDxf, parseDgn, …) là hàm thuần, chạy được trong Node để kiểm thử.
 */
(function (root) {
  "use strict";
  root.VN = root.VN || {};

  // ===================================================================== tiện ích chung
  const RAD = Math.PI / 180;

  function arcPts(cx, cy, rx, ry, rotDeg, a0Deg, sweepDeg, n) {
    // điểm trên cung elip tâm (cx, cy), bán trục rx, ry, xoay rotDeg, từ góc a0 quét sweep (độ, ngược kim đồng hồ)
    const out = [], cr = Math.cos(rotDeg * RAD), sr = Math.sin(rotDeg * RAD);
    const k = n || Math.max(8, Math.min(96, Math.ceil(Math.abs(sweepDeg) / 6)));
    for (let i = 0; i <= k; i++) {
      const t = (a0Deg + (sweepDeg * i) / k) * RAD;
      const x = rx * Math.cos(t), y = ry * Math.sin(t);
      out.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
    }
    return out;
  }

  // Cung theo "bulge" của polyline AutoCAD giữa p1 và p2 (bỏ điểm đầu, giữ điểm cuối)
  function bulgePts(p1, p2, b) {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1], d = Math.hypot(dx, dy);
    if (!b || d === 0) return [p2];
    const h = (d / 2) * (1 - b * b) / (2 * b);
    const cx = (p1[0] + p2[0]) / 2 - (h * dy) / d, cy = (p1[1] + p2[1]) / 2 + (h * dx) / d;
    const r = Math.hypot(p1[0] - cx, p1[1] - cy);
    const a0 = Math.atan2(p1[1] - cy, p1[0] - cx) / RAD, sweep = (4 * Math.atan(b)) / RAD;
    return arcPts(cx, cy, r, r, 0, a0, sweep).slice(1);
  }

  // Chữ tiếng Việt mã TCVN3 (ABC, font .VnTime…) — phổ biến trong bản đồ địa chính DGN/DXF cũ → Unicode.
  // Chỉ đổi khi chuỗi có ký tự vùng 0xA1–0xFE và chưa có chữ Việt Unicode.
  const TCVN3 = {161:"Ă",162:"Â",163:"Ê",164:"Ô",165:"Ơ",166:"Ư",167:"Đ",168:"ă",169:"â",170:"ê",171:"ô",172:"ơ",173:"ư",174:"đ",181:"à",182:"ả",183:"ã",184:"á",185:"ạ",187:"ằ",188:"ẳ",189:"ẵ",190:"ắ",198:"ặ",199:"ầ",200:"ẩ",201:"ẫ",202:"ấ",203:"ậ",204:"è",206:"ẻ",207:"ẽ",208:"é",209:"ẹ",210:"ề",211:"ể",212:"ễ",213:"ế",214:"ệ",215:"ì",216:"ỉ",220:"ĩ",221:"í",222:"ị",223:"ò",225:"ỏ",226:"õ",227:"ó",228:"ọ",229:"ồ",230:"ổ",231:"ỗ",232:"ố",233:"ộ",234:"ờ",235:"ở",236:"ỡ",237:"ớ",238:"ợ",239:"ù",241:"ủ",242:"ũ",243:"ú",244:"ụ",245:"ừ",246:"ử",247:"ữ",248:"ứ",249:"ự",250:"ỳ",251:"ỷ",252:"ỹ",253:"ý",254:"ỵ"};
  function tcvn3(s) {
    if (!/[\xa1-\xfe]/.test(s) || /[\u0100-\u01b0\u1ea0-\u1ef9]/.test(s) || /[^\x00-\xff]/.test(s)) return s;
    const r = s.replace(/[\xa1-\xfe]/g, (c) => TCVN3[c.charCodeAt(0)] || c);
    // font chữ hoa (.VnTimeH…) dùng mã chữ thường: chuỗi có chữ cái ASCII toàn chữ hoa → viết hoa cả chuỗi
    const ascii = s.replace(/[^A-Za-z]/g, "");
    return ascii.length >= 2 && ascii === ascii.toUpperCase() ? r.toUpperCase() : r;
  }

  // ===================================================================== KML / KMZ
  function kmlColor(s) {           // KML: aabbggrr → ["#rrggbb", độ mờ]
    const m = /^\s*([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})\s*$/i.exec(s || "");
    if (!m) return null;
    return ["#" + m[4] + m[3] + m[2], parseInt(m[1], 16) / 255];
  }

  function parseKml(text, DOMParserImpl) {
    const DP = DOMParserImpl || root.DOMParser;
    const doc = new DP().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("File KML không đúng định dạng XML");
    const all = (el, tag) => Array.from(el.getElementsByTagNameNS ? el.getElementsByTagNameNS("*", tag) : el.getElementsByTagName(tag));
    const kids = (el, tag) => Array.from(el.childNodes).filter((n) => n.nodeType === 1 && (n.localName || n.nodeName.replace(/^.*:/, "")) === tag);
    const first = (el, tag) => all(el, tag)[0];
    const txt = (el, tag) => { const e = el && first(el, tag); return e ? e.textContent.trim() : ""; };

    // Kiểu (Style / StyleMap) → màu đường, màu vùng
    const styles = {};
    for (const s of all(doc, "Style")) {
      const id = s.getAttribute("id"); if (!id) continue;
      const ls = first(s, "LineStyle"), ps = first(s, "PolyStyle"), is = first(s, "IconStyle");
      styles[id] = {
        line: ls && kmlColor(txt(ls, "color")), width: ls && Number(txt(ls, "width")) || null,
        fill: ps && kmlColor(txt(ps, "color")), noFill: ps && txt(ps, "fill") === "0",
        icon: is && kmlColor(txt(is, "color")),
      };
    }
    for (const m of all(doc, "StyleMap")) {
      const id = m.getAttribute("id"); if (!id) continue;
      for (const p of all(m, "Pair")) if (txt(p, "key") === "normal") styles[id] = styles[txt(p, "styleUrl").replace(/^.*#/, "")];
    }

    const coordsOf = (el) => txt(el, "coordinates").split(/\s+/).filter(Boolean)
      .map((t) => t.split(",").map(Number)).filter((c) => c.length >= 2 && isFinite(c[0]) && isFinite(c[1]))
      .map((c) => [c[0], c[1]]);
    function geoms(el) {
      const out = [];
      for (const c of Array.from(el.childNodes)) {
        if (c.nodeType !== 1) continue;
        const t = c.localName || c.nodeName.replace(/^.*:/, "");
        if (t === "Point") { const p = coordsOf(c)[0]; if (p) out.push({ type: "Point", coordinates: p }); }
        else if (t === "LineString") { const l = coordsOf(c); if (l.length > 1) out.push({ type: "LineString", coordinates: l }); }
        else if (t === "LinearRing") { const l = coordsOf(c); if (l.length > 2) out.push({ type: "Polygon", coordinates: [l] }); }
        else if (t === "Polygon") {
          const rings = [];
          for (const b of kids(c, "outerBoundaryIs").concat(kids(c, "innerBoundaryIs"))) {
            const r = all(b, "LinearRing")[0]; if (r) { const l = coordsOf(r); if (l.length > 2) rings.push(l); }
          }
          if (rings.length) out.push({ type: "Polygon", coordinates: rings });
        } else if (t === "MultiGeometry") out.push(...geoms(c));
      }
      return out;
    }

    const features = [];
    for (const pm of all(doc, "Placemark")) {
      const props = { name: txt(pm, "name") || "" };
      const desc = kids(pm, "description")[0];
      if (desc) props.description = desc.textContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
      for (const d of all(pm, "Data")) { const v = txt(d, "value"); if (v) props[d.getAttribute("name") || "?"] = v; }
      for (const d of all(pm, "SimpleData")) { const v = d.textContent.trim(); if (v) props[d.getAttribute("name") || "?"] = v; }
      const su = kids(pm, "styleUrl")[0];
      let st = su ? styles[su.textContent.trim().replace(/^.*#/, "")] : null;
      const inl = kids(pm, "Style")[0];
      if (inl) {
        const ls = first(inl, "LineStyle"), ps = first(inl, "PolyStyle");
        st = Object.assign({}, st, ls ? { line: kmlColor(txt(ls, "color")) } : {}, ps ? { fill: kmlColor(txt(ps, "color")) } : {});
      }
      if (st) {
        if (st.line) props.stroke = st.line[0];
        if (st.fill && !st.noFill) { props.fill = st.fill[0]; props.fillOpacity = Math.min(0.6, st.fill[1]); }
        if (st.noFill) props.fillOpacity = 0;
        if (st.icon) props.marker = st.icon[0];
      }
      for (const g of geoms(pm)) features.push({ type: "Feature", geometry: g, properties: { ...props, kind: g.type === "Point" && props.name ? "label" : "" } });
    }
    const name = txt(first(doc, "Document") || doc, "name");
    return { name, features };
  }

  // KMZ = ZIP chứa doc.kml (giải nén bằng DecompressionStream có sẵn trong trình duyệt)
  async function unzipKml(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("File KMZ hỏng (không phải ZIP)");
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entries = [];
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
      entries.push({ name, method, size, off });
      p += 46 + nl + xl + cl;
    }
    const kmls = entries.filter((e) => /\.kml$/i.test(e.name));
    const e = kmls.find((x) => /(^|\/)doc\.kml$/i.test(x.name)) || kmls[0];
    if (!e) throw new Error("Trong file KMZ không có file .kml");
    const lo = e.off, start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    const data = u8.subarray(start, start + e.size);
    if (e.method === 0) return new TextDecoder().decode(data);
    if (e.method !== 8) throw new Error("KMZ nén kiểu chưa hỗ trợ");
    const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new TextDecoder().decode(await new Response(ds).arrayBuffer());
  }

  // ===================================================================== DXF (AutoCAD)
  function dxfDecode(buf) {
    const u8 = new Uint8Array(buf);
    const head = new TextDecoder("latin1").decode(u8.subarray(0, Math.min(u8.length, 20000)));
    const ver = (/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*AC(\d+)/.exec(head) || [])[1];
    if (ver && Number(ver) >= 1021) return new TextDecoder("utf-8").decode(u8);      // AutoCAD 2007+: UTF-8
    try { return new TextDecoder("utf-8", { fatal: true }).decode(u8); } catch (_) { /* không phải UTF-8 → mã trang */ }
    const cp = (/\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*ANSI_(\d+)/i.exec(head) || [])[1];
    try { return new TextDecoder(cp ? "windows-" + cp : "windows-1252").decode(u8); }
    catch (_) { return new TextDecoder("latin1").decode(u8); }
  }

  function dxfText(s) {
    return tcvn3(String(s || ""))
      .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\P/g, "\n").replace(/\\[ACFHQTWfLlOoKk][^;\\]*;?/g, "").replace(/[{}]/g, "")
      .replace(/\\S([^;]*);/g, (_, t) => t.replace(/[\^#/]/g, "").trim() === "2" ? "²" : t.replace(/[\^#/]/g, " ").trim())
      .replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").replace(/%%[uUoO]/g, "")
      .replace(/\\~/g, " ").trim();
  }

  const JUST_DXF = (h, v) => {   // TEXT: 72 (0 trái, 1 giữa, 2 phải, 4 giữa), 73 (0/1 đáy, 2 giữa, 3 đỉnh)
    const hh = h === 1 || h === 4 ? "" : h === 2 ? "right" : "left";
    const vv = h === 4 || v === 2 ? "" : v === 3 ? "top" : "bottom";
    return (vv && hh ? vv + "-" + hh : vv || hh || "center");
  };
  const JUST_MTEXT = ["top-left", "top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];

  function parseDxf(text) {
    const L = text.split(/\r?\n/);
    const blocks = {}, ents = [];
    let section = "", target = ents, blk = null, poly = null;
    let i = 0;
    while (i < L.length - 1) {
      const code = parseInt(L[i], 10), val = L[i + 1];
      i += 2;
      if (code !== 0) continue;
      const type = val.trim();
      const g = [];                                  // nhóm mã của thực thể
      while (i < L.length - 1 && parseInt(L[i], 10) !== 0) { g.push([parseInt(L[i], 10), L[i + 1]]); i += 2; }
      const get = (c, d) => { const e = g.find((x) => x[0] === c); return e ? e[1] : d; };
      const num = (c, d = 0) => { const v = parseFloat(get(c, "")); return isFinite(v) ? v : d; };
      const layer = (get(8, "0") || "0").trim();

      if (type === "SECTION") { section = (get(2, "") || "").trim(); continue; }
      if (type === "ENDSEC") { section = ""; continue; }
      if (section === "BLOCKS") {
        if (type === "BLOCK") { blk = { name: (get(2, "") || "").trim(), base: [num(10), num(20)], ents: [] }; target = blk.ents; continue; }
        if (type === "ENDBLK") { if (blk) blocks[blk.name] = blk; blk = null; target = ents; continue; }
      } else if (section !== "ENTITIES") continue;

      if (poly && type !== "VERTEX" && type !== "SEQEND") { target.push(poly); poly = null; }
      switch (type) {
        case "LINE":
          target.push({ t: "line", layer, pts: [[num(10), num(20)], [num(11), num(21)]] }); break;
        case "LWPOLYLINE": {
          const pts = [], bulges = [];
          for (const [c, v] of g) {
            if (c === 10) { pts.push([parseFloat(v), 0]); bulges.push(0); }
            else if (c === 20 && pts.length) pts[pts.length - 1][1] = parseFloat(v);
            else if (c === 42 && pts.length) bulges[bulges.length - 1] = parseFloat(v);
          }
          const closed = (num(70) & 1) === 1;
          target.push(withBulges({ t: "line", layer, pts, closed }, bulges)); break;
        }
        case "POLYLINE": {
          const f = num(70);
          poly = (f & 16) || (f & 64) ? { skip: true } : { t: "line", layer, pts: [], bulges: [], closed: (f & 1) === 1 };
          break;
        }
        case "VERTEX":
          if (poly && !poly.skip && !(num(70) & 128)) { poly.pts.push([num(10), num(20)]); poly.bulges.push(num(42)); }
          break;
        case "SEQEND":
          if (poly && !poly.skip) target.push(withBulges(poly, poly.bulges));
          poly = null; break;
        case "CIRCLE": {
          const r = num(40);
          target.push({ t: "line", layer, closed: true, pts: arcPts(num(10), num(20), r, r, 0, 0, 360, 64).slice(0, -1) }); break;
        }
        case "ARC": {
          const r = num(40), a0 = num(50); let sw = num(51) - a0; if (sw <= 0) sw += 360;
          target.push({ t: "line", layer, pts: arcPts(num(10), num(20), r, r, 0, a0, sw) }); break;
        }
        case "ELLIPSE": {
          const mx = num(11), my = num(21), ra = Math.hypot(mx, my), rot = Math.atan2(my, mx) / RAD;
          const t0 = num(41, 0) / RAD, t1 = num(42, 2 * Math.PI) / RAD; let sw = t1 - t0; if (sw <= 0) sw += 360;
          target.push({ t: "line", layer, closed: sw >= 359.9, pts: arcPts(num(10), num(20), ra, ra * num(40, 1), rot, t0, sw) }); break;
        }
        case "POINT":
          target.push({ t: "point", layer, pts: [[num(10), num(20)]] }); break;
        case "TEXT": case "ATTRIB": {
          const h72 = num(72), v73 = num(type === "ATTRIB" ? 74 : 73);
          const al = (h72 || v73) && g.some((x) => x[0] === 11);
          const s = dxfText(get(1, ""));
          if (s && !(type === "ATTRIB" && (num(70) & 1))) target.push({ t: "text", layer, text: s, h: num(40, 1), rot: num(50),
            anchor: JUST_DXF(h72, v73), pts: [al ? [num(11), num(21)] : [num(10), num(20)]] });
          break;
        }
        case "MTEXT": {
          const s = dxfText(g.filter((x) => x[0] === 3).map((x) => x[1]).join("") + get(1, ""));
          let rot = num(50);
          if (g.some((x) => x[0] === 11)) rot = Math.atan2(num(21), num(11)) / RAD;
          if (s) target.push({ t: "text", layer, text: s, h: num(40, 1), rot, anchor: JUST_MTEXT[num(71, 1)] || "top-left", pts: [[num(10), num(20)]] });
          break;
        }
        case "INSERT":
          target.push({ t: "insert", layer, name: (get(2, "") || "").trim(), at: [num(10), num(20)],
            sx: num(41, 1), sy: num(42, 1), rot: num(50) });
          break;
        default: break;
      }
    }
    if (poly && !poly.skip) ents.push(poly);

    // Bung khối (INSERT) thành đối tượng thật: p' = điểm chèn + R(góc) · (tỉ lệ · (p − gốc khối))
    const out = [];
    function expand(list, tf, depth, layerOverride) {
      for (const e of list) {
        const lay = e.layer === "0" && layerOverride ? layerOverride : e.layer;
        if (e.t === "insert") {
          const b = blocks[e.name];
          if (!b || depth > 6) continue;
          const c = Math.cos(e.rot * RAD), s = Math.sin(e.rot * RAD);
          const inner = (p) => {
            const x = (p[0] - b.base[0]) * e.sx, y = (p[1] - b.base[1]) * e.sy;
            return tf([e.at[0] + x * c - y * s, e.at[1] + x * s + y * c]);
          };
          expand(b.ents, inner, depth + 1, lay);
          continue;
        }
        const o = Object.assign({}, e, { layer: lay, pts: e.pts.map(tf) });
        if (e.t === "text" && depth) { o.rot = e.rot; }
        out.push(o);
      }
    }
    expand(ents, (p) => p, 0, null);
    return out.filter((e) => e.pts.length && e.pts.every((p) => isFinite(p[0]) && isFinite(p[1])));
  }

  function withBulges(e, bulges) {
    if (!bulges || !bulges.some((b) => b)) { delete e.bulges; return e; }
    const pts = [e.pts[0]], n = e.pts.length;
    for (let k = 0; k < n - 1 + (e.closed ? 1 : 0); k++) pts.push(...bulgePts(e.pts[k], e.pts[(k + 1) % n], bulges[k]));
    if (e.closed && bulges[n - 1]) pts.pop();      // điểm cuối trùng điểm đầu
    e.pts = pts; delete e.bulges;
    return e;
  }

  // ===================================================================== DGN V7 (MicroStation, ISFF)
  // Theo mô tả định dạng công khai của GDAL/OGR dgnlib (Frank Warmerdam): số nguyên 32 bit thứ tự VAX
  // (từ cao trước, mỗi từ little-endian), số thực VAX D-float, đơn vị UOR quy về master unit qua TCB.
  function dgnInt32(u8, o) {
    return (u8[o + 2] | (u8[o + 3] << 8) | (u8[o] << 16) | (u8[o + 1] << 24));
  }
  function vaxDouble(u8, o) {
    const w = (k) => u8[o + 2 * k] | (u8[o + 2 * k + 1] << 8);
    const w0 = w(0), e = (w0 >> 7) & 0xff;
    if (e === 0) return 0;
    const f = (((w0 & 0x7f) * 65536 + w(1)) * 65536 + w(2)) * 65536 + w(3);   // 55 bit phần định trị
    const v = (1 + f / 2 ** 55) * 2 ** (e - 129);
    return w0 & 0x8000 ? -v : v;
  }

  function dgnKind(u8) {
    if (u8.length >= 8 && u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) return "v8";
    if (u8.length >= 4 && u8[0] === 0x41 && u8[1] === 0x43 && u8[2] === 0x31) return "dwg";   // "AC1…"
    if (u8.length >= 4 && (u8[1] & 0x7f) === 9 && (u8[0] & 0x3f) === 8) return "v7";
    return "";
  }

  function parseDgn(buf) {
    const u8 = new Uint8Array(buf);
    const kind = dgnKind(u8);
    if (kind === "v8") throw Object.assign(new Error("DGN V8"), { code: "dgn-v8" });
    if (kind !== "v7") throw new Error("Không nhận ra file DGN (không phải MicroStation V7)");
    let scale = 1, ox = 0, oy = 0, dim = 2;
    const ents = [];
    let o = 0, complexLeft = 0, complex = null, boQua = false, coTcb = false;
    const pt = (p) => [dgnInt32(u8, p) * scale - ox, dgnInt32(u8, p + 4) * scale - oy];
    const flushComplex = () => { if (complex && complex.pts.length > 1) ents.push(complex); complex = null; complexLeft = 0; };
    while (o + 4 <= u8.length) {
      if (u8[o] === 0xff && u8[o + 1] === 0xff) break;
      const level = u8[o] & 0x3f, isCx = (u8[o] & 0x80) !== 0, type = u8[o + 1] & 0x7f, deleted = (u8[o + 1] & 0x80) !== 0;
      const size = (u8[o + 2] | (u8[o + 3] << 8)) * 2 + 4;
      if (size < 4 || o + size > u8.length) break;
      const b = o; o += size;
      if (type === 34) { boQua = true; continue; }      // định nghĩa shared cell: toạ độ tương đối, bỏ qua
      if (boQua) { if (isCx) continue; boQua = false; }
      if (type === 9 && !deleted && !coTcb) {           // TCB: đơn vị và gốc toạ độ (lấy TCB đầu tiên)
        coTcb = true;
        dim = u8[b + 1214] & 0x40 ? 3 : 2;
        const spm = dgnInt32(u8, b + 1112), ups = dgnInt32(u8, b + 1116);
        if (spm && ups) scale = 1 / (spm * ups);
        ox = vaxDouble(u8, b + 1240) * scale; oy = vaxDouble(u8, b + 1248) * scale;
        continue;
      }
      if (type === 9) continue;
      if (deleted) { if (complexLeft) complexLeft--; continue; }
      if (complexLeft && !isCx) flushComplex();
      const layer = "Level " + level;
      const P = dim * 4;                                // byte / điểm nguyên
      let e = null;
      if (type === 3) e = { t: "line", layer, pts: [pt(b + 36), pt(b + 36 + P)] };
      else if (type === 4 || type === 6 || type === 11 || type === 21) {
        const n = u8[b + 36] | (u8[b + 37] << 8), pts = [];
        for (let k = 0; k < n && b + 38 + k * P + 8 <= b + size; k++) pts.push(pt(b + 38 + k * P));
        e = { t: "line", layer, pts, closed: type === 6 };
      } else if (type === 12 || type === 14) {          // chuỗi / hình phức: gộp các thành phần đi sau
        flushComplex();
        complexLeft = u8[b + 38] | (u8[b + 39] << 8);
        complex = { t: "line", layer, pts: [], closed: type === 14 };
        continue;
      } else if (type === 15 || type === 16) {          // elip / cung
        const arc = type === 16, d0 = arc ? 44 : 36;
        const ra = vaxDouble(u8, b + d0) * scale, rb = vaxDouble(u8, b + d0 + 8) * scale;
        let a0 = 0, sw = 360, rot = 0, cx, cy;
        if (arc) {
          a0 = dgnInt32(u8, b + 36) / 360000;
          const s = (u8[b + 40] | (u8[b + 41] << 8)) * 65536 + (u8[b + 42] | (u8[b + 43] << 8));   // thứ tự VAX
          sw = s >= 0x80000000 ? -(s - 0x80000000) / 360000 : s === 0 ? 360 : s / 360000;
        }
        if (dim === 2) {
          rot = dgnInt32(u8, b + d0 + 16) / 360000;
          cx = vaxDouble(u8, b + d0 + 20) * scale - ox; cy = vaxDouble(u8, b + d0 + 28) * scale - oy;
        } else {
          cx = vaxDouble(u8, b + d0 + 32) * scale - ox; cy = vaxDouble(u8, b + d0 + 40) * scale - oy;
        }
        if (isFinite(cx) && isFinite(cy) && ra > 0) {
          const pts = arcPts(cx, cy, ra, rb || ra, rot, a0, sw);
          e = { t: "line", layer, pts: Math.abs(sw) >= 359.9 ? pts.slice(0, -1) : pts, closed: Math.abs(sw) >= 359.9 };
        }
      } else if (type === 17) {                         // chữ
        const just = u8[b + 37];
        const h = (dgnInt32(u8, b + 42) * scale * 6) / 1000;
        let rot = 0, po, nc, to;
        if (dim === 2) { rot = dgnInt32(u8, b + 46) / 360000; po = b + 50; nc = u8[b + 58]; to = b + 60; }
        else { po = b + 62; nc = u8[b + 74]; to = b + 76; }
        let s;
        if (u8[to] === 0xff && u8[to + 1] === 0xfd) {   // chữ Unicode (UTF-16LE)
          s = new TextDecoder("utf-16le").decode(u8.subarray(to + 2, Math.min(b + size, to + 2 + nc * 2))).replace(/\0.*$/, "");
        } else s = new TextDecoder("latin1").decode(u8.subarray(to, Math.min(b + size, to + nc))).replace(/\0.*$/, "");
        const hj = just >= 12 ? "right" : just >= 6 ? "" : "left", vj = [ "top", "", "bottom" ][just % 6] ?? "bottom";
        s = tcvn3(s).trim();
        if (s) e = { t: "text", layer, text: s, h, rot, anchor: vj && hj ? vj + "-" + hj : vj || hj || "center", pts: [pt(po)] };
      }
      if (complexLeft && isCx) {
        complexLeft--;
        if (e && e.t === "line") complex.pts.push(...(complex.pts.length ? e.pts.slice(1) : e.pts));
        if (!complexLeft) flushComplex();
        continue;
      }
      if (e) ents.push(e);
    }
    flushComplex();
    return ents.filter((e) => e.pts.length && e.pts.every((p) => isFinite(p[0]) && isFinite(p[1])));
  }

  // ===================================================================== DGN V8 (MicroStation V8 / V8i / CONNECT)
  // Định dạng V8 không công bố. Cấu trúc dưới đây do ứng dụng này tự giải mã từ các file mẫu (đối chiếu với DXF
  // xuất từ chính file đó: 3 386/3 386 đoạn thẳng và 342/342 chữ khớp đến 1 cm):
  //  - vỏ: OLE Compound File (như .doc cũ); mô hình mặc định ở "Dgn-Md/#000000";
  //  - "Dgn~Mh" (nén zlib): đơn vị UOR / m tại byte 4196, gốc toạ độ toàn cục (UOR) tại 4212, 4220;
  //  - "Dgn^G/$1…$n": 16 byte đầu (số phần tử …) + khối zlib chứa các phần tử nối tiếp;
  //  - phần tử: kiểu ở byte 4, cờ 16 bit ở byte 6 (0x4000 = thành phần của phần tử phức), độ dài phần tử =
  //    4 + 2 × (UInt32 ở byte 8), hết dữ liệu hình học = 4 + 2 × (UInt32 ở byte 12), level ở byte 16;
  //    toạ độ là số thực IEEE (UOR) từ byte 108 (đường, chuỗi đường, elip, cung, chữ — 2D).
  function cfbRead(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const u32 = (o) => dv.getUint32(o, true);
    const ss = 1 << dv.getUint16(0x1e, true), mss = 1 << dv.getUint16(0x20, true);
    const off = (sec) => (sec + 1) * ss;
    const END = 0xfffffffa;
    const difat = [];
    for (let i = 0; i < 109; i++) difat.push(u32(0x4c + 4 * i));
    let sec = u32(0x44);
    for (let k = u32(0x48); k > 0 && sec < END; k--) {
      for (let i = 0; i < ss / 4 - 1; i++) difat.push(u32(off(sec) + 4 * i));
      sec = u32(off(sec) + ss - 4);
    }
    const fat = [];
    for (const f of difat.slice(0, u32(0x2c))) if (f < END) for (let i = 0; i < ss / 4; i++) fat.push(u32(off(f) + 4 * i));
    const chain = (start, max) => {
      const parts = []; let n = 0;
      for (let s = start; s < END && n < 1e6 && (max == null || n * ss < max); s = fat[s], n++) parts.push(u8.subarray(off(s), off(s) + ss));
      const out = new Uint8Array(parts.length * ss); parts.forEach((p, i) => out.set(p, i * ss));
      return out;
    };
    const dirs = chain(u32(0x30)), ent = [];
    for (let i = 0; i + 128 <= dirs.length; i += 128) {
      const d = new DataView(dirs.buffer, dirs.byteOffset + i, 128), nl = d.getUint16(0x40, true);
      ent.push({ name: new TextDecoder("utf-16le").decode(dirs.subarray(i, i + Math.max(0, nl - 2))), type: dirs[i + 0x42],
        left: d.getInt32(0x44, true), right: d.getInt32(0x48, true), child: d.getInt32(0x4c, true),
        start: d.getUint32(0x74, true), size: d.getUint32(0x78, true) });
    }
    const cutoff = u32(0x38), root = ent[0];
    const mini = root ? chain(root.start).subarray(0, root.size) : new Uint8Array(0);
    const mfStart = u32(0x3c), mfat = [];
    if (mfStart < END) { const m = chain(mfStart); for (let i = 0; i + 4 <= m.length; i += 4) mfat.push(new DataView(m.buffer, m.byteOffset).getUint32(i, true)); }
    const read = (e) => {
      if (e.size < cutoff) {
        const out = new Uint8Array(e.size); let p = 0;
        for (let s = e.start; s < END && p < e.size; s = mfat[s]) { const n = Math.min(mss, e.size - p); out.set(mini.subarray(s * mss, s * mss + n), p); p += n; }
        return out;
      }
      return chain(e.start, e.size).subarray(0, e.size);
    };
    const paths = new Map();                          // "/Dgn-Md/#000000/Dgn^G/$1" → mục
    const walk = (i, base, seen) => {
      if (i < 0 || i >= ent.length || seen.has(i)) return; seen.add(i);
      const e = ent[i]; walk(e.left, base, seen);
      const p = base + "/" + e.name; paths.set(p, e);
      if (e.type === 1 || e.type === 5) walk(e.child, p, seen);
      walk(e.right, base, seen);
    };
    if (root) walk(root.child, "", new Set());
    return { paths, read };
  }

  async function inflateZlib(u8) {                   // dữ liệu zlib (78 xx …) → Uint8Array
    if (root.DecompressionStream) {
      const ds = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate"));
      return new Uint8Array(await new Response(ds).arrayBuffer());
    }
    return new Uint8Array(require("zlib").inflateSync(u8));    // Node (kiểm thử)
  }

  function dgnV8Text(b) {
    if (b[0] === 0xff && b[1] === 0xfe) {
      if (b[2] === 0x01 && b[3] === 0x00) return tcvn3(new TextDecoder("latin1").decode(b.subarray(4)));   // chữ 8 bit (TCVN3…)
      return new TextDecoder("utf-16le").decode(b.subarray(2, 2 + ((b.length - 2) & ~1)));                    // Unicode
    }
    return tcvn3(new TextDecoder("latin1").decode(b));
  }

  async function parseDgnV8(buf, inflate) {
    const inf = inflate || inflateZlib;
    const u8 = new Uint8Array(buf), cf = cfbRead(u8);
    const models = [...cf.paths.keys()].map((p) => (/^\/Dgn-Md\/(#[0-9a-fA-F]+)$/.exec(p) || [])[1]).filter(Boolean).sort();
    if (!models.length) throw new Error("File DGN V8 không có mô hình (model) nào");
    const md = models.includes("#000000") ? "#000000" : models[0];
    const mhE = cf.paths.get(`/Dgn-Md/${md}/Dgn~Mh`);
    let uor = 1, ox = 0, oy = 0;
    if (mhE) {
      const mh = await inf(cf.read(mhE)), v = new DataView(mh.buffer, mh.byteOffset, mh.byteLength);
      if (mh.length >= 4236) {
        const u = v.getFloat64(4196, true), x = v.getFloat64(4212, true), y = v.getFloat64(4220, true);
        if (u > 0 && u < 1e9 && isFinite(x) && isFinite(y)) { uor = u; ox = x; oy = y; }
      }
    }
    const streams = [...cf.paths.entries()].map(([p, e]) => [(new RegExp(`^/Dgn-Md/${md}/Dgn\\^G/\\$(\\d+)$`).exec(p) || [])[1], e])
      .filter(([k]) => k).sort((a, b) => a[0] - b[0]);
    const ents = [], boQua = {};
    let cx = null, left = 0;
    const flush = () => { if (cx && cx.pts.length > 1) ents.push(cx); cx = null; left = 0; };
    for (const [, e] of streams) {
      const st = cf.read(e);
      if (st.length <= 18 || st[16] !== 0x78) continue;
      const raw = await inf(st.subarray(16)), dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      const d = (o) => dv.getFloat64(o, true);
      for (let o = 0; o + 20 <= raw.length;) {
        const sw = dv.getUint32(o + 8, true), n = 4 + 2 * sw;
        if (!sw || o + n > raw.length) break;
        const b = o; o += n;
        const type = raw[b + 4], fl = dv.getUint16(b + 6, true), end = b + 4 + 2 * dv.getUint32(b + 12, true);
        const comp = (fl & 0x4000) !== 0, cls = raw[b + 44] & 0x0f;
        if (cx && (!comp || left <= 0)) flush();
        const layer = "Level " + dv.getUint32(b + 16, true);
        const P = (k) => [(d(k) - ox) / uor, (d(k + 8) - oy) / uor];
        let el = null;
        if (type === 3) {
          if (end - b - 108 === 32) el = { t: "line", layer, pts: [P(b + 108), P(b + 124)] };
          else if (end - b - 108 === 48) el = { t: "line", layer, pts: [P(b + 108), P(b + 132)] };            // 3D: bỏ z
        } else if (type === 4 || type === 6 || type === 11) {
          const nv = dv.getUint32(b + 108, true), stp = nv ? (end - b - 116) / nv : 0;
          if (stp === 16 || stp === 24) { const pts = []; for (let k = 0; k < nv; k++) pts.push(P(b + 116 + k * stp)); el = { t: "line", layer, pts, closed: type === 6 }; }
        } else if (type === 12 || type === 14) {
          flush(); left = dv.getUint32(b + 108, true); cx = { t: "line", layer, pts: [], closed: type === 14 }; continue;
        } else if ((type === 15 && end - b === 148) || (type === 16 && end - b === 164)) {
          let a0 = 0, sw2 = 2 * Math.PI, ra, rb, rot, c;
          if (type === 15) { ra = d(b + 108); rb = d(b + 116); rot = d(b + 124); c = P(b + 132); }
          else { a0 = d(b + 108); sw2 = d(b + 116); ra = d(b + 124); rb = d(b + 132); rot = d(b + 140); c = P(b + 148); }
          const full = Math.abs(sw2) >= 2 * Math.PI - 1e-9;
          const pts = arcPts(c[0], c[1], ra / uor, (rb || ra) / uor, rot / RAD, a0 / RAD, sw2 / RAD);
          el = { t: "line", layer, pts: full ? pts.slice(0, -1) : pts, closed: full };
        } else if (type === 17 && end - b >= 174 && cls !== 1) {               // cls 1 = phần tử điều khiển mẫu tô
          const nb = dv.getUint16(b + 114, true), txt = dgnV8Text(raw.subarray(b + 174, Math.min(end, b + 174 + nb))).replace(/\0.*$/s, "").trim();
          const o0 = P(b + 156);
          // "Pattern Control Element": phần tử ẩn điều khiển mẫu tô, nằm ở gốc toạ độ → bỏ
          if (txt && txt !== "Pattern Control Element" && (o0[0] || o0[1])) el = { t: "text", layer, text: txt, h: d(b + 140) / uor, rot: d(b + 148) / RAD, anchor: "bottom-left", pts: [o0] };
        } else if (![2, 7, 12, 14, 15, 16, 17].includes(type)) boQua[type] = (boQua[type] || 0) + 1;
        if (!el) continue;
        if (cx && comp && left > 0) {
          left--;
          if (el.t === "line") cx.pts.push(...(cx.pts.length ? el.pts.slice(1) : el.pts));
          if (!left) flush();
          continue;
        }
        ents.push(el);
      }
    }
    flush();
    const out = ents.filter((x) => x.pts.length && x.pts.every((p) => isFinite(p[0]) && isFinite(p[1])));
    out.v8 = { model: md, models: models.length, uor, boQua };
    return out;
  }

  // ===================================================================== CAD → GeoJSON
  function extent(ents) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
    for (const e of ents) for (const [x, y] of e.pts) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; n++;
    }
    return n ? [x0, y0, x1, y1] : null;
  }

  // Đoán hệ toạ độ từ phạm vi: "wgs84" (độ), "vn2000" (x Đông, y Bắc), "vn2000-dao" (x Bắc, y Đông), "" (không rõ)
  function guessCrs(ext) {
    if (!ext) return "";
    const [x0, y0, x1, y1] = ext;
    const isE = (a, b) => a > 1e5 && b < 9e5, isN = (a, b) => a > 8e5 && b < 2.7e6;
    if (x0 >= 100 && x1 <= 120 && y0 >= 5 && y1 <= 25) return "wgs84";
    if (isE(x0, x1) && isN(y0, y1)) return "vn2000";
    if (isN(x0, x1) && isE(y0, y1)) return "vn2000-dao";
    return "";
  }

  // ents (toạ độ CAD) → GeoJSON WGS84. opt: { crs: "vn2000" | "vn2000-dao" | "wgs84", lon0 }
  function cadToGeojson(ents, opt, toWgs) {
    const conv = toWgs || root.VN.vn2000ToWgs84;
    const f = opt.crs === "wgs84" ? (p) => [p[0], p[1]]
      : opt.crs === "vn2000-dao" ? (p) => { const r = conv(p[0], p[1], 0, opt.lon0); return [r[1], r[0]]; }
        : (p) => { const r = conv(p[1], p[0], 0, opt.lon0); return [r[1], r[0]]; };
    const features = [];
    for (const e of ents) {
      const c = e.pts.map(f);
      const props = { layer: e.layer };
      if (e.t === "text") features.push({ type: "Feature", geometry: { type: "Point", coordinates: c[0] },
        properties: Object.assign(props, { kind: "text", text: e.text, h: e.h || 0, rot: e.rot || 0, anchor: e.anchor || "bottom-left" }) });
      else if (e.t === "point") features.push({ type: "Feature", geometry: { type: "Point", coordinates: c[0] }, properties: props });
      else if (e.closed && c.length > 2) features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [c.concat([c[0]])] }, properties: props });
      else if (c.length > 1) features.push({ type: "Feature", geometry: { type: "LineString", coordinates: c }, properties: props });
    }
    return features;
  }

  Object.assign(root.VN, { tcvn3, cfbRead, parseDgnV8, dgnV8Text, parseKml, unzipKml, parseDxf, dxfDecode, dxfText, parseDgn, dgnKind, vaxDouble, dgnInt32,
    bulgePts, arcPts, cadExtent: extent, guessCrs, cadToGeojson });

  if (typeof document === "undefined") return;   // chạy trong Node (kiểm thử) → chỉ xuất hàm

  // ===================================================================== giao diện
  const MAU = ["#e6194b", "#0082c8", "#3cb44b", "#f58231", "#911eb4", "#008080", "#d2a000", "#f032e6", "#7a4b00", "#000075"];
  const S = { map: null, h: null, files: [], seq: 0, markers: [] };

  function init(map, helpers) {
    S.map = map; S.h = helpers;
    const inp = document.getElementById("lf-input");
    document.getElementById("lf-add").addEventListener("click", () => inp.click());
    inp.addEventListener("change", () => { moFiles([...inp.files]); inp.value = ""; });
    const zone = map.getContainer();
    zone.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); zone.classList.add("lf-drop"); } });
    zone.addEventListener("dragleave", () => zone.classList.remove("lf-drop"));
    zone.addEventListener("drop", (e) => {
      zone.classList.remove("lf-drop");
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault(); moFiles([...e.dataTransfer.files]);
    });
    map.on("moveend", veChu);
    map.on("click", onClick);
  }

  async function moFiles(files) {
    for (const f of files) {
      try { await moFile(f); }
      catch (err) {
        if (err && err.code === "dgn-v8") S.h.toast(`${f.name}: DGN MicroStation V8 — chưa đọc được, xem hướng dẫn bên dưới`, 5000);
        else S.h.toast(`${f.name}: ${err && err.message ? err.message : err}`, 4000);
        hienLoi(f.name, err);
      }
    }
  }

  function hienLoi(name, err) {
    const box = document.getElementById("lf-loi");
    const e = S.h.escapeHtml;
    let msg = e(err && err.message ? err.message : String(err));
    if (err && err.code === "dgn-v8") msg = `là <b>DGN MicroStation V8</b> — định dạng đóng của Bentley, trình duyệt chưa đọc được. ` +
      `Trong MicroStation: <i>File › Export › DWG/DXF</i> (chọn <b>DXF</b>) hoặc <i>File › Save As</i> chọn kiểu <b>MicroStation V7 DGN</b>, rồi mở file mới tại đây.`;
    if (err && err.code === "dwg") msg = `là <b>DWG</b> (AutoCAD) — định dạng đóng, trình duyệt chưa đọc được. ` +
      `Trong AutoCAD: <i>Save As</i> chọn kiểu <b>AutoCAD DXF (*.dxf)</b>, rồi mở file .dxf tại đây.`;
    box.hidden = false;
    box.innerHTML = `<b>${e(name)}</b> ${msg}`;
  }

  async function moFile(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    document.getElementById("lf-loi").hidden = true;
    let features, loai;
    if (ext === "kml" || ext === "kmz" || (u8[0] === 0x50 && u8[1] === 0x4b && ext !== "dxf")) {
      const text = u8[0] === 0x50 && u8[1] === 0x4b ? await unzipKml(buf) : new TextDecoder().decode(u8);
      features = parseKml(text).features; loai = ext === "kmz" ? "KMZ" : "KML";
    } else {
      const k = dgnKind(u8);
      if (k === "dwg" || ext === "dwg") throw Object.assign(new Error("DWG"), { code: "dwg" });
      let ents;
      if (k === "v8") {
        ents = await parseDgnV8(buf); loai = "DGN V8";
        const bq = Object.values(ents.v8.boQua).reduce((x, y) => x + y, 0);
        if (bq) loai += ` · bỏ qua ${bq} phần tử chưa hỗ trợ`;
        if (ents.v8.models > 1) S.h.toast(`File có ${ents.v8.models} model — đang mở model đầu tiên (Default)`);
      } else if (ext === "dgn" || k === "v7") { ents = parseDgn(buf); loai = "DGN V7"; }
      else if (ext === "dxf") { ents = parseDxf(dxfDecode(buf)); loai = "DXF"; }
      else throw new Error("Chỉ mở được file .kml, .kmz, .dxf, .dgn");
      if (!ents.length) throw new Error("Không có đối tượng vẽ được (đường, vùng, điểm, chữ)");
      const opt = await hoiHeToaDo(file.name, ents);
      if (!opt) return;                                  // người dùng huỷ
      features = cadToGeojson(ents, opt);
      loai += opt.crs === "wgs84" ? " · WGS84" : ` · VN-2000 KTT ${opt.lon0}°`;
    }
    if (!features.length) throw new Error("Không có đối tượng vẽ được");
    themLop(file.name, loai, features);
  }

  // Hộp thoại chọn hệ toạ độ + kinh tuyến trục cho file CAD (mỗi lần mở file)
  function hoiHeToaDo(name, ents) {
    return new Promise((resolve) => {
      const dlg = document.getElementById("lf-dlg");
      const ext = extent(ents), doan = guessCrs(ext);
      const e = S.h.escapeHtml, f = (v) => S.h.fmt(v, 0);
      document.getElementById("lf-dlg-ten").textContent = name;
      document.getElementById("lf-dlg-pv").innerHTML = ext
        ? `Phạm vi toạ độ trong file: x ${f(ext[0])} – ${f(ext[2])}; y ${f(ext[1])} – ${f(ext[3])} · ${ents.length} đối tượng` +
          (doan === "vn2000-dao" ? `<br><b>x giống toạ độ Bắc (X), y giống toạ độ Đông (Y)</b> — đã chọn sẵn "đảo X/Y".` : "") +
          (doan === "" ? `<br><b>Phạm vi không giống VN-2000 hay độ WGS84</b> — kiểm tra lại file.` : "")
        : "";
      const sel = document.getElementById("lf-dlg-crs");
      sel.value = doan === "wgs84" ? "wgs84" : doan === "vn2000-dao" ? "vn2000-dao" : "vn2000";
      const tinh = document.getElementById("lf-dlg-tinh"), ktt = document.getElementById("lf-dlg-ktt");
      if (!tinh.options.length) {
        tinh.add(new Option("— Nhập tay —", ""));
        Object.keys(S.h.provinces).sort((a, b) => a.localeCompare(b, "vi"))
          .forEach((t) => tinh.add(new Option(`${t} (${S.h.provinces[t]}°)`, t)));
        tinh.addEventListener("change", () => { if (tinh.value) ktt.value = S.h.provinces[tinh.value]; });
        ktt.addEventListener("input", () => { tinh.value = ""; });
      }
      let lon0 = 105.5; try { lon0 = S.h.getLon0(); } catch (_) { /* giữ mặc định */ }
      ktt.value = lon0; tinh.value = S.h.provinceValue() || "";
      const capNhat = () => { document.getElementById("lf-dlg-kttrow").hidden = sel.value === "wgs84"; };
      sel.onchange = capNhat; capNhat();
      const done = (ok) => {
        dlg.close();
        if (!ok) { resolve(null); return; }
        const v = Number(ktt.value);
        if (sel.value !== "wgs84" && !(v >= 100 && v <= 120)) { S.h.toast("Kinh tuyến trục không hợp lệ"); resolve(null); return; }
        resolve({ crs: sel.value, lon0: v });
      };
      document.getElementById("lf-dlg-ok").onclick = () => done(true);
      document.getElementById("lf-dlg-huy").onclick = () => done(false);
      dlg.oncancel = () => done(false);
      dlg.showModal();
      void e;
    });
  }

  function bbox(features) {
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    const walk = (c) => { if (typeof c[0] === "number") { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else c.forEach(walk); };
    features.forEach((f) => walk(f.geometry.coordinates));
    return [x0, y0, x1, y1];
  }

  function themLop(name, loai, features) {
    const id = "lf" + (++S.seq), mau = MAU[(S.seq - 1) % MAU.length];
    const map = S.map, src = { type: "FeatureCollection", features };
    map.addSource(id, { type: "geojson", data: src });
    map.addLayer({ id: id + "-fill", type: "fill", source: id, filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": ["coalesce", ["get", "fill"], mau], "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.12] } });
    map.addLayer({ id: id + "-line", type: "line", source: id, filter: ["!=", ["geometry-type"], "Point"],
      paint: { "line-color": ["coalesce", ["get", "stroke"], mau], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 18, 2.2] } });
    map.addLayer({ id: id + "-pt", type: "circle", source: id, filter: ["all", ["==", ["geometry-type"], "Point"], ["!=", ["get", "kind"], "text"]],
      paint: { "circle-radius": 4, "circle-color": ["coalesce", ["get", "marker"], mau], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
    const bb = bbox(features);
    const ngoai = bb[1] < 7 || bb[3] > 24 || bb[0] < 101 || bb[2] > 118;
    const chu = features.filter((f) => f.properties.kind === "text" || f.properties.kind === "label");
    const lop = { id, name, loai, mau, n: features.length - chu.length, chu, bb, visible: true };
    S.files.push(lop);
    map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 40, maxZoom: 18, duration: 600 });
    if (ngoai) S.h.toast("Toạ độ nằm ngoài Việt Nam — kiểm tra lại hệ toạ độ / kinh tuyến trục", 5000);
    else S.h.toast(`Đã thêm ${name}`);
    danhSach(); veChu();
  }

  function danhSach() {
    const ul = document.getElementById("lf-ds"), e = S.h.escapeHtml;
    ul.innerHTML = S.files.map((f) => `<li data-id="${f.id}">
        <label class="lf-ten"><input type="checkbox" ${f.visible ? "checked" : ""} data-act="an">
          <span class="lf-sw" style="background:${f.mau}"></span><span><b>${e(f.name)}</b>
          <small class="muted">${e(f.loai)} · ${f.n} đối tượng${f.chu.length ? ` · ${f.chu.length} chữ` : ""}</small></span></label>
        <button type="button" class="btn small ghost" data-act="zoom" title="Phóng tới lớp">⤢</button>
        <button type="button" class="btn small ghost" data-act="xoa" title="Gỡ lớp khỏi bản đồ">×</button></li>`).join("");
    ul.hidden = !S.files.length;
    ul.onclick = (ev) => {
      const b = ev.target.closest("[data-act]"); if (!b) return;
      const li = b.closest("li"), f = S.files.find((x) => x.id === li.dataset.id); if (!f) return;
      if (b.dataset.act === "zoom") S.map.fitBounds([[f.bb[0], f.bb[1]], [f.bb[2], f.bb[3]]], { padding: 40, maxZoom: 18 });
      else if (b.dataset.act === "xoa") {
        for (const s of ["-fill", "-line", "-pt"]) if (S.map.getLayer(f.id + s)) S.map.removeLayer(f.id + s);
        S.map.removeSource(f.id);
        S.files = S.files.filter((x) => x !== f); danhSach(); veChu();
      }
    };
    ul.onchange = (ev) => {
      const b = ev.target.closest("[data-act=an]"); if (!b) return;
      const f = S.files.find((x) => x.id === b.closest("li").dataset.id); if (!f) return;
      f.visible = b.checked;
      for (const s of ["-fill", "-line", "-pt"]) S.map.setLayoutProperty(f.id + s, "visibility", f.visible ? "visible" : "none");
      veChu();
    };
  }

  // Chữ trong file CAD: vẽ bằng nhãn HTML, cỡ chữ theo chiều cao thật (m) ở mức zoom hiện tại; tối đa 400 nhãn trong khung nhìn
  function veChu() {
    const map = S.map;
    for (const m of S.markers) m.remove();
    S.markers = [];
    const b = map.getBounds(), z = map.getZoom(), lat = map.getCenter().lat;
    const mpp = (156543.03 * Math.cos(lat * RAD)) / 2 ** z;       // mét / điểm ảnh
    let dem = 0;
    for (const f of S.files) {
      if (!f.visible) continue;
      for (const c of f.chu) {
        if (dem >= 400) return;
        const [lon, la] = c.geometry.coordinates;
        if (!b.contains([lon, la])) continue;
        const p = c.properties;
        let px;
        if (p.kind === "label") { if (z < 12) continue; px = 12; }
        else { px = (p.h || 1) / mpp; if (px < 6) continue; px = Math.min(px, 48); }
        const el = document.createElement("div");
        el.className = "lf-chu";
        const sp = document.createElement("span");
        sp.textContent = p.kind === "label" ? p.name : p.text;
        sp.style.fontSize = px.toFixed(1) + "px";
        sp.style.color = p.kind === "label" ? "#222" : f.mau;
        const anchor = p.kind === "label" ? "left" : p.anchor || "bottom-left";
        if (p.rot) {
          const ox = /left/.test(anchor) ? "0%" : /right/.test(anchor) ? "100%" : "50%";
          const oy = /top/.test(anchor) ? "0%" : /bottom/.test(anchor) ? "100%" : "50%";
          sp.style.transformOrigin = ox + " " + oy;
          sp.style.transform = `rotate(${-p.rot}deg)`;
        }
        if (p.kind === "label") el.style.paddingLeft = "7px";
        el.appendChild(sp);
        S.markers.push(new root.maplibregl.Marker({ element: el, anchor }).setLngLat([lon, la]).addTo(map));
        dem++;
      }
    }
  }

  function onClick(ev) {
    const ids = [];
    for (const f of S.files) if (f.visible) ids.push(f.id + "-pt", f.id + "-line", f.id + "-fill");
    if (!ids.length) return;
    const fs = S.map.queryRenderedFeatures([[ev.point.x - 4, ev.point.y - 4], [ev.point.x + 4, ev.point.y + 4]], { layers: ids.filter((i) => S.map.getLayer(i)) });
    if (!fs.length) return;
    const ft = fs[0], f = S.files.find((x) => ft.layer.id.startsWith(x.id + "-")), e = S.h.escapeHtml;
    const p = ft.properties, g = ft.geometry;
    const rows = Object.entries(p).filter(([k, v]) => !["kind", "stroke", "fill", "fillOpacity", "marker", "h", "rot", "anchor"].includes(k) && v !== "" && v != null)
      .map(([k, v]) => `<tr><th>${e(k === "layer" ? "Lớp" : k === "name" ? "Tên" : k === "description" ? "Mô tả" : k)}</th><td>${e(String(v))}</td></tr>`).join("");
    let do_ = "";
    if (g.type === "Polygon" && root.VN.geodesicArea) {
      const a = Math.abs(root.VN.geodesicArea(g.coordinates[0].slice(0, -1).map(([x, y]) => [y, x])));
      do_ = `<div>Diện tích: <b>${S.h.fmt(a, 1)} m²</b> (${S.h.fmt(a / 10000, 4)} ha)</div>`;
    } else if (g.type === "LineString" && root.VN.geodesicDistance) {
      let d = 0; const c = g.coordinates;
      for (let k = 1; k < c.length; k++) d += root.VN.geodesicDistance(c[k - 1][1], c[k - 1][0], c[k][1], c[k][0]);
      do_ = `<div>Chiều dài: <b>${S.h.fmt(d, 1)} m</b></div>`;
    }
    new root.maplibregl.Popup({ maxWidth: "320px" }).setLngLat(ev.lngLat)
      .setHTML(`<div class="lf-pop"><b>${e(f ? f.name : "")}</b><table>${rows}</table>${do_}
        <small class="muted">Hình đo trên mặt elipxoit WGS84 — chỉ để tham khảo.</small></div>`).addTo(S.map);
  }

  root.VN.lopFileInit = init;
})(typeof window !== "undefined" ? window : globalThis);
