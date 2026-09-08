"""Backend tests for the Digital Invitations (Dijital Davetiye) module."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

# Tests share fixtures across classes (module-scoped invitation). Force all tests
# in this file to run on the same xdist worker to keep create->rsvp->report order.
pytestmark = pytest.mark.xdist_group(name="invitations")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fotuber-photo-repair.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def _future_date(days: int = 30) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).date().isoformat()


def _register_member() -> dict:
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"TEST_inv_{suffix}@example.com",
        "password": "TestPass123!",
        "full_name": f"Test User {suffix}",
        "phone": f"+90555{suffix[:7]}",
        "company_name": f"TEST_CO_{suffix}",
    }
    r = requests.post(f"{API}/member/register", json=payload, timeout=30)
    assert r.status_code == 200, f"register failed {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["token"], "user": data["user"], "email": payload["email"], "password": payload["password"]}


@pytest.fixture(scope="module")
def member_a():
    return _register_member()


@pytest.fixture(scope="module")
def member_b():
    return _register_member()


@pytest.fixture(scope="module")
def invitation(member_a):
    event_date = _future_date(30)
    payload = {
        "event_type": "dugun",
        "person1": "Ahmet",
        "person2": "Yasemin",
        "event_date": event_date,
        "event_time": "19:00",
        "venue_name": "Test Venue",
        "venue_address": "Test Addr, Istanbul",
        "map_url": "https://maps.google.com/?q=Istanbul",
        "message": "Bizi kırmayın",
        "theme": "romantic",
        "gift": {"name": "Ahmet Y.", "bank": "Ziraat", "iban": "TR330006100519786457841326"},
    }
    r = requests.post(f"{API}/invitations", json=payload,
                      headers={"Authorization": f"Bearer {member_a['token']}"}, timeout=30)
    assert r.status_code == 200, f"create invitation failed: {r.status_code} {r.text}"
    data = r.json()
    assert "id" in data and "slug" in data and "url" in data
    return {"payload": payload, **data}


# ---- CREATE + PUBLIC + expires_at ----

class TestCreateAndPublic:
    def test_create_returns_id_slug_url(self, invitation):
        assert invitation["url"].startswith("/davetiye/")
        assert invitation["slug"] in invitation["url"]

    def test_expires_at_is_event_plus_15_days(self, invitation):
        inv = invitation["invitation"]
        event = datetime.fromisoformat(inv["event_date"])
        if event.tzinfo is None:
            event = event.replace(tzinfo=timezone.utc)
        expires = datetime.fromisoformat(inv["expires_at"])
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        delta_days = (expires - event).total_seconds() / 86400.0
        assert 14.5 <= delta_days <= 16.5, f"expires_at should be ~15 days after event: {delta_days}"

    def test_public_get_returns_invitation(self, invitation):
        r = requests.get(f"{API}/invitations/public/{invitation['slug']}", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["slug"] == invitation["slug"]
        assert d["person1"] == "Ahmet"
        assert d["person2"] == "Yasemin"
        assert d["gift"]["iban"] == "TR330006100519786457841326"
        assert "owner_user_id" not in d  # owner-only field must not leak publicly


# ---- RSVP validation ----

class TestRSVP:
    def test_rsvp_empty_surname_returns_400(self, invitation):
        r = requests.post(
            f"{API}/invitations/public/{invitation['slug']}/rsvp",
            json={"name": "Ali", "surname": "  ", "attending": True, "guest_count": 2}, timeout=30,
        )
        assert r.status_code == 400
        assert "soyad" in r.text.lower() or "ad" in r.text.lower()

    def test_rsvp_valid_ok(self, invitation):
        r = requests.post(
            f"{API}/invitations/public/{invitation['slug']}/rsvp",
            json={"name": "Ali", "surname": "Veli", "attending": True, "guest_count": 2, "note": "TEST"},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_rsvp_declined(self, invitation):
        r = requests.post(
            f"{API}/invitations/public/{invitation['slug']}/rsvp",
            json={"name": "Kemal", "surname": "Yıl", "attending": False, "guest_count": 1},
            timeout=30,
        )
        assert r.status_code == 200


# ---- Memory ----

class TestMemory:
    def test_memory_submit_and_list(self, invitation):
        r = requests.post(
            f"{API}/invitations/public/{invitation['slug']}/memory",
            json={"name": "Zeynep", "message": "Mutluluklar dilerim!"}, timeout=30,
        )
        assert r.status_code == 200
        r2 = requests.get(f"{API}/invitations/public/{invitation['slug']}/memories", timeout=30)
        assert r2.status_code == 200
        mems = r2.json().get("memories", [])
        assert any(m["message"] == "Mutluluklar dilerim!" for m in mems)

    def test_memory_empty_message_400(self, invitation):
        r = requests.post(
            f"{API}/invitations/public/{invitation['slug']}/memory",
            json={"name": "Zeynep", "message": "   "}, timeout=30,
        )
        assert r.status_code == 400


# ---- Owner report ----

class TestReport:
    def test_report_stats(self, invitation, member_a):
        r = requests.get(f"{API}/invitations/{invitation['id']}/report",
                         headers={"Authorization": f"Bearer {member_a['token']}"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "rsvps" in data and "memories" in data and "stats" in data
        stats = data["stats"]
        assert stats["attending"] >= 1
        assert stats["declined"] >= 1
        assert stats["total_guests"] >= 2
        assert stats["memories"] >= 1

    def test_report_csv(self, invitation, member_a):
        r = requests.get(f"{API}/invitations/{invitation['id']}/report.csv",
                         headers={"Authorization": f"Bearer {member_a['token']}"}, timeout=30)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "").lower()
        assert "Ad" in r.text and "Soyad" in r.text

    def test_other_member_cannot_read_report(self, invitation, member_b):
        r = requests.get(f"{API}/invitations/{invitation['id']}/report",
                         headers={"Authorization": f"Bearer {member_b['token']}"}, timeout=30)
        assert r.status_code == 404

    def test_other_member_cannot_read_invitation_detail(self, invitation, member_b):
        r = requests.get(f"{API}/invitations/{invitation['id']}",
                         headers={"Authorization": f"Bearer {member_b['token']}"}, timeout=30)
        assert r.status_code == 404


# ---- My invitations listing ----

class TestMyInvitations:
    def test_list_includes_created(self, invitation, member_a):
        r = requests.get(f"{API}/invitations",
                         headers={"Authorization": f"Bearer {member_a['token']}"}, timeout=30)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json().get("invitations", [])]
        assert invitation["id"] in ids


# ---- Expired invitation returns 410 ----

class TestExpiredInvitation:
    def test_expired_returns_410(self, member_a):
        event_date = _future_date(5)
        r = requests.post(f"{API}/invitations",
                          headers={"Authorization": f"Bearer {member_a['token']}"},
                          json={"event_type": "dugun", "person1": "Exp", "person2": "Ired",
                                "event_date": event_date, "theme": "midnight"}, timeout=30)
        assert r.status_code == 200
        slug = r.json()["slug"]
        iid = r.json()["id"]

        # Mutate expires_at directly in DB to yesterday
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        res = db.invitations.update_one({"id": iid}, {"$set": {"expires_at": past}})
        assert res.modified_count == 1
        client.close()

        r2 = requests.get(f"{API}/invitations/public/{slug}", timeout=30)
        assert r2.status_code == 410
