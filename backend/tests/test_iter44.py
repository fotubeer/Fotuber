"""Iteration 44 backend tests: admin free invitations, photowall tiers, admin config, table QR PDF, spam box."""
import os, io
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback to reading frontend/.env
    with open("/app/frontend/.env") as f:
        for l in f:
            if l.startswith("REACT_APP_BACKEND_URL="):
                BASE = l.split("=",1)[1].strip().rstrip("/")

API = f"{BASE}/api"

ADMIN_EMAIL = "admin@fotuber.com.tr"
ADMIN_PASS = "FTB.2024"
MEMBER_EMAIL = "expired@fotuber.com.tr"
MEMBER_PASS = "Test1234"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:300]}"
    assert "access_token" in s.cookies, f"no access_token cookie set; cookies={list(s.cookies.keys())}"
    return s


@pytest.fixture(scope="module")
def member_session():
    s = requests.Session()
    r = s.post(f"{API}/member/login", json={"email": MEMBER_EMAIL, "password": MEMBER_PASS}, timeout=20)
    assert r.status_code == 200, f"member login failed: {r.status_code} {r.text[:300]}"
    return s


def _premium_photowall_payload(tier="gold"):
    return {
        "theme": "noir",
        "person1": "TEST",
        "person2": "Admin",
        "event_date": "2026-12-31",
        "event_time": "19:00",
        "venue_name": "TEST",
        "sections": {"photowall": True, "photowall_tier": tier},
    }


def test_admin_free_premium_photowall(admin_session):
    r = admin_session.post(f"{API}/invitations", json=_premium_photowall_payload("gold"), timeout=30)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}"
    d = r.json()
    assert d.get("status") == "published", d
    assert d.get("requires_payment") in (False, None), d
    assert (d.get("price") or 0) == 0, d
    # store for later tests
    pytest.admin_inv_id = d.get("id") or d.get("_id") or d.get("invitation_id")
    pytest.admin_inv_slug = d.get("slug")
    assert pytest.admin_inv_id, d


def test_member_premium_photowall_requires_payment(member_session):
    r = member_session.post(f"{API}/invitations", json=_premium_photowall_payload("gold"), timeout=30)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}"
    d = r.json()
    assert d.get("requires_payment") is True, d
    assert (d.get("price") or 0) > 0, d


def test_admin_studio_me(admin_session):
    r = admin_session.get(f"{API}/studio/me", timeout=20)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    acc = d.get("account") or {}
    membership = acc.get("membership") or {}
    plan = membership.get("plan") or acc.get("plan")
    assert plan == "gold", f"expected gold, got {plan}; acc={acc}"
    mods = acc.get("modules") or {}
    assert mods.get("vesikalik") is True and mods.get("gallery") is True, acc
    dr = int(acc.get("design_rights") or 0)
    assert dr >= 1_000_000, f"design_rights too low: {dr}"


def test_photowall_tiers_public():
    r = requests.get(f"{API}/invitations/photowall-tiers", timeout=20)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    # accept either dict or list
    if isinstance(d, dict):
        tiers = d.get("tiers") or d
    else:
        tiers = {t.get("id") or t.get("tier"): t for t in d}
    assert "silver" in tiers and "gold" in tiers, d
    for k in ("silver", "gold"):
        t = tiers[k]
        assert "price" in t and "storage_gb" in t, t


def test_admin_photowall_config_get_put(admin_session):
    r = admin_session.get(f"{API}/admin/photowall-config", timeout=20)
    assert r.status_code == 200, r.text[:300]
    orig = r.json()
    # PUT new values
    payload = {"silver": {"price": 450}, "gold": {"price": 850, "storage_gb": 60}}
    r2 = admin_session.put(f"{API}/admin/photowall-config", json=payload, timeout=20)
    assert r2.status_code == 200, r2.text[:300]
    # verify public tiers reflect
    r3 = requests.get(f"{API}/invitations/photowall-tiers", timeout=20)
    d = r3.json()
    tiers = d.get("tiers") if isinstance(d, dict) and "tiers" in d else d
    if isinstance(tiers, list):
        tiers = {t.get("id") or t.get("tier"): t for t in tiers}
    assert tiers["silver"]["price"] == 450, tiers["silver"]
    assert tiers["gold"]["price"] == 850, tiers["gold"]
    assert tiers["gold"]["storage_gb"] == 60, tiers["gold"]
    # reset to defaults
    reset = {"silver": {"price": 500, "storage_gb": 10}, "gold": {"price": 900, "storage_gb": 50}}
    r4 = admin_session.put(f"{API}/admin/photowall-config", json=reset, timeout=20)
    assert r4.status_code == 200


