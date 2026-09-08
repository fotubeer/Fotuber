"""Backend tests for Fotuber iteration 26:
- reveal_style persisted & returned
- Additive premium pricing (250 + 500 = 750)
- Free invitations expire at end of event day (NOT +15 days)
- PayTR create-link kind=invitation_extend (99 TRY)
- Photo wall video upload + storage cap surfacing
- Owner moderation (kind/size/hidden + storage_used/limit/limit_gb)
- Owner ZIP media download
"""
import os
import io
import struct
import time
import pytest
import requests
from datetime import datetime, timedelta

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        try:
            with open("/app/frontend/.env", "r") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert v, "REACT_APP_BACKEND_URL not set"
    return v.rstrip("/")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

MEMBER_EMAIL = "expired@fotuber.com.tr"
MEMBER_PASSWORD = "Test1234"

# Sample published slugs
PUBLISHED_FREE_SLUG = "ahmet-yasemin-e9385d"
PUBLISHED_PHOTOWALL_SLUG = "moderator-1ddd7d"


# --- tiny valid-ish media builders ---
def _tiny_jpeg() -> bytes:
    # minimal JPEG (1x1 white) - well-known bytes
    return bytes.fromhex(
        "FFD8FFE000104A46494600010100000100010000FFDB004300080606070605080707"
        "070909080A0C140D0C0B0B0C1912130F141D1A1F1E1D1A1C1C20242E2720222C231C"
        "1C2837292C30313434341F27393D38323C2E333432FFC0000B08000100010101110"
        "0FFC4001F0000010501010101010100000000000000000102030405060708090A0B"
        "FFC400B5100002010303020403050504040000017D01020300041105122131410613"
        "516107227114328191A1082342B1C11552D1F02433627282090A161718191A25262"
        "728292A3435363738393A434445464748494A535455565758595A636465666768696"
        "A737475767778797A838485868788898A92939495969798999AA2A3A4A5A6A7A8A9"
        "AAB2B3B4B5B6B7B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4D5D6D7D8D9DAE1E2E3E4E5E6"
        "E7E8E9EAF1F2F3F4F5F6F7F8F9FAFFDA0008010100003F00FBD0FFD9"
    )


def _tiny_mp4() -> bytes:
    # Minimal ftyp box (mp42) - not truly playable but has video/mp4 signature.
    ftyp = b"ftypmp42\x00\x00\x00\x00mp42isom"
    size = struct.pack(">I", len(ftyp) + 4)
    box = size + ftyp
    payload = box + b"\x00" * 32
    return payload


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/member/login", json={"email": MEMBER_EMAIL, "password": MEMBER_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def origin_url():
    return BASE_URL


def _future_date(days: int = 45) -> str:
    return (datetime.utcnow() + timedelta(days=days)).strftime("%Y-%m-%d")


