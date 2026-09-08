"""Backend tests for member auth (cookie-based) and vesikalik access-control."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def unique_email():
    return f"TEST_member_{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="module")
def creds(unique_email):
    return {
        "email": unique_email,
        "password": "TestPass123",
        "full_name": "Test Member",
        "phone": "5551112233",
        "company_name": "",
    }


@pytest.fixture(scope="module")
def member_session(creds):
    s = requests.Session()
    r = s.post(f"{API}/member/register", json=creds, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return s, r.json()


# -------- Auth --------
class TestMemberAuth:
    def test_register_returns_trial_membership(self, member_session):
        _, body = member_session
        assert "token" in body and "user" in body and "membership" in body
        assert body["user"]["role"] == "member"
        assert body["membership"]["active"] is True
        assert body["membership"]["status"] == "trial"
        assert float(body["membership"]["price"]) == 80.0

    def test_register_duplicate_email(self, creds):
        r = requests.post(f"{API}/member/register", json=creds, timeout=30)
        assert r.status_code == 400

    def test_login_wrong_password(self, creds):
        r = requests.post(f"{API}/member/login",
                          json={"email": creds["email"], "password": "WRONG_pw"},
                          timeout=30)
        assert r.status_code == 401

    def test_login_ok(self, creds):
        s = requests.Session()
        r = s.post(f"{API}/member/login",
                   json={"email": creds["email"], "password": creds["password"]},
                   timeout=30)
        assert r.status_code == 200
        # cookie should be set
        assert any(c.name == "access_token" for c in s.cookies)

    def test_me_with_cookie(self, member_session):
        s, _ = member_session
        r = s.get(f"{API}/member/me", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j["user"]["role"] == "member"
        assert j["membership"]["active"] is True

    def test_me_without_auth(self):
        r = requests.get(f"{API}/member/me", timeout=30)
        assert r.status_code in (401, 403)


# -------- Vesikalik access control --------
class TestVesikalikAccess:
    def test_credits_no_auth(self):
        r = requests.get(f"{API}/vesikalik/ai-credits", timeout=30)
        assert r.status_code in (401, 403)

    def test_topup_no_auth(self):
        r = requests.post(f"{API}/vesikalik/credits/topup",
                          json={"package_id": "p10"}, timeout=30)
        assert r.status_code in (401, 403)

    def test_credits_member(self, member_session):
        s, _ = member_session
        r = s.get(f"{API}/vesikalik/ai-credits", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j["mode"] == "credits"
        assert j["remaining"] == 0
        assert j["role"] == "member"

    def test_packages_member(self, member_session):
        s, _ = member_session
        r = s.get(f"{API}/vesikalik/credit-packages", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("packages"), list) and len(j["packages"]) > 0
        ids = [p["id"] for p in j["packages"]]
        assert "p10" in ids

    def test_gemini_key_member(self, member_session):
        s, _ = member_session
        r = s.get(f"{API}/vesikalik/gemini-key", timeout=30)
        assert r.status_code == 200

    def test_topup_member_p10(self, member_session):
        s, _ = member_session
        r = s.post(f"{API}/vesikalik/credits/topup",
                   json={"package_id": "p10"}, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j["added"] == 10
        assert j["remaining"] >= 10
        # verify persistence
        r2 = s.get(f"{API}/vesikalik/ai-credits", timeout=30)
        assert r2.status_code == 200
        assert r2.json()["remaining"] >= 10


# -------- Subscribe --------
class TestSubscribe:
    def test_subscribe_extends_paid(self, member_session):
        s, _ = member_session
        r = s.post(f"{API}/member/subscribe", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j["ok"] is True
        assert j["demo"] is True
        assert float(j["charged"]) == 80.0
        assert j["membership"]["active"] is True
        assert j["membership"]["status"] == "active"
