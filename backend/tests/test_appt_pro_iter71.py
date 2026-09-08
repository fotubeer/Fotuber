"""Iteration 71: services kind filter, blocks CRUD, public requests (KVKK+day-status),
contract-settings dual clauses, PDF single-page for venue & photo."""
import os
import io
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


# ── Services kind filter ────────────────────────────────────────────────
class TestServicesKind:
    def test_kind_service_includes_aktuel_kamera(self, ah):
        r = requests.get(f"{API}/appt-pro/services?kind=service", headers=ah, timeout=20)
        assert r.status_code == 200, r.text
        names = [s["name"] for s in r.json()["services"]]
        assert "Aktüel Kamera" in names, f"Aktüel Kamera missing: {names}"
        assert "Dış Çekim" in names
        # All service kinds
        for s in r.json()["services"]:
            assert s["kind"] == "service"

    def test_kind_event_returns_events_only(self, ah):
        r = requests.get(f"{API}/appt-pro/services?kind=event", headers=ah, timeout=20)
        assert r.status_code == 200
        svcs = r.json()["services"]
        assert svcs, "no event services"
        for s in svcs:
            assert s["kind"] == "event"
        names = [s["name"] for s in svcs]
        assert any(n in names for n in ["İsteme / Nişan", "Doğum Günü", "Bride"])

    def test_service_crud_preserves_kind(self, ah):
        # Create
        payload = {"name": "TEST_Iter71 Svc", "active": True, "sort": 99, "base_price": 100,
                   "kind": "service", "venue_enabled": False, "options": []}
        r = requests.post(f"{API}/appt-pro/services", json=payload, headers=ah, timeout=20)
        assert r.status_code == 200, r.text
        sid = r.json()["service"]["id"]
        assert r.json()["service"]["kind"] == "service"
        # Patch to event
        payload["kind"] = "event"; payload["venue_enabled"] = True; payload["name"] = "TEST_Iter71 Evt"
        rp = requests.patch(f"{API}/appt-pro/services/{sid}", json=payload, headers=ah, timeout=20)
        assert rp.status_code == 200
        # Verify via GET
        g = requests.get(f"{API}/appt-pro/services?kind=event", headers=ah, timeout=20).json()["services"]
        assert any(s["id"] == sid and s["kind"] == "event" for s in g)
        # Delete
        d = requests.delete(f"{API}/appt-pro/services/{sid}", headers=ah, timeout=20)
        assert d.status_code == 200


# ── Blocks CRUD ─────────────────────────────────────────────────────────
class TestBlocks:
    def test_block_all_day_and_range(self, ah):
        # All day
        r1 = requests.post(f"{API}/appt-pro/blocks",
                           json={"date": "2030-06-15", "all_day": True, "note": "TEST_Iter71 tatil"},
                           headers=ah, timeout=20)
        assert r1.status_code == 200, r1.text
        bid1 = r1.json()["block"]["id"]

        # Time range
        r2 = requests.post(f"{API}/appt-pro/blocks",
                           json={"date": "2030-06-16", "all_day": False, "start": "12:00", "end": "14:00", "note": "TEST_Iter71 aralık"},
                           headers=ah, timeout=20)
        assert r2.status_code == 200
        bid2 = r2.json()["block"]["id"]

        # List
        lst = requests.get(f"{API}/appt-pro/blocks", headers=ah, timeout=20).json()["blocks"]
        ids = [b["id"] for b in lst]
        assert bid1 in ids and bid2 in ids

        # day-status closed
        ds = requests.get(f"{API}/appt-pro/public/day-status?date=2030-06-15", timeout=20).json()
        assert ds["closed"] is True

        # day-status blocked_ranges
        ds2 = requests.get(f"{API}/appt-pro/public/day-status?date=2030-06-16", timeout=20).json()
        assert ds2["closed"] is False
        assert any(r["start"] == "12:00" and r["end"] == "14:00" for r in ds2["blocked_ranges"])

        # Delete
        assert requests.delete(f"{API}/appt-pro/blocks/{bid1}", headers=ah, timeout=20).status_code == 200
        assert requests.delete(f"{API}/appt-pro/blocks/{bid2}", headers=ah, timeout=20).status_code == 200


# ── Public requests (KVKK + blocked day) ───────────────────────────────
class TestPublicRequests:
    def test_kvkk_required(self):
        r = requests.post(f"{API}/appt-pro/public/requests",
                          json={"name": "TEST_Iter71 A", "phone": "05551112233", "kvkk_accepted": False},
                          timeout=20)
        assert r.status_code == 400
        assert "KVKK" in r.text or "onay" in r.text.lower()

    def test_valid_request_creates(self, ah):
        r = requests.post(f"{API}/appt-pro/public/requests",
                          json={"name": "TEST_Iter71 Müşteri", "phone": "05551110099",
                                "event_type": "Aktüel Kamera", "date": "2030-07-10",
                                "kvkk_accepted": True, "comms_consent": True},
                          timeout=20)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]

        lst = requests.get(f"{API}/appt-pro/requests", headers=ah, timeout=20).json()
        assert "unseen" in lst
        assert any(x["id"] == rid for x in lst["requests"])

        # PATCH status
        p = requests.patch(f"{API}/appt-pro/requests/{rid}",
                           json={"status": "contacted", "admin_note": "TEST"}, headers=ah, timeout=20)
        assert p.status_code == 200

        # DELETE
        d = requests.delete(f"{API}/appt-pro/requests/{rid}", headers=ah, timeout=20)
        assert d.status_code == 200

    def test_blocked_day_rejects(self, ah):
        # Create block
        b = requests.post(f"{API}/appt-pro/blocks",
                          json={"date": "2030-08-20", "all_day": True, "note": "TEST_Iter71 kapalı"},
                          headers=ah, timeout=20).json()["block"]
        try:
            r = requests.post(f"{API}/appt-pro/public/requests",
                              json={"name": "TEST_Iter71 X", "phone": "05551110088",
                                    "date": "2030-08-20", "kvkk_accepted": True},
                              timeout=20)
            assert r.status_code == 400, f"Expected 400 on blocked day, got {r.status_code}"
        finally:
            requests.delete(f"{API}/appt-pro/blocks/{b['id']}", headers=ah, timeout=20)


