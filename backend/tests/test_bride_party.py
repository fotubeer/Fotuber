"""Tests for bride_party event_type (backend contract).

Covers:
  1. POST /api/admin/guest-events with event_type='bride_party'
  2. GET /api/guest-events/{upload_token} public — returns event_type
  3. POST /api/admin/venues/{vid}/activate with event_type='bride_party'
  4. Regression: default event_type=='wedding' when omitted
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback: read from frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@fotuber.com.tr")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "FTB.2024")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def created_ids(admin_session):
    """Track created events / venues for cleanup"""
    ids = {"events": [], "venues": []}
    yield ids
    # teardown
    for vid in ids["venues"]:
        try:
            admin_session.delete(f"{BASE_URL}/api/admin/venues/{vid}")
        except Exception:
            pass
    for eid in ids["events"]:
        try:
            admin_session.delete(f"{BASE_URL}/api/admin/guest-events/{eid}")
        except Exception:
            pass


# ---- 1. Create guest-event with event_type='bride_party' -------------------
def test_create_bride_party_event_returns_correct_type(admin_session, created_ids):
    payload = {
        "name": "TEST_BrideParty_Ayse",
        "couple_names": "Ayşe",
        "event_type": "bride_party",
        "retention_days": 3,
        "max_size_per_user_mb": 200,
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/guest-events", json=payload)
    assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["event_type"] == "bride_party", f"Expected bride_party, got {data.get('event_type')}"
    assert data["couple_names"] == "Ayşe"
    assert data.get("upload_token")
    assert data.get("id")
    created_ids["events"].append(data["id"])
    # keep token for next test
    pytest.bride_party_token = data["upload_token"]
    pytest.bride_party_event_id = data["id"]


# ---- 2. Public GET returns event_type ---------------------------------------
def test_public_guest_event_returns_bride_party_type():
    token = getattr(pytest, "bride_party_token", None)
    assert token, "Previous test must create event"
    r = requests.get(f"{BASE_URL}/api/guest-events/{token}")
    assert r.status_code == 200, f"Public GET failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["event_type"] == "bride_party"
    assert data["couple_names"] == "Ayşe"
    assert data["name"] == "TEST_BrideParty_Ayse"


# ---- 3. Venue activate stores event_type -----------------------------------
def test_venue_activate_with_bride_party(admin_session, created_ids):
    # create venue
    r = admin_session.post(
        f"{BASE_URL}/api/admin/venues",
        json={"name": "TEST_Venue_BP", "description": "", "default_max_size_per_user_mb": 200, "default_retention_days": 3},
    )
    assert r.status_code == 200, r.text
    vid = r.json()["id"]
    created_ids["venues"].append(vid)

    # activate with bride_party
    r2 = admin_session.post(
        f"{BASE_URL}/api/admin/venues/{vid}/activate",
        json={
            "name": "TEST_BP_via_venue",
            "couple_names": "Melis",
            "event_type": "bride_party",
        },
    )
    assert r2.status_code == 200, r2.text
    venue = r2.json()
    assert venue.get("current_event_id"), "Venue must have current_event_id after activation"
    eid = venue["current_event_id"]
    created_ids["events"].append(eid)

    # verify the underlying event has event_type='bride_party'
    r3 = admin_session.get(f"{BASE_URL}/api/admin/guest-events/{eid}")
    assert r3.status_code == 200, r3.text
    ev = r3.json()["event"]
    assert ev["event_type"] == "bride_party", f"Underlying event has event_type={ev.get('event_type')}"
    assert ev["couple_names"] == "Melis"


# ---- 4. Regression: default event_type is 'wedding' ------------------------
def test_default_event_type_is_wedding(admin_session, created_ids):
    payload = {
        "name": "TEST_DefaultWedding",
        "couple_names": "Ali & Ayşe",
        "retention_days": 3,
        "max_size_per_user_mb": 200,
        # event_type intentionally omitted
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/guest-events", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["event_type"] == "wedding", f"Default should be wedding, got {data.get('event_type')}"
    created_ids["events"].append(data["id"])


# ---- 5. Extra: other event types round-trip --------------------------------
@pytest.mark.parametrize("ev_type,couple", [
    ("birthday", "Emre"),
    ("engagement", "Zeynep"),
    ("henna", "Fatma"),
    ("nikah", "Ahmet & Ayşe"),
    ("other", "TEST Other"),
])
def test_other_event_types_stored(admin_session, created_ids, ev_type, couple):
    r = admin_session.post(
        f"{BASE_URL}/api/admin/guest-events",
        json={"name": f"TEST_{ev_type}", "couple_names": couple, "event_type": ev_type},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["event_type"] == ev_type
    assert data["couple_names"] == couple
    created_ids["events"].append(data["id"])

    # public endpoint round-trip
    r2 = requests.get(f"{BASE_URL}/api/guest-events/{data['upload_token']}")
    assert r2.status_code == 200
    assert r2.json()["event_type"] == ev_type
