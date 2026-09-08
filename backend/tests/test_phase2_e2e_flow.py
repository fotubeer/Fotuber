"""End-to-end Phase 2 flow: upload → public view → submit → status update → live status on public link."""
import os
import io
import uuid
import pytest
import requests
from PIL import Image

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"


def _jpg_bytes(size=(64, 64)):
    img = Image.new("RGB", size, (200, 120, 60))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=70)
    return buf.getvalue()


@pytest.fixture(scope="module")
def owner():
    s = requests.Session()
    r = s.post(f"{API}/studio/login", json={"email": "studio1@test.com", "password": "Test1234"})
    assert r.status_code == 200
    return s


@pytest.fixture(scope="module")
def event(owner):
    r = owner.post(f"{API}/studio/gallery/events", json={
        "name": f"TEST_E2E_{uuid.uuid4().hex[:6]}", "client_name": "TEST",
        "event_date": "2026-02-01", "album_limit": 10, "canvas_limit": 2, "retouch_limit": 2,
    })
    assert r.status_code == 200
    ev = r.json()
    yield ev
    owner.delete(f"{API}/studio/gallery/events/{ev['id']}")


def test_full_e2e_flow(owner, event):
    eid = event["id"]
    token = event["share_token"]

    # 1. Upload a tiny JPG (single chunk)
    data = _jpg_bytes()
    r_init = owner.post(f"{API}/studio/gallery/events/{eid}/upload-init",
                        data={"filename": "test.jpg", "size": len(data), "total_chunks": 1})
    assert r_init.status_code == 200
    upload_id = r_init.json()["upload_id"]
    assert r_init.json()["is_raw"] is False

    r_chunk = owner.post(f"{API}/studio/gallery/upload-chunk/{upload_id}",
                        data={"index": 0}, files={"chunk": ("part0", data, "application/octet-stream")})
    assert r_chunk.status_code == 200, r_chunk.text

    r_done = owner.post(f"{API}/studio/gallery/upload-complete/{upload_id}")
    assert r_done.status_code == 200, r_done.text
    photo = r_done.json()
    photo_id = photo.get("id") or photo.get("photo", {}).get("id")
    assert photo_id, f"No photo id: {photo}"
    print(f"Uploaded photo {photo_id}")

    # 2. Public event view — photo shows up
    r_pub = requests.get(f"{API}/gallery/public/{token}")
    assert r_pub.status_code == 200
    body = r_pub.json()
    assert len(body["photos"]) >= 1
    assert body["watermark"] is True  # gold default
    assert body["allow_originals"] is False
    assert body["link_expired"] is False

    # 3. Submit selection as client
    r_sel = requests.post(f"{API}/gallery/public/{token}/select", json={
        "selections": [{"photo_id": photo_id, "album": True, "canvas": False, "retouch": False}],
        "upsells": [], "note": "TEST note",
        "client_name": "TEST Client", "client_phone": "+905550001111",
    })
    assert r_sel.status_code == 200, r_sel.text

    # 4. Owner lists orders and finds the new one
    r_ord = owner.get(f"{API}/studio/gallery/orders")
    assert r_ord.status_code == 200
    orders = r_ord.json()
    our = [o for o in orders if o.get("event_id") == eid]
    assert our, "New order missing from owner list"
    order_id = our[0]["id"]

    # 5. Owner sets status to 'printing' (Baskıda)
    r_st = owner.put(f"{API}/studio/gallery/orders/{order_id}/status", json={"status": "printing"})
    assert r_st.status_code == 200
    assert r_st.json()["status"] == "printing"
    assert r_st.json()["status_label"] == "Baskıda"

    # 6. Public page now reflects order_status
    r_pub2 = requests.get(f"{API}/gallery/public/{token}")
    assert r_pub2.status_code == 200
    body2 = r_pub2.json()
    assert body2["event"]["order_status"] == "printing"
    assert body2["event"]["order_status_label"] == "Baskıda"


def test_watermark_off_originals_on_reflects_public(owner, event):
    # Toggle: watermark off, originals on
    r = owner.put(f"{API}/studio/gallery/settings", json={"watermark": False, "allow_originals": True})
    assert r.status_code == 200
    body = requests.get(f"{API}/gallery/public/{event['share_token']}").json()
    assert body["watermark"] is False
    assert body["allow_originals"] is True
    # Restore
    owner.put(f"{API}/studio/gallery/settings", json={"watermark": True, "allow_originals": False})


def test_assign_order_and_employee_scope(owner, event):
    # Get employee list
    r_e = owner.get(f"{API}/studio/employees")
    assert r_e.status_code == 200
    emps = r_e.json().get("employees", [])
    if not emps:
        pytest.skip("No employees to assign")
    emp = next((e for e in emps if e.get("username") == "aliusta"), emps[0])
    emp_id = emp["id"]

    orders = owner.get(f"{API}/studio/gallery/orders").json()
    our = [o for o in orders if o.get("event_id") == event["id"]]
    if not our:
        pytest.skip("No order to assign (previous test may have failed)")
    order_id = our[0]["id"]

    r_asg = owner.put(f"{API}/studio/gallery/orders/{order_id}/assign", json={"employee_id": emp_id})
    assert r_asg.status_code == 200, r_asg.text
    assert r_asg.json()["assigned_to"] == emp_id
    assert r_asg.json()["assigned_name"]  # e.g. Ali Usta

    # Employee session sees the assigned order
    es = requests.Session()
    lr = es.post(f"{API}/studio/login", json={"email": "aliusta", "password": "1234"})
    if lr.status_code != 200:
        pytest.skip(f"Employee login failed: {lr.status_code}")
    emp_orders = es.get(f"{API}/studio/gallery/orders").json()
    assert any(o["id"] == order_id for o in emp_orders), "Employee should see assigned order"
