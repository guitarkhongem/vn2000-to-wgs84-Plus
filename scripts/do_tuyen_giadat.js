/*
 * Dò tuyến từng đoạn đường của bảng giá đất theo mạng đường OpenStreetMap (OSRM, hồ sơ đi bộ — đi được
 * cả hai chiều đường một chiều, bám đúng tim đường hơn hồ sơ ô tô).
 *
 *   node scripts/do_tuyen_giadat.js data/giadat_diem.json data/giadat_tuyen.json [di_bo|o_to] [ds_id.txt]
 *
 * Hồ sơ "di_bo" (mặc định): routed-foot — đi được hai chiều đường một chiều, bám tim đường.
 * Hồ sơ "o_to": routed-car — dùng lần hai cho các đoạn mà tuyến đi bộ chưa trùng tên đường
 * (danh sách id trong ds_id.txt, mỗi dòng một id). scripts/build_giadat_2026.py chọn tuyến tốt hơn.
 *
 * data/giadat_diem.json: tạo bằng  python scripts/build_giadat_2026.py "…xlsm" --diem data/giadat_diem.json
 * Máy chủ: https://routing.openstreetmap.de (FOSSGIS) — dùng nhẹ nhàng: 1 yêu cầu / ~1,1 giây, chỉ dò các
 * đoạn chưa có trong tệp kết quả (chạy lại được nhiều lần). Cần Node 18+ (có fetch).
 *
 * Kết quả: {id đoạn: {di_bo: {…}, o_to: {…}}}, mỗi tuyến gồm:
 *   toa_do: [[kinh độ, vĩ độ], …]  — tuyến dò được
 *   dai:    chiều dài tuyến (m)
 *   bam:    khoảng cách (m) từ từng điểm trong liên kết Google Maps tới đường gần nhất
 *   buoc:   [[tên đường OSM, mét], …] cộng dồn theo tên dọc tuyến — để đối chiếu với tên trong bảng giá
 *   loi:    mã lỗi nếu không dò được (vd NoRoute)
 */
"use strict";
const fs = require("fs");
const MAY_CHU = { di_bo: "https://routing.openstreetmap.de/routed-foot/route/v1/driving/",
                  o_to: "https://routing.openstreetmap.de/routed-car/route/v1/driving/" };

function giaiPolyline(str, precision = 6) {
  const f = Math.pow(10, precision);
  let i = 0, lat = 0, lon = 0;
  const out = [];
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d; else lon += d;
    }
    out.push([lon / f, lat / f]);
  }
  return out;
}

async function main(vao, ra, hoSo = "di_bo", dsId = null) {
  const { doan } = JSON.parse(fs.readFileSync(vao, "utf8"));
  const kq = fs.existsSync(ra) ? JSON.parse(fs.readFileSync(ra, "utf8")) : {};
  const chi = dsId ? new Set(fs.readFileSync(dsId, "utf8").split(/\s+/).filter(Boolean)) : null;
  let moi = 0;
  for (const d of doan) {
    if ((kq[d.id] && kq[d.id][hoSo]) || d.diem.length < 2 || (chi && !chi.has(d.id))) continue;
    const c = d.diem.map(([la, lo]) => `${lo.toFixed(6)},${la.toFixed(6)}`).join(";");
    const r = await fetch(`${MAY_CHU[hoSo]}${c}?overview=full&geometries=polyline6&continue_straight=false&steps=true`);
    const j = await r.json();
    let t;
    if (j.code === "Ok") {
      const rt = j.routes[0], ten = {};
      for (const leg of rt.legs) for (const st of leg.steps) ten[st.name || st.ref || ""] = (ten[st.name || st.ref || ""] || 0) + st.distance;
      t = { toa_do: giaiPolyline(rt.geometry), dai: rt.distance, bam: j.waypoints.map((w) => w.distance),
            buoc: Object.entries(ten).map(([k, v]) => [k, Math.round(v)]) };
    } else t = { loi: j.code };
    kq[d.id] = { ...(kq[d.id] || {}), [hoSo]: t };
    if (++moi % 50 === 0) fs.writeFileSync(ra, JSON.stringify(kq));
    await new Promise((s) => setTimeout(s, 1100));
  }
  fs.writeFileSync(ra, JSON.stringify(kq));
  console.log(`Dò thêm ${moi} đoạn; tổng ${Object.keys(kq).length}`);
}

if (require.main === module) main(...process.argv.slice(2));
module.exports = { giaiPolyline };
