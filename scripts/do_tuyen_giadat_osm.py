"""
Dò tuyến từng đoạn đường của bảng giá đất NGAY TRÊN MÁY, theo mạng đường OpenStreetMap, có ƯU TIÊN TÊN ĐƯỜNG.

Đầu vào:
    data/giadat_diem.json  — danh sách đoạn + điểm (tạo: build_giadat_2026.py "…xlsm" --diem data/giadat_diem.json),
                             mỗi đoạn kèm "duong" (tên đường trong bảng giá)
    osm_duong_quangtri.json — đường OSM của tỉnh (Overpass API: way["highway"], `out tags geom`),
                             © OpenStreetMap contributors, ODbL. KHÔNG nằm trong repo (vài chục MB).
Ra: data/giadat_tuyen.json, hồ sơ "osm_ten" (cùng định dạng với scripts/do_tuyen_giadat.js).

Phương pháp (đường đi ngắn nhất có trọng số — Dijkstra):
    1. Đồ thị: mỗi đoạn thẳng giữa hai đỉnh liên tiếp của một way OSM là một cạnh hai chiều
       (bỏ qua đường một chiều, như hồ sơ đi bộ — cần hình con đường, không phải lộ trình xe).
    2. Trọng số cạnh = chiều dài × 1,0 nếu tên đường OSM TRÙNG tên đường trong bảng giá
       (build_giadat_2026.khop_ten ≥ 0,6), ngược lại × 1,6 — tuyến bám đúng con đường có tên khi có thể,
       vẫn đi được qua đường không tên / đường khác khi cần.
    3. Bắt điểm: mỗi điểm của liên kết Google Maps được chiếu vuông góc lên cạnh gần nhất; ưu tiên cạnh trùng
       tên trong 60 m, nếu không thì cạnh gần nhất trong 150 m. Khoảng cách chiếu ghi vào "bam".
    4. Nối các chặng điểm đầu → (điểm giữa) → điểm cuối. Ghi "buoc" = chiều dài theo từng tên đường OSM.
Chất lượng được đánh giá lại trong build_giadat_2026.py (giống các hồ sơ OSRM).

Chạy:  python scripts/do_tuyen_giadat_osm.py data/giadat_diem.json "…/osm_duong_quangtri.json"
"""
import heapq
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from build_giadat_2026 import khop_ten  # noqa: E402

TUYEN = ROOT / "data" / "giadat_tuyen.json"
O = 0.002            # ô lưới chỉ mục không gian (~200 m)
PHAT_KHAC_TEN = 1.6  # hệ số trọng số cạnh không trùng tên
BAM_TEN, BAM_MAX = 60.0, 150.0


def kx(lat):
    return 111320 * math.cos(math.radians(lat))


KY = 110574


class DoThi:
    def __init__(self, ways, vung):
        """ways: [{n, r, g}]; vung: tập ô lưới cần giữ (quanh các đoạn) để đồ thị gọn."""
        self.adj = defaultdict(list)       # nút → [(nút, mét, id cạnh)]
        self.canh = []                     # id → (a, b, tên)
        self.luoi = defaultdict(list)      # ô → [id cạnh]
        for w in ways:
            ten = " / ".join(t for t in (w.get("n"), w.get("r")) if t)  # tên + số hiệu (ref) để so khớp
            g = [tuple(p) for p in w["g"]]
            if not any((int(x / O), int(y / O)) in vung for x, y in g):
                continue
            for a, b in zip(g, g[1:]):
                if a == b:
                    continue
                d = math.hypot((b[0] - a[0]) * kx(a[1]), (b[1] - a[1]) * KY)
                i = len(self.canh)
                self.canh.append((a, b, ten, d))
                self.adj[a].append((b, d, i))
                self.adj[b].append((a, d, i))
                for cx in range(int(min(a[0], b[0]) / O), int(max(a[0], b[0]) / O) + 1):
                    for cy in range(int(min(a[1], b[1]) / O), int(max(a[1], b[1]) / O) + 1):
                        self.luoi[(cx, cy)].append(i)

    def chieu(self, lon, lat, ten_bang):
        """Điểm chiếu gần nhất → (khoảng cách m, id cạnh, điểm chiếu, t)."""
        cx, cy = int(lon / O), int(lat / O)
        ung = []
        seen = set()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for i in self.luoi.get((cx + dx, cy + dy), ()):
                    if i in seen:
                        continue
                    seen.add(i)
                    a, b, ten, _ = self.canh[i]
                    k = kx(lat)
                    ax, ay = (a[0] - lon) * k, (a[1] - lat) * KY
                    bx, by = (b[0] - lon) * k, (b[1] - lat) * KY
                    vx, vy = bx - ax, by - ay
                    L = vx * vx + vy * vy
                    t = max(0.0, min(1.0, -(ax * vx + ay * vy) / L)) if L else 0.0
                    d = math.hypot(ax + t * vx, ay + t * vy)
                    p = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
                    ung.append((d, i, p, t, khop_ten(ten_bang, ten) >= 0.6 if ten else False))
        if not ung:
            return None
        trung = [u for u in ung if u[4] and u[0] <= BAM_TEN]
        u = min(trung or ung)
        return u[:4] if u[0] <= BAM_MAX else None

    def duong_di(self, s, e, ten_bang, gioi_han):
        """Dijkstra giữa hai điểm chiếu s, e (dạng trả về của chieu)."""
        ds, i_s, ps, ts = s
        de, i_e, pe, te = e
        trong_so = {}

        def w(i):
            if i not in trong_so:
                ten = self.canh[i][2]
                trong_so[i] = 1.0 if ten and khop_ten(ten_bang, ten) >= 0.6 else PHAT_KHAC_TEN
            return trong_so[i]

        if i_s == i_e:   # cùng một cạnh
            a, b, ten, d = self.canh[i_s]
            return [ps, pe], abs(te - ts) * d, [(ten, abs(te - ts) * d)]
        a, b, _, d = self.canh[i_s]
        S, E = ("S",), ("E",)
        bat_dau = [(a, ts * d, i_s), (b, (1 - ts) * d, i_s)]
        a2, b2, _, d2 = self.canh[i_e]
        ket_thuc = {a2: te * d2, b2: (1 - te) * d2}
        dist = {S: 0.0}
        prev = {}
        pq = [(0.0, S)]
        best, best_node = math.inf, None
        while pq:
            c, u = heapq.heappop(pq)
            if c > dist.get(u, math.inf) or c > best or c > gioi_han:
                continue
            nb = bat_dau if u == S else [(v, dd, i) for v, dd, i in self.adj[u]]
            for v, dd, i in nb:
                nc = c + dd * w(i)
                if nc < dist.get(v, math.inf):
                    dist[v] = nc
                    prev[v] = (u, i, dd)
                    heapq.heappush(pq, (nc, v))
                    if v in ket_thuc:
                        tong = nc + ket_thuc[v] * w(i_e)
                        if tong < best:
                            best, best_node = tong, v
        if best_node is None:
            return None
        # dựng lại
        path, buoc, u = [best_node], defaultdict(float), best_node
        while u != S:
            pu, i, dd = prev[u]
            buoc[self.canh[i][2]] += dd
            if pu != S:
                path.append(pu)
            u = pu
        path.reverse()
        buoc[self.canh[i_e][2]] += ket_thuc[best_node]
        hinh = [ps] + path + [pe]
        dai = sum(math.hypot((q[0] - p[0]) * kx(p[1]), (q[1] - p[1]) * KY) for p, q in zip(hinh, hinh[1:]))
        return hinh, dai, list(buoc.items())


