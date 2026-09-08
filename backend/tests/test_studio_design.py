"""Tests for Studio Suite + Davetiye Tasarım Stüdyosu (additive modules)."""
import io
import os
import re
import time
import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASSWORD = "FTB.2024"

FTB_RE = re.compile(r"^FTB-[A-Z0-9]{5,6}$")


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def studio_creds():
    ts = int(time.time())
    return {
        "email": f"TEST_studio_{ts}@example.com",
        "password": "StudioPass123",
        "firma_adi": "TEST Stüdyo",
        "phone": "+905550001122",
    }


# ---------- STUDIO --------------------------------------------------------
class TestStudioPlans:
    def test_plans_public(self, s):
        r = s.get(f"{API}/studio/plans")
        assert r.status_code == 200
        data = r.json()
        assert data["trial_days"] == 3
        plan_ids = [p["id"] for p in data["plans"]]
        assert plan_ids == ["trial", "basic", "bronze", "silver", "gold"]


class TestStudioAuth:
    reg_token = None
    reg_account = None

    def test_register_missing_kvkk(self, s, studio_creds):
        payload = {**studio_creds, "kvkk_consent": False}
        r = s.post(f"{API}/studio/register", json=payload)
        assert r.status_code == 400

    def test_register_success(self, s, studio_creds):
        payload = {**studio_creds, "kvkk_consent": True}
        r = s.post(f"{API}/studio/register", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "token" in d and "account" in d
        acc = d["account"]
        assert FTB_RE.match(acc["ftb_code"]), acc["ftb_code"]
        assert acc["membership"]["status"] == "trial"
        assert acc["membership"]["days_left"] == 3
        assert acc["membership"]["limits"]["watermark_forced"] is True
        assert acc["membership"]["limits"]["storage_gb"] == 10
        assert acc["membership"]["limits"]["max_events"] == 2
        assert acc["membership"]["limits"]["ai_credits"] == 0
        TestStudioAuth.reg_token = d["token"]
        TestStudioAuth.reg_account = acc

    def test_register_duplicate(self, s, studio_creds):
        payload = {**studio_creds, "kvkk_consent": True}
        r = s.post(f"{API}/studio/register", json=payload)
        assert r.status_code == 400

    def test_login_wrong_password(self, s, studio_creds):
        r = requests.post(f"{API}/studio/login", json={"email": studio_creds["email"], "password": "wrong"})
        assert r.status_code == 401

    def test_login_success(self, s, studio_creds):
        r = requests.post(f"{API}/studio/login", json={"email": studio_creds["email"], "password": studio_creds["password"]})
        assert r.status_code == 200
        assert r.json()["account"]["email"] == studio_creds["email"].lower()

    def test_me(self, studio_creds):
        assert TestStudioAuth.reg_token
        r = requests.get(f"{API}/studio/me", headers={"Authorization": f"Bearer {TestStudioAuth.reg_token}"})
        assert r.status_code == 200
        d = r.json()
        assert d["account"]["email"] == studio_creds["email"].lower()
        assert len(d["plans"]) == 5

    def test_me_no_auth(self):
        r = requests.get(f"{API}/studio/me")
        assert r.status_code == 401


# ---------- DESIGN STUDIO -------------------------------------------------
class TestDesignPublic:
    def test_fonts(self):
        r = requests.get(f"{API}/design/fonts")
        assert r.status_code == 200
        d = r.json()
        assert d["count"] >= 55
        assert any(f["family"] == "Playfair Display" for f in d["fonts"])

    def test_templates(self):
        r = requests.get(f"{API}/design/templates")
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()["templates"]]
        for tid in ["blank-portrait", "blank-square", "wedding-classic", "engagement-blush", "birthday-fun"]:
            assert tid in ids


class TestDesignProjectsAuth:
    pid = None

    def test_projects_require_auth(self):
        r = requests.get(f"{API}/design/projects")
        assert r.status_code == 401
        r = requests.post(f"{API}/design/projects", json={"title": "x"})
        assert r.status_code == 401

    def test_crud(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        # CREATE
        r = requests.post(f"{API}/design/projects", json={
            "title": "TEST Design",
            "canvas_json": {"objects": []},
            "width": 1080, "height": 1350,
        }, headers=h)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        TestDesignProjectsAuth.pid = pid
        # LIST
        r = requests.get(f"{API}/design/projects", headers=h)
        assert r.status_code == 200
        assert any(p["id"] == pid for p in r.json())
        # GET
        r = requests.get(f"{API}/design/projects/{pid}", headers=h)
        assert r.status_code == 200
        assert r.json()["title"] == "TEST Design"
        # UPDATE
        r = requests.put(f"{API}/design/projects/{pid}", json={
            "title": "TEST Design Updated",
            "canvas_json": {"objects": []},
            "width": 1080, "height": 1350,
        }, headers=h)
        assert r.status_code == 200
        assert r.json()["title"] == "TEST Design Updated"
        # verify persistence
        r = requests.get(f"{API}/design/projects/{pid}", headers=h)
        assert r.json()["title"] == "TEST Design Updated"
        # DELETE
        r = requests.delete(f"{API}/design/projects/{pid}", headers=h)
        assert r.status_code == 200
        r = requests.get(f"{API}/design/projects/{pid}", headers=h)
        assert r.status_code == 404


class TestDesignUpload:
    def test_upload_no_auth(self):
        r = requests.post(f"{API}/design/upload", files={"file": ("t.png", b"\x89PNG\r\n\x1a\n", "image/png")})
        assert r.status_code == 401

    def test_upload_non_image(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.post(f"{API}/design/upload", files={"file": ("t.txt", b"hello", "text/plain")}, headers=h)
        assert r.status_code == 400

    def test_upload_image_and_fetch(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        # Minimal PNG (1x1 transparent)
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
               b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8"
               b"\x0f\x00\x00\x01\x01\x00\x01\x5c\xcd\xff\x69\x00\x00\x00\x00IEND\xaeB`\x82")
        r = requests.post(f"{API}/design/upload", files={"file": ("t.png", png, "image/png")}, headers=h)
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        assert r.json()["url"].endswith(aid)
        # fetch
        r = requests.get(f"{API}{r.json()['url'].replace('/api','')}")
        # asset endpoint is public
        r2 = requests.get(f"{API}/design/asset/{aid}")
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image/")


# ---------- REGRESSION ---------------------------------------------------
class TestRegression:
    def test_services(self):
        r = requests.get(f"{API}/services")
        assert r.status_code == 200

    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200

    def test_print_options(self):
        r = requests.get(f"{API}/invitations/print-options")
        assert r.status_code == 200
