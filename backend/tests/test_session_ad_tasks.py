"""Session AD — 3 enhancements: venue report + TR datepickers + campaign codes."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fotuber-photo-repair.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def venue_token():
    r = requests.post(f"{BASE_URL}/api/venue/login",
                      json={"email": "salon1@test.com", "password": "Test1234"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def venue_headers(venue_token):
    return {"Authorization": f"Bearer {venue_token}", "Content-Type": "application/json"}


class TestVenueReport:
    def test_report_returns_used_codes(self, venue_headers):
        r = requests.get(f"{BASE_URL}/api/venue/report", headers=venue_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "report" in data and "count" in data
        assert data["count"] >= 2
        rows = data["report"]
        couples = {row.get("couple_name") for row in rows}
        assert "Ayşe & Mehmet" in couples
        assert "Can & Ece" in couples
        # each row must have enriched fields
        for row in rows:
            assert "code" in row
            assert "code_type" in row
            assert "used_at" in row
            assert "invitation_slug" in row
            assert "event_date" in row

    def test_report_couple_enriched_from_invitation(self, venue_headers):
        r = requests.get(f"{BASE_URL}/api/venue/report", headers=venue_headers, timeout=15)
        rows = r.json()["report"]
        ayse = next((x for x in rows if x["couple_name"] == "Ayşe & Mehmet"), None)
        assert ayse is not None
        assert ayse["invitation_slug"] and "ayse-mehmet" in ayse["invitation_slug"]
        assert ayse["event_date"]
        assert ayse["code_type"] == "free"

        can = next((x for x in rows if x["couple_name"] == "Can & Ece"), None)
        assert can is not None
        assert can["code_type"] == "discount"
        assert can["discount_percent"] > 0


class TestVenueCampaignCodeGen:
    """Enhancement 3 uses POST /api/venue/codes (count=1) per number."""
    def test_generate_single_free_code(self, venue_headers):
        r = requests.post(f"{BASE_URL}/api/venue/codes", headers=venue_headers,
                          json={"count": 1, "code_type": "free", "discount_percent": 0,
                                "couple_name": "TEST_AD Camp Ayşe", "note": "Toplu kampanya"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data["created"]) == 1
        c = data["created"][0]
        assert c["code"].startswith("SALON-")
        assert c["code_type"] == "free"
        assert c["status"] == "active"

    def test_generate_single_discount_code(self, venue_headers):
        r = requests.post(f"{BASE_URL}/api/venue/codes", headers=venue_headers,
                          json={"count": 1, "code_type": "discount", "discount_percent": 25,
                                "couple_name": "TEST_AD Camp Zeynep", "note": "Toplu kampanya"}, timeout=15)
        assert r.status_code == 200
        c = r.json()["created"][0]
        assert c["code_type"] == "discount"
        assert c["discount_percent"] == 25

    def test_stats_reflect_new_codes(self, venue_headers):
        r = requests.get(f"{BASE_URL}/api/venue/stats", headers=venue_headers, timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert s["total"] >= s["used"]
        assert s["active"] == s["total"] - s["used"]
