/*
 * Đọc toạ độ người dùng nhập — chép từ functions/parse.py.
 * parseCoordinates(text) → { points: [[tên, x, y, h]], errors: [[dòng, lý do]] }   (VN-2000)
 * parseWgs84(text)       → { points: [[tên, lat, lon, h]], errors: [[dòng, lý do]] }
 */
(function (root) {
  "use strict";

  // float() kiểu Python: chặt chẽ hơn parseFloat ("12abc" là lỗi)
  function toFloat(s) {
    const t = String(s).trim().replace(/,/g, ".");
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) {
      throw new Error(`không phải số: "${s}"`);
    }
    return Number(t);
  }

  const EN = /^[EN]\d{8}$/;

  function parseCoordinates(text) {
    const coords = [];
    const errors = [];
    if (!text || !text.trim()) return { points: [], errors };

    const lines = text.trim().split(/\r?\n/);
    let autoIndex = 1;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      let tokens = line.split(/[\t\s,]+/).map((t) => t.replace(/,/g, ".")).filter(Boolean);
      if (tokens.length === 0) { i += 1; continue; }            // dòng trống
      tokens[0] = tokens[0].replace(/^[^0-9A-Za-z]+/, "");       // bỏ ký tự dẫn ở STT
      tokens = tokens.slice(0, 4);                               // bỏ ghi chú cuối dòng

      // --- Gom 3 dòng đơn ---
      if (tokens.length === 1 && i + 2 < lines.length) {
        try {
          const x = toFloat(lines[i]);
          const y = toFloat(lines[i + 1]);
          const h = toFloat(lines[i + 2]);
          coords.push([`Điểm ${autoIndex}`, x, y, h]);
          autoIndex += 1;
          i += 3;
          continue;
        } catch (_) { /* không phải khối 3 dòng */ }
      }

      // --- X=..., Y=... ---
      if (/^[Xx]=[0-9]*\.?[0-9]+$/.test(line) && i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (/^[Yy]=[0-9]*\.?[0-9]+$/.test(next)) {
          const xRaw = Number(line.split("=")[1]);
          const yRaw = Number(next.split("=")[1]);
          const xOk = xRaw >= 500000 && xRaw <= 2650000;
          const yOk = yRaw >= 330000 && yRaw <= 670000;
          const xSwapOk = yRaw >= 500000 && yRaw <= 2650000;
          const ySwapOk = xRaw >= 330000 && xRaw <= 670000;
          let x = xRaw, y = yRaw;
          if (!(xOk && yOk) && (xSwapOk && ySwapOk)) { x = yRaw; y = xRaw; }
          coords.push([`Điểm ${autoIndex}`, x, y, 0.0]);
          autoIndex += 1;
          i += 2;
          continue;
        }
      }

      // --- Dòng E/N tách biệt ---
      if (tokens.length === 1 && EN.test(tokens[0])) {
        if (i + 1 < lines.length) {
          const nt = lines[i + 1].trim().split(/[\t\s]+/).filter(Boolean);
          if (nt.length === 1 && EN.test(nt[0])) {
            let x = null, y = null;
            for (const t of [tokens[0], nt[0]]) {
              if (t[0] === "E") y = parseInt(t.slice(1), 10);
              else if (t[0] === "N") x = parseInt(t.slice(1), 10);
            }
            if (x !== null && y !== null) {
              coords.push([`Điểm ${autoIndex}`, x, y, 0.0]);
              autoIndex += 1;
              i += 2;
              continue;
            }
          }
        }
        errors.push([line, "Thiếu dòng mã hiệu E/N kèm theo"]);
        i += 1;
        continue;
      }

      // --- E/N cùng dòng ---
      if (tokens.length === 2 && tokens.every((t) => EN.test(t))) {
        let x = null, y = null;
        for (const t of tokens) {
          if (t[0] === "E") y = parseInt(t.slice(1), 10);
          else if (t[0] === "N") x = parseInt(t.slice(1), 10);
        }
        if (x !== null && y !== null) {
          coords.push([`Điểm ${autoIndex}`, x, y, 0.0]);
          autoIndex += 1;
        } else {
          errors.push([line, "Không tách được E/N"]);
        }
        i += 1;
        continue;
      }

      // --- STT X Y H / STT X Y / X Y H / X Y ---
      try {
        if (tokens.length === 4) {
          const [stt, x, y, h] = tokens;
          coords.push([stt, toFloat(x), toFloat(y), toFloat(h)]);
        } else if (tokens.length === 3) {
          const isStt = /^\d+$/.test(tokens[0]);
          const isFloat2 = /^-?\d+(\.\d+)?$/.test(tokens[1]) && /^-?\d+(\.\d+)?$/.test(tokens[2]);
          if (isStt && isFloat2) {
            coords.push([tokens[0], toFloat(tokens[1]), toFloat(tokens[2]), 0.0]);
          } else {
            const [x, y, h] = tokens.map(toFloat);
            coords.push([`Điểm ${autoIndex}`, x, y, h]);
            autoIndex += 1;
          }
        } else if (tokens.length === 2) {
          const [x, y] = tokens.map(toFloat);
          coords.push([`Điểm ${autoIndex}`, x, y, 0.0]);
          autoIndex += 1;
        } else {
          throw new Error("Không đúng định dạng");
        }
      } catch (e) {
        errors.push([line, `Lỗi: ${e.message}`]);
      }
      i += 1;
    }

    // --- Lọc miền hợp lệ ---
    const points = [];
    for (const [name, x, y, h] of coords) {
      const okX = x >= 500000 && x <= 2650000;
      const okY = y >= 330000 && y <= 670000;
      const okH = h >= -1000 && h <= 3200;
      if (okX && okY && okH) {
        points.push([name, x, y, h]);
      } else {
        const reason = [];
        if (!okX) reason.push(`X=${x} ngoài miền`);
        if (!okY) reason.push(`Y=${y} ngoài miền`);
        if (!okH) reason.push(`H=${h} ngoài miền`);
        errors.push([name, reason.join("; ")]);
      }
    }
    return { points, errors };
  }

  function parseWgs84(text) {
    const points = [];
    const errors = [];
    if (!text) return { points, errors };

    let autoIndex = 1;
    for (const raw of text.trim().split(/\r?\n/)) {
      let tokens = raw.trim().split(/[\s,;]+/).filter(Boolean);
      if (tokens.length === 0) continue;
      try {
        let name = null;
        let isNum = true;
        try { toFloat(tokens[0]); } catch (_) { isNum = false; }
        if (!isNum || tokens.length === 4) { name = tokens[0]; tokens = tokens.slice(1); }

        let lat, lon, h;
        if (tokens.length === 2) { [lat, lon] = tokens.map(toFloat); h = 0.0; }
        else if (tokens.length === 3) { [lat, lon, h] = tokens.map(toFloat); }
        else throw new Error("Không đúng định dạng (cần: lat lon [h])");

        if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) {
          throw new Error("Vĩ độ/kinh độ ngoài miền");
        }
        if (name === null) name = String(autoIndex);
        autoIndex += 1;
        points.push([name, lat, lon, h]);
      } catch (e) {
        errors.push([raw, `Lỗi: ${e.message}`]);
      }
    }
    return { points, errors };
  }

  root.VN = root.VN || {};
  root.VN.parseCoordinates = parseCoordinates;
  root.VN.parseWgs84 = parseWgs84;
  root.VN.toFloat = toFloat;
})(typeof window !== "undefined" ? window : globalThis);
