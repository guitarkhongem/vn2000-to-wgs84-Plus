"""Test script bảng giá đất 2026 (scripts/build_giadat_2026.py) — không cần file Excel gốc."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
pytest.importorskip("openpyxl")
import build_giadat_2026 as G  # noqa: E402


def test_link_google_maps_dang_ma_hoa():
    url = ("https://www.google.com/maps/dir/17.464260255670627%2C%20106.62725939063543/"
           "17.46379460886504%2C%20106.62419343192809")
    assert G.diem_tu_link(url) == [(17.464260255670627, 106.62725939063543), (17.46379460886504, 106.62419343192809)]


def test_link_co_diem_giua_va_tham_so():
    url = "https://www.google.com/maps/dir/16.764148,+107.248629/16.773570,+107.252881/16.779423,+107.230993/@16.77,107.23,4386m/data=!3m2"
    assert len(G.diem_tu_link(url)) == 3


def test_link_rut_gon_dung_bang_giai():
    rg = {"https://maps.app.goo.gl/abc": "https://www.google.com/maps/dir/16.8,107.1/16.81,107.11"}
    assert G.diem_tu_link("https://maps.app.goo.gl/abc", rg) == [(16.8, 107.1), (16.81, 107.11)]
    assert G.diem_tu_link("https://maps.app.goo.gl/khongco", rg) is None


def test_bo_diem_ngoai_tinh_va_gia_tri_khong_phai_link():
    assert G.diem_tu_link("https://www.google.com/maps/dir/10.0,106.0/10.1,106.1") is None
    assert G.diem_tu_link("Chưa gắn vị trí") is None
    assert G.diem_tu_link(None) is None


def test_khoang_cach_gan_dung():
    # 0,001° vĩ độ ≈ 110,6 m
    assert G.khoang_cach((16.0, 106.0), (16.001, 106.0)) == pytest.approx(110.6, abs=0.5)


def test_don_gian_giu_hinh_dang():
    line = [(106.0, 16.0), (106.00001, 16.000001), (106.00002, 16.0), (106.001, 16.001)]
    out = G.don_gian(line)
    assert out[0] == [106.0, 16.0] and out[-1] == [106.001, 16.001]
    assert len(out) < len(line)


def test_doi_chieu_ten_duong():
    assert G.khop_ten("Lê Duẩn (phải tuyến)", "Đường Lê Duẩn") == 1.0
    assert G.khop_ten("Quốc lộ 9", "QL9") == 1.0
    assert G.khop_ten("Trần Hưng Đạo", "Lý Thường Kiệt") == 0.0
    assert G.khop_ten("Quốc lộ 1A", "Quốc lộ 1 / QL.1") == 1.0      # QL1A = QL1, ref "QL.1"
    assert G.khop_ten("Quốc lộ 9D", "QL.9") == 0.0                   # 9D là tuyến khác QL9
    assert G.khop_ten("ĐH 48B (đường Trừ lấu)", "ĐH.48B") == 1.0
    trung, co_ten = G.ty_le_khop("Trần Hưng Đạo", [["Trần Hưng Đạo", 800], ["", 100], ["Lý Thường Kiệt", 100]])
    assert trung == pytest.approx(0.8) and co_ten == pytest.approx(0.9)


def _tuyen(toa_do, dai, bam, buoc):
    return {"toa_do": toa_do, "dai": dai, "bam": bam, "buoc": buoc}


def test_chon_tuyen_uu_tien_trung_ten_duong():
    pts = [(16.0, 106.0), (16.0, 106.003)]           # ~320 m theo hướng Đông
    di_bo = _tuyen([[106.0, 16.0], [106.0015, 16.001], [106.003, 16.0]], 400, [3, 4], [["Đường khác", 400]])
    o_to = _tuyen([[106.0, 16.0], [106.003, 16.0]], 330, [3, 4], [["Lê Lợi", 330]])
    hinh, info = G.chon_tuyen({"di_bo": di_bo, "o_to": o_to}, pts, "Lê Lợi")
    assert info["cl"] == "tot" and info["ho_so"] == "o_to" and info["khop"] == 1.0
    hinh, info = G.chon_tuyen({"di_bo": di_bo}, pts, "Lê Lợi")      # chỉ có tuyến sai tên → xem lại
    assert info["cl"] == "xem_lai"


def test_chon_tuyen_khong_do_duoc_noi_thang():
    pts = [(16.0, 106.0), (16.0, 106.003)]
    hinh, info = G.chon_tuyen({"di_bo": {"loi": "NoRoute"}}, pts, "Lê Lợi")
    assert info["cl"] == "thang" and hinh == [[106.0, 16.0], [106.003, 16.0]]


def test_duong_khong_ten_chi_xet_hinh_hoc():
    pts = [(16.0, 106.0), (16.0, 106.003)]
    c = _tuyen([[106.0, 16.0], [106.003, 16.0]], 330, [3, 4], [["", 330]])   # đường thôn không tên trên OSM
    assert G.chon_tuyen({"di_bo": c}, pts, "Đường thôn 3")[1]["cl"] == "tot"
