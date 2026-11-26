from functions.parse import parse_coordinates, parse_wgs84


# ---------- parse_coordinates (VN-2000) ----------

def test_stt_x_y_h():
    pts, errors = parse_coordinates("1 1850000 520000 10")
    assert pts == [["1", 1850000.0, 520000.0, 10.0]]
    assert errors == []


def test_dong_trong_khong_lam_hong():
    pts, _ = parse_coordinates("1 1850000 520000 10\n\n2 1850010 520010 10")
    assert [p[0] for p in pts] == ["1", "2"]


def test_dinh_dang_N_E():
    pts, _ = parse_coordinates("N01850000 E00520000")
    assert pts[0][1:3] == [1850000.0, 520000.0]


def test_loai_diem_ngoai_mien():
    pts, errors = parse_coordinates("1 100 200 0")
    assert pts == []
    assert len(errors) == 1


# ---------- parse_wgs84 ----------

def test_wgs84_lat_lon_khong_co_h():
    """Lỗi cũ: thiếu H thì vĩ độ điểm sau bị đọc nhầm thành H."""
    pts, errors = parse_wgs84("16.70 106.60\n16.71 106.61")
    assert pts == [["1", 16.70, 106.60, 0.0], ["2", 16.71, 106.61, 0.0]]
    assert errors == []


def test_wgs84_co_h_va_ten():
    pts, _ = parse_wgs84("M1 16.70 106.60 12.5\nM2, 16.71, 106.61")
    assert pts == [["M1", 16.70, 106.60, 12.5], ["M2", 16.71, 106.61, 0.0]]


def test_wgs84_bao_loi_dong_sai():
    pts, errors = parse_wgs84("16.70 106.60\nabc\n95 106.6")
    assert len(pts) == 1
    assert len(errors) == 2
