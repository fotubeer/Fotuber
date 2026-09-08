"""Backend tests for the new features:
  1. Photo Selection Albums (create → upload → public view → select → admin view selections)
  2. Guest QR Uploads (event → public info → upload with quota → zip → delete)
  3. Product Options (album/canvas admin CRUD + public print_sizes)
  4. Cash register discrepancy report
  5. Settings SEO / typography / analytics persistence
Tests are idempotent and self-cleaning.
"""
import io
import os
import time
import uuid
import zipfile
import pytest
import requests
from PIL import Image

# Load REACT_APP_BACKEND_URL from frontend .env (pytest process doesn't inherit shell env).
def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    envp = "/app/frontend/.env"
    if os.path.exists(envp):
        for line in open(envp):
            if line.strip().startswith("REACT_APP_BACKEND_URL="):
                return line.strip().split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url().rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASSWORD = "FTB.2024"


# --------------------------------------------------------------------- helpers
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


def _register_customer():
    """Create a fresh TEST_ customer and return (token, user_dict)."""
    uniq = uuid.uuid4().hex[:10]
    payload = {
        "name": "TESTCust",
        "surname": uniq,
        "email": f"test_{uniq}@example.com",
        "phone": "05551112233",
        "password": "Passw0rd!",
        "kvkk_consent": True,
        "marketing_consent": False,
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j["user"], payload["password"]


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _make_jpg_bytes(name="DSC00001", w=1200, h=800, color=(200, 20, 20)):
    img = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return buf


# --------------------------------------------------------------------- fixtures
@pytest.fixture(scope="session")
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def customer_token():
    tok, user, _ = _register_customer()
    yield tok
    # cleanup happens via admin — but we don't expose user-deletion via API, so leave it.


@pytest.fixture(scope="session")
def customer_user(customer_token):
    r = requests.get(f"{API}/auth/me", headers=_bearer(customer_token), timeout=15)
    assert r.status_code == 200
    return r.json()


# --------------------------------------------------------------------- basics
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_admin_login(self):
        r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "admin"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert isinstance(data["token"], str) and len(data["token"]) > 20


# --------------------------------------------------------------------- photo albums
class TestPhotoAlbums:
    album_id = None
    share_token = None
    photo_ids = []

    def test_01_create_album(self, admin_token):
        payload = {
            "couple_names": "TEST_Ali & Ayşe",
            "event_date": "2026-06-15",
            "notes": "TEST album",
        }
        r = requests.post(f"{API}/admin/photo-albums", json=payload, headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["couple_names"] == payload["couple_names"]
        assert j["photo_count"] == 0
        assert isinstance(j["share_token"], str) and len(j["share_token"]) >= 10
        assert "id" in j
        TestPhotoAlbums.album_id = j["id"]
        TestPhotoAlbums.share_token = j["share_token"]

    def test_02_list_albums(self, admin_token):
        r = requests.get(f"{API}/admin/photo-albums", headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 200
        assert any(a["id"] == TestPhotoAlbums.album_id for a in r.json())

    def test_03_upload_photos(self, admin_token):
        # Upload 2 files. photo code should be derived from filename (upper, no ext).
        files = [
            ("files", ("DSC00123.jpg", _make_jpg_bytes("DSC00123"), "image/jpeg")),
            ("files", ("dsc00124.JPEG", _make_jpg_bytes("dsc00124"), "image/jpeg")),
        ]
        r = requests.post(
            f"{API}/admin/photo-albums/{TestPhotoAlbums.album_id}/photos",
            files=files, headers=_bearer(admin_token), timeout=30,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["added"] == 2
        photos = j["photos"]
        assert len(photos) == 2
        codes = sorted([p["code"] for p in photos])
        assert codes == ["DSC00123", "DSC00124"], f"codes should be uppercase without ext: {codes}"
        TestPhotoAlbums.photo_ids = [p["id"] for p in photos]

    def test_04_get_album_detail_photo_count(self, admin_token):
        r = requests.get(
            f"{API}/admin/photo-albums/{TestPhotoAlbums.album_id}",
            headers=_bearer(admin_token), timeout=15,
        )
        assert r.status_code == 200
        j = r.json()
        assert j["album"]["photo_count"] == 2
        assert len(j["photos"]) == 2

    def test_05_public_requires_auth(self):
        # No auth header at all
        r = requests.get(f"{API}/photo-albums/{TestPhotoAlbums.share_token}", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_06_public_get_album_authenticated(self, customer_token):
        r = requests.get(
            f"{API}/photo-albums/{TestPhotoAlbums.share_token}",
            headers=_bearer(customer_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["album"]["id"] == TestPhotoAlbums.album_id
        assert len(j["photos"]) == 2
        assert j["print_sizes"] == ["10x15", "13x18", "15x21", "20x30", "30x40"]
        # storage_path must be excluded on public payload
        assert all("storage_path" not in p for p in j["photos"])

    def test_07_public_file_download(self, customer_token):
        pid = TestPhotoAlbums.photo_ids[0]
        r = requests.get(
            f"{API}/photo-albums/{TestPhotoAlbums.share_token}/file/{pid}",
            headers=_bearer(customer_token), timeout=15,
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 100

    def test_08_submit_selections(self, customer_token):
        pid1, pid2 = TestPhotoAlbums.photo_ids
        payload = {
            "selections": [
                {"photo_id": pid1, "photo_code": "DSC00123", "product_type": "print", "product_variant": "20x30", "quantity": 2, "notes": ""},
                {"photo_id": pid2, "photo_code": "DSC00124", "product_type": "album", "product_variant": "30x30", "quantity": 1, "notes": "gift"},
            ],
            "customer_note": "TEST selection",
        }
        r = requests.post(
            f"{API}/photo-albums/{TestPhotoAlbums.share_token}/selections",
            json=payload, headers=_bearer(customer_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        assert j["count"] == 2

    def test_09_submit_selections_overwrites(self, customer_token):
        pid1 = TestPhotoAlbums.photo_ids[0]
        payload = {
            "selections": [
                {"photo_id": pid1, "photo_code": "DSC00123", "product_type": "canvas", "product_variant": "50x70", "quantity": 1, "notes": "second submit"},
            ],
            "customer_note": "TEST overwrite",
        }
        r = requests.post(
            f"{API}/photo-albums/{TestPhotoAlbums.share_token}/selections",
            json=payload, headers=_bearer(customer_token), timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["count"] == 1

    def test_10_admin_view_selections(self, admin_token, customer_user):
        r = requests.get(
            f"{API}/admin/photo-albums/{TestPhotoAlbums.album_id}/selections",
            headers=_bearer(admin_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["count"] == 1, f"expected 1 after overwrite, got {j['count']}"
        by_user = j["by_user"]
        assert len(by_user) == 1
        u = by_user[0]
        assert u["user_id"] == customer_user["id"]
        items = u["items"]
        assert items[0]["photo_code"] == "DSC00123"
        assert items[0]["product_type"] == "canvas"
        assert items[0]["product_variant"] == "50x70"

    def test_11_delete_photo(self, admin_token):
        pid = TestPhotoAlbums.photo_ids[1]  # DSC00124
        r = requests.delete(
            f"{API}/admin/photo-albums/{TestPhotoAlbums.album_id}/photos/{pid}",
            headers=_bearer(admin_token), timeout=15,
        )
        assert r.status_code == 200
        # Verify count decremented
        r2 = requests.get(
            f"{API}/admin/photo-albums/{TestPhotoAlbums.album_id}",
            headers=_bearer(admin_token), timeout=15,
        )
        assert r2.json()["album"]["photo_count"] == 1
        assert len(r2.json()["photos"]) == 1

    def test_99_delete_album(self, admin_token):
        r = requests.delete(
            f"{API}/admin/photo-albums/{TestPhotoAlbums.album_id}",
            headers=_bearer(admin_token), timeout=15,
        )
        assert r.status_code == 200
        r2 = requests.get(
            f"{API}/admin/photo-albums/{TestPhotoAlbums.album_id}",
            headers=_bearer(admin_token), timeout=15,
        )
        assert r2.status_code == 404


# --------------------------------------------------------------------- product options
class TestProductOptions:
    canvas_id = None
    album_id = None

    def test_01_create_canvas(self, admin_token):
        p = {"kind": "canvas", "name": "TEST_Kanvas 50x70", "size": "50x70", "price": 1200, "active": True, "sort_order": 1}
        r = requests.post(f"{API}/admin/product-options", json=p, headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["kind"] == "canvas"
        assert j["name"] == "TEST_Kanvas 50x70"
        TestProductOptions.canvas_id = j["id"]

    def test_02_create_album(self, admin_token):
        p = {"kind": "album", "name": "TEST_Klasik Albüm 30x30", "size": "30x30", "price": 3500, "active": True}
        r = requests.post(f"{API}/admin/product-options", json=p, headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 200
        TestProductOptions.album_id = r.json()["id"]

    def test_03_public_list(self):
        r = requests.get(f"{API}/product-options", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["print_sizes"] == ["10x15", "13x18", "15x21", "20x30", "30x40"]
        names = {i["name"] for i in j["items"]}
        assert "TEST_Kanvas 50x70" in names
        assert "TEST_Klasik Albüm 30x30" in names

    def test_04_filter_by_kind(self):
        r = requests.get(f"{API}/product-options?kind=canvas", timeout=15)
        assert r.status_code == 200
        for i in r.json()["items"]:
            assert i["kind"] == "canvas"

    def test_99_cleanup(self, admin_token):
        for oid in [TestProductOptions.canvas_id, TestProductOptions.album_id]:
            if oid:
                requests.delete(f"{API}/admin/product-options/{oid}", headers=_bearer(admin_token), timeout=15)


# --------------------------------------------------------------------- guest events
class TestGuestEvents:
    event_id = None
    upload_token = None

    def test_01_create_event(self, admin_token):
        payload = {
            "name": "TEST_Dugun2026",  # ASCII to avoid header encoding bug (see report)
            "couple_names": "TEST_Ali & Ayse",
            "event_date": "2026-08-15",
            "max_size_per_user_mb": 10,   # keep small to test 413 easily
            "retention_days": 3,
        }
        r = requests.post(f"{API}/admin/guest-events", json=payload, headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["name"] == payload["name"]
        assert isinstance(j["upload_token"], str) and len(j["upload_token"]) >= 8
        assert j["delete_at"], "delete_at should be set"
        assert j["upload_count"] == 0
        TestGuestEvents.event_id = j["id"]
        TestGuestEvents.upload_token = j["upload_token"]

    def test_02_public_info_no_auth(self):
        r = requests.get(f"{API}/guest-events/{TestGuestEvents.upload_token}", timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["name"] == "TEST_Dugun2026"
        assert j["max_size_per_user_mb"] == 10
        assert j["retention_days"] == 3
        assert j["expired"] is False
        # No internal fields
        for internal in ("created_by", "id", "upload_token", "total_size", "upload_count"):
            assert internal not in j, f"public payload leaked internal field: {internal}"

    def test_03_upload_requires_auth(self):
        f = _make_jpg_bytes(w=100, h=100)
        r = requests.post(
            f"{API}/guest-events/{TestGuestEvents.upload_token}/upload",
            files=[("file", ("t.jpg", f, "image/jpeg"))],
            data={"kvkk_accepted": "true"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_04_upload_kvkk_required(self, customer_token):
        f = _make_jpg_bytes(w=100, h=100)
        r = requests.post(
            f"{API}/guest-events/{TestGuestEvents.upload_token}/upload",
            files=[("file", ("t.jpg", f, "image/jpeg"))],
            data={"kvkk_accepted": "false"},
            headers=_bearer(customer_token),
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_05_upload_ok(self, customer_token):
        f = _make_jpg_bytes(w=400, h=300)
        r = requests.post(
            f"{API}/guest-events/{TestGuestEvents.upload_token}/upload",
            files=[("file", ("guest_photo.jpg", f, "image/jpeg"))],
            data={"kvkk_accepted": "true"},
            headers=_bearer(customer_token),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        assert j["size"] > 100
        assert j["remaining"] >= 0

    def test_06_my_usage(self, customer_token):
        r = requests.get(
            f"{API}/guest-events/{TestGuestEvents.upload_token}/my-usage",
            headers=_bearer(customer_token), timeout=15,
        )
        assert r.status_code == 200
        j = r.json()
        assert j["used_files"] == 1
        assert j["used_bytes"] > 100
        assert j["limit_bytes"] == 10 * 1024 * 1024
        assert j["remaining_bytes"] == j["limit_bytes"] - j["used_bytes"]

    def test_07_upload_quota_exceeded(self, customer_token):
        # Create ~11MB payload (limit is 10MB, we already used a little)
        big_img = Image.new("RGB", (5000, 5000), (255, 128, 0))
        buf = io.BytesIO()
        big_img.save(buf, format="JPEG", quality=95)
        # Ensure > 10MB by concatenation trick: send as raw bytes bigger than limit
        raw = buf.getvalue()
        # Pad to > 11MB with junk (still uploadable regardless of format because backend just checks size)
        while len(raw) < 11 * 1024 * 1024:
            raw += os.urandom(256 * 1024)
        r = requests.post(
            f"{API}/guest-events/{TestGuestEvents.upload_token}/upload",
            files=[("file", ("big.bin", io.BytesIO(raw), "application/octet-stream"))],
            data={"kvkk_accepted": "true"},
            headers=_bearer(customer_token),
            timeout=60,
        )
        assert r.status_code == 413, f"expected 413, got {r.status_code}: {r.text[:200]}"

    def test_08_upload_count_incremented(self, admin_token):
        r = requests.get(f"{API}/admin/guest-events/{TestGuestEvents.event_id}", headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["event"]["upload_count"] == 1
        assert len(j["uploads"]) == 1

    def test_09_extend(self, admin_token):
        # Grab current delete_at first
        r0 = requests.get(f"{API}/admin/guest-events/{TestGuestEvents.event_id}", headers=_bearer(admin_token), timeout=15)
        old = r0.json()["event"]["delete_at"]
        r = requests.post(
            f"{API}/admin/guest-events/{TestGuestEvents.event_id}/extend?days=5",
            headers=_bearer(admin_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        new = r.json()["delete_at"]
        assert new != old
        # Verify persistence
        r2 = requests.get(f"{API}/admin/guest-events/{TestGuestEvents.event_id}", headers=_bearer(admin_token), timeout=15)
        assert r2.json()["event"]["delete_at"] == new

    def test_10_download_zip(self, admin_token):
        r = requests.get(
            f"{API}/admin/guest-events/{TestGuestEvents.event_id}/download-zip",
            headers=_bearer(admin_token), timeout=30,
        )
        assert r.status_code == 200
        assert r.headers.get("content-type") == "application/zip"
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        # Validate zip
        z = zipfile.ZipFile(io.BytesIO(r.content))
        names = z.namelist()
        assert len(names) >= 1
        # Should contain a folder with the customer's name
        assert any("guest_photo.jpg" in n for n in names), f"expected guest_photo in {names}"

    def test_99_delete_event(self, admin_token):
        r = requests.delete(f"{API}/admin/guest-events/{TestGuestEvents.event_id}", headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/admin/guest-events/{TestGuestEvents.event_id}", headers=_bearer(admin_token), timeout=15)
        assert r2.status_code == 404


class TestGuestEventTurkishZipBug:
    """Reproduces the Content-Disposition Turkish-char encoding bug in download-zip."""

    def test_zip_with_turkish_event_name_fails(self, admin_token, customer_token):
        payload = {
            "name": "TEST_Düğün 2026",       # ğ, ü — non latin-1 chars
            "couple_names": "TEST_",
            "event_date": "2026-08-15",
            "max_size_per_user_mb": 10,
            "retention_days": 3,
        }
        r = requests.post(f"{API}/admin/guest-events", json=payload, headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 200
        ev = r.json()
        eid, tok = ev["id"], ev["upload_token"]
        try:
            # Upload one small file so zip has something
            f = _make_jpg_bytes(w=200, h=200)
            up = requests.post(
                f"{API}/guest-events/{tok}/upload",
                files=[("file", ("t.jpg", f, "image/jpeg"))],
                data={"kvkk_accepted": "true"},
                headers=_bearer(customer_token), timeout=30,
            )
            assert up.status_code == 200

            r_zip = requests.get(
                f"{API}/admin/guest-events/{eid}/download-zip",
                headers=_bearer(admin_token), timeout=30,
            )
            # BUG: Content-Disposition filename uses raw non-ASCII chars → 500
            # Once fixed with RFC 5987 (filename*=UTF-8''...) this should be 200.
            if r_zip.status_code == 500:
                pytest.xfail(
                    "KNOWN BUG: download-zip 500s when event.name contains non-latin-1 chars "
                    "(Turkish ğ/ü). Fix: encode Content-Disposition filename via RFC 5987."
                )
            assert r_zip.status_code == 200
            assert r_zip.headers.get("content-type") == "application/zip"
        finally:
            requests.delete(f"{API}/admin/guest-events/{eid}", headers=_bearer(admin_token), timeout=15)


# --------------------------------------------------------------------- discrepancy
class TestCashDiscrepancy:
    def test_discrepancy_shape(self, admin_token):
        r = requests.get(
            f"{API}/cash-register/discrepancy?year=2026&month=07",
            headers=_bearer(admin_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        # Note: implementation returns "days" (list); review said "rows" — verify actual keys.
        for k in ("year", "month", "days_with_diff", "total_over", "total_short", "net_diff"):
            assert k in j, f"missing key: {k}. keys={list(j.keys())}"
        assert j["year"] == 2026
        assert j["month"] == 7
        assert isinstance(j["days_with_diff"], list)
        assert isinstance(j["total_over"], (int, float))
        assert isinstance(j["total_short"], (int, float))
        assert isinstance(j["net_diff"], (int, float))


# --------------------------------------------------------------------- settings
class TestSettingsPersistence:
    def test_settings_seo_typography_persist(self, admin_token):
        payload = {
            "seo_title": "TEST Fotuber SEO",
            "seo_description": "TEST desc",
            "seo_keywords": "fotoğraf, düğün",
            "seo_business_type": "PhotographyBusiness",
            "seo_price_range": "₺₺",
            "seo_opening_hours": "Mo-Sa 09:00-19:00",
            "seo_og_image_url": "https://example.com/og.png",
            "google_search_console_verification": "TEST_verify_xyz",
            "google_analytics_id": "G-TEST12345",
            "font_heading": "Playfair Display",
            "font_body": "Inter",
            "font_scale": 1.15,
        }
        r = requests.put(f"{API}/settings", json=payload, headers=_bearer(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        for k, v in payload.items():
            assert j.get(k) == v, f"{k}: expected {v!r}, got {j.get(k)!r}"

        # GET verifies persistence
        r2 = requests.get(f"{API}/settings", timeout=15)
        assert r2.status_code == 200
        got = r2.json()
        for k, v in payload.items():
            assert got.get(k) == v, f"persist {k}: expected {v!r}, got {got.get(k)!r}"
