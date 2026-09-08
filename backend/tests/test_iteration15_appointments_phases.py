"""
Iteration 15 backend tests — appointment overhaul (3-phase):
- 30-min availability slots (public 08:00-23:30, admin full 24h)
- Public POST /appointments with event_type / event_addons / phone_2 + slot validation
- Admin PATCH: phone_2, admin_notes, event_type/event_addons/extra_services_note, date/time reschedule
- Admin mid-payment add & remove — recalculates paid_total/remaining_amount
- POST /appointments/walkin — full 24h slot validation + new fields
"""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://personnel-portal-16.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASS = "FTB.2024"

# Use a distant-future date to avoid collisions with real seed data
FUTURE_DATE = (datetime.now(timezone.utc).date() + timedelta(days=45)).isoformat()


# ---------- Fixtures ----------
def _new_session():
    """Fresh requests session — no cookies leaked between admin & customer."""
    return requests.Session()


@pytest.fixture(scope="module")
def s():
    # Anonymous / neutral session (no login) — cookies cleared before each request
    return _new_session()


@pytest.fixture(scope="module")
def admin_headers():
    sess = _new_session()
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def customer():
    sess = _new_session()
    ts = int(time.time())
    email = f"TEST_iter15_{ts}@example.com"
    password = "TestPass!23"
    payload = {
        "name": "Iter15",
        "surname": "Tester",
        "email": email,
        "phone": "05551234567",
        "password": password,
        "kvkk_consent": True,
        "marketing_consent": False,
    }
    r = sess.post(f"{BASE_URL}/api/auth/register", json=payload)
    if r.status_code != 200:
        r2 = sess.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
        assert r2.status_code == 200, f"customer register+login failed: {r.text}"
        token = r2.json()["token"]
    else:
        token = r.json()["token"]
    return {"email": email, "password": password, "token": token,
            "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def any_service(s):
    r = requests.get(f"{BASE_URL}/api/services")
    assert r.status_code == 200
    items = r.json()
    assert len(items) > 0, "no services seeded"
    return items[0]


# ---------- Availability ----------
class TestAvailability:
    def test_public_availability_30min_08_to_2330(self, s):
        r = requests.get(f"{BASE_URL}/api/availability", params={"date": FUTURE_DATE})
        assert r.status_code == 200
        data = r.json()
        assert data["date"] == FUTURE_DATE
        slots = data["slots"]
        times = [x["time"] for x in slots]
        # Should start at 08:00 and end at 23:30, all 30-min
        assert times[0] == "08:00"
        assert "23:30" in times
        assert "07:30" not in times
        assert "00:00" not in times
        # All statuses should be 'available' for public (booked hidden)
        for x in slots:
            assert x["status"] == "available"
        # Verify 30-min grid
        for t in times:
            hh, mm = t.split(":")
            assert mm in ("00", "30")
        # Full public slot count = 32 (08:00..23:30 inclusive)
        # But past dates could hide some; using future date so ALL should show up
        assert len(times) == 32, f"expected 32 public slots, got {len(times)}: {times}"

    def test_admin_availability_full_24h(self, s, admin_headers):
        r = requests.get(f"{BASE_URL}/api/availability", params={"date": FUTURE_DATE}, headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        slots = data["slots"]
        times = [x["time"] for x in slots]
        assert "00:00" in times
        assert "23:30" in times
        assert len(times) == 48, f"admin should see 48 30-min slots, got {len(times)}"
        # each slot must have status either 'booked' or 'available'
        for x in slots:
            assert x["status"] in ("booked", "available")


# ---------- Appointment creation (public/customer) ----------
class TestAppointmentCreate:
    def test_reject_out_of_hours(self, s, customer, any_service):
        payload = {
            "service_id": any_service["id"],
            "date": FUTURE_DATE,
            "time": "07:00",
            "notes": "TEST_iter15",
            "contract_accepted": True,
        }
        r = requests.post(f"{BASE_URL}/api/appointments", json=payload, headers=customer["headers"])
        assert r.status_code == 400
        assert "saat" in r.text.lower() or "geçersiz" in r.text.lower()

    def test_reject_non_30min_grid(self, s, customer, any_service):
        payload = {
            "service_id": any_service["id"],
            "date": FUTURE_DATE,
            "time": "09:15",
            "contract_accepted": True,
        }
        r = requests.post(f"{BASE_URL}/api/appointments", json=payload, headers=customer["headers"])
        assert r.status_code == 400

    def test_create_with_event_fields(self, s, customer, any_service):
        payload = {
            "service_id": any_service["id"],
            "date": FUTURE_DATE,
            "time": "10:30",
            "notes": "TEST_iter15 event fields",
            "contract_accepted": True,
            "event_type": "wedding",
            "event_addons": ["klip", "album", "tablo"],
            "extra_services_note": "TEST_iter15 extra services",
            "phone_2": "05559999999",
        }
        r = requests.post(f"{BASE_URL}/api/appointments", json=payload, headers=customer["headers"])
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["event_type"] == "wedding"
        assert doc["event_addons"] == ["klip", "album", "tablo"]
        assert doc["extra_services_note"] == "TEST_iter15 extra services"
        assert doc["phone_2"] == "05559999999"
        # store for other tests
        pytest.iter15_appt_id = doc["id"]


# ---------- Admin PATCH ----------
class TestAdminUpdateAppointment:
    def test_update_admin_fields(self, s, admin_headers):
        aid = getattr(pytest, "iter15_appt_id", None)
        assert aid, "prior test_create_with_event_fields must run"
        upd = {
            "phone_2": "05557778899",
            "admin_notes": "TEST_iter15 admin note",
            "event_type": "engagement_venue",
            "event_addons": ["ikramli", "fotografli"],
            "extra_services_note": "TEST_iter15 updated extras",
        }
        r = requests.patch(f"{BASE_URL}/api/appointments/{aid}", json=upd, headers=admin_headers)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["phone_2"] == "05557778899"
        assert doc["admin_notes"] == "TEST_iter15 admin note"
        assert doc["event_type"] == "engagement_venue"
        assert doc["event_addons"] == ["ikramli", "fotografli"]
        assert doc["extra_services_note"] == "TEST_iter15 updated extras"

        # Verify persistence via GET
        r2 = requests.get(f"{BASE_URL}/api/appointments/{aid}", headers=admin_headers)
        assert r2.status_code == 200
        doc2 = r2.json()
        assert doc2["admin_notes"] == "TEST_iter15 admin note"
        assert doc2["event_addons"] == ["ikramli", "fotografli"]

    def test_reschedule_to_valid_30min(self, s, admin_headers):
        aid = pytest.iter15_appt_id
        r = requests.patch(f"{BASE_URL}/api/appointments/{aid}",
                    json={"time": "14:30"}, headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.json()["time"] == "14:30"

    def test_reschedule_invalid_time_rejected(self, s, admin_headers):
        aid = pytest.iter15_appt_id
        r = requests.patch(f"{BASE_URL}/api/appointments/{aid}",
                    json={"time": "14:15"}, headers=admin_headers)
        assert r.status_code == 400


# ---------- Mid-payments ----------
class TestMidPayments:
    def test_add_mid_payment_admin(self, s, admin_headers):
        aid = pytest.iter15_appt_id
        # First set total_amount so remaining is meaningful
        requests.patch(f"{BASE_URL}/api/appointments/{aid}",
                json={"total_amount": 10000, "deposit_amount": 2000},
                headers=admin_headers)
        payload = {"amount": 1500, "date": FUTURE_DATE, "method": "cash", "note": "TEST_iter15 mid"}
        r = requests.post(f"{BASE_URL}/api/appointments/{aid}/mid-payments",
                   json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert len(doc["mid_payments"]) >= 1
        assert doc["mid_payments_total"] >= 1500
        # paid_total = deposit(2000) + mid(1500) = 3500
        assert doc["paid_total"] >= 3500
        # remaining = 10000 - 3500 = 6500
        assert doc["remaining_amount"] == 6500
        pytest.iter15_mid_pid = doc["mid_payments"][0]["id"]

    def test_customer_cannot_add_mid_payment(self, s, customer):
        aid = pytest.iter15_appt_id
        payload = {"amount": 500, "date": FUTURE_DATE, "method": "cash"}
        r = requests.post(f"{BASE_URL}/api/appointments/{aid}/mid-payments",
                   json=payload, headers=customer["headers"])
        assert r.status_code == 403

    def test_remove_mid_payment(self, s, admin_headers):
        aid = pytest.iter15_appt_id
        pid = pytest.iter15_mid_pid
        r = requests.delete(f"{BASE_URL}/api/appointments/{aid}/mid-payments/{pid}",
                     headers=admin_headers)
        assert r.status_code == 200, r.text
        doc = r.json()
        # After removal, mid_payments_total should drop
        ids = [m["id"] for m in doc["mid_payments"]]
        assert pid not in ids
        # remaining = 10000 - 2000 = 8000
        assert doc["remaining_amount"] == 8000


# ---------- Walk-in ----------
class TestWalkin:
    def test_walkin_full_24h_valid(self, s, admin_headers, any_service):
        payload = {
            "customer_name": "TEST_iter15 Walkin",
            "customer_phone": "05551112233",
            "phone_2": "05551112244",
            "service_id": any_service["id"],
            "date": FUTURE_DATE,
            "time": "02:30",   # outside public window, but valid admin slot
            "deposit_amount": 500,
            "total_amount": 5000,
            "event_type": "kina",
            "event_addons": ["klip"],
            "auto_approve": False,   # keep pending so it doesn't block other tests
        }
        r = requests.post(f"{BASE_URL}/api/appointments/walkin", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["time"] == "02:30"
        assert doc["phone_2"] == "05551112244"
        assert doc["event_type"] == "kina"
        assert "klip" in doc["event_addons"]
        pytest.iter15_walkin_id = doc["id"]

    def test_walkin_rejects_bad_grid(self, s, admin_headers, any_service):
        payload = {
            "customer_name": "TEST_iter15 Bad",
            "customer_phone": "05551112233",
            "service_id": any_service["id"],
            "date": FUTURE_DATE,
            "time": "10:20",
            "auto_approve": False,
        }
        r = requests.post(f"{BASE_URL}/api/appointments/walkin", json=payload, headers=admin_headers)
        assert r.status_code == 400


# ---------- GET single appointment ----------
class TestGetAppointment:
    def test_get_single_admin(self, s, admin_headers):
        aid = pytest.iter15_appt_id
        r = requests.get(f"{BASE_URL}/api/appointments/{aid}", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == aid
        assert "service_name" in d
        assert "remaining_amount" in d
        assert "paid_total" in d


# ---------- Cleanup ----------
@pytest.fixture(scope="module", autouse=True)
def cleanup(request, s):
    yield
    # try admin login again for cleanup
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    if r.status_code != 200:
        return
    tok = r.json()["token"]
    hdr = {"Authorization": f"Bearer {tok}"}
    for aid_attr in ("iter15_appt_id", "iter15_walkin_id"):
        aid = getattr(pytest, aid_attr, None)
        if aid:
            requests.delete(f"{BASE_URL}/api/appointments/{aid}", headers=hdr)
