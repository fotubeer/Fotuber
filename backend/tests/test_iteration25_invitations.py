"""Iteration 25: Print PDF, premium pricing gating, PayTR invitation, photo wall."""
import os, io, uuid, time
import pytest
import requests

def _load_backend_url():
    v = os.environ.get('REACT_APP_BACKEND_URL')
    if v:
        return v.rstrip('/')
    # fallback: read frontend .env
    try:
        for line in open('/app/frontend/.env'):
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip().rstrip('/')
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def member():
    email = f"test_iter25_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/member/register", json={
        "email": email, "password": "TestPass1234", "full_name": "Test User",
        "phone": "+905551112233", "kvkk_accepted": True, "sms_consent": True, "email_consent": True,
    }, timeout=30)
    assert r.status_code in (200, 201), f"register: {r.status_code} {r.text}"
    j = r.json()
    token = j.get("access_token") or j.get("token") or j.get("token_data", {}).get("access_token")
    assert token, f"no token in {j}"
    return {"email": email, "token": token}


@pytest.fixture()
def auth_headers(member):
    return {"Authorization": f"Bearer {member['token']}"}


# ---- Print PDF ----
class TestPrintPdf:
    def test_options(self):
        r = requests.get(f"{API}/invitations/print-options", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "sizes" in j and "symbols" in j and "event_types" in j
        assert len(j["sizes"]) >= 4
        assert set(["heart", "rings", "floral", "star", "crescent", "none"]).issubset(set(j["symbols"]))

    def test_missing_person1_returns_400(self):
        r = requests.post(f"{API}/invitations/print-pdf", json={
            "person1": "", "event_date": "2027-06-01",
        }, timeout=30)
        assert r.status_code == 400

    @pytest.mark.parametrize("size", ["a5", "a6", "10x15", "dl"])
    @pytest.mark.parametrize("symbol", ["heart", "rings", "floral", "star", "crescent", "none"])
    def test_pdf_sizes_symbols(self, size, symbol):
        payload = {
            "person1": "Ayşe", "person2": "Mehmet", "event_type": "dugun",
            "event_date": "2027-06-01", "event_time": "18:00",
            "venue_name": "Hilton", "venue_address": "İstanbul",
            "message": "Şerefimize", "size": size, "symbol": symbol,
            "bg_color": "#fff8f0", "accent_color": "#c9a24a", "text_color": "#2b2b2b",
        }
        r = requests.post(f"{API}/invitations/print-pdf", json=payload, timeout=60)
        assert r.status_code == 200, f"{size}/{symbol}: {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF", f"not a PDF: {r.content[:20]}"
        assert len(r.content) > 500


# ---- Pricing / gating ----
class TestPricingGating:
    def test_free_theme_published(self, auth_headers):
        payload = {
            "event_type": "dugun", "person1": "Ali", "person2": "Zeynep",
            "event_date": "2027-07-15", "theme": "romantic",
            "sections": {"photowall": False},
        }
        r = requests.post(f"{API}/invitations", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "published"
        assert j["requires_payment"] is False
        assert j["price"] == 0
        slug = j["slug"]
        # public viewable
        r2 = requests.get(f"{API}/invitations/public/{slug}", timeout=15)
        assert r2.status_code == 200

    def test_premium_theme_unpaid_and_hidden(self, auth_headers):
        payload = {
            "event_type": "dugun", "person1": "Deniz",
            "event_date": "2027-06-10", "theme": "noir",
            "sections": {"photowall": False},
        }
        r = requests.post(f"{API}/invitations", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j["status"] == "unpaid"
        assert j["requires_payment"] is True
        assert j["price"] == 200
        slug = j["slug"]
        r2 = requests.get(f"{API}/invitations/public/{slug}", timeout=15)
        assert r2.status_code == 404
        return j["id"]

    def test_photowall_price_750(self, auth_headers):
        payload = {
            "event_type": "dugun", "person1": "Elif",
            "event_date": "2027-06-05", "theme": "sky",
            "sections": {"photowall": True},
        }
        r = requests.post(f"{API}/invitations", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j["requires_payment"] is True
        assert j["price"] == 750
        assert j["status"] == "unpaid"

    def test_server_ignores_client_price(self, auth_headers):
        # Sending fake price should not affect server pricing
        payload = {
            "event_type": "dugun", "person1": "Hakan",
            "event_date": "2027-10-01", "theme": "noir",
            "sections": {"photowall": False},
            "price": 1,  # client attempt to override
        }
        r = requests.post(f"{API}/invitations", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j["price"] == 200


# ---- PayTR create ----
class TestPaytrInvitation:
    def test_paytr_create_premium(self, auth_headers):
        # create an unpaid premium invitation
        r = requests.post(f"{API}/invitations", json={
            "event_type": "dugun", "person1": "Selim",
            "event_date": "2027-11-11", "theme": "royal",
        }, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        inv_id = r.json()["id"]

        r2 = requests.post(f"{API}/payments/paytr/create", json={
            "kind": "invitation", "invitation_id": inv_id,
            "origin_url": BASE_URL,
        }, headers=auth_headers, timeout=60)
        assert r2.status_code == 200, r2.text
        j = r2.json()
        assert j.get("callback_id")
        assert j.get("link") and ("paytr" in j["link"].lower() or j["link"].startswith("http"))

    def test_paytr_create_free_400(self, auth_headers):
        r = requests.post(f"{API}/invitations", json={
            "event_type": "dugun", "person1": "Barış",
            "event_date": "2027-12-01", "theme": "romantic",
        }, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        inv_id = r.json()["id"]
        r2 = requests.post(f"{API}/payments/paytr/create", json={
            "kind": "invitation", "invitation_id": inv_id, "origin_url": BASE_URL,
        }, headers=auth_headers, timeout=30)
        assert r2.status_code == 400
        # accepts either "free/no payment needed" or "already published" messages
        low = r2.text.lower()
        assert any(k in low for k in ["ücretsiz", "free", "ödeme", "yayın"])

    def test_paytr_create_other_user_404(self, auth_headers):
        # register second user
        email2 = f"test_iter25b_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/member/register", json={
            "email": email2, "password": "TestPass1234", "full_name": "U2",
            "phone": "+905551114455", "kvkk_accepted": True, "sms_consent": True, "email_consent": True,
        }, timeout=30)
        assert r.status_code in (200, 201)
        token2 = r.json().get("access_token") or r.json().get("token")
        # create premium invitation as user1
        r = requests.post(f"{API}/invitations", json={
            "event_type": "dugun", "person1": "Kaya",
            "event_date": "2027-12-15", "theme": "ocean",
        }, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        inv_id = r.json()["id"]
        # try paytr create as user2
        r2 = requests.post(f"{API}/payments/paytr/create", json={
            "kind": "invitation", "invitation_id": inv_id, "origin_url": BASE_URL,
        }, headers={"Authorization": f"Bearer {token2}"}, timeout=30)
        assert r2.status_code == 404


# ---- Photo wall ----
class TestPhotoWall:
    SLUG = "premium-demo-foto"

    def _tiny_jpeg(self):
        # minimal valid JPEG
        return (b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
                b'\xff\xdb\x00C\x00' + b'\x08' * 64 +
                b'\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00'
                b'\xff\xc4\x00\x14\x00\x01' + b'\x00' * 15 + b'\x00'
                b'\xff\xc4\x00\x14\x10\x01' + b'\x00' * 15 + b'\x00'
                b'\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xd2\xcf \xff\xd9')

    def test_upload_and_list(self):
        # verify invitation exists / published
        r = requests.get(f"{API}/invitations/public/{self.SLUG}", timeout=15)
        assert r.status_code == 200, f"seed invitation missing: {r.status_code}"

        files = {"file": ("test.jpg", self._tiny_jpeg(), "image/jpeg")}
        data = {"uploader_name": "TEST_Guest"}
        r = requests.post(f"{API}/invitations/public/{self.SLUG}/photos",
                          files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        pid = r.json().get("id")
        assert pid

        # list
        r2 = requests.get(f"{API}/invitations/public/{self.SLUG}/photos", timeout=15)
        assert r2.status_code == 200
        photos = r2.json().get("photos", [])
        assert any(p["id"] == pid for p in photos)

        # image content
        r3 = requests.get(f"{API}/invitations/photo/{pid}", timeout=15)
        assert r3.status_code == 200
        assert r3.headers.get("content-type", "").startswith("image")
        assert len(r3.content) > 20
