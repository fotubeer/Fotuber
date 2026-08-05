"""
Backend tests for iteration 22:
- Admin memberships/contacts/export endpoints (admin auth + shapes + CSV)
- Trial-once-per-phone/company on member registration
- PayTR create for monthly + yearly plans
- Feature tracking on paid credit callback (kredi_yukleme)
"""
import os
import uuid
import base64
import hashlib
import hmac
import time
import requests
import pytest

def _load_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    return line.split("=", 1)[1].strip().strip('"')
    except Exception:
        return None
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASSWORD = "FTB.2024"

# PayTR secrets (env)
PAYTR_KEY = os.environ.get("PAYTR_MERCHANT_KEY") or "JaxG8xwP6j47nr1e"
PAYTR_SALT = os.environ.get("PAYTR_MERCHANT_SALT") or "LypfXqSwQiF9YjjY"


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _rand():
    return uuid.uuid4().hex[:10]


def _register_member(s, name="Test User", email=None, phone=None, company=None, password="Test1234"):
    payload = {
        "name": name,
        "full_name": name,
        "email": email or f"TEST_{_rand()}@example.com",
        "phone": phone or f"+9053{int(time.time()*1000) % 100000000:08d}",
        "company_name": company or "",
        "password": password,
    }
    r = s.post(f"{API}/member/register", json=payload)
    return r, payload


# ---------------- Admin auth on admin endpoints ----------------
class TestAdminAuthGuard:
    def test_memberships_requires_admin(self, s):
        r = s.get(f"{API}/admin/memberships")
        assert r.status_code in (401, 403)

    def test_export_requires_admin(self, s):
        r = s.get(f"{API}/admin/export?kind=memberships")
        assert r.status_code in (401, 403)

    def test_member_token_forbidden_on_admin(self, s):
        # register a fresh member and try admin endpoint
        r, _ = _register_member(s, name="Guard User",
                                email=f"TEST_guard_{_rand()}@example.com",
                                phone=f"+9055{_rand()[:8]}", company=f"TESTGUARD_{_rand()}")
        assert r.status_code == 200, r.text
        mt = r.json()["token"]
        h = {"Authorization": f"Bearer {mt}"}
        for path in ("/admin/memberships", "/admin/contacts",
                     "/admin/export?kind=contacts", "/admin/export?kind=memberships"):
            rr = s.get(f"{API}{path}", headers=h)
            assert rr.status_code == 403, f"{path} => {rr.status_code}"


# ---------------- Memberships shape + pricing ----------------
class TestAdminMemberships:
    def test_memberships_shape_and_pricing(self, s, admin_headers):
        r = s.get(f"{API}/admin/memberships", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("members", "groups", "counts", "pricing", "feature_labels"):
            assert k in d
        for k in ("trial", "monthly", "yearly", "expired"):
            assert k in d["groups"] and k in d["counts"]
        assert "total" in d["counts"]
        assert d["pricing"]["monthly"] == 99
        assert d["pricing"]["yearly"] == 899
        # If there are any members, verify a report has all required fields
        if d["members"]:
            m = d["members"][0]
            for key in ("name", "email", "phone", "company_name", "account_type",
                        "status", "plan", "paid_until", "trial_end", "trial_used_before",
                        "ai_credits", "own_gemini_key", "subscription_count",
                        "credit_topup_count", "credits_purchased", "total_spent",
                        "appointment_count", "has_appointment", "features_used",
                        "features_labels"):
                assert key in m, f"missing {key} in member report"

    def test_contacts_shape(self, s, admin_headers):
        r = s.get(f"{API}/admin/contacts", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("members", "customers", "booking_contacts", "counts"):
            assert k in d
        for k in ("members", "customers", "booking_contacts"):
            assert k in d["counts"]

    def test_export_contacts_csv(self, s, admin_headers):
        r = s.get(f"{API}/admin/export?kind=contacts", headers=admin_headers)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "").lower()
        # BOM present
        assert r.content[:3] == b"\xef\xbb\xbf"
        assert "Ad Soyad" in r.text

    def test_export_memberships_csv(self, s, admin_headers):
        r = s.get(f"{API}/admin/export?kind=memberships", headers=admin_headers)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "").lower()
        assert r.content[:3] == b"\xef\xbb\xbf"
        # Turkish headers
        assert "Üyelik Durumu" in r.text
        assert "Toplam Harcama" in r.text


