/*
 * Giao diện WebGIS: nhập liệu → chuyển đổi → bảng/xuất file → bản đồ MapLibre.
 * Toàn bộ tính toán nằm trong converter.js / parse.js / geo.js / export.js.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const fmt = (v, d) => Number(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });

  // ---------------- Lưu tạm trên trình duyệt (tiện lợi, không bắt buộc) ----------------
  const store = {
    get(k, def) { try { const v = localStorage.getItem("vn2000:" + k); return v === null ? def : v; } catch (_) { return def; } },
    set(k, v) { try { localStorage.setItem("vn2000:" + k, v); } catch (_) { /* bỏ qua */ } },
  };

  const SAMPLES = {
    vn2000: "1 1842173.70 546243.50 10\n2 1842131.17 546252.31 10\n3 1842104.21 546211.86 10\n4 1842151.63 546197.68 10",
    // = 4 điểm VN-2000 ở trên đổi sang WGS84 (lon0 106.25)
    wgs84: "1 16.65562529 106.68535922 -3.617\n2 16.65524078 106.68544094 -3.616\n3 16.65499794 106.68506119 -3.616\n4 16.65542675 106.68492923 -3.618",
  };

  const state = {
    dir: store.get("dir", "vn2wgs"),
    rows: [],            // { name, x, y, h, lat, lon, hw }
    markers: [],
    edgeMarkers: [],
    circles: [],         // { id, name, lat, lon, r } — vòng tròn bán kính quanh điểm
    circleMarkers: [],
  };
  let circleSeq = 0;

  // ---------------- Kinh tuyến trục ----------------
  const provinceSel = $("province");
  const lon0Input = $("lon0");
  Object.keys(VN.LON0_BY_PROVINCE).sort((a, b) => a.localeCompare(b, "vi")).forEach((name) => {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = `${name} (${VN.LON0_BY_PROVINCE[name]}°)`;
    provinceSel.appendChild(o);
  });
  provinceSel.value = store.get("province", "");
  lon0Input.value = store.get("lon0", "106.25");
  provinceSel.addEventListener("change", () => {
    if (provinceSel.value) lon0Input.value = VN.LON0_BY_PROVINCE[provinceSel.value];
    store.set("province", provinceSel.value);
    store.set("lon0", lon0Input.value);
  });
  lon0Input.addEventListener("input", () => {
    const p = provinceSel.value;
    if (p && Number(lon0Input.value) !== VN.LON0_BY_PROVINCE[p]) provinceSel.value = "";
    store.set("province", provinceSel.value);
    store.set("lon0", lon0Input.value);
  });
  function getLon0() {
    const v = Number(lon0Input.value);
    if (!(v >= 102 && v <= 110)) throw new Error("Kinh tuyến trục phải trong khoảng 102°–110°");
    return v;
  }

  // ---------------- Chiều chuyển đổi ----------------
  const coords = $("coords");
  coords.value = store.get("input", "");
  coords.addEventListener("input", () => store.set("input", coords.value));

  function setDir(dir) {
    state.dir = dir;
    store.set("dir", dir);
    document.querySelectorAll(".segmented button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.dir === dir)));
    const vn = dir === "vn2wgs";
    $("input-label").textContent = vn ? "Toạ độ VN-2000 (Tên X Y H — X hướng Bắc)" : "Toạ độ WGS84 (Tên Vĩ-độ Kinh-độ H)";
    coords.placeholder = vn ? SAMPLES.vn2000 : SAMPLES.wgs84;
  }
  document.querySelectorAll(".segmented button").forEach((b) => b.addEventListener("click", () => setDir(b.dataset.dir)));
  setDir(state.dir);

  $("sample").addEventListener("click", () => {
    coords.value = state.dir === "vn2wgs" ? SAMPLES.vn2000 : SAMPLES.wgs84;
    store.set("input", coords.value);
  });
  $("clear").addEventListener("click", () => {
    coords.value = "";
    store.set("input", "");
    state.rows = [];
    render();
  });
  $("file").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    coords.value = await f.text();
    store.set("input", coords.value);
    e.target.value = "";
    toast(`Đã mở ${f.name}`);
  });

  // ---------------- Chuyển đổi ----------------
  function showErrors(errors) {
    const box = $("errors");
    if (!errors.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML = `<strong>Bỏ qua ${errors.length} dòng không hợp lệ:</strong><ul>` +
      errors.map(([line, why]) => `<li><code>${escapeHtml(line)}</code> — ${escapeHtml(why)}</li>`).join("") + "</ul>";
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  $("convert").addEventListener("click", () => {
    let lon0;
    try { lon0 = getLon0(); } catch (e) { showErrors([["Kinh tuyến trục", e.message]]); return; }

    if (state.dir === "vn2wgs") {
      const { points, errors } = VN.parseCoordinates(coords.value);
      showErrors(errors);
      state.rows = points.map(([name, x, y, h]) => {
        const [lat, lon, hw] = VN.vn2000ToWgs84(x, y, h, lon0);
        return { name, x, y, h, lat, lon, hw };
      });
    } else {
      const { points, errors } = VN.parseWgs84(coords.value);
      showErrors(errors);
      state.rows = points.map(([name, lat, lon, hw]) => {
        const [x, y, h] = VN.wgs84ToVn2000(lat, lon, hw, lon0);
        return { name, x, y, h, lat, lon, hw };
      });
    }
    if (!state.rows.length) toast("Không có toạ độ hợp lệ");
    render(true);
  });

  // ---------------- Kết quả ----------------
  function sortedRows() {
    return state.rows.slice().sort((a, b) => VN.comparePointNames(a.name, b.name));
  }

  function textOut() {
    return state.dir === "vn2wgs"
      ? state.rows.map((r) => `${r.name} ${r.lat} ${r.lon} ${r.hw}`).join("\n")
      : state.rows.map((r) => `${r.name} ${r.x} ${r.y} ${r.h}`).join("\n");
  }

  function renderTable() {
    const card = $("results-card");
    card.hidden = state.rows.length === 0;
    $("count").textContent = state.rows.length ? `(${state.rows.length} điểm)` : "";
    const vn = state.dir === "vn2wgs";
    $("table").querySelector("tbody").innerHTML = state.rows.map((r, i) => `
      <tr data-i="${i}">
        <td>${escapeHtml(r.name)}</td>
        <td>${r.x.toFixed(3)}</td><td>${r.y.toFixed(3)}</td>
        <td>${r.lat.toFixed(8)}</td><td>${r.lon.toFixed(8)}</td>
        <td>${(vn ? r.hw : r.h).toFixed(3)}</td>
      </tr>`).join("");
  }

  $("table").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-i]");
    if (!tr) return;
    const r = state.rows[Number(tr.dataset.i)];
    map.flyTo({ center: [r.lon, r.lat], zoom: Math.max(map.getZoom(), 18) });
    popupFor(r).addTo(map);
  });

  $("copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(textOut()); toast("Đã sao chép kết quả"); }
    catch (_) { toast("Trình duyệt chặn sao chép"); }
  });
  $("dl-csv").addEventListener("click", () => VN.download("points.csv", VN.toCsv(state.rows), "text/csv;charset=utf-8"));
  $("dl-kml").addEventListener("click", () => VN.download("points.kml", VN.toKml(state.rows), "application/vnd.google-earth.kml+xml"));
  $("dl-dxf").addEventListener("click", () => VN.download("toado_vn2000.dxf", VN.toDxf(state.rows), "application/dxf"));

  // ---------------- Thửa đất: nối điểm, cạnh, diện tích ----------------
  const joinBox = $("join"), lengthsBox = $("lengths");
  joinBox.checked = store.get("join", "1") === "1";
  lengthsBox.checked = store.get("lengths", "0") === "1";
  joinBox.addEventListener("change", () => { store.set("join", joinBox.checked ? "1" : "0"); render(); });
  lengthsBox.addEventListener("change", () => { store.set("lengths", lengthsBox.checked ? "1" : "0"); render(); });

  function renderArea(rows) {
    const box = $("area");
    if (rows.length < 3 || !joinBox.checked) { box.hidden = true; return; }
    const a1 = VN.shoelaceArea(rows.map((r) => [r.x, r.y]));
    const a2 = VN.geodesicArea(rows.map((r) => [r.lat, r.lon]));
    let perim = 0;
    for (let i = 0; i < rows.length; i++) {
      const p = rows[i], q = rows[(i + 1) % rows.length];
      perim += VN.geodesicDistance(p.lat, p.lon, q.lat, q.lon);
    }
    box.hidden = false;
    box.innerHTML = `
      <div>Diện tích VN-2000: <strong>${fmt(a1, 1)} m²</strong> <small>(${fmt(a1 / 10000, 4)} ha)</small></div>
      <div>Diện tích WGS84: <strong>${fmt(a2, 1)} m²</strong> <small>(${fmt(a2 / 10000, 4)} ha)</small></div>
      <div><small>Chu vi: ${fmt(perim, 2)} m · nối theo thứ tự tên điểm</small></div>`;
  }

  // ---------------- Bản đồ ----------------
  const map = new maplibregl.Map({
    container: "map",
    center: [106.68, 16.63],    // Khe Sanh, Hướng Hóa
    zoom: 11,
    attributionControl: { compact: true },
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster", tileSize: 256, maxzoom: 19,
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          attribution: "© OpenStreetMap contributors",
        },
        sat: {
          // Esri chưa có ảnh độ phân giải cao ở nhiều vùng nông thôn → dừng ở z17, zoom sâu hơn thì phóng to ảnh z17
          type: "raster", tileSize: 256, maxzoom: 17,
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          attribution: "Ảnh vệ tinh © Esri",
        },
        parcel: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        circles: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      },
      layers: [
        { id: "osm", type: "raster", source: "osm" },
        { id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } },
        { id: "parcel-fill", type: "fill", source: "parcel", filter: ["==", "$type", "Polygon"],
          paint: { "fill-color": "#1e66f5", "fill-opacity": 0.12 } },
        { id: "parcel-line", type: "line", source: "parcel",
          paint: { "line-color": "#1e66f5", "line-width": 3 } },
        { id: "circle-fill", type: "fill", source: "circles",
          paint: { "fill-color": "#d81b60", "fill-opacity": 0.08 } },
        { id: "circle-line", type: "line", source: "circles",
          paint: { "line-color": "#d81b60", "line-width": 2.5, "line-dasharray": [3, 2] } },
      ],
    },
  });
  VN.map = map;   // để gỡ lỗi từ console
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

  const base = store.get("base", "osm");
  function setBase(b) {
    store.set("base", b);
    document.querySelectorAll(".basemap button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.base === b)));
    if (!map.getLayer("osm")) return;
    map.setLayoutProperty("osm", "visibility", b === "osm" ? "visible" : "none");
    map.setLayoutProperty("sat", "visibility", b === "sat" ? "visible" : "none");
  }
  document.querySelectorAll(".basemap button").forEach((b) => b.addEventListener("click", () => setBase(b.dataset.base)));

  // Popup của điểm: toạ độ + tuỳ chọn vẽ vòng tròn bán kính R (m) tâm tại điểm
  function popupFor(r) {
    const popup = new maplibregl.Popup({ offset: 10, closeButton: true, maxWidth: "300px" })
      .setLngLat([r.lon, r.lat]);
    const build = () => {
      const el = document.createElement("div");
      el.className = "pt-pop";
      const mine = state.circles.filter((c) => c.lat === r.lat && c.lon === r.lon);
      el.innerHTML = `<b>${escapeHtml(r.name)}</b><br>
        X: ${r.x.toFixed(3)} · Y: ${r.y.toFixed(3)} · H: ${r.h.toFixed(3)}<br>
        ${r.lat.toFixed(8)}, ${r.lon.toFixed(8)} · h: ${r.hw.toFixed(3)}
        <form class="circle-form">
          <label>Vòng tròn bán kính
            <input type="text" name="r" inputmode="decimal" autocomplete="off" required
              value="${escapeHtml(store.get("radius", "50"))}"> m</label>
          <button type="submit" class="btn small primary">Vẽ</button>
        </form>
        ${mine.length ? `<ul class="circle-mine">${mine.map((c) =>
          `<li>R = ${fmt(c.r, c.r % 1 ? 2 : 0)} m <button type="button" class="link" data-del="${c.id}">Xoá</button></li>`).join("")}</ul>` : ""}`;
      el.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        const radius = Number(String(e.target.r.value).replace(",", "."));
        if (!(radius > 0 && radius <= 50000)) { toast("Bán kính phải từ 0,1 đến 50 000 m"); return; }
        store.set("radius", String(radius));
        popup.remove();            // đóng popup để không che vòng tròn (xoá được ở bảng điều khiển)
        addCircle(r, radius);
      });
      el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
        removeCircle(Number(b.dataset.del));
        popup.setDOMContent(build());
      }));
      return el;
    };
    popup.setDOMContent(build());
    popup.on("open", () => popup.setDOMContent(build()));   // cập nhật danh sách vòng tròn mỗi lần mở
    return popup;
  }

  // ---------------- Vòng tròn bán kính ----------------
  function addCircle(r, radius) {
    state.circles.push({ id: ++circleSeq, name: r.name, lat: r.lat, lon: r.lon, r: radius });
    renderCircles();
    // Phóng / thu bản đồ cho thấy trọn vòng tròn
    const ring = VN.geodesicCircle(r.lat, r.lon, radius, 32);
    const b = new maplibregl.LngLatBounds();
    ring.forEach((c) => b.extend(c));
    map.fitBounds(b, { padding: 70, maxZoom: 19, duration: 500 });
  }
  function removeCircle(id) {
    state.circles = state.circles.filter((c) => c.id !== id);
    renderCircles();
  }
  function renderCircles() {
    state.circleMarkers.forEach((m) => m.remove());
    state.circleMarkers = [];
    const fc = { type: "FeatureCollection", features: state.circles.map((c) => ({
      type: "Feature", properties: { id: c.id },
      geometry: { type: "Polygon", coordinates: [VN.geodesicCircle(c.lat, c.lon, c.r)] },
    })) };
    whenStyleReady(() => map.getSource("circles").setData(fc));
    // Nhãn "R = … m" ở mép trên vòng tròn
    for (const c of state.circles) {
      const top = VN.geodesicCircle(c.lat, c.lon, c.r, 4)[0];   // phương vị 0° = hướng Bắc
      const el = document.createElement("div");
      el.className = "circle-label";
      el.textContent = `R = ${fmt(c.r, c.r % 1 ? 2 : 0)} m`;
      state.circleMarkers.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(top).addTo(map));
    }
    // Danh sách trong bảng điều khiển
    const box = $("circles");
    box.hidden = !state.circles.length;
    box.innerHTML = state.circles.length
      ? `<div class="row between"><strong>Vòng tròn bán kính</strong>
           <button type="button" class="btn small" id="circles-clear">Xoá tất cả</button></div>
         <ul>${state.circles.map((c) => `<li><span class="sw" style="background:#d81b60"></span>
           Tâm <b>${escapeHtml(c.name)}</b> · R = ${fmt(c.r, c.r % 1 ? 2 : 0)} m
           <small>(≈ ${fmt(Math.PI * c.r * c.r, 0)} m²)</small>
           <button type="button" class="link" data-del="${c.id}">Xoá</button></li>`).join("")}</ul>`
      : "";
    box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => removeCircle(Number(b.dataset.del))));
    const clr = $("circles-clear");
    if (clr) clr.addEventListener("click", () => { state.circles = []; renderCircles(); });
  }

  function renderMap(fit) {
    state.markers.forEach((m) => m.remove());
    state.edgeMarkers.forEach((m) => m.remove());
    state.markers = [];
    state.edgeMarkers = [];

    const rows = sortedRows();
    for (const r of rows) {
      const el = document.createElement("div");
      el.className = "pt";
      el.innerHTML = `<span>${escapeHtml(r.name)}</span>`;
      const mk = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([r.lon, r.lat]).setPopup(popupFor(r)).addTo(map);
      state.markers.push(mk);
    }

    const joined = joinBox.checked && rows.length >= 2;
    const ring = rows.map((r) => [r.lon, r.lat]);
    let geom = { type: "FeatureCollection", features: [] };
    if (joined) {
      const closed = ring.concat([ring[0]]);
      geom.features.push(rows.length >= 3
        ? { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [closed] } }
        : { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring } });
    }
    const src = map.getSource("parcel");
    if (src) src.setData(geom);

    if (joined && lengthsBox.checked) {
      const n = rows.length === 2 ? 1 : rows.length;
      for (let i = 0; i < n; i++) {
        const p = rows[i], q = rows[(i + 1) % rows.length];
        const d = VN.geodesicDistance(p.lat, p.lon, q.lat, q.lon);
        const el = document.createElement("div");
        el.className = "edge";
        el.textContent = `${fmt(d, 2)} m`;
        state.edgeMarkers.push(new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([(p.lon + q.lon) / 2, (p.lat + q.lat) / 2]).addTo(map));
      }
    }

    renderArea(rows);

    if (fit && rows.length) {
      const b = new maplibregl.LngLatBounds();
      ring.forEach((c) => b.extend(c));
      map.fitBounds(b, { padding: 60, maxZoom: 19, duration: 600 });
    }
  }

  // Chạy fn ngay khi style bản đồ sẵn sàng (không đợi tải xong ảnh nền)
  function whenStyleReady(fn) {
    if (map.getSource("parcel")) { fn(); return; }
    const check = () => { if (map.getSource("parcel")) { map.off("styledata", check); fn(); } };
    map.on("styledata", check);
  }

  function render(fit) {
    renderTable();
    whenStyleReady(() => {
      renderMap(fit);
      schedulePlanningHits();
    });
  }

  // ---------------- Lớp quy hoạch Hướng Hóa (PMTiles do GitHub Actions tạo) ----------------
  // ?qh=đường-dẫn cho phép thử với file khác (vd GeoJSON mẫu khi phát triển)
  const QH_URL = new URL(new URLSearchParams(location.search).get("qh") || "data/quyhoach.pmtiles", location.href).href;
  const QH_IS_PM = /\.pmtiles$/i.test(QH_URL);
  const QH_SRC = QH_IS_PM ? { source: "qh", sourceLayer: "quyhoach" } : { source: "qh" };
  const qhToggle = $("qh-toggle");
  let qhReady = false;
  let qhVisible = store.get("qh", "1") === "1";
  let qhHitIds = [];

  async function addPlanningLayer() {
    try {
      if (location.protocol === "file:") throw new Error("cần http(s)");
      const res = await fetch(QH_URL, { method: "HEAD" });
      if (!res.ok) throw new Error(String(res.status));
    } catch (_) {
      return;   // chưa có file (Actions chưa chạy) → ẩn nút, bản đồ vẫn dùng bình thường
    }
    if (QH_IS_PM) {
      const protocol = new pmtiles.Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      // tippecanoe --use-attribute-for-id=id đã chuyển "id" thành feature id (bỏ khỏi properties)
      // → dùng feature id có sẵn, KHÔNG promoteId
      map.addSource("qh", { type: "vector", url: "pmtiles://" + QH_URL });
    } else {
      map.addSource("qh", { type: "geojson", data: QH_URL, promoteId: "id" });
    }
    const sl = QH_IS_PM ? { "source-layer": "quyhoach" } : {};
    const hit = ["boolean", ["feature-state", "hit"], false];
    // Tô theo màu gốc của bản đồ quy hoạch (thuộc tính "mau"); thửa chứa điểm đậm hơn, viền cam
    map.addLayer({
      id: "qh-fill", type: "fill", source: "qh", ...sl, minzoom: 10,
      paint: {
        "fill-color": ["coalesce", ["get", "mau"], "#ffc107"],
        // "zoom" phải ở ngoài cùng → interpolate bọc case
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, ["case", hit, 0.85, 0.7], 16, ["case", hit, 0.85, 0.5]],
      },
    }, "parcel-fill");
    map.addLayer({
      id: "qh-line", type: "line", source: "qh", ...sl, minzoom: 12,
      paint: {
        "line-color": ["case", hit, "#ff3d00", "#8d6e00"],
        "line-opacity": ["case", hit, 1, 0.6],
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, ["case", hit, 2, 0.3], 16, ["case", hit, 3.5, 0.8], 19, ["case", hit, 5, 1.5]],
      },
    }, "parcel-fill");

    map.on("click", "qh-fill", (e) => {
      // Vùng lớn (đường, khu vực) có thể phủ lên thửa nhỏ → lấy thửa nhỏ nhất tại điểm bấm
      const f = [...e.features].sort((a, b) => (a.properties.dien_tich ?? Infinity) - (b.properties.dien_tich ?? Infinity))[0];
      if (!f) return;
      const p = f.properties;
      const nguon = { nhan: "theo nhãn trên bản đồ", mau: "suy ra từ màu", nhom: "suy ra từ màu (chỉ biết nhóm)" }[p.nguon] || "";
      new maplibregl.Popup({ offset: 6, maxWidth: "280px" }).setLngLat(e.lngLat)
        .setHTML(
          `<div class="qh-pop"><span class="sw" style="background:${escapeHtml(p.mau || "#ffc107")}"></span>` +
          `<b>${escapeHtml(p.ten_dat || "Chưa xác định loại đất")}</b></div>` +
          (p.ma_dat ? `Mã: <b>${escapeHtml(p.ma_dat)}</b>${nguon ? ` <span style="color:#666">(${nguon})</span>` : ""}<br>` : "") +
          `Thửa quy hoạch số ${escapeHtml(f.id ?? p.id)} · ${fmt(p.dien_tich, 1)} m²` +
          ` <span style="color:#666">(${fmt(p.dien_tich / 10000, 4)} ha)</span>`)
        .addTo(map);
    });
    map.on("mouseenter", "qh-fill", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "qh-fill", () => { map.getCanvas().style.cursor = ""; });

    // Mỗi khi có thêm dữ liệu quy hoạch được tải về → tra lại thửa chứa điểm
    map.on("sourcedata", (e) => { if (e.sourceId === "qh" && e.isSourceLoaded) schedulePlanningHits(); });

    qhReady = true;
    qhToggle.hidden = false;
    setQhVisible(qhVisible);
    loadLegend();
  }

  // Chú giải: data/quyhoach_chugiai.json (do scripts/extract_landuse_mapinfo.py tạo)
  async function loadLegend() {
    try {
      const res = await fetch(new URL("data/quyhoach_chugiai.json", location.href));
      if (!res.ok) return;
      const items = await res.json();
      $("legend").querySelector("ul").innerHTML = items.map((it) =>
        `<li><span class="sw" style="background:${escapeHtml(it.mau || "#ffc107")}"></span>` +
        `<span><b>${escapeHtml(it.ma)}</b> ${escapeHtml(it.ten)}</span>` +
        `<small>${fmt(it.so_thua, 0)}</small></li>`).join("");
      $("legend").hidden = !qhVisible;
    } catch (_) { /* không có chú giải thì thôi */ }
  }

  let qhTimer;
  function schedulePlanningHits() {
    clearTimeout(qhTimer);
    qhTimer = setTimeout(updatePlanningHits, 150);
  }

  function setQhVisible(v) {
    qhVisible = v;
    store.set("qh", v ? "1" : "0");
    qhToggle.setAttribute("aria-pressed", String(v));
    if (!qhReady) return;
    ["qh-fill", "qh-line"].forEach((id) => map.setLayoutProperty(id, "visibility", v ? "visible" : "none"));
    if ($("legend").querySelector("li")) $("legend").hidden = !v;
    schedulePlanningHits();
  }
  qhToggle.addEventListener("click", () => setQhVisible(!qhVisible));

  // Tô cam các thửa chứa điểm và liệt kê ở bảng điều khiển
  function updatePlanningHits() {
    if (!qhReady) return;
    qhHitIds.forEach((id) => map.setFeatureState({ ...QH_SRC, id }, { hit: false }));
    qhHitIds = [];
    const box = $("qh-info");
    if (!qhVisible || !state.rows.length) { box.hidden = true; return; }
    // Đọc thẳng dữ liệu đã tải (không phụ thuộc việc vẽ), rồi thử điểm-trong-đa-giác.
    // Ở PMTiles mức 16 hình thửa gần như nguyên bản; ở mức thấp hơn ranh đã được đơn giản hoá.
    const feats = map.querySourceFeatures("qh", QH_IS_PM ? { sourceLayer: "quyhoach" } : {});
    if (!feats.length) {
      box.hidden = false;
      box.innerHTML = "<small>Đang tải lớp quy hoạch… (phóng to bản đồ tới khu vực có điểm)</small>";
      return;
    }

    const plots = new Map();   // id → { area, names }
    const outside = [];
    const probes = sortedRows();
    // Điểm nhập thường là góc thửa (nằm trên ranh) → thêm tâm thửa để biết thửa nào chứa phần lớn diện tích
    if (probes.length >= 3) {
      probes.unshift({
        name: "tâm thửa",
        lon: probes.reduce((s, r) => s + r.lon, 0) / probes.length,
        lat: probes.reduce((s, r) => s + r.lat, 0) / probes.length,
      });
    }
    for (const r of probes) {
      let found = false;
      for (const f of feats) {
        if (!VN.pointInGeometry(r.lon, r.lat, f.geometry)) continue;
        const id = f.id ?? f.properties.id;
        if (!plots.has(id)) plots.set(id, { area: f.properties.dien_tich, ma: f.properties.ma_dat,
          ten: f.properties.ten_dat, mau: f.properties.mau, names: [] });
        const names = plots.get(id).names;
        if (!names.includes(r.name)) names.push(r.name);   // thửa có thể lặp ở nhiều ô tile
        found = true;
      }
      if (!found) outside.push(r.name);
    }
    // Chỉ viền cam thửa chứa TÂM thửa (nếu có) — góc thửa nằm trên ranh nên hay "chạm" cả vùng đường
    // bao quanh, viền hết sẽ rối. Khi < 3 điểm thì viền mọi thửa chứa điểm.
    const centerIds = [...plots].filter(([, p]) => p.names.includes("tâm thửa")).map(([id]) => id);
    qhHitIds = centerIds.length ? centerIds : [...plots.keys()];
    qhHitIds.forEach((id) => map.setFeatureState({ ...QH_SRC, id }, { hit: true }));

    box.hidden = false;
    // Dữ liệu có vùng lớn bao vùng nhỏ → xếp thửa nhỏ (cụ thể nhất) lên đầu
    const list = [...plots].sort((a, b) => (qhHitIds.includes(b[0]) - qhHitIds.includes(a[0])) || (a[1].area - b[1].area)).map(([id, p]) =>
      `<li${qhHitIds.includes(id) ? "" : ' style="opacity:.7"'}><span class="sw" style="background:${escapeHtml(p.mau || "#ffc107")}"></span>` +
      `<strong>${escapeHtml(p.ma || "?")}</strong> ${escapeHtml(p.ten || "Chưa xác định loại đất")}` +
      `<br><small>Thửa số ${escapeHtml(id)} · ${fmt(p.area, 1)} m² · chứa ${p.names.map(escapeHtml).join(", ")}</small></li>`).join("");
    box.innerHTML = (plots.size
      ? `<div>Quy hoạch tại vị trí này (viền cam trên bản đồ):</div><ul class="qh-list">${list}</ul>`
      : "<div>Không điểm nào nằm trong thửa quy hoạch.</div>") +
      (outside.length && plots.size ? `<small>Nằm trên ranh hoặc ngoài thửa: ${outside.map(escapeHtml).join(", ")}</small>` : "") +
      `<small style="display:block;margin-top:4px">Theo Bản đồ điều chỉnh QHSDĐ đến năm 2030 huyện Hướng Hóa. Chỉ để tham khảo.</small>`;
  }

  // ---------------- Thông báo ngắn ----------------
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  whenStyleReady(() => { setBase(base); addPlanningLayer(); });

  // Lần đầu mở: hiện ví dụ cho người dùng thấy ngay; các lần sau: chạy lại dữ liệu đã lưu
  if (!coords.value.trim()) coords.value = state.dir === "vn2wgs" ? SAMPLES.vn2000 : SAMPLES.wgs84;
  $("convert").click();
})();