def test_table_qr_pdf_gold(admin_session):
    iid = getattr(pytest, "admin_inv_id", None)
    assert iid, "need admin invitation id from earlier test"
    r = admin_session.get(f"{API}/invitations/{iid}/table-qr.pdf", timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    ct = r.headers.get("content-type", "")
    assert "application/pdf" in ct, ct
    assert r.content[:4] == b"%PDF", r.content[:20]


def test_table_qr_pdf_forbidden_silver(admin_session):
    # create a silver invitation (no table QR)
    r = admin_session.post(f"{API}/invitations", json=_premium_photowall_payload("silver"), timeout=30)
    assert r.status_code in (200, 201)
    iid = r.json().get("id")
    r2 = admin_session.get(f"{API}/invitations/{iid}/table-qr.pdf", timeout=20)
    assert r2.status_code == 403, f"expected 403, got {r2.status_code} {r2.text[:200]}"


def test_spam_box_flow(admin_session):
    iid = getattr(pytest, "admin_inv_id", None)
    slug = getattr(pytest, "admin_inv_slug", None)
    assert iid and slug, "need admin invitation from earlier"
    # upload a photo via public endpoint
    img = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90"
        b"wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x5c\xcd\xff\x69"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    up = requests.post(
        f"{API}/invitations/public/{slug}/photos",
        files={"file": ("t.png", io.BytesIO(img), "image/png")},
        data={"guest_name": "TEST"},
        timeout=30,
    )
    assert up.status_code in (200, 201), f"upload failed: {up.status_code} {up.text[:300]}"
    up_d = up.json()
    pid = up_d.get("id") or up_d.get("photo_id") or (up_d.get("photo") or {}).get("id")
    # If not returned, fetch manage list to find last one
    if not pid:
        mng = admin_session.get(f"{API}/invitations/{iid}/photos/manage", timeout=20).json()
        photos = mng.get("photos") if isinstance(mng, dict) else mng
        pid = photos[-1].get("id") if photos else None
    assert pid, f"no photo id, up={up_d}"

    # mark spam
    r = admin_session.post(f"{API}/invitations/{iid}/photos/{pid}/spam", json={"spam": True}, timeout=20)
    assert r.status_code == 200, r.text[:300]
    # verify in manage list
    mng = admin_session.get(f"{API}/invitations/{iid}/photos/manage", timeout=20).json()
    photos = mng.get("photos") if isinstance(mng, dict) else mng
    found = next((p for p in photos if (p.get("id") == pid)), None)
    assert found and found.get("spam") is True, found
    # top-level spam_count should be >=1
    sc = mng.get("spam_count", 0) if isinstance(mng, dict) else 0
    assert sc >= 1, f"expected spam_count>=1, got {sc}"

    # public list must NOT include spam
    pub = requests.get(f"{API}/invitations/public/{slug}/photos", timeout=20).json()
    pub_list = pub.get("photos") if isinstance(pub, dict) else pub
    ids = [p.get("id") for p in (pub_list or [])]
    assert pid not in ids, f"spam photo leaked to public list: {ids}"

    # unmark
    r2 = admin_session.post(f"{API}/invitations/{iid}/photos/{pid}/spam", json={"spam": False}, timeout=20)
    assert r2.status_code == 200
    mng2 = admin_session.get(f"{API}/invitations/{iid}/photos/manage", timeout=20).json()
    photos2 = mng2.get("photos") if isinstance(mng2, dict) else mng2
    found2 = next((p for p in photos2 if p.get("id") == pid), None)
    assert found2 and (found2.get("spam") in (False, None)), found2