def main(diem_path, osm_path):
    ds = json.loads(Path(diem_path).read_text(encoding="utf-8"))["doan"]
    osm = json.loads(Path(osm_path).read_text(encoding="utf-8"))
    vung = set()
    for d in ds:
        for la, lo in d["diem"]:
            for dx in range(-8, 9):
                for dy in range(-8, 9):
                    vung.add((int(lo / O) + dx, int(la / O) + dy))
    # đoạn dài: thêm ô dọc đường thẳng nối các điểm
    for d in ds:
        for (la1, lo1), (la2, lo2) in zip(d["diem"], d["diem"][1:]):
            n = int(max(abs(lo2 - lo1), abs(la2 - la1)) / O) + 1
            for k in range(n + 1):
                x, y = lo1 + (lo2 - lo1) * k / n, la1 + (la2 - la1) * k / n
                for dx in range(-8, 9):
                    for dy in range(-8, 9):
                        vung.add((int(x / O) + dx, int(y / O) + dy))
    g = DoThi(osm["ways"], vung)
    print(f"Đồ thị: {len(g.adj)} nút, {len(g.canh)} cạnh")
    kq = json.loads(TUYEN.read_text(encoding="utf-8")) if TUYEN.exists() else {}
    dem = defaultdict(int)
    for d in ds:
        pts = d["diem"]
        if len(pts) < 2:
            continue
        ten = d.get("duong") or ""
        chieu = [g.chieu(lo, la, ten) for la, lo in pts]
        if any(c is None for c in chieu):
            kq.setdefault(d["id"], {})["osm_ten"] = {"loi": "XaDuong"}
            dem["xa_duong"] += 1
            continue
        hinh, dai, buoc = [], 0.0, defaultdict(float)
        ok = True
        for s, e in zip(chieu, chieu[1:]):
            thang = math.hypot((e[2][0] - s[2][0]) * kx(s[2][1]), (e[2][1] - s[2][1]) * KY)
            r = g.duong_di(s, e, ten, gioi_han=max(3 * thang * PHAT_KHAC_TEN, 1500))
            if r is None:
                ok = False
                break
            h, dd, bb = r
            hinh += h if not hinh else h[1:]
            dai += dd
            for k, v in bb:
                buoc[k] += v
        if not ok:
            kq.setdefault(d["id"], {})["osm_ten"] = {"loi": "NoRoute"}
            dem["khong_tuyen"] += 1
            continue
        kq.setdefault(d["id"], {})["osm_ten"] = {
            "toa_do": [[round(x, 6), round(y, 6)] for x, y in hinh], "dai": round(dai, 1),
            "bam": [round(c[0], 1) for c in chieu], "buoc": [[k, round(v)] for k, v in buoc.items()]}
        dem["ok"] += 1
    TUYEN.write_text(json.dumps(kq, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(dict(dem))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
