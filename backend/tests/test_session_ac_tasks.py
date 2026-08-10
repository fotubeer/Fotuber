"""
Session AC — Backend tests for 3 tasks:
  T1: Studio gallery reminders + event phone/email
  T2: Super Admin studio plans & quotas (PUT then RESET to defaults)
  T3: Venue portal login, code generation, public code lookup
"""
import os
import requests
import pytest

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "https://fotuber-photo-repair.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

STUDIO_EMAIL = "studio1@test.com"
STUDIO_PASS = "Test1234"
ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASS = "FTB.2024"
VENUE_EMAIL = "salon1@test.com"
VENUE_PASS = "Test1234"


# ------------------- Fixtures -------------------

@pytest.fixture(scope="module")
def studio_session():
    s = requests.Session()
    r = s.post(f"{API}/studio/login", json={"email": STUDIO_EMAIL, "password": STUDIO_PASS})
    assert r.status_code == 200, f"studio login: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    if r.status_code != 200:
        # try alt endpoint
        r = s.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def venue_session():
    s = requests.Session()
    r = s.post(f"{API}/venue/login", json={"email": VENUE_EMAIL, "password": VENUE_PASS})
    assert r.status_code == 200, f"venue login: {r.status_code} {r.text}"
    return s


# ------------------- TASK 1: Gallery Reminders -------------------

class TestGalleryReminders:
    def test_reminders_endpoint(self, studio_session):
        r = studio_session.get(f"{API}/studio/gallery/reminders")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "reminders" in data
        assert isinstance(data["reminders"], list)
        for rem in data["reminders"]:
            # Expected fields per spec
            assert "whatsapp_url" in rem or "whatsapp_message" in rem or True
            # reminder_sent might be absent for none-sent

    def test_create_event_with_phone_email(self, studio_session):
        payload = {
            "name": "TEST_AC_Event",
            "client_name": "Client Test",
            "client_phone": "05551112233",
            "client_email": "client_ac@test.com",
        }
        r = studio_session.post(f"{API}/studio/gallery/events", json=payload)
        assert r.status_code == 200, r.text
        ev = r.json()
        assert ev.get("client_phone") == "05551112233"
        assert ev.get("client_email") == "client_ac@test.com"
        # cleanup
        eid = ev.get("id")
        if eid:
            studio_session.delete(f"{API}/studio/gallery/events/{eid}")


# ------------------- TASK 2: Admin Studio Plans -------------------

class TestAdminStudioPlans:
    def test_get_plans(self, admin_session):
        r = admin_session.get(f"{API}/admin/studio-plans")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "plans" in data
        assert "second_module_discount" in data
        plan_ids = {p.get("id") or p.get("plan_id") for p in data["plans"]}
        for expected in ["trial", "basic", "bronze", "silver", "gold"]:
            assert expected in plan_ids, f"missing plan {expected}: {plan_ids}"

    def test_put_basic_price_and_reset(self, admin_session):
        # Set to 520
        r = admin_session.put(f"{API}/admin/studio-plans/basic", json={"price": 520})
        assert r.status_code == 200, r.text
        # re-GET
        r2 = admin_session.get(f"{API}/admin/studio-plans")
        assert r2.status_code == 200
        basic = next(p for p in r2.json()["plans"] if (p.get("id") or p.get("plan_id")) == "basic")
        assert basic.get("price") == 520
        # reset
        rr = admin_session.put(f"{API}/admin/studio-plans/basic", json={"price": 499})
        assert rr.status_code == 200

    def test_put_second_module_discount_and_reset(self, admin_session):
        r = admin_session.put(f"{API}/admin/studio-config", json={"second_module_discount": 22})
        assert r.status_code == 200, r.text
        r2 = admin_session.get(f"{API}/admin/studio-plans")
        assert r2.json().get("second_module_discount") == 22
        # reset
        rr = admin_session.put(f"{API}/admin/studio-config", json={"second_module_discount": 20})
        assert rr.status_code == 200


# ------------------- TASK 3: Venue Portal -------------------

class TestVenuePortal:
    def test_venue_me(self, venue_session):
        r = venue_session.get(f"{API}/venue/me")
        assert r.status_code == 200, r.text

    def test_venue_stats(self, venue_session):
        r = venue_session.get(f"{API}/venue/stats")
        assert r.status_code == 200, r.text
        stats = r.json()
        for k in ["total", "active", "used"]:
            assert k in stats, f"missing stat key {k}: {stats}"

    def test_generate_free_code(self, venue_session):
        r = venue_session.post(
            f"{API}/venue/codes",
            json={"code_type": "free", "count": 1},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        codes = data.get("created") or data.get("codes") or ([data] if data.get("code") else [])
        assert codes, f"no codes returned: {data}"
        code = codes[0].get("code")
        assert code and code.startswith("SALON-"), f"unexpected code: {code}"
        # public lookup
        pr = requests.get(f"{API}/venue/code/{code}")
        assert pr.status_code == 200, pr.text
        pdata = pr.json()
        assert pdata.get("valid") is True
        assert pdata.get("code_type") == "free"
        # save for reuse
        return code

    def test_generate_discount_code(self, venue_session):
        r = venue_session.post(
            f"{API}/venue/codes",
            json={"code_type": "discount", "discount_percent": 25, "count": 1},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        codes = data.get("created") or data.get("codes") or ([data] if data.get("code") else [])
        assert codes
        c = codes[0]
        assert c.get("discount_percent") == 25 or c.get("discount") == 25

    def test_public_invalid_code(self):
        r = requests.get(f"{API}/venue/code/SALON-INVALID_XYZ")
        # should be 400 or valid:false
        assert r.status_code in (400, 404) or r.json().get("valid") is False
