"""Phase 1 tests: Studio + Vesikalık merger.
- /api/vesikalik/ai-credits auth: admin bearer, studio bearer, no auth.
- Admin studio-accounts list + module toggle (grant/revoke vesikalik).
- Studio /api/studio/me returns modules.
"""
import os
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    return None


BASE_URL = _load_backend_url()

ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASS = "FTB.2024"
STUDIO_EMAIL = "studio1@test.com"
STUDIO_PASS = "Test1234"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def studio_token():
    r = requests.post(f"{BASE_URL}/api/studio/login", json={"email": STUDIO_EMAIL, "password": STUDIO_PASS})
    assert r.status_code == 200, f"studio login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


def test_admin_ai_credits(admin_token):
    r = requests.get(f"{BASE_URL}/api/vesikalik/ai-credits", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("role") == "admin"
    assert data.get("mode") == "emergent"


def test_studio_ai_credits(studio_token):
    r = requests.get(f"{BASE_URL}/api/vesikalik/ai-credits", headers={"Authorization": f"Bearer {studio_token}"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("role") == "studio"
    assert data.get("mode") == "credits"
    assert "remaining" in data


def test_noauth_ai_credits():
    r = requests.get(f"{BASE_URL}/api/vesikalik/ai-credits")
    assert r.status_code == 401


def test_studio_me_modules(studio_token):
    r = requests.get(f"{BASE_URL}/api/studio/me", headers={"Authorization": f"Bearer {studio_token}"})
    assert r.status_code == 200, r.text
    data = r.json()
    account = data.get("account") or data
    assert "modules" in account
    assert account["modules"].get("vesikalik") is True
    assert account["modules"].get("gallery") is True
    assert account.get("brand_name") or account.get("firma_adi")


def test_admin_studio_accounts_list_and_module_toggle(admin_token, studio_token):
    # list studios
    r = requests.get(f"{BASE_URL}/api/admin/studio-accounts", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    payload = r.json()
    accounts = payload.get("accounts") if isinstance(payload, dict) else payload
    assert isinstance(accounts, list)
    sid = None
    for a in accounts:
        if a.get("email") == STUDIO_EMAIL:
            sid = a.get("id") or a.get("_id")
            break
    assert sid, f"studio1 not found in list: {accounts}"

    # revoke vesikalik
    r2 = requests.post(
        f"{BASE_URL}/api/admin/studio-accounts/{sid}/modules",
        json={"vesikalik": False, "gallery": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200, r2.text

    # now the studio token should be 403 on ai-credits (module gate)
    r3 = requests.get(f"{BASE_URL}/api/vesikalik/ai-credits", headers={"Authorization": f"Bearer {studio_token}"})
    assert r3.status_code == 403, f"expected 403 after revoke, got {r3.status_code} {r3.text}"

    # restore
    r4 = requests.post(
        f"{BASE_URL}/api/admin/studio-accounts/{sid}/modules",
        json={"vesikalik": True, "gallery": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r4.status_code == 200, r4.text

    # verify restore
    r5 = requests.get(f"{BASE_URL}/api/vesikalik/ai-credits", headers={"Authorization": f"Bearer {studio_token}"})
    assert r5.status_code == 200
    assert r5.json().get("role") == "studio"
