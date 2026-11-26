/*
 * Lớp "Giá đất 2026" — Bảng giá đất tỉnh Quảng Trị áp dụng từ 01/01/2026 (Nghị quyết 12/2025/NQ-HĐND).
 * Dữ liệu: docs/data/giadat_2026.json (scripts/build_giadat_2026.py tạo; mục "nguon" ghi nguồn).
 *
 * - Vẽ đoạn đường có toạ độ, tô màu theo giá đất ở Vị trí 1; nét đứt = vị trí cần xem lại.
 * - Sau khi chuyển đổi: liệt kê các đoạn đường gần thửa (gần tâm thửa / điểm) và giá đất nông nghiệp của xã.
 * - Tra cứu toàn bộ bảng theo xã và tên đường (kể cả đoạn không có toạ độ).
 * Hàm tính toán thuần (không phụ thuộc bản đồ) để kiểm thử trong docs/tests.html.
 */
(function (root) {
  "use strict";

  // Thang màu theo giá đất ở Vị trí 1 (đồng/m²)
  const BAC_GIA = [
    [0, "#fff3b0", "< 1 triệu"],
    [1e6, "#ffd166", "1 – 3 triệu"],
    [3e6, "#f8961e", "3 – 6 triệu"],
    [6e6, "#e63946", "6 – 10 triệu"],
    [1e7, "#9d0208", "10 – 20 triệu"],
    [2e7, "#5a189a", "≥ 20 triệu"],
  ];
  function mauGia(v) {
    let c = BAC_GIA[0][1];
    for (const [nguong, mau] of BAC_GIA) if (v >= nguong) c = mau;
    return c;
  }

  // Khoảng cách (m) từ điểm (lon, lat) tới đường gấp khúc [[lon, lat], …] — phép chiếu phẳng cục bộ,
  // sai số không đáng kể ở cự li vài km.
  function khoangCachToiDuong(lon, lat, line) {
    const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110574;
    let best = Infinity;
    if (line.length === 1) return Math.hypot((line[0][0] - lon) * kx, (line[0][1] - lat) * ky);
    for (let i = 0; i < line.length - 1; i++) {
      const ax = (line[i][0] - lon) * kx, ay = (line[i][1] - lat) * ky;
      const bx = (line[i + 1][0] - lon) * kx, by = (line[i + 1][1] - lat) * ky;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best) best = d;
    }
    return best;
  }

  // n đoạn gần nhất trong bán kính r (m); mỗi đoạn phải có "hinh"
  function doanGanNhat(lon, lat, doan, r = 300, n = 5) {
    const dLat = r / 110574, dLon = r / (111320 * Math.cos((lat * Math.PI) / 180));
    const out = [];
    for (const d of doan) {
      if (!d.hinh) continue;
      const b = d._bb || (d._bb = khung(d.hinh));
      if (lon < b[0] - dLon || lon > b[2] + dLon || lat < b[1] - dLat || lat > b[3] + dLat) continue;
      const k = khoangCachToiDuong(lon, lat, d.hinh);
      if (k <= r) out.push({ d, k });
    }
    return out.sort((a, b) => a.k - b.k).slice(0, n);
  }
  function khung(line) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of line) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
    return b;
  }

  // Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu
  const boDau = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

  root.VN = root.VN || {};
  Object.assign(root.VN, { BAC_GIA, mauGia, khoangCachToiDuong, doanGanNhat, boDau });

  if (typeof document === "undefined") return;   // chạy trong Node (kiểm thử) → chỉ xuất hàm

  // ===================================================================== giao diện
  const CL = {
    tot: "",
    xem_lai: "Vị trí đoạn đường cần xem lại (điểm đầu/cuối xa đường, tuyến dò vòng, hoặc tên đường trên OpenStreetMap khác tên trong bảng giá)",
    thang: "Không dò được theo đường — nối thẳng các điểm của liên kết Google Maps",
  };
  const G = { data: null, doan: [], map: null, h: null, visible: true, ready: false };

  function init(map, helpers) {
    G.map = map;
    G.h = helpers;
    G.visible = helpers.store.get("gd", "1") === "1";
    load();
  }

  async function load() {
    try {
      const res = await fetch(new URL("data/giadat_2026.json", location.href));
      if (!res.ok) return;
      G.data = await res.json();
    } catch (_) { return; }   // file:// hoặc chưa có dữ liệu → bỏ qua lớp giá đất
    G.doan = G.data.doan;
    const fc = { type: "FeatureCollection", features: [] };
    G.doan.forEach((d, i) => {
      if (!d.hinh) return;
      fc.features.push({
        type: "Feature", id: i,
        properties: { i, v1: d.o[0] || 0, cl: d.cl },
        geometry: d.hinh.length > 1 ? { type: "LineString", coordinates: d.hinh } : { type: "Point", coordinates: d.hinh[0] },
      });
    });
    const map = G.map;
    map.addSource("gd", { type: "geojson", data: fc, attribution: G.h.attribution });
    const mau = ["step", ["get", "v1"], BAC_GIA[0][1], ...BAC_GIA.slice(1).flatMap(([n, c]) => [n, c])];
    const rong = ["interpolate", ["linear"], ["zoom"], 11, 1.5, 15, 4, 18, 7];
    map.addLayer({ id: "gd-vien", type: "line", source: "gd", minzoom: 11, filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3, 15, 7, 18, 11], "line-opacity": 0.8 } }, "parcel-fill");
    map.addLayer({ id: "gd-line", type: "line", source: "gd", minzoom: 11,
      filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "cl"], "tot"]],
      layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": mau, "line-width": rong } }, "parcel-fill");
    map.addLayer({ id: "gd-line-nghi", type: "line", source: "gd", minzoom: 11,
      filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "cl"], "tot"]],
      paint: { "line-color": mau, "line-width": rong, "line-dasharray": [1.5, 1.2] } }, "parcel-fill");
    map.addLayer({ id: "gd-diem", type: "circle", source: "gd", minzoom: 11, filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-color": mau, "circle-radius": 5, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } }, "parcel-fill");

    for (const id of ["gd-line", "gd-line-nghi", "gd-diem"]) {
      map.on("click", id, (e) => {
        const f = e.features[0];
        new maplibregl.Popup({ offset: 8, maxWidth: "340px" }).setLngLat(e.lngLat).setHTML(popupHtml(G.doan[f.properties.i])).addTo(map);
      });
      map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
    }

    // Nút bật/tắt + chú giải
    const btn = document.getElementById("gd-toggle");
    btn.hidden = false;
    btn.addEventListener("click", () => setVisible(!G.visible));
    document.getElementById("gd-legend").querySelector("ul").innerHTML = BAC_GIA.map(([, c, t]) =>
      `<li><span class="sw line" style="background:${c}"></span><span>${t}</span></li>`).join("") +
      `<li><span class="sw line dash"></span><span>Vị trí cần xem lại</span></li>`;
    setVisible(G.visible);
    setOpacity(G.h.opacity ? G.h.opacity() : 1);

    // Tra cứu
    const sel = document.getElementById("gd-xa");
    const xas = [...new Map(G.doan.map((d) => [d.xa_id, d.xa])).entries()].sort((a, b) => a[1].localeCompare(b[1], "vi"));
    sel.innerHTML = `<option value="">— Tất cả 78 xã, phường, đặc khu —</option>` +
      xas.map(([id, ten]) => `<option value="${id}">${G.h.escapeHtml(ten)}</option>`).join("");
    document.getElementById("gd-card").hidden = false;
    sel.addEventListener("change", traCuu);
    document.getElementById("gd-tim").addEventListener("input", traCuu);
    for (const id of ["gd-kq", "gd-gan"]) {
      document.getElementById(id).addEventListener("click", (e) => {
        const li = e.target.closest("[data-i]");
        if (li) bayToi(G.doan[Number(li.dataset.i)]);
      });
    }
    document.getElementById("gd-nguon").innerHTML = nguonHtml();
    G.ready = true;
    capNhatGan(G.lastRows || []);
  }

  function setVisible(v) {
    G.visible = v;
    G.h.store.set("gd", v ? "1" : "0");
    document.getElementById("gd-toggle").setAttribute("aria-pressed", String(v));
    for (const id of ["gd-vien", "gd-line", "gd-line-nghi", "gd-diem"]) {
      if (G.map.getLayer(id)) G.map.setLayoutProperty(id, "visibility", v ? "visible" : "none");
    }
    document.getElementById("gd-legend").hidden = !v;
  }

  const tien = (v) => (v == null ? "—" : G.h.fmt(v, 0));

  function bangGia(d) {
    const dong = (ten, arr) => `<tr><th>${ten}</th>${[0, 1, 2, 3].map((k) => `<td>${tien(arr && arr[k])}</td>`).join("")}</tr>`;
    return `<table class="gd-bang"><thead><tr><th>đ/m²</th><th>VT1</th><th>VT2</th><th>VT3</th><th>VT4</th></tr></thead><tbody>` +
      dong("Đất ở", d.o) + (d.tm ? dong("TMDV", d.tm) : "") + (d.sx ? dong("SXKD", d.sx) : "") + `</tbody></table>`;
  }

  function tieuDe(d) {
    const e = G.h.escapeHtml;
    const doan = [d.tu, d.den].filter(Boolean).join(" → ");
    return `<b>${e(d.duong || "")}</b>${doan ? `<br><span class="muted">${e(doan)}</span>` : ""}`;
  }

  function popupHtml(d) {
    const e = G.h.escapeHtml;
    const doi = d.o_cu && d.o[0] ? ` · bảng cũ ${tien(d.o_cu)} (${d.o[0] >= d.o_cu ? "+" : ""}${G.h.fmt((d.o[0] / d.o_cu - 1) * 100, 1)}%)` : "";
    return `<div class="gd-pop">${tieuDe(d)}
      <div class="muted">${e(d.xa || "")}${d.xa_cu && d.xa_cu !== d.xa ? ` (cũ: ${e(d.xa_cu)})` : ""}${doi}</div>
      ${bangGia(d)}
      ${CL[d.cl] ? `<div class="gd-canh">⚠ ${CL[d.cl]}</div>` : ""}
      ${d.ten_osm ? `<div class="gd-canh">Trên OpenStreetMap, tuyến dò nằm trên: <b>${G.h.escapeHtml(d.ten_osm)}</b> (tên khác bảng giá — có thể là tên quốc lộ/tỉnh lộ của cùng con đường)</div>` : ""}
      <div class="gd-src">Bảng giá đất 2026 — NQ 12/2025/NQ-HĐND tỉnh Quảng Trị. Vị trí (VT1–4) của thửa do cơ quan có thẩm quyền xác định.</div></div>`;
  }

  function nguonHtml() {
    const n = G.data.nguon || {};
    return Object.values(n).map((t) => `<li>${G.h.escapeHtml(t)}</li>`).join("");
  }

  // Sau khi chuyển đổi: đoạn đường gần thửa nhất + giá đất nông nghiệp của xã
  function capNhatGan(rows) {
    G.lastRows = rows;
    const box = document.getElementById("gd-gan");
    if (!G.ready || !rows.length) { box.hidden = true; return; }
    const lon = rows.reduce((s, r) => s + r.lon, 0) / rows.length;
    const lat = rows.reduce((s, r) => s + r.lat, 0) / rows.length;
    const gan = doanGanNhat(lon, lat, G.doan, 400, 4);
    const e = G.h.escapeHtml;
    let html = `<div><strong>Giá đất 2026 quanh ${rows.length >= 3 ? "tâm thửa" : "điểm"}</strong> <small class="muted">(bán kính 400 m)</small></div>`;
    if (gan.length) {
      html += `<ul class="gd-list">${gan.map(({ d, k }) =>
        `<li data-i="${G.doan.indexOf(d)}"><span class="sw line" style="background:${mauGia(d.o[0] || 0)}"></span>` +
        `<div>${tieuDe(d)} <small class="muted">· cách ${G.h.fmt(k, 0)} m</small>` +
        `<div class="gd-vt">Đất ở: VT1 <b>${tien(d.o[0])}</b> · VT2 ${tien(d.o[1])} · VT3 ${tien(d.o[2])} · VT4 ${tien(d.o[3])} đ/m²</div>` +
        `${d.cl !== "tot" ? `<small class="gd-canh">⚠ vị trí đoạn đường cần xem lại</small>` : ""}</div></li>`).join("")}</ul>`;
      const nn = G.data.nong_nghiep[gan[0].d.xa_id];
      if (nn) {
        html += `<div class="gd-nn"><b>Đất nông nghiệp – ${e(nn.ten)}</b> (VT1/VT2/VT3, đ/m²): ` +
          `cây hằng năm ${nn.hnk.map(tien).join(" / ")}; cây lâu năm ${nn.cln.map(tien).join(" / ")}; ` +
          `nuôi trồng thủy sản ${nn.nts.map(tien).join(" / ")}; rừng sản xuất ${nn.rsx.map(tien).join(" / ")}</div>`;
      }
    } else {
      html += `<div class="muted">Không có đoạn đường nào trong bảng giá (có toạ độ) trong bán kính 400 m. Tra cứu theo xã ở mục <i>Bảng giá đất 2026</i>.</div>`;
    }
    html += `<small class="muted" style="display:block;margin-top:4px">Đoạn đường gần nhất chưa chắc là đường thửa đất tiếp giáp; vị trí VT1–VT4 do cơ quan có thẩm quyền xác định. Chỉ để tham khảo.</small>`;
    box.innerHTML = html;
    box.hidden = false;
  }

  function traCuu() {
    const xa = document.getElementById("gd-xa").value;
    const q = boDau(document.getElementById("gd-tim").value.trim());
    const kq = document.getElementById("gd-kq");
    if (!xa && q.length < 2) { kq.innerHTML = `<small class="muted">Chọn xã hoặc gõ tên đường (≥ 2 ký tự).</small>`; return; }
    const out = [];
    G.doan.forEach((d, i) => {
      if (xa && String(d.xa_id) !== xa) return;
      if (q && !boDau(`${d.duong} ${d.tu} ${d.den} ${d.xa_cu || ""}`).includes(q)) return;
      out.push(i);
    });
    const e = G.h.escapeHtml;
    kq.innerHTML = `<small class="muted">${out.length} đoạn${out.length > 200 ? " — hiện 200 đoạn đầu, gõ thêm để lọc" : ""}</small>` +
      `<ul class="gd-list">${out.slice(0, 200).map((i) => {
        const d = G.doan[i];
        return `<li data-i="${i}" class="${d.hinh ? "co-vi-tri" : ""}" title="${d.hinh ? "Bấm để xem trên bản đồ" : "Đoạn này không có toạ độ"}">` +
          `<span class="sw line" style="background:${mauGia(d.o[0] || 0)}"></span><div>${tieuDe(d)}` +
          `${!xa ? ` <small class="muted">· ${e(d.xa)}</small>` : ""}` +
          `<div class="gd-vt">VT1 <b>${tien(d.o[0])}</b> · VT2 ${tien(d.o[1])} · VT3 ${tien(d.o[2])} · VT4 ${tien(d.o[3])}</div></div></li>`;
      }).join("")}</ul>`;
  }

  function bayToi(d) {
    if (!d.hinh) { G.h.toast("Đoạn này không có toạ độ trong bảng giá"); return; }
    if (!G.visible) setVisible(true);
    const b = new maplibregl.LngLatBounds();
    d.hinh.forEach((c) => b.extend(c));
    G.map.fitBounds(b, { padding: 80, maxZoom: 17, duration: 600 });
    const mid = d.hinh[Math.floor(d.hinh.length / 2)];
    new maplibregl.Popup({ offset: 8, maxWidth: "340px" }).setLngLat(mid).setHTML(popupHtml(d)).addTo(G.map);
  }

  // Độ đậm lớp giá đất (thanh "Độ đậm lớp phủ" trên bản đồ), f = 0…1
  function setOpacity(f) {
    if (!G.map || !G.map.getLayer("gd-line")) return;
    const m = Math.max(f, 0.25);
    G.map.setPaintProperty("gd-line", "line-opacity", m);
    G.map.setPaintProperty("gd-line-nghi", "line-opacity", m);
    G.map.setPaintProperty("gd-vien", "line-opacity", 0.8 * f);
    G.map.setPaintProperty("gd-diem", "circle-opacity", m);
  }

  root.VN.giadatInit = init;
  root.VN.giadatOpacity = setOpacity;
  root.VN.giadatRows = (rows) => capNhatGan(rows);
})(typeof window !== "undefined" ? window : globalThis);
