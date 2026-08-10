"""Etkinlik Galerisi (Phase B) backend tests"""
import io
import os
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fotuber-photo-repair.preview.emergentagent.com").rstrip("/")
STUDIO_EMAIL = "studio1@test.com"
STUDIO_PASS = "Test1234"


@pytest.fixture(scope="module")
def studio_token():
    r = requests.post(f"{BASE_URL}/api/studio/login", json={"email": STUDIO_EMAIL, "password": STUDIO_PASS})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def sh(studio_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {studio_token}"})
    return s


def _make_jpg(size=(200, 200)):
    im = Image.new("RGB", size, (120, 60, 200))
    buf = io.BytesIO()
    im.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def created_event(sh):
    r = sh.post(f"{BASE_URL}/api/studio/gallery/events", json={
        "name": "TEST_PhaseB_Event", "client_name": "TEST_Client",
        "album_limit": 2, "canvas_limit": 0, "retouch_limit": 0
    })
    assert r.status_code == 200, r.text
    ev = r.json()
    assert ev["album_limit"] == 2
    assert ev["share_token"]
    yield ev
    # cleanup
    sh.delete(f"{BASE_URL}/api/studio/gallery/events/{ev['id']}")


def _chunk_upload(sh, event_id, filename, data):
    CHUNK = 512 * 1024
    total = max(1, -(-len(data) // CHUNK))
    r = sh.post(f"{BASE_URL}/api/studio/gallery/events/{event_id}/upload-init",
                data={"filename": filename, "size": len(data), "total_chunks": total},
                headers={})
    assert r.status_code == 200, r.text
    init = r.json()
    upload_id = init["upload_id"]
    for i in range(total):
        blob = data[i*CHUNK:(i+1)*CHUNK]
        rr = sh.post(f"{BASE_URL}/api/studio/gallery/upload-chunk/{upload_id}",
                     data={"index": i}, files={"chunk": ("chunk", blob)})
        assert rr.status_code == 200, rr.text
    rc = sh.post(f"{BASE_URL}/api/studio/gallery/upload-complete/{upload_id}")
    assert rc.status_code == 200, rc.text
    return init, rc.json()


class TestEventsAndUpload:
    def test_list_events_contains_created(self, sh, created_event):
        r = sh.get(f"{BASE_URL}/api/studio/gallery/events")
        assert r.status_code == 200
        ids = [e["id"] for e in r.json()]
        assert created_event["id"] in ids

    def test_upload_jpeg_creates_photo_with_thumb(self, sh, created_event):
        data = _make_jpg()
        init, res = _chunk_upload(sh, created_event["id"], "test.jpg", data)
        assert init["is_raw"] is False
        assert res["is_raw"] is False
        assert res["thumb"]
        # Serve thumb
        tr = requests.get(f"{BASE_URL}{res['thumb']}")
        assert tr.status_code == 200
        assert tr.headers["content-type"].startswith("image/")

    def test_upload_raw_flags_and_no_thumb(self, sh, created_event):
        init, res = _chunk_upload(sh, created_event["id"], "sample.nef", b"NEFDATA\x00" * 100)
        assert init["is_raw"] is True
        assert init["warning"]
        assert res["is_raw"] is True
        assert res["thumb"] is None

    def test_event_detail_lists_photos(self, sh, created_event):
        r = sh.get(f"{BASE_URL}/api/studio/gallery/events/{created_event['id']}")
        assert r.status_code == 200
        d = r.json()
        assert d["event"]["album_limit"] == 2
        assert len(d["photos"]) >= 2


class TestServicePacks:
    def test_create_and_delete_pack(self, sh):
        r = sh.post(f"{BASE_URL}/api/studio/gallery/service-packs",
                    json={"name": "TEST_Pack", "price": 250, "description": "d", "active": True})
        assert r.status_code == 200
        p = r.json()
        assert p["name"] == "TEST_Pack"
        assert p["price"] == 250
        pid = p["id"]
        r2 = sh.get(f"{BASE_URL}/api/studio/gallery/service-packs")
        assert any(x["id"] == pid for x in r2.json())
        d = sh.delete(f"{BASE_URL}/api/studio/gallery/service-packs/{pid}")
        assert d.status_code == 200


class TestPublicSelectAndLimits:
    def test_public_get_and_limit_enforcement_and_order(self, sh, created_event):
        token = created_event["share_token"]
        r = requests.get(f"{BASE_URL}/api/gallery/public/{token}")
        assert r.status_code == 200
        pub = r.json()
        assert pub["event"]["album_limit"] == 2
        photos = [p for p in pub["photos"] if not p.get("is_raw")]
        # Ensure at least 3 non-raw photos (upload extras if needed)
        while len(photos) < 3:
            _chunk_upload(sh, created_event["id"], f"extra{len(photos)}.jpg", _make_jpg((150, 150)))
            r = requests.get(f"{BASE_URL}/api/gallery/public/{token}")
            photos = [p for p in r.json()["photos"] if not p.get("is_raw")]
        sels3 = [{"photo_id": p["id"], "album": True, "canvas": False, "retouch": False} for p in photos[:3]]
        bad = requests.post(f"{BASE_URL}/api/gallery/public/{token}/select",
                            json={"selections": sels3, "upsells": [], "note": ""})
        assert bad.status_code == 400
        assert "limit" in bad.json()["detail"].lower() or "Albüm" in bad.json()["detail"]
        # Submit 2 (ok)
        sels2 = sels3[:2]
        ok = requests.post(f"{BASE_URL}/api/gallery/public/{token}/select",
                           json={"selections": sels2, "upsells": [], "note": "test"})
        assert ok.status_code == 200, ok.text
        order_no = ok.json()["order_no"]
        assert order_no.startswith("SIP-")
        # Re-submit should be rejected
        again = requests.post(f"{BASE_URL}/api/gallery/public/{token}/select",
                              json={"selections": sels2, "upsells": [], "note": ""})
        assert again.status_code == 400

    def test_order_appears_and_status_and_pdf(self, sh, created_event):
        r = sh.get(f"{BASE_URL}/api/studio/gallery/orders")
        assert r.status_code == 200
        orders = [o for o in r.json() if o["event_id"] == created_event["id"]]
        assert orders, "Expected an order for TEST event"
        o = orders[0]
        assert o["album_count"] == 2
        # status update
        us = sh.put(f"{BASE_URL}/api/studio/gallery/orders/{o['id']}/status", json={"status": "processing"})
        assert us.status_code == 200
        # invalid status
        bad = sh.put(f"{BASE_URL}/api/studio/gallery/orders/{o['id']}/status", json={"status": "xxx"})
        assert bad.status_code == 400
        # PDF
        pr = sh.get(f"{BASE_URL}/api/studio/gallery/orders/{o['id']}/pdf")
        assert pr.status_code == 200
        assert pr.headers["content-type"].startswith("application/pdf")
        assert len(pr.content) > 500


class TestRegression:
    def test_services_ok(self):
        r = requests.get(f"{BASE_URL}/api/services")
        assert r.status_code == 200

    def test_design_fonts_ok(self):
        r = requests.get(f"{BASE_URL}/api/design/fonts")
        assert r.status_code == 200