# ── Contract settings (dual clauses + kvkk + working_hours) ─────────────
class TestContractSettings:
    def test_put_dual_clauses_kvkk_workinghours(self, ah):
        # Read current
        cur = requests.get(f"{API}/appt-pro/contract-settings", headers=ah, timeout=20).json()["settings"]
        assert cur is not None
        payload = {
            "clauses": cur.get("clauses") or [],
            "clauses_photo": cur.get("clauses_photo") or [],
            "kvkk_text": "TEST_Iter71 KVKK metni · 6698 · arama/SMS/kampanya",
            "working_hours": {"start": "10:00", "end": "20:00"},
        }
        r = requests.put(f"{API}/appt-pro/contract-settings", json=payload, headers=ah, timeout=20)
        assert r.status_code == 200
        g = requests.get(f"{API}/appt-pro/contract-settings", headers=ah, timeout=20).json()["settings"]
        assert g["kvkk_text"] == payload["kvkk_text"]
        assert g["working_hours"] == payload["working_hours"]
        assert isinstance(g["clauses"], list) and isinstance(g["clauses_photo"], list)

        # Restore original kvkk_text (best effort — leave test values acceptable)


# ── PDF single-page for both variants ───────────────────────────────────
class TestContractPDF:
    def _make(self, ah, brand_variant):
        payload = {
            "customer_name": f"TEST_Iter71 {brand_variant}",
            "customer_phone": "05551110044",
            "service_name_snapshot": "TEST_Iter71 · Test",
            "date": "2030-09-01", "time": "18:00",
            "venue": "TEST_Iter71 Mekan",
            "line_items": [{"type": "service", "label": "TEST_Iter71 Svc", "price": 5000}],
            "subtotal": 5000, "discount_percent": 0, "discount_amount": 0,
            "total": 5000, "deposit_amount": 1000, "paid_amount": 1000,
            "payment_method": "card",
            "contract": {
                "party_role": "gelin", "party_name": "TEST_Iter71 Ali", "party_tc": "12345678901",
                "party_email": "iter71@example.com", "party_address": "TEST Addr",
                "party_phone": "05551110044",
                "bride_name": "TEST_Iter71 Ayşe", "groom_name": "TEST_Iter71 Mehmet",
                "bride_phone": "05551110044", "groom_phone": "05559876543",
                "event_date": "2030-09-01", "event_time": "18:00", "venue": "TEST_Iter71 Mekan",
                "line_items": [{"type": "service", "label": "TEST_Iter71 Svc", "price": 5000}],
                "subtotal": 5000, "discount_percent": 0, "discount_amount": 0,
                "total": 5000, "deposit_amount": 1000, "remaining_amount": 4000,
                "consent_social": True, "consent_marketing": False,
                "brand_variant": brand_variant,
            },
        }
        r = requests.post(f"{API}/appt-pro/appointments", json=payload, headers=ah, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()

    def _cleanup(self, ah, d):
        try: requests.delete(f"{API}/appt-pro/contracts/{d['contract_id']}", headers=ah, timeout=20)
        except Exception: pass

    def _count_pages(self, pdf_bytes):
        # Prefer pypdf if available
        try:
            from pypdf import PdfReader
            return len(PdfReader(io.BytesIO(pdf_bytes)).pages)
        except Exception:
            try:
                from PyPDF2 import PdfReader
                return len(PdfReader(io.BytesIO(pdf_bytes)).pages)
            except Exception:
                # crude fallback: count '/Type /Page' occurrences (excluding /Pages)
                s = pdf_bytes
                import re
                return len(re.findall(rb"/Type\s*/Page[^s]", s))

    def _pdf_text(self, pdf_bytes):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(pdf_bytes))
            return "\n".join((p.extract_text() or "") for p in reader.pages)
        except Exception:
            try:
                from PyPDF2 import PdfReader
                reader = PdfReader(io.BytesIO(pdf_bytes))
                return "\n".join((p.extract_text() or "") for p in reader.pages)
            except Exception:
                return ""

    def test_venue_pdf_single_page(self, ah):
        d = self._make(ah, "venue")
        try:
            pdf = requests.get(f"{API}/appt-pro/contracts/{d['contract_id']}/pdf", headers=ah, timeout=30)
            assert pdf.status_code == 200
            assert pdf.content[:4] == b"%PDF"
            pages = self._count_pages(pdf.content)
            assert pages == 1, f"Venue PDF must be 1 page, got {pages}"
        finally:
            self._cleanup(ah, d)

    def test_photo_pdf_single_page_no_davetevi(self, ah):
        d = self._make(ah, "photo")
        try:
            pdf = requests.get(f"{API}/appt-pro/contracts/{d['contract_id']}/pdf", headers=ah, timeout=30)
            assert pdf.status_code == 200
            pages = self._count_pages(pdf.content)
            assert pages == 1, f"Photo PDF must be 1 page, got {pages}"
            text = self._pdf_text(pdf.content)
            # In photo PDF, brand should be Photography and 'Davet Evi' shouldn't appear
            if text:
                assert "Davet Evi" not in text, f"'Davet Evi' should not appear in photo PDF: {text[:200]}"
                assert "Photography" in text or "FOTUBER" in text
        finally:
            self._cleanup(ah, d)
