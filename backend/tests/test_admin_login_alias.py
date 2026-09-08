"""
Tests for the admin login accessibility bug fix.

Scenarios covered:
- Login with the canonical admin email (admin@fotuber.com.tr)
- Login with the newly seeded alias email (admin@fotuber.com)
- Wrong password for both variants
- Non-existent email
- Whitespace tolerance in the email field
- GET /api/auth/me with returned bearer token
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://personnel-portal-16.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_MAIN = "admin@fotuber.com.tr"
ADMIN_ALIAS = "admin@fotuber.com"
ADMIN_PW = "FTB.2024"
WRONG_PW = "FTB.2023"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(client, email, password):
    return client.post(f"{API}/auth/login", json={"email": email, "password": password})


# ---- Success cases ----

def test_login_admin_main_success(client):
    r = _login(client, ADMIN_MAIN, ADMIN_PW)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 20
    assert "user" in data
    assert data["user"]["email"] == ADMIN_MAIN
    assert data["user"]["role"] == "admin"


def test_login_admin_alias_success(client):
    r = _login(client, ADMIN_ALIAS, ADMIN_PW)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 20
    assert data["user"]["email"] == ADMIN_ALIAS
    assert data["user"]["role"] == "admin"


def test_login_whitespace_tolerance(client):
    r = _login(client, f"  {ADMIN_MAIN}  ", ADMIN_PW)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["email"] == ADMIN_MAIN
    assert data["user"]["role"] == "admin"


def test_login_case_insensitive(client):
    # Bonus check: emails are lowercased server side
    r = _login(client, ADMIN_MAIN.upper(), ADMIN_PW)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "admin"


# ---- Failure cases ----

def test_login_wrong_password_main(client):
    r = _login(client, ADMIN_MAIN, WRONG_PW)
    assert r.status_code == 401
    detail = r.json().get("detail", "")
    assert detail == "E-posta veya şifre hatalı"


def test_login_wrong_password_alias(client):
    r = _login(client, ADMIN_ALIAS, WRONG_PW)
    assert r.status_code == 401
    detail = r.json().get("detail", "")
    assert detail == "E-posta veya şifre hatalı"


def test_login_nonexistent_email(client):
    r = _login(client, "adm@fotuber.com.tr", ADMIN_PW)
    assert r.status_code == 401
    detail = r.json().get("detail", "")
    assert detail == "E-posta veya şifre hatalı"


# ---- /auth/me with token ----

def test_auth_me_with_token_main(client):
    r = _login(client, ADMIN_MAIN, ADMIN_PW)
    assert r.status_code == 200
    token = r.json()["token"]
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    data = me.json()
    assert data["email"] == ADMIN_MAIN
    assert data["role"] == "admin"


def test_auth_me_with_token_alias(client):
    r = _login(client, ADMIN_ALIAS, ADMIN_PW)
    assert r.status_code == 200
    token = r.json()["token"]
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    data = me.json()
    assert data["email"] == ADMIN_ALIAS
    assert data["role"] == "admin"
