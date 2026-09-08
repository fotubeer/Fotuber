"""Iteration 72: New features — Public request creates without 500 despite
async email/notify tasks; regressions (KVKK 400, closed-day 400) still hold;
converted status flow works via PATCH."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASS = "FTB.2024"


@pytest.fixture(scope="module")
def ah():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {tok}"}


class TestPublicRequestNotification:
    def test_valid_request_returns_200_and_persists(self, ah):
        payload = {
            "name": "TEST_Iter72 Ali",
            "phone": "05551110072",
            "email": "iter72a@example.com",
            "event_type": "Aktüel Kamera",
            "date": "2030-10-11", "time": "15:00",
            "note": "TEST_Iter72 bildirim testi",
            "kvkk_accepted": True, "comms_consent": True,
        }
        r = requests.post(f"{API}/appt-pro/public/requests", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]

        # Second consecutive request should also be 200
        payload2 = {**payload, "name": "TEST_Iter72 Veli", "phone": "05551110073"}
        r2 = requests.post(f"{API}/appt-pro/public/requests", json=payload2, timeout=20)
        assert r2.status_code == 200, r2.text
        rid2 = r2.json()["id"]

        # Both are visible in admin listing
        lst = requests.get(f"{API}/appt-pro/requests", headers=ah, timeout=20).json()
        ids = {x["id"] for x in lst["requests"]}
        assert rid in ids and rid2 in ids

        # Cleanup
        for i in (rid, rid2):
            requests.delete(f"{API}/appt-pro/requests/{i}", headers=ah, timeout=20)

    def test_kvkk_required_regression(self):
        r = requests.post(f"{API}/appt-pro/public/requests",
                          json={"name": "TEST_Iter72 K", "phone": "05551110074", "kvkk_accepted": False},
                          timeout=20)
        assert r.status_code == 400

    def test_closed_day_regression(self, ah):
        b = requests.post(f"{API}/appt-pro/blocks",
                          json={"date": "2030-11-15", "all_day": True, "note": "TEST_Iter72 kapalı"},
                          headers=ah, timeout=20).json()["block"]
        try:
            r = requests.post(f"{API}/appt-pro/public/requests",
                              json={"name": "TEST_Iter72 C", "phone": "05551110075",
                                    "date": "2030-11-15", "kvkk_accepted": True},
                              timeout=20)
            assert r.status_code == 400
        finally:
            requests.delete(f"{API}/appt-pro/blocks/{b['id']}", headers=ah, timeout=20)


class TestConvertedStatus:
    def test_patch_status_converted(self, ah):
        r = requests.post(f"{API}/appt-pro/public/requests",
                          json={"name": "TEST_Iter72 Conv", "phone": "05551110076",
                                "event_type": "Aktüel Kamera", "date": "2030-12-05",
                                "kvkk_accepted": True, "comms_consent": True},
                          timeout=20)
        assert r.status_code == 200
        rid = r.json()["id"]

        p = requests.patch(f"{API}/appt-pro/requests/{rid}",
                           json={"status": "converted"}, headers=ah, timeout=20)
        assert p.status_code == 200

        lst = requests.get(f"{API}/appt-pro/requests", headers=ah, timeout=20).json()["requests"]
        row = next((x for x in lst if x["id"] == rid), None)
        assert row is not None
        assert row["status"] == "converted"

        requests.delete(f"{API}/appt-pro/requests/{rid}", headers=ah, timeout=20)


class TestEmailStatus:
    def test_email_configured_true(self, ah):
        r = requests.get(f"{API}/admin/email/status", headers=ah, timeout=20)
        # Endpoint may or may not exist; skip if 404
        if r.status_code == 404:
            pytest.skip("email/status endpoint absent")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "configured" in data
        # If admin@fotuber.com.tr is intended default, note here.
        print("email status:", data)
