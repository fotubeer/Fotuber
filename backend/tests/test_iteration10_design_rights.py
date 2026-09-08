"""Iteration 10 — Faz A Design Studio: admin CRUD, studio rights packages,
PayTR link creation, AI revise (ai-edit) — at most ONE real AI call.
Regression: /api/services, admin login, existing PayTR subscription."""
import os
import time
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASSWORD = "FTB.2024"
STUDIO_EMAIL = "studio1@test.com"
STUDIO_PASSWORD = "Test1234"


# --- Fixtures --------------------------------------------------------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def studio_token():
    r = requests.post(f"{BASE}/api/studio/login",
                      json={"email": STUDIO_EMAIL, "password": STUDIO_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"studio login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def studio_headers(studio_token):
    return {"Authorization": f"Bearer {studio_token}"}


# --- Admin Design-Rights Packages CRUD ------------------------------------
class TestAdminPackagesCRUD:
    def test_list_requires_auth(self):
        r = requests.get(f"{BASE}/api/admin/design-rights-packages", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_create_requires_auth(self):
        r = requests.post(f"{BASE}/api/admin/design-rights-packages",
                          json={"name": "X", "rights": 1, "price": 1.0}, timeout=15)
        assert r.status_code in (401, 403)

    def test_list_seeded(self, admin_headers):
        r = requests.get(f"{BASE}/api/admin/design-rights-packages",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        pkgs = r.json()
        assert isinstance(pkgs, list)
        assert len(pkgs) >= 4
        names = {p["name"] for p in pkgs}
        # Seeded 4 packages
        assert "1 Tasarım Hakkı" in names
        assert "3 Tasarım Hakkı" in names
        assert "5 Tasarım Hakkı" in names
        assert "10 Tasarım Hakkı" in names
        # Check price of one
        for p in pkgs:
            if p["name"] == "1 Tasarım Hakkı":
                assert float(p["price"]) == 149.0
                assert int(p["rights"]) == 1

    def test_full_crud_cycle(self, admin_headers):
        # CREATE
        payload = {"name": "TEST_Paket_2", "rights": 2, "price": 249.0, "active": True, "sort": 99}
        r = requests.post(f"{BASE}/api/admin/design-rights-packages",
                          json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == "TEST_Paket_2"
        assert created["rights"] == 2
        assert created["price"] == 249.0
        pid = created["id"]

        # Verify via list
        r = requests.get(f"{BASE}/api/admin/design-rights-packages",
                         headers=admin_headers, timeout=15)
        assert any(p["id"] == pid for p in r.json())

        # UPDATE
        upd = {"name": "TEST_Paket_2_UPD", "rights": 4, "price": 349.0, "active": False, "sort": 100}
        r = requests.put(f"{BASE}/api/admin/design-rights-packages/{pid}",
                         json=upd, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["name"] == "TEST_Paket_2_UPD"
        assert u["rights"] == 4
        assert u["price"] == 349.0
        assert u["active"] is False

        # DELETE
        r = requests.delete(f"{BASE}/api/admin/design-rights-packages/{pid}",
                            headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # 404 after delete
        r = requests.put(f"{BASE}/api/admin/design-rights-packages/{pid}",
                        json=upd, headers=admin_headers, timeout=15)
        assert r.status_code == 404
        r = requests.delete(f"{BASE}/api/admin/design-rights-packages/{pid}",
                           headers=admin_headers, timeout=15)
        assert r.status_code == 404


# --- Studio Rights Packages -----------------------------------------------
class TestStudioRightsPackages:
    def test_requires_studio_auth(self):
        r = requests.get(f"{BASE}/api/studio/design/rights-packages", timeout=15)
        assert r.status_code == 401

    def test_returns_active_and_rights(self, studio_headers):
        r = requests.get(f"{BASE}/api/studio/design/rights-packages",
                         headers=studio_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "packages" in data and "design_rights" in data
        assert isinstance(data["packages"], list)
        assert len(data["packages"]) >= 4
        assert all(p.get("active") for p in data["packages"])
        assert isinstance(data["design_rights"], int)
        assert data["design_rights"] >= 0


# --- PayTR Studio Design-Rights link creation -----------------------------
class TestPayTRStudioRights:
    def test_create_link_and_status(self, studio_headers):
        # Get a package id
        r = requests.get(f"{BASE}/api/studio/design/rights-packages",
                         headers=studio_headers, timeout=15)
        pkg_id = r.json()["packages"][0]["id"]

        r = requests.post(f"{BASE}/api/studio/payments/design-rights/create",
                          json={"package_id": pkg_id, "origin_url": BASE},
                          headers=studio_headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "callback_id" in body and "link" in body
        assert body["link"].startswith("https"), f"link not https: {body['link']}"
        cid = body["callback_id"]

        # status: pending
        r = requests.get(f"{BASE}/api/studio/payments/status/{cid}",
                         headers=studio_headers, timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert s["status"] == "pending"
        assert s["kind"] == "studio_design_rights"

        # foreign / unknown callback -> 404
        r = requests.get(f"{BASE}/api/studio/payments/status/does-not-exist-{int(time.time())}",
                         headers=studio_headers, timeout=15)
        assert r.status_code == 404

    def test_invalid_package(self, studio_headers):
        r = requests.post(f"{BASE}/api/studio/payments/design-rights/create",
                          json={"package_id": "bogus", "origin_url": BASE},
                          headers=studio_headers, timeout=15)
        assert r.status_code == 400


# --- AI Revise (ai-edit) — ONE real Gemini call ---------------------------
class TestAiEdit:
    def test_invalid_asset_404(self, studio_headers):
        r = requests.post(f"{BASE}/api/studio/design/ai-edit",
                          json={"asset_id": "not-a-real-asset-id",
                                "instruction": "Daha koyu tonlara al"},
                          headers=studio_headers, timeout=30)
        assert r.status_code == 404

    def test_revise_success_once(self, studio_headers):
        # Fetch an existing owned AI asset via mongo
        import asyncio, os as _os
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        from motor.motor_asyncio import AsyncIOMotorClient

        async def _lookup():
            c = AsyncIOMotorClient(_os.environ["MONGO_URL"])
            db = c[_os.environ["DB_NAME"]]
            s = await db.studio_accounts.find_one({"email": STUDIO_EMAIL})
            a = await db.design_assets.find_one(
                {"owner_studio_id": s["id"], "source": "ai"})
            return s["id"], a["id"] if a else None, int(s.get("design_rights", 0))
        studio_id, asset_id, rights_before = asyncio.run(_lookup())
        assert asset_id, "No AI asset seed available"

        # Fire the ai-edit call (real Gemini, ~15-30s)
        r = requests.post(f"{BASE}/api/studio/design/ai-edit",
                          json={"asset_id": asset_id,
                                "instruction": "Biraz daha altın vurgu ekle, kompozisyonu koru."},
                          headers=studio_headers, timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert "image" in body and "id" in body["image"] and "url" in body["image"]
        assert body["image"]["url"].startswith("/api/design/asset/")
        assert isinstance(body["rights_remaining"], int)
        # Decremented by exactly 1
        assert body["rights_remaining"] == rights_before - 1, \
            f"rights not decremented: before={rights_before}, after={body['rights_remaining']}"

        # Serve the image
        img_id = body["image"]["id"]
        r = requests.get(f"{BASE}/api/design/asset/{img_id}", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 1000


# --- Foreign asset guard (owner mismatch → 404) ---------------------------
class TestAiEditForeign:
    def test_foreign_asset_404(self, studio_headers):
        # Any known asset from a different owner should 404. Simulate by using a
        # UUID for asset owned by nobody / by admin (member uploads). Fall back
        # to a made-up id which we already covered above; instead search DB for
        # an asset with a different owner if any exists.
        import asyncio, os as _os
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        from motor.motor_asyncio import AsyncIOMotorClient

        async def _find_foreign():
            c = AsyncIOMotorClient(_os.environ["MONGO_URL"])
            db = c[_os.environ["DB_NAME"]]
            s = await db.studio_accounts.find_one({"email": STUDIO_EMAIL})
            other = await db.design_assets.find_one(
                {"owner_studio_id": {"$ne": s["id"]}})
            return other["id"] if other else None
        foreign_id = asyncio.run(_find_foreign())
        if not foreign_id:
            pytest.skip("No foreign asset available to test ownership guard")
        r = requests.post(f"{BASE}/api/studio/design/ai-edit",
                          json={"asset_id": foreign_id, "instruction": "xx"},
                          headers=studio_headers, timeout=30)
        assert r.status_code == 404


# --- Regression ------------------------------------------------------------
class TestRegression:
    def test_services_ok(self):
        r = requests.get(f"{BASE}/api/services", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_login_ok(self):
        r = requests.post(f"{BASE}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200

    def test_existing_paytr_subscription_link(self):
        # Existing member/subscription PayTR flow. Login as expired member
        r = requests.post(f"{BASE}/api/auth/login",
                          json={"email": "expired@fotuber.com.tr", "password": "Test1234"},
                          timeout=15)
        if r.status_code != 200:
            pytest.skip(f"expired member login unavailable: {r.status_code}")
        tok = r.json().get("token") or r.json().get("access_token")
        h = {"Authorization": f"Bearer {tok}"}
        # Get available subscription packages
        r = requests.get(f"{BASE}/api/subscription-packages", timeout=15)
        if r.status_code != 200 or not r.json():
            pytest.skip("No subscription-packages endpoint / no data")
        pkg_id = r.json()[0]["id"]
        r = requests.post(f"{BASE}/api/payments/paytr/create",
                          json={"kind": "subscription", "package_id": pkg_id,
                                "origin_url": BASE},
                          headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("link", "").startswith("https")
