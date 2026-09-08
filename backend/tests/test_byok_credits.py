"""Backend tests: Vesikalık BYOK Gemini key + AI credits (iteration_18)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fotuber-photo-repair.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASS = "FTB.2024"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestAuth:
    def test_login_returns_token(self, token):
        assert token


class TestAICredits:
    def test_ai_credits_shape(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/vesikalik/ai-credits", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("remaining", "total", "own_key", "masked"):
            assert k in d, f"missing key {k} in {d}"
        assert isinstance(d["remaining"], int)
        assert isinstance(d["total"], int)
        assert d["total"] == 25
        # remaining should be <=25 and >=0
        assert 0 <= d["remaining"] <= 25
        assert isinstance(d["own_key"], bool)


class TestGeminiKey:
    def test_get_initial_no_key(self, auth_headers):
        # ensure clean state
        requests.delete(f"{BASE_URL}/api/vesikalik/gemini-key", headers=auth_headers, timeout=15)
        r = requests.get(f"{BASE_URL}/api/vesikalik/gemini-key", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("connected") is False
        assert d.get("masked") in (None, "")

    def test_post_invalid_key_rejected(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/vesikalik/gemini-key",
                          headers=auth_headers,
                          json={"api_key": "AIzaINVALIDtestkey123"}, timeout=30)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "geçersiz" in detail or "gemini" in detail, f"unexpected detail: {detail}"

    def test_get_still_not_connected_after_invalid(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/vesikalik/gemini-key", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("connected") is False

    def test_delete_returns_disconnected(self, auth_headers):
        r = requests.delete(f"{BASE_URL}/api/vesikalik/gemini-key", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("connected") is False


class TestAuthRequired:
    def test_ai_credits_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/vesikalik/ai-credits", timeout=10)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_get_gemini_key_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/vesikalik/gemini-key", timeout=10)
        assert r.status_code in (401, 403)

    def test_post_gemini_key_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/vesikalik/gemini-key",
                          json={"api_key": "x"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_delete_gemini_key_requires_auth(self):
        r = requests.delete(f"{BASE_URL}/api/vesikalik/gemini-key", timeout=10)
        assert r.status_code in (401, 403)
