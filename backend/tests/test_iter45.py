"""Iteration 45 backend tests: bulk-print packages, member design account,
print-consume admin bypass, bulk-print PDF (single + zip).
"""
import os, base64, io, zipfile
import pytest
import requests

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PW = "FTB.2024"
MEMBER_EMAIL = "expired@fotuber.com.tr"
MEMBER_PW = "Test1234"

TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


# --------------------- fixtures ---------------------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def member_session():
    s = requests.Session()
    r = s.post(f"{API}/member/login", json={"email": MEMBER_EMAIL, "password": MEMBER_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return s


# --------------------- member design account ---------------------
def test_member_studio_me_design_only(member_session):
    r = member_session.get(f"{API}/studio/me", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    account = data.get("account") or {}
    assert str(account.get("id", "")).startswith("member-"), account.get("id")
    mods = account.get("modules") or {}
    # Member design account has NO studio modules like vesikalik/gallery
    assert not mods.get("vesikalik"), f"member should not have vesikalik: {mods}"
    assert not mods.get("gallery"), f"member should not have gallery: {mods}"
    assert isinstance(account.get("design_rights", 0), int)


# --------------------- admin bulk-print CRUD ---------------------
def test_admin_bulk_print_packages_crud(admin_session):
    r = admin_session.get(f"{API}/admin/bulk-print-packages", timeout=15)
    assert r.status_code == 200, r.text
    pkgs = r.json()
    assert isinstance(pkgs, list) and len(pkgs) >= 4, f"expected >=4 seed pkgs, got {len(pkgs)}"
    for p in pkgs:
        assert "prints" in p and "bonus_ai" in p and "price" in p, p

    # CREATE
    payload = {
        "name": "TEST_pkg_iter45",
        "prints": 250,
        "bonus_ai": 15,
        "price": 999.0,
        "active": True,
        "sort": 99,
    }
    r = admin_session.post(f"{API}/admin/bulk-print-packages", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    created = r.json()
    pid = created["id"]

    # UPDATE
    payload["price"] = 1199.0
    r = admin_session.put(f"{API}/admin/bulk-print-packages/{pid}", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    assert float(r.json()["price"]) == 1199.0

    # DELETE
    r = admin_session.delete(f"{API}/admin/bulk-print-packages/{pid}", timeout=15)
    assert r.status_code == 200, r.text


# --------------------- member bulk-print listing ---------------------
def test_member_bulk_print_listing(member_session):
    r = member_session.get(f"{API}/studio/design/bulk-print-packages", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "packages" in d and len(d["packages"]) >= 1
    for k in ("print_capacity", "print_remaining", "design_rights"):
        assert k in d, f"missing {k}"


# --------------------- member bulk-print buy (PayTR link only) ---------------------
def test_member_bulk_print_buy_creates_paytr(member_session):
    lst = member_session.get(f"{API}/studio/design/bulk-print-packages", timeout=15).json()
    pid = lst["packages"][0]["id"]
    r = member_session.post(
        f"{API}/studio/payments/bulk-print/create",
        json={"package_id": pid, "origin_url": BASE},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    # PayTR wrapper returns nested { data: { link } } and callback_id
    link = None
    if isinstance(d.get("data"), dict):
        link = d["data"].get("link") or d["data"].get("payment_link")
    link = link or d.get("link") or d.get("payment_link")
    assert link and "paytr" in link.lower(), f"no PayTR link in response: {d}"
    assert d.get("callback_id") or d.get("data", {}).get("callback_id"), d


# --------------------- print-consume admin bypass ---------------------
def test_print_consume_admin_bypass(admin_session):
    r = admin_session.post(f"{API}/design/print-consume", json={"count": 50}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("ok") is True
    assert int(d.get("remaining", 0)) >= 1_000_000, d


def test_print_consume_member_zero_capacity(member_session):
    # ensure member starts with 0 capacity: the seed test user may have 0. If not,
    # we just accept either 402 [CAPACITY] or 200 (already has capacity).
    r = member_session.post(f"{API}/design/print-consume", json={"count": 1}, timeout=15)
    if r.status_code == 200:
        pytest.skip("Member has print capacity already; skipping 402 assertion")
    assert r.status_code == 402, r.text
    assert "CAPACITY" in r.text


# --------------------- matbaa PDF (single + zip) ---------------------
def _pdf_payload(mode):
    return {
        "images": [TINY_PNG_B64, TINY_PNG_B64],
        "width_mm": 130,
        "height_mm": 180,
        "bleed_mm": 3,
        "mode": mode,
    }


def test_bulk_print_pdf_single(admin_session):
    r = admin_session.post(f"{API}/design/bulk-print-pdf", json=_pdf_payload("single"), timeout=60)
    assert r.status_code == 200, r.text[:400]
    assert "application/pdf" in r.headers.get("content-type", "")
    assert r.content[:4] == b"%PDF"
    # 2 pages expected (very loose check: 'Type /Page' occurrences >= 2)
    assert r.content.count(b"/Type /Page") >= 2 or r.content.count(b"/Type/Page") >= 2


def test_bulk_print_pdf_zip(admin_session):
    r = admin_session.post(f"{API}/design/bulk-print-pdf", json=_pdf_payload("zip"), timeout=60)
    assert r.status_code == 200, r.text[:400]
    ctype = r.headers.get("content-type", "")
    assert "zip" in ctype, ctype
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = zf.namelist()
    pdfs = [n for n in names if n.lower().endswith(".pdf")]
    assert len(pdfs) == 2, names


# --------------------- admin AI design-rights-packages listing ---------------------
def test_admin_design_rights_packages(admin_session):
    r = admin_session.get(f"{API}/admin/design-rights-packages", timeout=15)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)
