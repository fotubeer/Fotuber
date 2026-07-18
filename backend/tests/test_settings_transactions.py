"""
Fotuber Iteration 2 backend tests:
- Site Settings (public GET, admin PUT, logo upload/download)
- Cash-flow Transactions (admin CRUD)
- Transactions Summary (daily/weekly/monthly aggregation)
- Auth guards (customer 403, unauthenticated 401)
"""
import io
import os
import struct
import uuid
import zlib
from datetime import datetime, timedelta, timezone

import pytest
import requests


def _load_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # load from frontend/.env directly
        env_path = "/app/frontend/.env"
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
    assert url, "REACT_APP_BACKEND_URL must be set (env or /app/frontend/.env)"
    return url.rstrip("/")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASSWORD = "FTB.2024"

TODAY = datetime.now(timezone.utc).date().isoformat()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
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
@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def customer_client():
    email = f"TEST_cf_{uuid.uuid4().hex[:8]}@example.com"
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={
        "name": "Cash", "surname": "Flow", "email": email,
        "phone": "05001110000", "password": "pass1234",
        "kvkk_consent": True, "marketing_consent": False,
    })
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module", autouse=True)
def clean_today_transactions(admin_client):
    """Ensure today has no leftover transactions before running tests.
    Runs before any transaction test, and after all tests to clean up."""
    # Pre-clean
    r = admin_client.get(f"{API}/transactions",
                         params={"date_from": TODAY, "date_to": TODAY})
    if r.status_code == 200:
        for t in r.json():
            admin_client.delete(f"{API}/transactions/{t['id']}")
    yield
    # Post-clean
    r = admin_client.get(f"{API}/transactions",
                         params={"date_from": TODAY, "date_to": TODAY})
    if r.status_code == 200:
        for t in r.json():
            admin_client.delete(f"{API}/transactions/{t['id']}")


# ---------------------------------------------------------------------------
# Settings tests
# ---------------------------------------------------------------------------
class TestSettings:
    def test_get_settings_public(self):
        r = requests.get(f"{API}/settings")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)
        assert "business_name" in data, f"missing business_name in {list(data.keys())}"
        # default seeded name is Fotuber (may have been updated in a prior run; verify field exists and type)
        assert isinstance(data["business_name"], str)
        # ensure default fields exist
        for k in ["phone", "email", "hero_title", "hero_title_accent"]:
            assert k in data, f"missing default field {k}"

    def test_put_settings_admin_updates(self, admin_client):
        payload = {"business_name": "Fotuber Test", "phone": "05001112233"}
        r = admin_client.put(f"{API}/settings", json=payload)
        assert r.status_code == 200, r.text
        # Verify via GET
        r = requests.get(f"{API}/settings")
        assert r.status_code == 200
        data = r.json()
        assert data["business_name"] == "Fotuber Test"
        assert data["phone"] == "05001112233"

        # restore defaults to leave clean state
        admin_client.put(f"{API}/settings",
                         json={"business_name": "Fotuber", "phone": "05010002523"})

    def test_put_settings_unauth_forbidden(self):
        r = requests.put(f"{API}/settings", json={"business_name": "Hacker"})
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_put_settings_customer_forbidden(self, customer_client):
        r = customer_client.put(f"{API}/settings", json={"business_name": "Hacker"})
        assert r.status_code == 403

    def test_logo_upload_and_download(self, admin_client):
        img = _make_png_bytes()
        files = {"file": ("logo.png", img, "image/png")}
        r = admin_client.post(f"{API}/settings/logo", files=files)
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
        body = r.json()
        assert "logo_id" in body and isinstance(body["logo_id"], str)
        logo_id = body["logo_id"]

        # settings should now show logo_id
        s = requests.get(f"{API}/settings").json()
        assert s.get("logo_id") == logo_id

        # download
        r = requests.get(f"{API}/settings/logo/{logo_id}")
        assert r.status_code == 200
        ct = r.headers.get("Content-Type", "")
        assert ct.startswith("image/"), f"expected image content-type, got {ct}"
        # bytes should be non-empty and roughly match uploaded size
        assert len(r.content) > 0
        # Emergent storage may re-encode, so allow flexible size check
        assert abs(len(r.content) - len(img)) < max(500, len(img))

    def test_logo_upload_customer_forbidden(self, customer_client):
        img = _make_png_bytes()
        files = {"file": ("logo.png", img, "image/png")}
        r = customer_client.post(f"{API}/settings/logo", files=files)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Transactions CRUD tests
