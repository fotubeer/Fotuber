"""Tests for admin cancel & hard-delete appointment endpoints.

Verifies:
  - PATCH /api/appointments/{id} with status='cancelled' returns 200 and moves record to cancelled list.
  - DELETE /api/appointments/{id} returns {"ok": True} and removes the record entirely.
"""

import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://personnel-portal-16.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASSWORD = "FTB.2024"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def customer_token():
    uniq = uuid.uuid4().hex[:8]
    payload = {
        "name": f"Test User {uniq}",
        "surname": "Cancel",
        "email": f"test_cancel_{uniq}@example.com",
        "phone": f"050{uniq[:8]}",
        "password": "TestPass1!",
        "kvkk_consent": True,
        "marketing_consent": False,
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def customer_headers(customer_token):
    return {"Authorization": f"Bearer {customer_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def any_service_id(admin_headers):
    r = requests.get(f"{API}/services", timeout=15)
    assert r.status_code == 200, r.text
    items = r.json()
    assert items, "No services seeded in the system"
    return items[0]["id"]


def _pick_free_slot():
    """Return (date, time) that is unlikely to collide. Uses a far-future date."""
    import datetime as dt
    # 60 days ahead – highly unlikely to conflict
    d = dt.date.today() + dt.timedelta(days=60)
    return d.isoformat(), "15:00"


@pytest.fixture
def created_appointment(customer_headers, any_service_id):
    """Create a pending appointment via customer flow, return its id."""
    date, tm = _pick_free_slot()
    # try several slots if conflict
    attempts = ["15:00", "16:00", "11:00", "12:00", "13:00", "14:00", "17:00", "18:00", "19:00", "10:00", "09:00"]
    last_err = None
    for slot in attempts:
        payload = {
            "service_id": any_service_id,
            "date": date,
            "time": slot,
            "notes": "TEST cancel/delete",
            "contract_accepted": True,
        }
        r = requests.post(f"{API}/appointments", json=payload, headers=customer_headers, timeout=15)
        if r.status_code == 200 or r.status_code == 201:
            return r.json()["id"]
        last_err = r.text
    pytest.fail(f"Could not create test appointment. Last error: {last_err}")


class TestCancelAppointment:
    """PATCH /api/appointments/{id} → status='cancelled'"""

    def test_patch_cancel_returns_200_and_updates_status(self, admin_headers, created_appointment):
        aid = created_appointment
        r = requests.patch(
            f"{API}/appointments/{aid}",
            json={"status": "cancelled"},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "cancelled", body

        # Verify persistence — appointment shows up under status_filter=cancelled
        r2 = requests.get(f"{API}/appointments", params={"status_filter": "cancelled"}, headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        ids = [a["id"] for a in r2.json()]
        assert aid in ids, f"Cancelled appointment {aid} not found in cancelled list"

        # And it should NOT show up in pending anymore
        r3 = requests.get(f"{API}/appointments", params={"status_filter": "pending"}, headers=admin_headers, timeout=15)
        assert r3.status_code == 200
        pending_ids = [a["id"] for a in r3.json()]
        assert aid not in pending_ids, "Cancelled appointment still appears in pending list"

    def test_patch_cancel_requires_admin(self, customer_headers, created_appointment):
        aid = created_appointment
        r = requests.patch(
            f"{API}/appointments/{aid}",
            json={"status": "cancelled"},
            headers=customer_headers,
            timeout=15,
        )
        assert r.status_code in (401, 403), f"Expected 401/403 for customer PATCH, got {r.status_code}"


class TestHardDelete:
    """DELETE /api/appointments/{id}"""

    def test_delete_returns_ok_and_removes(self, admin_headers, created_appointment):
        aid = created_appointment
        r = requests.delete(f"{API}/appointments/{aid}", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True, body

        # Verify GONE from all lists
        for st in ("pending", "cancelled", "approved"):
            rr = requests.get(f"{API}/appointments", params={"status_filter": st}, headers=admin_headers, timeout=15)
            assert rr.status_code == 200
            ids = [a["id"] for a in rr.json()]
            assert aid not in ids, f"Deleted appointment still in {st} list"

    def test_delete_requires_admin(self, customer_headers):
        # Attempt with a fake id — expect 401/403 before we even hit the record
        r = requests.delete(f"{API}/appointments/nonexistent-id", headers=customer_headers, timeout=15)
        assert r.status_code in (401, 403), f"Expected 401/403 for customer DELETE, got {r.status_code}"


class TestFlowCancelThenDelete:
    """End-to-end: create → cancel → delete."""

    def test_full_flow(self, admin_headers, customer_headers, any_service_id):
        # Create
        date, _ = _pick_free_slot()
        payload = {"service_id": any_service_id, "date": date, "time": "09:00", "notes": "TEST flow", "contract_accepted": True}
        # try alt slots
        for slot in ["09:00", "10:00", "11:00", "12:00", "13:00"]:
            payload["time"] = slot
            r = requests.post(f"{API}/appointments", json=payload, headers=customer_headers, timeout=15)
            if r.status_code in (200, 201):
                break
        assert r.status_code in (200, 201), r.text
        aid = r.json()["id"]

        # Cancel
        rc = requests.patch(f"{API}/appointments/{aid}", json={"status": "cancelled"}, headers=admin_headers, timeout=15)
        assert rc.status_code == 200 and rc.json()["status"] == "cancelled"

        # Delete
        rd = requests.delete(f"{API}/appointments/{aid}", headers=admin_headers, timeout=15)
        assert rd.status_code == 200 and rd.json().get("ok") is True

        # Confirm gone
        rg = requests.get(f"{API}/appointments", params={"status_filter": "cancelled"}, headers=admin_headers, timeout=15)
        assert aid not in [a["id"] for a in rg.json()]