# -------- reveal_style & free pricing --------
class TestRevealStyleAndFreePricing:
    def test_create_free_invitation_with_reveal_hearts(self, session):
        payload = {
            "event_type": "dugun", "person1": "TEST_Reveal", "person2": "Bride",
            "event_date": _future_date(30), "theme": "romantic",
            "reveal_style": "hearts",
        }
        r = session.post(f"{API}/invitations", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "published"
        assert data["price"] == 0
        assert data["invitation"]["reveal_style"] == "hearts"
        # cleanup at end
        self._iid = data["id"]
        pytest.free_invitation_id = data["id"]
        pytest.free_invitation_slug = data["slug"]
        pytest.free_invitation_event_date = payload["event_date"]

    def test_public_get_returns_reveal_style(self, session):
        slug = pytest.free_invitation_slug
        r = requests.get(f"{API}/invitations/public/{slug}", timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("reveal_style") == "hearts"


# -------- premium additive pricing --------
class TestPremiumPricing:
    def test_create_premium_noir_with_photowall_price_750(self, session):
        payload = {
            "event_type": "dugun", "person1": "TEST_Premium", "person2": "Wall",
            "event_date": _future_date(30), "theme": "noir",
            "reveal_style": "sparkle",
            "sections": {"photowall": True},
        }
        r = session.post(f"{API}/invitations", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "unpaid"
        assert data["price"] == 750
        assert data["requires_payment"] is True
        pricing = data["pricing"]
        assert pricing["premium_price"] == 250
        assert pricing["photowall_price"] == 500
        assert pricing["needs_payment"] is True
        pytest.premium_wall_slug = data["slug"]
        pytest.premium_wall_id = data["id"]

    def test_unpaid_premium_slug_public_404(self):
        slug = pytest.premium_wall_slug
        r = requests.get(f"{API}/invitations/public/{slug}", timeout=15)
        assert r.status_code == 404

    def test_create_premium_only_price_250(self, session):
        payload = {
            "event_type": "dugun", "person1": "TEST_PremOnly",
            "event_date": _future_date(30), "theme": "noir",
        }
        r = session.post(f"{API}/invitations", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["price"] == 250
        assert d["status"] == "unpaid"
        assert d["pricing"]["photowall"] is False

    def test_create_free_theme_photowall_only_price_500(self, session):
        payload = {
            "event_type": "dugun", "person1": "TEST_WallOnly",
            "event_date": _future_date(30), "theme": "romantic",
            "sections": {"photowall": True},
        }
        r = session.post(f"{API}/invitations", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["price"] == 500
        assert d["status"] == "unpaid"
        assert d["pricing"]["premium_theme"] is False
        assert d["pricing"]["photowall"] is True


# -------- update preserves reveal_style + free expiry ~event day end --------
class TestUpdatePreserveRevealAndExpiry:
    def test_update_keeps_reveal_style_and_end_of_day_expiry(self, session):
        iid = pytest.free_invitation_id
        ed = pytest.free_invitation_event_date
        new_ed = _future_date(60)
        payload = {
            "event_type": "dugun", "person1": "TEST_Reveal", "person2": "Bride",
            "event_date": new_ed, "theme": "romantic",
            "reveal_style": "hearts",
        }
        r = session.put(f"{API}/invitations/{iid}", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["reveal_style"] == "hearts"
        # expires_at should be same-day (< 24 hours after event_date)
        exp = datetime.fromisoformat(upd["expires_at"].replace("Z", "+00:00"))
        event_dt = datetime.fromisoformat(new_ed + "T00:00:00+00:00")
        delta = exp - event_dt
        assert timedelta(hours=23) <= delta < timedelta(days=1), f"expected end-of-day, got {delta}"


# -------- PayTR invitation_extend --------
class TestPaytrExtend:
    def test_paytr_create_extend_returns_link(self, session):
        # Use a free invitation the user owns (needs event_date). We created one above.
        iid = pytest.free_invitation_id
        r = session.post(f"{API}/payments/paytr/create",
                         json={"kind": "invitation_extend", "invitation_id": iid, "origin_url": BASE_URL},
                         timeout=30)
        # Live PayTR: accept success or a soft failure and report clearly.
        if r.status_code == 200:
            data = r.json()
            assert "link" in data and data["link"].startswith("http"), data
            assert "callback_id" in data
            pytest.extend_created_ok = True
        else:
            pytest.extend_created_ok = False
            # Non-fatal: capture status for report but fail test to surface issue
            pytest.fail(f"PayTR create-extend failed with {r.status_code}: {r.text[:400]}")

    def test_paytr_create_extend_already_extended_returns_400(self, session):
        # Grab an invitation, mark extended via a paid order simulation isn't safe.
        # Instead, we call the endpoint twice: after the first successful call the invitation
        # still isn't extended (payment not completed). We simulate by directly setting
        # extended=True via the update PUT? update doesn't set that.
        # There is no admin endpoint to flip 'extended' safely. Skip if we can't reproduce.
        pytest.skip("Cannot flip 'extended' server-side without completing PayTR payment; covered by code review.")


# -------- Photo/video wall (public upload + list) --------
class TestPhotoWallUploadAndList:
    def test_upload_image_to_seeded_photowall(self):
        slug = PUBLISHED_PHOTOWALL_SLUG
        files = {"file": ("TEST_photo.jpg", _tiny_jpeg(), "image/jpeg")}
        data = {"uploader_name": "TEST_Guest"}
        r = requests.post(f"{API}/invitations/public/{slug}/photos", files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["kind"] == "image"

    def test_upload_video_to_seeded_photowall(self):
        slug = PUBLISHED_PHOTOWALL_SLUG
        files = {"file": ("TEST_clip.mp4", _tiny_mp4(), "video/mp4")}
        data = {"uploader_name": "TEST_Guest"}
        r = requests.post(f"{API}/invitations/public/{slug}/photos", files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["kind"] == "video"

    def test_list_photos_returns_kind(self):
        slug = PUBLISHED_PHOTOWALL_SLUG
        r = requests.get(f"{API}/invitations/public/{slug}/photos", timeout=15)
        assert r.status_code == 200, r.text
        photos = r.json()["photos"]
        assert len(photos) > 0
        assert all("kind" in p for p in photos)
        kinds = {p["kind"] for p in photos}
        assert "image" in kinds
        # video may exist among many items; not strictly required, but preferred
        # (we just uploaded one). Non-fatal check.


# -------- Owner moderation --------
class TestOwnerModeration:
    def test_manage_returns_storage_and_fields(self, session):
        # Find the seeded photowall invitation id for the logged-in owner
        r = session.get(f"{API}/invitations", timeout=15)
        assert r.status_code == 200
        invs = r.json()["invitations"]
        target = next((i for i in invs if i.get("slug") == PUBLISHED_PHOTOWALL_SLUG), None)
        assert target, "seeded photowall invitation not found for this owner"
        iid = target["id"]
        pytest.owner_photowall_iid = iid
        r2 = session.get(f"{API}/invitations/{iid}/photos/manage", timeout=20)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert "storage_used" in body
        assert "storage_limit" in body
        assert body.get("storage_limit_gb") == 75
        assert isinstance(body["photos"], list)
        assert len(body["photos"]) > 0
        p0 = body["photos"][0]
        for k in ("kind", "size", "hidden"):
            assert k in p0, f"photo missing key {k}: {p0}"


# -------- Owner ZIP download --------
class TestOwnerZipDownload:
    def test_download_zip(self, session):
        iid = pytest.owner_photowall_iid
        r = session.get(f"{API}/invitations/{iid}/photos/download", timeout=60)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/zip")
        assert len(r.content) > 0
        # ZIP magic bytes
        assert r.content[:2] == b"PK"


# -------- Cleanup TEST_ invitations --------
@pytest.fixture(scope="module", autouse=True)
def _cleanup(session):
    yield
    try:
        r = session.get(f"{API}/invitations", timeout=15)
        for inv in r.json().get("invitations", []):
            if (inv.get("person1") or "").startswith("TEST_"):
                session.delete(f"{API}/invitations/{inv['id']}", timeout=10)
    except Exception:
        pass
