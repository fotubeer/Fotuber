"""Iteration 70 tests: cash-flow integration, PDF, cascade delete, approvals feed."""
import os
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


def _build_payload(paid=3000, method="card"):
    return {
        "customer_name": "TEST_Iter70 Gelin",
        "customer_phone": "05551110022",
        "service_name_snapshot": "TEST_Iter70 Service · Standart",
        "date": "2026-09-15", "time": "19:00",
        "venue": "TEST_Iter70 Salon",
        "line_items": [
            {"type": "service", "label": "TEST_Iter70 Svc", "price": 10000},
        ],
        "subtotal": 10000, "discount_percent": 0, "discount_amount": 0,
        "total": 10000, "deposit_amount": paid, "paid_amount": paid,
        "payment_method": method,
        "contract": {
            "party_role": "gelin", "party_name": "TEST_Iter70 Ayşe", "party_tc": "12345678901",
            "party_email": "iter70@example.com", "party_address": "TEST Addr",
            "party_phone": "05551110022",
            "bride_name": "TEST_Iter70 Ayşe", "groom_name": "TEST_Iter70 Mehmet",
            "bride_phone": "05551110022", "groom_phone": "05559876543",
            "event_date": "2026-09-15", "event_time": "19:00", "venue": "TEST_Iter70 Salon",
            "line_items": [],
            "subtotal": 10000, "discount_percent": 0, "discount_amount": 0,
            "total": 10000, "deposit_amount": paid, "remaining_amount": 10000 - paid,
            "consent_social": True, "consent_marketing": False,
            "brand_variant": "venue",
        },
    }


def _cleanup(ah, contract_id, appt_id):
    try:
        requests.delete(f"{API}/appt-pro/contracts/{contract_id}", headers=ah, timeout=20)
    except Exception:
        pass
    try:
        requests.delete(f"{API}/appointments/{appt_id}", headers=ah, timeout=20)
    except Exception:
        pass


