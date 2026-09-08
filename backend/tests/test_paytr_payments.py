"""Tests for PayTR Link API integration: create, callback grant, idempotency, bad hash."""
import os
import hmac
import base64
import hashlib
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://fotuber-photo-repair.preview.emergentagent.com").rstrip("/")
PAYTR_MERCHANT_KEY = os.environ.get("PAYTR_MERCHANT_KEY", "JaxG8xwP6j47nr1e")
PAYTR_MERCHANT_SALT = os.environ.get("PAYTR_MERCHANT_SALT", "LypfXqSwQiF9YjjY")

EXPIRED_EMAIL = "expired@fotuber.com.tr"
EXPIRED_PASS = "Test1234"


def _cb_hash(callback_id, merchant_oid, status, total_amount):
    msg = callback_id + merchant_oid + PAYTR_MERCHANT_SALT + status + total_amount
    return base64.b64encode(hmac.new(PAYTR_MERCHANT_KEY.encode(), msg.encode(), hashlib.sha256).digest()).decode()


@pytest.fixture(scope="module")
def member_token():
    r = requests.post(f"{BASE_URL}/api/member/login", json={"email": EXPIRED_EMAIL, "password": EXPIRED_PASS}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(member_token):
    return {"Authorization": f"Bearer {member_token}"}


def test_create_subscription_link(auth_headers):
    r = requests.post(f"{BASE_URL}/api/payments/paytr/create",
                      json={"kind": "subscription", "origin_url": BASE_URL},
                      headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert "callback_id" in data and data["callback_id"]
    assert "link" in data and data["link"].startswith("https://www.paytr.com/link/")


def test_create_credits_p25_link(auth_headers):
    r = requests.post(f"{BASE_URL}/api/payments/paytr/create",
                      json={"kind": "credits", "package_id": "p25", "origin_url": BASE_URL},
                      headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert data.get("callback_id")
    assert data.get("link", "").startswith("https://www.paytr.com/link/")


def _create_p10_order(headers):
    r = requests.post(f"{BASE_URL}/api/payments/paytr/create",
                      json={"kind": "credits", "package_id": "p10", "origin_url": BASE_URL},
                      headers=headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    return r.json()["callback_id"]


def _get_credits(headers, cid):
    r = requests.get(f"{BASE_URL}/api/payments/status/{cid}", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def _current_credits(headers):
    r = requests.get(f"{BASE_URL}/api/vesikalik/ai-credits", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    return int(r.json().get("remaining", 0))


def _pay_order(auth_headers, cid, price_kurus, oid_suffix=""):
    merchant_oid = f"TESTOID{oid_suffix}{cid[:8]}"
    h = _cb_hash(cid, merchant_oid, "success", price_kurus)
    form = {"callback_id": cid, "merchant_oid": merchant_oid, "status": "success",
            "total_amount": price_kurus, "hash": h}
    r = requests.post(f"{BASE_URL}/api/payments/paytr-callback", data=form, timeout=20)
    assert r.status_code == 200 and r.text.strip() == "OK", f"{r.status_code} {r.text}"
    return form


def test_callback_bad_hash_rejected(auth_headers):
    cid = _create_p10_order(auth_headers)
    # Need to derive price_kurus - grab package price via admin? Fallback: compute using unit price. Use small value.
    # We just need to test bad-hash rejection; total_amount can be arbitrary.
    payload = {"callback_id": cid, "merchant_oid": "TESTOIDBAD", "status": "success",
               "total_amount": "1000", "hash": "invalidhashxx=="}
    r = requests.post(f"{BASE_URL}/api/payments/paytr-callback", data=payload, timeout=20)
    assert r.status_code == 400
    # Order should still be pending
    st = _get_credits(auth_headers, cid)
    assert st["status"] == "pending", f"Should still be pending: {st}"


def test_callback_grant_and_idempotency(auth_headers):
    # Fetch package prices via admin
    admin = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"email": "admin@fotuber.com.tr", "password": "FTB.2024"}, timeout=20)
    assert admin.status_code == 200, admin.text
    adm_tok = admin.json().get("access_token") or admin.json().get("token")
    pkgs = requests.get(f"{BASE_URL}/api/vesikalik/credit-packages",
                        headers={"Authorization": f"Bearer {adm_tok}"}, timeout=20)
    assert pkgs.status_code == 200, pkgs.text
    p10 = next((p for p in pkgs.json()["packages"] if p["id"] == "p10"), None)
    assert p10, pkgs.json()
    price_kurus = str(int(round(float(p10["price"]) * 100)))

    # Bootstrap: activate membership via subscription so /api/vesikalik/ai-credits is reachable
    sub = requests.post(f"{BASE_URL}/api/payments/paytr/create",
                        json={"kind": "subscription", "origin_url": BASE_URL},
                        headers=auth_headers, timeout=30).json()
    sub_cid = sub["callback_id"]
    sub_price = "8000"  # 80 TRY
    _pay_order(auth_headers, sub_cid, sub_price, "SUB")

    before = _current_credits(auth_headers)

    # Buy p10 credits
    cid = _create_p10_order(auth_headers)
    form = _pay_order(auth_headers, cid, price_kurus, "CR")

    st = _get_credits(auth_headers, cid)
    assert st["status"] == "paid", st
    after = _current_credits(auth_headers)
    assert after == before + 10, f"Credits not granted: before={before} after={after}"

    # Idempotency - post the same again
    r2 = requests.post(f"{BASE_URL}/api/payments/paytr-callback", data=form, timeout=20)
    assert r2.status_code == 200 and r2.text.strip() == "OK"
    after2 = _current_credits(auth_headers)
    assert after2 == after, f"Idempotency broken: after={after} after2={after2}"
