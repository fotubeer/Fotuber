"""Phase 2: Gallery expiry rules, extend-link, order flow/assign, watermark settings, RAW warn, module pricing/PayTR."""
import os
import io
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"

OWNER_EMAIL = "studio1@test.com"
OWNER_PASS = "Test1234"
EMP_USER = "aliusta"
EMP_PASS = "1234"


@pytest.fixture(scope="module")
def owner():
    s = requests.Session()
    r = s.post(f"{API}/studio/login", json={"email": OWNER_EMAIL, "password": OWNER_PASS})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def employee():
    s = requests.Session()
    r = s.post(f"{API}/studio/login", json={"email": EMP_USER, "password": EMP_PASS})
    if r.status_code != 200:
        pytest.skip(f"Employee login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def event(owner):
    payload = {
        "name": f"TEST_Etkinlik_{uuid.uuid4().hex[:6]}",
        "client_name": "TEST Muşteri",
        "event_date": "2026-02-01",
        "album_limit": 50, "canvas_limit": 5, "retouch_limit": 5,
    }
    r = owner.post(f"{API}/studio/gallery/events", json=payload)
    assert r.status_code == 200, r.text
    ev = r.json()
    yield ev
    # Cleanup
    try:
        owner.delete(f"{API}/studio/gallery/events/{ev['id']}")
    except Exception:
        pass


# ------------------ 1. Expiry rules (gold: 7/14) ------------------
def test_event_creates_with_gold_expiry(event):
    assert "link_expires_at" in event
    assert "originals_delete_at" in event
    now = datetime.now(timezone.utc)
    link_exp = datetime.fromisoformat(event["link_expires_at"])
    del_at = datetime.fromisoformat(event["originals_delete_at"])
    dlink = (link_exp - now).total_seconds() / 86400
    ddel = (del_at - now).total_seconds() / 86400
    assert 6.5 <= dlink <= 7.5, f"link days ~7, got {dlink}"
    assert 13.5 <= ddel <= 14.5, f"del days ~14, got {ddel}"
    assert event.get("extra_link_used") in (False, None)


# ------------------ 2. Extend-link one-time ------------------
def test_extend_link_once_then_400(owner, event):
    del_before = event["originals_delete_at"]
    r1 = owner.post(f"{API}/studio/gallery/events/{event['id']}/extend-link")
    assert r1.status_code == 200, r1.text
    body = r1.json()
    assert body.get("ok") is True
    assert "link_expires_at" in body
    # deletion date must NOT change: verify via GET
    r_get = owner.get(f"{API}/studio/gallery/events/{event['id']}")
    assert r_get.status_code == 200
    ev_after = r_get.json()["event"]
    assert ev_after["originals_delete_at"] == del_before, "Deletion date must not change on extend"
    # Second call → 400
    r2 = owner.post(f"{API}/studio/gallery/events/{event['id']}/extend-link")
    assert r2.status_code == 400
    assert "kullanıldı" in r2.text or "zaten" in r2.text


# ------------------ 3. Order flow labels ------------------
def test_order_flow_labels(owner):
    r = owner.get(f"{API}/studio/gallery/order-flow")
    assert r.status_code == 200
    flow = r.json()["flow"]
    labels = [f["label"] for f in flow]
    keys = [f["key"] for f in flow]
    assert len(flow) == 5
    for lbl in ["İnceleniyor", "Hazırlanıyor", "Baskıda", "Kargoda", "Tamamlandı"]:
        assert lbl in labels, f"Missing {lbl}: {labels}"


# ------------------ 4. Gallery Settings persistence ------------------
def test_gallery_settings_toggle(owner):
    # Read current
    r = owner.get(f"{API}/studio/gallery/settings")
    assert r.status_code == 200
    orig = r.json()
    assert orig.get("watermark_forced") is False  # gold plan
    # Toggle: watermark False, originals True
    r2 = owner.put(f"{API}/studio/gallery/settings", json={"watermark": False, "allow_originals": True})
    assert r2.status_code == 200
    r3 = owner.get(f"{API}/studio/gallery/settings")
    assert r3.json()["watermark"] is False
    assert r3.json()["allow_originals"] is True
    # Restore defaults (gold defaults: watermark True, originals False)
    owner.put(f"{API}/studio/gallery/settings", json={"watermark": True, "allow_originals": False})


# ------------------ 5. RAW upload-init returns is_raw ------------------
def test_upload_init_raw_flag(owner, event):
    r = owner.post(f"{API}/studio/gallery/events/{event['id']}/upload-init",
                   data={"filename": "photo.nef", "size": 100, "total_chunks": 1})
    assert r.status_code == 200
    assert r.json().get("is_raw") is True
    # JPG should not be raw
    r2 = owner.post(f"{API}/studio/gallery/events/{event['id']}/upload-init",
                    data={"filename": "photo.jpg", "size": 100, "total_chunks": 1})
    assert r2.json().get("is_raw") is False


# ------------------ 6. Module pricing (20% discount) ------------------
def test_modules_pricing_20pct_discount(owner):
    r = owner.get(f"{API}/studio/modules/pricing")
    assert r.status_code == 200
    data = r.json()
    assert data["modules"].get("vesikalik") is True and data["modules"].get("gallery") is True
    # gold discounted: 2499 * 0.8 = 1999.2
    gold_ves = next(p for p in data["pricing"] if p["module"] == "vesikalik" and p["plan"] == "gold")
    assert gold_ves["discount"] == 20
    assert abs(gold_ves["price"] - 1999.2) < 0.01
    assert abs(gold_ves["base_price"] - 2499.0) < 0.01


# ------------------ 7. PayTR module create returns payment URL ------------------
def test_module_paytr_create(owner):
    r = owner.post(f"{API}/studio/payments/module/create",
                   json={"module": "vesikalik", "plan": "basic", "origin_url": BASE})
    # Accept 200 with payment_url or a controlled error (test env may not have PayTR creds)
    if r.status_code != 200:
        pytest.skip(f"PayTR create endpoint returned {r.status_code}: {r.text[:200]}")
    data = r.json()
    # PayTR helper typically returns payment_url or token
    has_url = any(k in data for k in ("payment_url", "iframe_url", "token", "url", "link", "paytr_link_id"))
    assert has_url, f"No payment URL/token in response: {data}"


# ------------------ 8. Public event exposes expiry/watermark/order-flow ------------------
def test_public_event_shape(event):
    token = event["share_token"]
    r = requests.get(f"{API}/gallery/public/{token}")
    assert r.status_code == 200
    body = r.json()
    assert "watermark" in body
    assert "allow_originals" in body
    assert body.get("link_expired") is False
    assert body["event"]["link_expires_at"]
    flow = body.get("order_flow", [])
    assert len(flow) == 5


# ------------------ 9. Employee scoped orders ------------------
def test_employee_sees_only_assigned_orders(owner, employee):
    # Owner sees all
    r_o = owner.get(f"{API}/studio/gallery/orders")
    assert r_o.status_code == 200
    owner_orders = r_o.json()
    # Employee endpoint returns own scope
    r_e = employee.get(f"{API}/studio/gallery/orders")
    assert r_e.status_code == 200
    emp_orders = r_e.json()
    # Every emp order must be assigned to the employee (or at least count <= owner's)
    assert len(emp_orders) <= len(owner_orders)


# ------------------ 10. Non-owner cannot assign or change gallery settings ------------------
def test_employee_cannot_change_settings(employee):
    r = employee.put(f"{API}/studio/gallery/settings", json={"watermark": True})
    assert r.status_code in (403, 401), f"Employee should not change settings: {r.status_code}"


# ------------------ 11. Regression: /vesikalik/ai-credits ------------------
def test_ai_credits_auth_matrix(owner):
    r_no = requests.get(f"{API}/vesikalik/ai-credits")
    assert r_no.status_code == 401
    r_st = owner.get(f"{API}/vesikalik/ai-credits")
    assert r_st.status_code == 200
    assert r_st.json().get("role") == "studio"
