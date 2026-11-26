/*
 * Chuyển đổi toạ độ VN-2000 ⇄ WGS84 — bản JavaScript.
 *
 * ⚠️ Chép NGUYÊN công thức từ functions/converter.py (bản Python là gốc).
 * Không sửa hằng số / công thức nếu không sửa cả bản Python và test (docs/tests.html,
 * tests/test_converter.py) — hai bản phải cho cùng kết quả.
 *
 * Quy ước: x = hướng Bắc, y = hướng Đông (có 500 000 m), lon0 = kinh tuyến trục (độ).
 */
(function (root) {
  "use strict";

  const radians = (d) => (d * Math.PI) / 180;
  const degrees = (r) => (r * 180) / Math.PI;
  const round = (v, n) => { const p = Math.pow(10, n); return Math.round(v * p) / p; };

  // 7 tham số Helmert VN-2000 → WGS84
  const dX = -191.90441429;
  const dY = -39.30318279;
  const dZ = -111.45032835;
  const rx = radians(-0.00928836 / 3600);
  const ry = radians(0.01975479 / 3600);
  const rz = radians(-0.00427372 / 3600);
  const k = 1.000000252906278;

  // ------------------- VN2000 → WGS84 -------------------
  function vn2000ToWgs84(x, y, h, lon0Deg) {
    const a = 6378137.0;
    const e2 = 0.00669437999013;
    const e_ = e2 / (1 - e2);
    const k0 = 0.9999;
    const y0 = 500000;
    const lon0Rad = radians(lon0Deg);

    const mu = (x / k0) / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
    const a1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const B1 = mu + (3 * a1 / 2 - 27 * a1 ** 3 / 32) * Math.sin(2 * mu)
      + (21 * a1 ** 2 / 16 - 55 * a1 ** 4 / 32) * Math.sin(4 * mu)
      + (151 * a1 ** 3 / 96) * Math.sin(6 * mu);

    const N1 = a / Math.sqrt(1 - e2 * Math.sin(B1) ** 2);
    const R1 = a * (1 - e2) / (1 - e2 * Math.sin(B1) ** 2) ** 1.5;
    const C1 = e_ * Math.cos(B1) ** 2;
    const T1 = Math.tan(B1) ** 2;
    const D = (y - y0) / (k0 * N1);

    const B = B1 - (N1 * Math.tan(B1) / R1) * (
      D ** 2 / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * e_) * D ** 4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * e_ - 3 * C1 ** 2) * D ** 6 / 720
    );

    const L = lon0Rad + (1 / Math.cos(B1)) * (
      D
      - (1 + 2 * T1 + C1) * D ** 3 / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * e_ + 24 * T1 ** 2) * D ** 5 / 120
    );

    let N = a / Math.sqrt(1 - e2 * Math.sin(B) ** 2);
    const X_vn = (N + h) * Math.cos(B) * Math.cos(L);
    const Y_vn = (N + h) * Math.cos(B) * Math.sin(L);
    const Z_vn = ((1 - e2) * N + h) * Math.sin(B);

    const X_wgs = dX + k * (X_vn + rz * Y_vn - ry * Z_vn);
    const Y_wgs = dY + k * (-rz * X_vn + Y_vn + rx * Z_vn);
    const Z_wgs = dZ + k * (ry * X_vn - rx * Y_vn + Z_vn);

    const p = Math.sqrt(X_wgs ** 2 + Y_wgs ** 2);
    const lon = Math.atan2(Y_wgs, X_wgs);
    let lat = Math.atan2(Z_wgs, p * (1 - e2));
    let lat0 = 0;
    let h2 = 0;
    while (Math.abs(lat - lat0) > 1e-12) {
      lat0 = lat;
      N = a / Math.sqrt(1 - e2 * Math.sin(lat0) ** 2);
      h2 = p / Math.cos(lat0) - N;
      lat = Math.atan2(Z_wgs, p * (1 - e2 * N / (N + h2)));
    }

    return [round(degrees(lat), 8), round(degrees(lon), 8), round(h2, 7)];
  }

  // ------------------- WGS84 → VN2000 -------------------
  function wgs84ToVn2000(latDeg, lonDeg, h, lon0Deg) {
    const a = 6378137.0;
    const f = 1 / 298.257223563;
    const e2 = 0.00669437999013;
    const ep2 = e2 / (1 - e2);
    const k0 = 0.9999;
    const y0 = 500000;

    const B = radians(latDeg);
    const L = radians(lonDeg);
    const L0 = radians(lon0Deg);

    let N = a / Math.sqrt(1 - e2 * Math.sin(B) ** 2);
    const Xw = (N + h) * Math.cos(B) * Math.cos(L);
    const Yw = (N + h) * Math.cos(B) * Math.sin(L);
    const Zw = ((1 - e2) * N + h) * Math.sin(B);

    const Xs = Xw - dX;
    const Ys = Yw - dY;
    const Zs = Zw - dZ;

    const Xv = (1 / k) * (Xs - rz * Ys + ry * Zs);
    const Yv = (1 / k) * (rz * Xs + Ys - rx * Zs);
    const Zv = (1 / k) * (-ry * Xs + rx * Ys + Zs);

    const p = Math.sqrt(Xv ** 2 + Yv ** 2);
    const gamma = Math.atan((Zv / p) * (1 - f + (a * e2) / Math.sqrt(Xv ** 2 + Yv ** 2 + Zv ** 2)));
    const B_vn = Math.atan((Zv * (1 - f) + a * e2 * Math.sin(gamma) ** 3) /
      ((1 - f) * (p - a * e2 * Math.cos(gamma) ** 3)));
    let L_vn = Math.atan2(Yv, Xv);
    if (L_vn < 0) L_vn += 2 * Math.PI;
    const H_vn = Math.cos(B_vn) * p + Zv * Math.sin(B_vn) - a * Math.sqrt(1 - e2 * Math.sin(B_vn) ** 2);

    const l = L_vn - L0;
    const eta = Math.sqrt(ep2) * Math.cos(B_vn);
    const T = Math.tan(B_vn) ** 2;
    N = a / Math.sqrt(1 - e2 * Math.sin(B_vn) ** 2);

    const A1x = (Math.cos(B_vn) ** 2 * (5 - T + 9 * eta ** 2 + 4 * eta ** 4)) / 12;
    const A2x = (Math.cos(B_vn) ** 4 * (61 - 58 * T + T ** 2)) / 360;
    const A1y = (Math.cos(B_vn) ** 2 * (1 - T + eta ** 2)) / 6;
    const A2y = (Math.cos(B_vn) ** 4 * (5 - 18 * T + T ** 2 + 14 * eta ** 2 - 58 * T * eta ** 2)) / 120;

    const A1 = 1 + 3 / 4 * e2 + 45 / 64 * e2 ** 2;
    const A2 = 3 / 8 * e2 + 15 / 32 * e2 ** 2;
    const A3 = 15 / 256 * e2 ** 2;
    const XB = a * (1 - e2) * (A1 * B_vn - A2 * Math.sin(2 * B_vn) + A3 * Math.sin(4 * B_vn));

    const x = k0 * (XB + l ** 2 / 4 * N * Math.sin(2 * B_vn) * (1 + A1x * l ** 2 + A2x * l ** 4));
    const y = k0 * l * N * Math.cos(B_vn) * (1 + A1y * l ** 2 + A2y * l ** 4) + y0;

    return [round(x, 4), round(y, 4), round(H_vn, 4)];
  }

  root.VN = root.VN || {};
  root.VN.vn2000ToWgs84 = vn2000ToWgs84;
  root.VN.wgs84ToVn2000 = wgs84ToVn2000;
})(typeof window !== "undefined" ? window : globalThis);
