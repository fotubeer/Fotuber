"""
Fotuber Backend Integration Tests
Covers: auth, services, availability, appointments, blocked-slots, staff, reports, gallery
"""
import os
import io
import uuid
import time
import struct
import zlib
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://personnel-portal-16.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASSWORD = "FTB.2024"

# tomorrow date to avoid past slot issues
TEST_DATE = (datetime.now(timezone.utc).date() + timedelta(days=3)).isoformat()


def _make_png_bytes() -> bytes:
    """Tiny valid 1x1 red PNG."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    raw = b"\x00\xff\x00\x00"  # filter + RGB
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def admin_token():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}"})
    return s


@pytest.fixture(scope="session")
def customer_a():
    """Creates fresh customer A."""
    email = f"TEST_custA_{uuid.uuid4().hex[:8]}@example.com"
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={
        "name": "Ali", "surname": "Test", "email": email,
        "phone": "05551112233", "password": "pass1234",
        "kvkk_consent": True, "marketing_consent": False,
    })
    assert r.status_code == 200, f"register A failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return {"session": s, "email": email, "user": data["user"], "token": data["token"]}


@pytest.fixture(scope="session")
def customer_b():
    email = f"TEST_custB_{uuid.uuid4().hex[:8]}@example.com"
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={
        "name": "Beste", "surname": "Test", "email": email,
        "phone": "05551112244", "password": "pass1234",
        "kvkk_consent": True, "marketing_consent": True,
    })
    assert r.status_code == 200, f"register B failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return {"session": s, "email": email, "user": data["user"], "token": data["token"]}


# ---------------------------------------------------------------------------
# Auth Tests
# ---------------------------------------------------------------------------
class TestAuth:
    def test_register_requires_kvkk(self):
        email = f"TEST_nokvkk_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "name": "No", "surname": "KVKK", "email": email,
            "phone": "05551112255", "password": "pass1234",
            "kvkk_consent": False,
        })
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_register_success_returns_customer(self):
        email = f"TEST_reg_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "name": "Reg", "surname": "User", "email": email,
            "phone": "05551112277", "password": "pass1234",
            "kvkk_consent": True, "marketing_consent": False,
        })
        assert r.status_code == 200
        data = r.json()
        # backend lowercases emails
        assert data["user"]["email"] == email.lower()
        assert data["user"]["role"] == "customer"
        assert data["user"]["kvkk_consent"] is True
        assert isinstance(data["token"], str) and len(data["token"]) > 20

    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "admin"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert "token" in data and len(data["token"]) > 20

    def test_login_bad_credentials(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": ADMIN_EMAIL, "password": "wrong-password",
        })
        assert r.status_code == 401

    def test_me_via_bearer(self, admin_client):
        r = admin_client.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL
        assert r.json()["role"] == "admin"

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# Services + Availability
# ---------------------------------------------------------------------------
class TestServicesAndAvailability:
    def test_services_seeded(self):
        r = requests.get(f"{API}/services")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 5, f"expected >=5 seeded services, got {len(items)}"
        # sanity fields
        assert "id" in items[0] and "name" in items[0] and "price" in items[0]

    def test_availability_11_slots(self):
        r = requests.get(f"{API}/availability", params={"date": TEST_DATE})
        assert r.status_code == 200
        data = r.json()
        assert data["date"] == TEST_DATE
        assert len(data["slots"]) == 11
        times = [s["time"] for s in data["slots"]]
        assert times[0] == "09:00" and times[-1] == "19:00"
        for s in data["slots"]:
            assert s["status"] in ("available", "booked")

    def test_service_crud_admin_and_403_for_customer(self, admin_client, customer_a):
        # Create
        payload = {"name": "TEST_Svc", "description": "d", "price": 100.0,
                   "duration_hours": 1, "image_url": "", "active": True}
        r = admin_client.post(f"{API}/services", json=payload)
        assert r.status_code == 200
        svc = r.json()
        sid = svc["id"]
        assert svc["name"] == "TEST_Svc"

        # Update
        payload["name"] = "TEST_Svc_Updated"
        r = admin_client.put(f"{API}/services/{sid}", json=payload)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Svc_Updated"

        # Non-admin forbidden
        r = customer_a["session"].post(f"{API}/services", json=payload)
        assert r.status_code == 403
        r = customer_a["session"].put(f"{API}/services/{sid}", json=payload)
        assert r.status_code == 403
        r = customer_a["session"].delete(f"{API}/services/{sid}")
        assert r.status_code == 403

        # Delete
        r = admin_client.delete(f"{API}/services/{sid}")
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Appointment full workflow + conflicts
# ---------------------------------------------------------------------------
class TestAppointmentFlow:
    def test_full_flow_conflict_and_blocked_slot(self, admin_client, customer_a, customer_b):
        # get a service id
        services = requests.get(f"{API}/services").json()
        sid = services[0]["id"]

        # Use two different slots to avoid interference: one for approve flow, one for blocked flow
        slot_appt = "10:00"
        slot_blocked = "15:00"

        # -------- Customer A creates appointment (pending) --------
        r = customer_a["session"].post(f"{API}/appointments", json={
            "service_id": sid, "date": TEST_DATE, "time": slot_appt, "notes": "test"
        })
        assert r.status_code == 200, f"create appt failed: {r.status_code} {r.text}"
        appt = r.json()
        aid = appt["id"]
        assert appt["status"] == "pending"
        assert appt["service_name"]

        # Customer A can see own via /me
        r = customer_a["session"].get(f"{API}/appointments/me")
        assert r.status_code == 200
        assert any(a["id"] == aid for a in r.json())

        # Admin lists pending
        r = admin_client.get(f"{API}/appointments", params={"status_filter": "pending"})
        assert r.status_code == 200
        assert any(a["id"] == aid for a in r.json())

        # Non-admin cannot list all
        r = customer_a["session"].get(f"{API}/appointments")
        assert r.status_code == 403

        # -------- Admin approves with kapora --------
        r = admin_client.patch(f"{API}/appointments/{aid}", json={
            "status": "approved", "deposit_amount": 500, "paid_amount": 500
        })
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["status"] == "approved"
        assert upd["deposit_amount"] == 500
        assert upd["paid_amount"] == 500

        # Availability shows booked
        r = requests.get(f"{API}/availability", params={"date": TEST_DATE})
        assert r.status_code == 200
        slots_map = {s["time"]: s["status"] for s in r.json()["slots"]}
        assert slots_map[slot_appt] == "booked"

        # -------- Customer B tries same slot -> 409 --------
        r = customer_b["session"].post(f"{API}/appointments", json={
            "service_id": sid, "date": TEST_DATE, "time": slot_appt,
        })
        assert r.status_code == 409

        # -------- Admin blocks another slot; customer cannot book it --------
        r = admin_client.post(f"{API}/blocked-slots", json={
            "date": TEST_DATE, "time": slot_blocked, "reason": "test block"
        })
        assert r.status_code == 200, r.text
        bid = r.json()["id"]

        r = customer_b["session"].post(f"{API}/appointments", json={
            "service_id": sid, "date": TEST_DATE, "time": slot_blocked,
        })
        assert r.status_code == 409

        # Non-admin cannot post/list/delete blocked-slots
        r = customer_a["session"].post(f"{API}/blocked-slots", json={
            "date": TEST_DATE, "time": "11:00"
        })
        assert r.status_code == 403
        r = customer_a["session"].get(f"{API}/blocked-slots")
        assert r.status_code == 403

        # Cleanup
        admin_client.delete(f"{API}/blocked-slots/{bid}")
        admin_client.delete(f"{API}/appointments/{aid}")

    def test_appointments_unauth(self):
        r = requests.get(f"{API}/appointments")
        assert r.status_code == 401
        r = requests.get(f"{API}/appointments/me")
        assert r.status_code == 401
        r = requests.post(f"{API}/appointments", json={})
        assert r.status_code in (401, 422)


# ---------------------------------------------------------------------------
# Staff CRUD
# ---------------------------------------------------------------------------
class TestStaff:
    def test_staff_crud(self, admin_client, customer_a):
        # Non-admin forbidden
        r = customer_a["session"].get(f"{API}/staff")
        assert r.status_code == 403

        # Create
        r = admin_client.post(f"{API}/staff", json={
            "name": "TEST_Staff", "role": "Fotoğrafçı", "phone": "05551110000",
            "email": "TEST_staff@example.com", "salary": 15000, "active": True,
        })
        assert r.status_code == 200
        st = r.json()
        stid = st["id"]
        assert st["name"] == "TEST_Staff"

        # List
        r = admin_client.get(f"{API}/staff")
        assert r.status_code == 200
        assert any(s["id"] == stid for s in r.json())

        # Update
        r = admin_client.put(f"{API}/staff/{stid}", json={
            "name": "TEST_Staff_Upd", "role": "Yönetmen", "phone": "05551110000",
            "email": "TEST_staff@example.com", "salary": 20000, "active": True,
        })
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Staff_Upd"
        assert r.json()["salary"] == 20000

        # Delete
        r = admin_client.delete(f"{API}/staff/{stid}")
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------
class TestReports:
    def test_reports_summary(self, admin_client, customer_a):
        # Non-admin forbidden
        r = customer_a["session"].get(f"{API}/reports/summary")
        assert r.status_code == 403

        r = admin_client.get(f"{API}/reports/summary")
        assert r.status_code == 200
        data = r.json()
        for k in ["pending", "approved", "cancelled", "today_approved",
                  "total_revenue", "total_deposits", "revenue_series", "staff_count"]:
            assert k in data, f"missing key: {k}"
        assert isinstance(data["revenue_series"], list)
        assert len(data["revenue_series"]) == 7
        for row in data["revenue_series"]:
            assert "date" in row and "revenue" in row


# ---------------------------------------------------------------------------
# Gallery
# ---------------------------------------------------------------------------
class TestGallery:
    def test_categories_and_upload_and_fetch(self, admin_client, customer_a):
        # Categories
        r = requests.get(f"{API}/gallery/categories")
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) == 6
        slugs = {c["slug"] for c in cats}
        assert "fotograf-cekimi" in slugs

        # Non-admin cannot upload
        img = _make_png_bytes()
        files = {"file": ("test.png", img, "image/png")}
        data = {"category": "fotograf-cekimi", "title": "TEST_gallery", "description": "d"}
        r = customer_a["session"].post(f"{API}/gallery/upload", files=files, data=data)
        assert r.status_code == 403

        # Admin uploads
        files = {"file": ("test.png", img, "image/png")}
        r = admin_client.post(f"{API}/gallery/upload", files=files, data=data)
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
        item = r.json()
        item_id = item["id"]
        assert item["category"] == "fotograf-cekimi"
        assert item["media_type"] == "image"

        # List gallery includes item
        r = requests.get(f"{API}/gallery", params={"category": "fotograf-cekimi"})
        assert r.status_code == 200
        assert any(g["id"] == item_id for g in r.json())

        # File fetch returns bytes
        r = requests.get(f"{API}/gallery/file/{item_id}")
        assert r.status_code == 200
        assert r.headers.get("Content-Type", "").startswith("image/")
        assert len(r.content) > 0

        # Cleanup
        admin_client.delete(f"{API}/gallery/{item_id}")