# ── Cash-flow / transactions integration ────────────────────────────────
class TestCashflowIntegration:
    def test_card_payment_creates_income_transaction(self, ah):
        r = requests.post(f"{API}/appt-pro/appointments", json=_build_payload(3000, "card"), headers=ah, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        appt_id, contract_id = d["appointment_id"], d["contract_id"]

        # Fetch transactions
        tr = requests.get(f"{API}/transactions", headers=ah, timeout=20)
        assert tr.status_code == 200, tr.text
        body = tr.json()
        rows = body.get("transactions", body) if isinstance(body, dict) else body
        match = [t for t in rows if t.get("contract_id") == contract_id]
        assert len(match) >= 1, f"No transaction linked to contract {contract_id}"
        t = match[0]
        assert t.get("amount") == 3000, t
        assert t.get("kind") == "income", t
        assert t.get("payment_method") == "card", t

        _cleanup(ah, contract_id, appt_id)

    def test_cash_payment_records_method(self, ah):
        r = requests.post(f"{API}/appt-pro/appointments", json=_build_payload(1500, "cash"), headers=ah, timeout=30)
        assert r.status_code == 200
        d = r.json()
        appt_id, contract_id = d["appointment_id"], d["contract_id"]

        tr = requests.get(f"{API}/transactions", headers=ah, timeout=20).json()
        rows = tr.get("transactions", tr) if isinstance(tr, dict) else tr
        match = [t for t in rows if t.get("contract_id") == contract_id]
        assert match, "cash tx missing"
        assert match[0]["payment_method"] == "cash"
        assert match[0]["amount"] == 1500

        _cleanup(ah, contract_id, appt_id)

    def test_zero_paid_no_transaction(self, ah):
        r = requests.post(f"{API}/appt-pro/appointments", json=_build_payload(0, "cash"), headers=ah, timeout=30)
        assert r.status_code == 200
        d = r.json()
        appt_id, contract_id = d["appointment_id"], d["contract_id"]

        tr = requests.get(f"{API}/transactions", headers=ah, timeout=20).json()
        rows = tr.get("transactions", tr) if isinstance(tr, dict) else tr
        match = [t for t in rows if t.get("contract_id") == contract_id]
        assert len(match) == 0, f"Unexpected tx for paid=0: {match}"

        _cleanup(ah, contract_id, appt_id)


# ── PDF ──────────────────────────────────────────────────────────────────
class TestContractPDF:
    def test_pdf_download(self, ah):
        r = requests.post(f"{API}/appt-pro/appointments", json=_build_payload(2000, "card"), headers=ah, timeout=30)
        assert r.status_code == 200
        d = r.json()
        appt_id, contract_id = d["appointment_id"], d["contract_id"]

        pdf = requests.get(f"{API}/appt-pro/contracts/{contract_id}/pdf", headers=ah, timeout=30)
        assert pdf.status_code == 200, pdf.text[:400]
        assert "application/pdf" in pdf.headers.get("content-type", "").lower()
        assert len(pdf.content) > 500
        assert pdf.content[:4] == b"%PDF", f"Not a PDF: {pdf.content[:20]}"

        _cleanup(ah, contract_id, appt_id)


# ── Cascade delete ──────────────────────────────────────────────────────
class TestCascadeDelete:
    def test_delete_contract_cascades(self, ah):
        r = requests.post(f"{API}/appt-pro/appointments", json=_build_payload(2500, "card"), headers=ah, timeout=30)
        assert r.status_code == 200
        d = r.json()
        appt_id, contract_id = d["appointment_id"], d["contract_id"]

        # Precondition: tx exists
        tr = requests.get(f"{API}/transactions", headers=ah, timeout=20).json()
        rows = tr.get("transactions", tr) if isinstance(tr, dict) else tr
        assert any(t.get("contract_id") == contract_id for t in rows), "pre-tx missing"

        # Delete contract
        dl = requests.delete(f"{API}/appt-pro/contracts/{contract_id}", headers=ah, timeout=20)
        assert dl.status_code == 200, dl.text

        # Contract gone
        gc = requests.get(f"{API}/appt-pro/contracts/{contract_id}", headers=ah, timeout=20)
        assert gc.status_code == 404

        # Appointment gone
        ga = requests.get(f"{API}/appointments/{appt_id}", headers=ah, timeout=20)
        # Some backends 404, some list-only. Check via list too.
        alist = requests.get(f"{API}/appointments", headers=ah, timeout=20).json()
        arows = alist.get("appointments", alist) if isinstance(alist, dict) else alist
        assert not any(a.get("id") == appt_id for a in arows), "appointment still present after cascade"

        # Transaction gone
        tr2 = requests.get(f"{API}/transactions", headers=ah, timeout=20).json()
        rows2 = tr2.get("transactions", tr2) if isinstance(tr2, dict) else tr2
        assert not any(t.get("contract_id") == contract_id for t in rows2), "transaction not removed after cascade"


# ── Approvals feed ─────────────────────────────────────────────────────
class TestApprovals:
    def test_approve_bumps_unseen_and_seen_resets(self, ah):
        r = requests.post(f"{API}/appt-pro/appointments", json=_build_payload(1000, "cash"), headers=ah, timeout=30)
        assert r.status_code == 200
        d = r.json()
        appt_id, contract_id = d["appointment_id"], d["contract_id"]

        # Mark seen first to establish baseline 0
        requests.post(f"{API}/appt-pro/approvals/seen", headers=ah, timeout=20)
        pre = requests.get(f"{API}/appt-pro/approvals", headers=ah, timeout=20).json()
        base_unseen = pre.get("unseen", 0)
        assert base_unseen == 0, f"Expected 0 unseen after seen, got {base_unseen}"

        # Get token, public approve
        c = requests.get(f"{API}/appt-pro/contracts/{contract_id}", headers=ah, timeout=20).json()["contract"]
        token = c["public_token"]
        ap = requests.post(f"{API}/appt-pro/public/contracts/{token}/approve",
                           json={"approver_name": "TEST_Iter70", "accepted": True}, timeout=20)
        assert ap.status_code == 200, ap.text

        after = requests.get(f"{API}/appt-pro/approvals", headers=ah, timeout=20).json()
        assert after.get("unseen", 0) >= 1, f"Expected unseen>=1 after approve: {after}"

        # Seen resets
        sn = requests.post(f"{API}/appt-pro/approvals/seen", headers=ah, timeout=20)
        assert sn.status_code == 200
        after2 = requests.get(f"{API}/appt-pro/approvals", headers=ah, timeout=20).json()
        assert after2.get("unseen", 0) == 0

        _cleanup(ah, contract_id, appt_id)
