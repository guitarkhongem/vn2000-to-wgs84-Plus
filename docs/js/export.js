/*
 * Xuất file: CSV, KML, DXF. Mỗi hàm nhận danh sách dòng kết quả:
 *   { name, x, y, h, lat, lon, hw }  (x Bắc, y Đông theo VN-2000; hw = cao độ WGS84)
 */
(function (root) {
  "use strict";

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function toCsv(rows) {
    const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const head = ["Tên điểm", "X (m)", "Y (m)", "H VN2000 (m)", "Vĩ độ (Lat)", "Kinh độ (Lon)", "H WGS84 (m)"];
    const body = rows.map((r) => [r.name, r.x, r.y, r.h, r.lat, r.lon, r.hw].map(q).join(","));
    return "﻿" + [head.join(","), ...body].join("\n");   // BOM để Excel đọc đúng tiếng Việt
  }

  function toKml(rows) {
    const out = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<kml xmlns="http://www.opengis.net/kml/2.2">',
      "  <Document>",
      "    <name>Computed Points (WGS84)</name>",
    ];
    for (const r of rows) {
      out.push(
        "    <Placemark>",
        `      <name>${esc(r.name)}</name>`,
        "      <Point>",
        `        <coordinates>${r.lon},${r.lat},${r.hw}</coordinates>`,
        "      </Point>",
        "    </Placemark>"
      );
    }
    out.push("  </Document>", "</kml>");
    return out.join("\n");
  }

  // DXF R12 ASCII: dấu + (lớp POINTS, đỏ) và tên điểm (lớp TEXT, xanh lá), như export_dxf.py.
  // CAD: X = Đông (y), Y = Bắc (x).
  function toDxf(rows, crossSize = 0.5) {
    const g = [];
    const p = (code, val) => g.push(String(code), String(val));
    p(0, "SECTION"); p(2, "TABLES");
    p(0, "TABLE"); p(2, "LAYER"); p(70, 2);
    for (const [name, color] of [["POINTS", 1], ["TEXT", 3]]) {
      p(0, "LAYER"); p(2, name); p(70, 0); p(62, color); p(6, "CONTINUOUS");
    }
    p(0, "ENDTAB"); p(0, "ENDSEC");
    p(0, "SECTION"); p(2, "ENTITIES");
    const line = (x1, y1, x2, y2) => {
      p(0, "LINE"); p(8, "POINTS");
      p(10, x1); p(20, y1); p(30, 0); p(11, x2); p(21, y2); p(31, 0);
    };
    for (const r of rows) {
      const X = Number(r.y), Y = Number(r.x);
      line(X - crossSize, Y, X + crossSize, Y);
      line(X, Y - crossSize, X, Y + crossSize);
      p(0, "TEXT"); p(8, "TEXT");
      p(10, X + crossSize * 1.2); p(20, Y + crossSize * 1.2); p(30, 0);
      // DXF R12 không có UTF-8: ký tự tiếng Việt ghi dạng \U+XXXX (AutoCAD hiểu được)
      const text = String(r.name).replace(/[^\x20-\x7e]/g,
        (c) => "\\U+" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0"));
      p(40, crossSize * 3); p(1, text);
    }
    p(0, "ENDSEC"); p(0, "EOF");
    return g.join("\r\n") + "\r\n";
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  root.VN = root.VN || {};
  Object.assign(root.VN, { toCsv, toKml, toDxf, download });
})(typeof window !== "undefined" ? window : globalThis);
