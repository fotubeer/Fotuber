"""Iter 46: Per-module entitlement (trial opens BOTH), yearly savings_pct,
admin/member unaffected. See review_request iter 46."""
import os, time, uuid, requests, pytest
from pathlib import Path

def _load_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE = _load_url().rstrip("/")
API = f"{BASE}/api"


# ---------- studio register + trial opens both modules ----------
@pytest.fixture(scope="module")
def new_studio():
    email = f"TEST_iter46_{uuid.uuid4().hex[:8]}@example.com"
    pw = "Test1234"
    r = requests.post(f"{API}/studio/register", json={
        "email": email, "password": pw, "firma_adi": "TEST Iter46 Stüdyo",
        "phone": "+905550001111", "kvkk_consent": True,
    })
    assert r.status_code == 200, f"register failed {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"register response missing token: {data}"
    return {"email": email, "password": pw, "token": token, "id": data.get("account", {}).get("id")}


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_trial_opens_both_modules(new_studio):
    r = requests.get(f"{API}/studio/me", headers=_auth(new_studio["token"]))
    assert r.status_code == 200, r.text
    body = r.json()
    acc = body.get("account") or body
    mods = acc.get("modules") or {}
    assert mods.get("vesikalik") is True, f"vesikalik should be True in trial: {mods}"
    assert mods.get("gallery") is True, f"gallery should be True in trial: {mods}"
    ent = acc.get("entitlement") or {}
    assert ent.get("trial_active") is True, f"trial_active not True: {ent}"
    assert ent.get("trial_end"), f"trial_end empty: {ent}"


def test_studio_login_returns_modules(new_studio):
    r = requests.post(f"{API}/studio/login", json={
        "email": new_studio["email"], "password": new_studio["password"]
    })
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    r2 = requests.get(f"{API}/studio/me", headers=_auth(tok))
    assert r2.status_code == 200
    acc = r2.json().get("account") or r2.json()
    assert acc.get("modules", {}).get("vesikalik") in (True, False)
    assert "entitlement" in acc


# ---------- yearly savings_pct ----------
def test_modules_pricing_savings(new_studio):
    r = requests.get(f"{API}/studio/modules/pricing", headers=_auth(new_studio["token"]))
    assert r.status_code == 200, r.text
    data = r.json()
    rows = data.get("pricing") or []
    assert len(rows) > 0, "no pricing rows"
    for row in rows:
        assert "savings_pct" in row, f"row missing savings_pct: {row}"
        assert "base_price" in row, f"row missing base_price: {row}"
        assert "base_yearly" in row, f"row missing base_yearly: {row}"
        assert isinstance(row["savings_pct"], int)
        # savings should be positive (yearly cheaper than 12x monthly)
        assert row["savings_pct"] > 0, f"non-positive savings on {row}"
        # base_yearly < base_price*12
        assert float(row["base_yearly"]) < float(row["base_price"]) * 12


# ---------- admin unaffected ----------
def test_admin_studio_me_full_access():
    r = requests.post(f"{API}/auth/login", json={
        "email": "admin@fotuber.com.tr", "password": "FTB.2024"
    })
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    r2 = requests.get(f"{API}/studio/me", headers=_auth(tok))
    assert r2.status_code == 200, r2.text
    acc = r2.json().get("account") or r2.json()
    mods = acc.get("modules") or {}
    assert mods.get("vesikalik") is True
    assert mods.get("gallery") is True


# ---------- expired member unaffected (design-only, modules={}) ----------
def test_expired_member_studio_me_no_modules():
    r = requests.post(f"{API}/member/login", json={
        "email": "expired@fotuber.com.tr", "password": "Test1234"
    })
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    r2 = requests.get(f"{API}/studio/me", headers=_auth(tok))
    assert r2.status_code == 200, r2.text
    acc = r2.json().get("account") or r2.json()
    mods = acc.get("modules") or {}
    # design-only: modules should be empty dict (no vesikalik/gallery keys or both False)
    assert not mods.get("vesikalik"), f"member should NOT have vesikalik: {mods}"
    assert not mods.get("gallery"), f"member should NOT have gallery: {mods}"
