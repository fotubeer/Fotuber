"""Tests for /api/appt-pro (walk-in appointment + contract system)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fotuber-photo-repair.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASS = "FTB.2024"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="module")
def ah(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ── Services ────────────────────────────────────────────────────────────
class TestServices:
    def test_list_services_seeds_defaults(self, ah):
        r = requests.get(f"{API}/appt-pro/services", headers=ah, timeout=20)
        assert r.status_code == 200, r.text
        svcs = r.json()["services"]
        assert len(svcs) >= 8
        venue = [s for s in svcs if s.get("venue_enabled")]
        shoot = [s for s in svcs if not s.get("venue_enabled")]
        assert len(venue) >= 4
        assert len(shoot) >= 4
        # venue events should have 4 options each
        for s in venue[:4]:
            assert len(s["options"]) == 4

    def test_service_crud(self, ah):
        payload = {
            "name": "TEST_Service_X",
            "active": True, "sort": 99, "base_price": 500, "venue_enabled": True,
            "options": [{"label": "TEST_Opt", "price": 100}],
        }
        c = requests.post(f"{API}/appt-pro/services", json=payload, headers=ah, timeout=20)
        assert c.status_code == 200, c.text
        svc = c.json()["service"]
        assert svc["name"] == "TEST_Service_X"
        assert svc["options"][0]["price"] == 100
        sid = svc["id"]

        payload["name"] = "TEST_Service_X2"
        u = requests.patch(f"{API}/appt-pro/services/{sid}", json=payload, headers=ah, timeout=20)
        assert u.status_code == 200

        g = requests.get(f"{API}/appt-pro/services", headers=ah, timeout=20)
        names = [s["name"] for s in g.json()["services"]]
        assert "TEST_Service_X2" in names

        d = requests.delete(f"{API}/appt-pro/services/{sid}", headers=ah, timeout=20)
        assert d.status_code == 200


# ── Products ────────────────────────────────────────────────────────────
class TestProducts:
    def test_list_products_seeds(self, ah):
        r = requests.get(f"{API}/appt-pro/products", headers=ah, timeout=20)
        assert r.status_code == 200
        data = r.json()
        prods = data["products"]
        cats = set(p["category"] for p in prods)
        assert cats == {"album", "canvas", "fine", "poster", "print", "magazine"}
        assert len(prods) >= 24

    def test_product_crud(self, ah):
        payload = {"category": "album", "name": "TEST_Album", "variant": "T", "size": "10x10", "price": 999, "active": True, "sort": 0}
        c = requests.post(f"{API}/appt-pro/products", json=payload, headers=ah, timeout=20)
        assert c.status_code == 200, c.text
        pid = c.json()["product"]["id"]
        assert c.json()["product"]["price"] == 999

        payload["price"] = 1500
        u = requests.patch(f"{API}/appt-pro/products/{pid}", json=payload, headers=ah, timeout=20)
        assert u.status_code == 200

        # invalid category
        bad = requests.post(f"{API}/appt-pro/products", json={**payload, "category": "xxx"}, headers=ah, timeout=20)
        assert bad.status_code == 400

        d = requests.delete(f"{API}/appt-pro/products/{pid}", headers=ah, timeout=20)
        assert d.status_code == 200


# ── Contract settings ───────────────────────────────────────────────────
class TestContractSettings:
    def test_get_defaults(self, ah):
        r = requests.get(f"{API}/appt-pro/contract-settings", headers=ah, timeout=20)
        assert r.status_code == 200
        s = r.json()["settings"]
        assert "design" in s
        assert s["design"].get("accent_color")
        assert s["design"].get("title_font")
        assert s.get("brand_name_venue")
        assert s.get("brand_name_photo")
        clauses_text = " ".join(c["body"] for c in s.get("clauses", []))
        assert "cayma bedeli" in clauses_text.lower()
        assert "kapora" not in clauses_text.lower()

    def test_put_settings_persists(self, ah):
        payload = {
            "brand_name_venue": "TEST Davet Evi",
            "brand_name_photo": "TEST Photography",
            "design": {"accent_color": "#ff0000", "title_font": "'Playfair Display', serif"},
        }
        r = requests.put(f"{API}/appt-pro/contract-settings", json=payload, headers=ah, timeout=20)
        assert r.status_code == 200
        s = r.json()["settings"]
        assert s["brand_name_venue"] == "TEST Davet Evi"
        assert s["design"]["accent_color"] == "#ff0000"
        # Restore
        requests.put(f"{API}/appt-pro/contract-settings",
                     json={"brand_name_venue": "FOTUBER Photography & Davet Evi",
                           "brand_name_photo": "FOTUBER Photography",
                           "design": {"accent_color": "#111827", "title_font": "'Great Vibes', cursive"}},
                     headers=ah, timeout=20)


# ── Combined appointment+contract ───────────────────────────────────────
class TestApptBuilder:
    def test_create_appt_and_contract(self, ah):
        # get a venue service
        svcs = requests.get(f"{API}/appt-pro/services", headers=ah, timeout=20).json()["services"]
        venue_svc = next(s for s in svcs if s.get("venue_enabled"))
        opt = venue_svc["options"][0] if venue_svc["options"] else {"label": "İkramlı", "price": 0}

        payload = {
            "customer_name": "TEST Gelin & Damat",
            "customer_phone": "05551234567",
            "service_name_snapshot": venue_svc["name"] + " · " + opt["label"],
            "date": "2026-08-20", "time": "18:00",
            "venue": "TEST Salon",
            "line_items": [
                {"type": "service", "label": venue_svc["name"] + " " + opt["label"], "price": 10000},
                {"type": "product", "label": "Albüm 30x50", "price": 2000},
            ],
            "subtotal": 12000, "discount_percent": 10, "discount_amount": 1200,
            "total": 10800, "deposit_amount": 3000, "paid_amount": 0,
            "contract": {
                "party_role": "gelin", "party_name": "TEST Ayşe", "party_tc": "12345678901",
                "party_email": "test@example.com", "party_address": "TEST Addr",
                "party_phone": "05551234567",
                "bride_name": "TEST Ayşe", "groom_name": "TEST Mehmet",
                "bride_phone": "05551234567", "groom_phone": "05559876543",
                "event_date": "2026-08-20", "event_time": "18:00", "venue": "TEST Salon",
                "line_items": [],
                "subtotal": 12000, "discount_percent": 10, "discount_amount": 1200,
                "total": 10800, "deposit_amount": 3000, "remaining_amount": 7800,
                "consent_social": True, "consent_marketing": False,
                "brand_variant": "venue",
            },
        }
        r = requests.post(f"{API}/appt-pro/appointments", json=payload, headers=ah, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        appt_id = data["appointment_id"]
        contract_id = data["contract_id"]

        # Verify appt is in main list
        alist = requests.get(f"{API}/appointments", headers=ah, timeout=20)
        assert alist.status_code == 200
        appts = alist.json()
        # Handle either shape
        rows = appts.get("appointments", appts) if isinstance(appts, dict) else appts
        match = next((a for a in rows if a.get("id") == appt_id), None)
        assert match is not None, "Appointment not found in /api/appointments"
        assert match.get("service_name_snapshot")
        assert match.get("total_amount") == 10800
        assert match.get("status") == "approved"

        # Verify contract
        gc = requests.get(f"{API}/appt-pro/contracts/{contract_id}", headers=ah, timeout=20)
        assert gc.status_code == 200
        c = gc.json()["contract"]
        assert c["approval_status"] == "pending"
        assert c["public_token"]
        assert c["brand_variant"] == "venue"
        assert c["deposit_amount"] == 3000
        assert c["remaining_amount"] == 7800

        # Public GET (no auth)
        token = c["public_token"]
        pub = requests.get(f"{API}/appt-pro/public/contracts/{token}", timeout=20)
        assert pub.status_code == 200
        pdata = pub.json()
        assert "created_by" not in pdata["contract"]
        assert pdata["settings"]

        # Public approve: reject with accepted=false
        bad = requests.post(f"{API}/appt-pro/public/contracts/{token}/approve",
                            json={"approver_name": "TEST", "accepted": False}, timeout=20)
        assert bad.status_code == 400

        # Public approve success
        ok = requests.post(f"{API}/appt-pro/public/contracts/{token}/approve",
                           json={"approver_name": "TEST Ayşe", "accepted": True}, timeout=20)
        assert ok.status_code == 200

        # Verify status flipped
        gc2 = requests.get(f"{API}/appt-pro/contracts/{contract_id}", headers=ah, timeout=20)
        assert gc2.json()["contract"]["approval_status"] == "approved"

        # Cleanup
        requests.delete(f"{API}/appt-pro/contracts/{contract_id}", headers=ah, timeout=20)
        # Try deleting the appointment
        requests.delete(f"{API}/appointments/{appt_id}", headers=ah, timeout=20)


# ── RBAC (unauthenticated should be 401/403) ────────────────────────────
class TestRBAC:
    def test_no_auth_blocked(self):
        r = requests.get(f"{API}/appt-pro/services", timeout=20)
        assert r.status_code in (401, 403)

    def test_public_endpoints_no_auth(self):
        # unknown token → 404, but should NOT be 401
        r = requests.get(f"{API}/appt-pro/public/contracts/nonexistent-token", timeout=20)
        assert r.status_code == 404
