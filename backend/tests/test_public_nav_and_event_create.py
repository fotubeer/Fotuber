"""Backend regression: studio login + gallery event create with client_phone + quota gate."""
import os
import pytest
import requests

def _load_env():
    from pathlib import Path
    for p in ["/app/frontend/.env", "/app/backend/.env"]:
        try:
            for line in Path(p).read_text().splitlines():
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
        except Exception:
            pass
_load_env()
BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL not set"
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def studio_session():
    s = requests.Session()
    r = s.post(f"{API}/studio/login", json={"email": "studio1@test.com", "password": "Test1234"})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def test_studio_me_active_gold(studio_session):
    r = studio_session.get(f"{API}/studio/me")
    assert r.status_code == 200
    data = r.json()
    acc = data.get("account", data)
    plan = (acc.get("membership") or {}).get("plan") or acc.get("plan")
    assert plan == "gold", f"expected gold, got {plan}"


def test_create_event_returns_client_phone(studio_session):
    payload = {"name": "TEST_NavBugEvent", "client_name": "TEST Client", "client_phone": "05551234567"}
    r = studio_session.post(f"{API}/studio/gallery/events", json=payload)
    assert r.status_code == 200, f"create event failed: {r.status_code} {r.text}"
    ev = r.json()
    assert "id" in ev and ev["id"]
    assert ev.get("client_phone") == "05551234567"
    assert ev.get("name") == "TEST_NavBugEvent"
    # cleanup
    d = studio_session.delete(f"{API}/studio/gallery/events/{ev['id']}")
    assert d.status_code in (200, 204)


def test_expired_studio_quota_402_upgrade():
    """Register a fresh studio and force-expire it via Mongo, then confirm create_event → 402 [UPGRADE]."""
    import pymongo, os as _os
    from datetime import datetime, timezone, timedelta

    mongo_url = _os.environ.get("MONGO_URL")
    db_name = _os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        # try backend env
        from pathlib import Path
        env = Path("/app/backend/.env").read_text()
        for line in env.splitlines():
            if line.startswith("MONGO_URL="):
                mongo_url = line.split("=", 1)[1].strip()
            if line.startswith("DB_NAME="):
                db_name = line.split("=", 1)[1].strip()
    client = pymongo.MongoClient(mongo_url)
    db = client[db_name]

    import uuid
    email = f"TEST_expired_{uuid.uuid4().hex[:6]}@test.com"
    s = requests.Session()
    reg = s.post(f"{API}/studio/register", json={
        "email": email, "password": "Test1234", "firma_adi": "TEST Expired Co",
        "phone": "05550000000", "kvkk_consent": True,
    })
    assert reg.status_code in (200, 201), f"register: {reg.status_code} {reg.text}"

    # Expire the account: set trial_ends_at + paid_until in the past and plan=trial
    past = datetime.now(timezone.utc) - timedelta(days=10)
    upd = db.studio_accounts.update_one(
        {"email": email.lower()},
        {"$set": {"trial_end": past, "paid_until": past, "plan": "trial"}},
    )
    assert upd.matched_count == 1

    lg = s.post(f"{API}/studio/login", json={"email": email, "password": "Test1234"})
    assert lg.status_code == 200
    tok = lg.json().get("token") or lg.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})

    r = s.post(f"{API}/studio/gallery/events", json={"name": "TEST_x", "client_name": "x", "client_phone": "05550000000"})
    assert r.status_code == 402, f"expected 402, got {r.status_code} {r.text}"
    detail = r.json().get("detail", "")
    assert str(detail).startswith("[UPGRADE]"), f"detail did not start with [UPGRADE]: {detail}"

    # cleanup
    db.studio_accounts.delete_one({"email": email.lower()})