# ---------------------------------------------------------------------------
class TestTransactions:

    def test_create_income_and_expense(self, admin_client):
        # income
        r = admin_client.post(f"{API}/transactions", json={
            "kind": "income", "amount": 1500, "payment_method": "cash",
            "category": "Kapora", "description": "test income",
            "date": TODAY,
        })
        assert r.status_code == 200, r.text
        income = r.json()
        assert income["kind"] == "income"
        assert income["amount"] == 1500
        assert income["payment_method"] == "cash"
        assert income["category"] == "Kapora"
        assert income["date"] == TODAY
        assert "id" in income and isinstance(income["id"], str)
        pytest.income_id = income["id"]

        # expense
        r = admin_client.post(f"{API}/transactions", json={
            "kind": "expense", "amount": 500, "payment_method": "card",
            "category": "Malzeme", "description": "test expense",
            "date": TODAY,
        })
        assert r.status_code == 200, r.text
        exp = r.json()
        assert exp["kind"] == "expense"
        assert exp["amount"] == 500
        assert exp["payment_method"] == "card"
        assert "id" in exp
        pytest.expense_id = exp["id"]

    def test_list_transactions_and_filters(self, admin_client):
        r = admin_client.get(f"{API}/transactions")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        ids = {t["id"] for t in items}
        assert pytest.income_id in ids
        assert pytest.expense_id in ids

        # filter kind=income
        r = admin_client.get(f"{API}/transactions", params={"kind": "income"})
        assert r.status_code == 200
        for t in r.json():
            assert t["kind"] == "income"
        assert any(t["id"] == pytest.income_id for t in r.json())
        assert not any(t["id"] == pytest.expense_id for t in r.json())

        # filter method=card
        r = admin_client.get(f"{API}/transactions", params={"method": "card"})
        assert r.status_code == 200
        for t in r.json():
            assert t["payment_method"] == "card"
        assert any(t["id"] == pytest.expense_id for t in r.json())
        assert not any(t["id"] == pytest.income_id for t in r.json())

        # date_from=today returns both
        r = admin_client.get(f"{API}/transactions", params={"date_from": TODAY})
        assert r.status_code == 200
        ids = {t["id"] for t in r.json()}
        assert pytest.income_id in ids
        assert pytest.expense_id in ids

    def test_summary_today_week_month(self, admin_client):
        r = admin_client.get(f"{API}/transactions/summary")
        assert r.status_code == 200, r.text
        data = r.json()

        for k in ("today", "week", "month", "daily_series",
                  "week_series", "month_series"):
            assert k in data, f"missing key {k}"

        # today assertions - since we cleaned before, only our 2 records exist
        t = data["today"]
        assert t["income"] == 1500, f"today income expected 1500, got {t['income']}"
        assert t["expense"] == 500, f"today expense expected 500, got {t['expense']}"
        assert t["net"] == 1000, f"today net expected 1000, got {t['net']}"
        assert "by_method" in t
        bm = t["by_method"]
        for m in ("cash", "card", "transfer"):
            assert m in bm, f"by_method missing {m}"
        assert bm["cash"] == 1500
        assert bm["card"] == -500
        assert bm["transfer"] == 0

        # series lengths
        assert isinstance(data["daily_series"], list) and len(data["daily_series"]) == 7
        assert isinstance(data["week_series"], list) and len(data["week_series"]) == 4
        assert isinstance(data["month_series"], list) and len(data["month_series"]) == 6

        # daily_series last entry should be today with income=1500 expense=500
        last_day = data["daily_series"][-1]
        assert last_day["date"] == TODAY
        assert last_day["income"] == 1500
        assert last_day["expense"] == 500

    def test_update_transaction(self, admin_client):
        # update income amount to 2000
        r = admin_client.put(f"{API}/transactions/{pytest.income_id}", json={
            "kind": "income", "amount": 2000, "payment_method": "cash",
            "category": "Kapora", "description": "updated",
            "date": TODAY,
        })
        assert r.status_code == 200, r.text
        assert r.json()["amount"] == 2000

        # summary should reflect
        r = admin_client.get(f"{API}/transactions/summary")
        assert r.status_code == 200
        data = r.json()
        assert data["today"]["income"] == 2000
        assert data["today"]["net"] == 1500  # 2000 - 500
        assert data["today"]["by_method"]["cash"] == 2000

    def test_delete_transaction(self, admin_client):
        r = admin_client.delete(f"{API}/transactions/{pytest.expense_id}")
        assert r.status_code == 200
        # verify gone
        r = admin_client.get(f"{API}/transactions", params={"date_from": TODAY})
        assert r.status_code == 200
        ids = {t["id"] for t in r.json()}
        assert pytest.expense_id not in ids
        # also delete income cleanup
        admin_client.delete(f"{API}/transactions/{pytest.income_id}")


# ---------------------------------------------------------------------------
# Auth guard tests
# ---------------------------------------------------------------------------
class TestTransactionAuthGuards:
    def test_unauth_get_transactions(self):
        r = requests.get(f"{API}/transactions")
        assert r.status_code == 401, f"expected 401, got {r.status_code}"

    def test_customer_get_transactions_forbidden(self, customer_client):
        r = customer_client.get(f"{API}/transactions")
        assert r.status_code == 403

    def test_customer_post_transactions_forbidden(self, customer_client):
        r = customer_client.post(f"{API}/transactions", json={
            "kind": "income", "amount": 100, "payment_method": "cash", "date": TODAY,
        })
        assert r.status_code == 403

    def test_customer_summary_forbidden(self, customer_client):
        r = customer_client.get(f"{API}/transactions/summary")
        assert r.status_code == 403

    def test_unauth_get_summary(self):
        r = requests.get(f"{API}/transactions/summary")
        assert r.status_code == 401
