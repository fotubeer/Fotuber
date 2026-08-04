"""Backend tests for iteration 19: AI credit top-up (demo) flow."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fotuber-photo-repair.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASS = "FTB.2024"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_ai_credits_shape(auth_headers):
    r = requests.get(f"{BASE_URL}/api/vesikalik/ai-credits", headers=auth_headers, timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["role"] == "admin"
    assert d["mode"] == "emergent"
    assert d["unit_price"] == 4.0
    assert d["markup"] == 2.0
    assert d["currency"] == "TRY"
    for k in ("remaining", "total", "own_key", "masked"):
        assert k in d


def test_credit_packages_shape(auth_headers):
    r = requests.get(f"{BASE_URL}/api/vesikalik/credit-packages", headers=auth_headers, timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["currency"] == "TRY"
    assert d["demo"] is True
    assert d["unit_price"] == 4.0
    assert d["markup"] == 2.0
    pkgs = {p["id"]: p for p in d["packages"]}
    assert set(pkgs) == {"p10", "p25", "p50", "p100"}
    assert pkgs["p10"]["credits"] == 10 and pkgs["p10"]["price"] == 40.0
    assert pkgs["p25"]["credits"] == 25 and pkgs["p25"]["price"] == 100.0
    assert pkgs["p50"]["credits"] == 50 and pkgs["p50"]["price"] == 200.0
    assert pkgs["p100"]["credits"] == 100 and pkgs["p100"]["price"] == 400.0
    assert pkgs["p25"]["popular"] is True
    for pid in ("p10", "p50", "p100"):
        assert pkgs[pid]["popular"] is False


def test_topup_success_and_persists(auth_headers):
    before = requests.get(f"{BASE_URL}/api/vesikalik/ai-credits", headers=auth_headers, timeout=10).json()["remaining"]
    r = requests.post(f"{BASE_URL}/api/vesikalik/credits/topup", json={"package_id": "p10"}, headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["added"] == 10
    assert d["remaining"] == before + 10
    assert d["package"]["id"] == "p10"
    # Verify persistence
    after = requests.get(f"{BASE_URL}/api/vesikalik/ai-credits", headers=auth_headers, timeout=10).json()["remaining"]
    assert after == before + 10


def test_topup_invalid_package(auth_headers):
    r = requests.post(f"{BASE_URL}/api/vesikalik/credits/topup", json={"package_id": "pXX"}, headers=auth_headers, timeout=10)
    assert r.status_code == 400
    assert "Geçersiz paket" in r.json().get("detail", "")


def test_endpoints_require_auth():
    for method, path, body in [
        ("get", "/api/vesikalik/ai-credits", None),
        ("get", "/api/vesikalik/credit-packages", None),
        ("post", "/api/vesikalik/credits/topup", {"package_id": "p10"}),
    ]:
        fn = getattr(requests, method)
        r = fn(f"{BASE_URL}{path}", json=body, timeout=10) if body else fn(f"{BASE_URL}{path}", timeout=10)
        assert r.status_code in (401, 403), f"{path} -> {r.status_code}"