# ---------------- Trial-once ----------------
class TestTrialOnce:
    def test_trial_flow_phone_and_company(self, s):
        # Unique phone P, unique company C
        p = f"+9057{int(time.time()*1000) % 100000000:08d}"
        c = f"TESTCO_{_rand()}"

        # A: fully unique → trial
        rA, pA = _register_member(s, name="Trial A",
                                  email=f"TEST_A_{_rand()}@example.com",
                                  phone=p, company=c)
        assert rA.status_code == 200, rA.text
        dA = rA.json()
        assert dA.get("trial_used_before") is False
        assert dA["membership"]["status"] == "trial"

        # B: same phone P, different email + company → expired, trial_used
        rB, _ = _register_member(s, name="Trial B",
                                 email=f"TEST_B_{_rand()}@example.com",
                                 phone=p, company=f"TESTCO_{_rand()}")
        assert rB.status_code == 200, rB.text
        dB = rB.json()
        assert dB.get("trial_used_before") is True
        assert dB["membership"]["status"] == "expired"

        # C: same company C, different phone + email → expired
        rC, _ = _register_member(s, name="Trial C",
                                 email=f"TEST_C_{_rand()}@example.com",
                                 phone=f"+9058{_rand()[:8]}", company=c)
        assert rC.status_code == 200, rC.text
        dC = rC.json()
        assert dC.get("trial_used_before") is True
        assert dC["membership"]["status"] == "expired"

        # D: fully unique → trial
        rD, _ = _register_member(s, name="Trial D",
                                 email=f"TEST_D_{_rand()}@example.com",
                                 phone=f"+9059{_rand()[:8]}", company=f"TESTCO_{_rand()}")
        assert rD.status_code == 200, rD.text
        dD = rD.json()
        assert dD.get("trial_used_before") is False
        assert dD["membership"]["status"] == "trial"


# ---------------- PayTR create monthly & yearly ----------------
class TestPaytrCreate:
    @pytest.fixture(scope="class")
    def member_headers(self):
        s = requests.Session()
        r, _ = _register_member(s, name="Pay Member",
                                email=f"TEST_pay_{_rand()}@example.com",
                                phone=f"+9051{_rand()[:8]}",
                                company=f"TESTPAY_{_rand()}")
        assert r.status_code == 200, r.text
        tok = r.json()["token"]
        return s, {"Authorization": f"Bearer {tok}"}

    def test_paytr_monthly_link(self, member_headers):
        s, h = member_headers
        r = s.post(f"{API}/payments/paytr/create",
                   json={"kind": "subscription", "origin_url": BASE_URL},
                   headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "link" in d and d["link"].startswith("https://www.paytr.com/link/")
        assert "callback_id" in d and len(d["callback_id"]) > 5

    def test_paytr_yearly_link(self, member_headers):
        s, h = member_headers
        r = s.post(f"{API}/payments/paytr/create",
                   json={"kind": "subscription", "period": "yearly", "origin_url": BASE_URL},
                   headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["link"].startswith("https://www.paytr.com/link/")
        assert d.get("callback_id")


# ---------------- Feature tracking via callback ----------------
class TestFeatureTracking:
    def test_credit_topup_callback_tracks_feature(self, s, admin_headers):
        # Register a fresh member (unique phone+company)
        r, payload = _register_member(s, name="Feat Track",
                                      email=f"TEST_feat_{_rand()}@example.com",
                                      phone=f"+9052{_rand()[:8]}",
                                      company=f"TESTFEAT_{_rand()}")
        assert r.status_code == 200, r.text
        mtok = r.json()["token"]
        mid = r.json()["user"]["id"]
        mh = {"Authorization": f"Bearer {mtok}"}

        # Create a credits order p10
        cr = s.post(f"{API}/payments/paytr/create",
                    json={"kind": "credits", "package_id": "p10", "origin_url": BASE_URL},
                    headers=mh)
        assert cr.status_code == 200, cr.text
        cd = cr.json()
        callback_id = cd["callback_id"]
        # price kurus of p10 from server order (call status to inspect? we need total_amount)
        # Poll status to get price info OR compute from known packages.
        # p10 credits: base_cost=2.0 * markup=2 * 10 = 40 TRY = 4000 kurus
        # (from server: AI_CREDIT_BASE_COST * AI_CREDIT_MARKUP * credits)
        price_kurus = "4000"

        # Send callback with correct hash
        status = "success"
        # merchant_oid convention: server stores callback_id as merchant_oid? Check by using callback_id as merchant_oid
        merchant_oid = callback_id
        msg = callback_id + merchant_oid + PAYTR_SALT + status + price_kurus
        digest = hmac.new(PAYTR_KEY.encode(), msg.encode(), hashlib.sha256).digest()
        h_b64 = base64.b64encode(digest).decode()
        form = {
            "merchant_oid": merchant_oid,
            "status": status,
            "total_amount": price_kurus,
            "hash": h_b64,
            "callback_id": callback_id,
        }
        cb = s.post(f"{API}/payments/paytr-callback", data=form)
        assert cb.status_code == 200, cb.text
        assert cb.text.strip().upper().startswith("OK"), cb.text

        # Small wait then check admin memberships
        time.sleep(1)
        # Use fresh session for admin call to avoid session-cookie mixing
        adm = requests.Session()
        mm = adm.get(f"{API}/admin/memberships", headers=admin_headers)
        assert mm.status_code == 200
        found = next((x for x in mm.json()["members"] if x["id"] == mid), None)
        assert found, "member not found in admin memberships"
        assert found["credit_topup_count"] >= 1, f"credit_topup_count={found['credit_topup_count']}"
        assert "kredi_yukleme" in (found.get("features_used") or []), found.get("features_used")
