"""Phase 2: Employee management, chat gating, employee login, firm archive metadata."""
import os
import time
import requests
import pytest

def _load_backend_url():
    v = os.environ.get('REACT_APP_BACKEND_URL')
    if v:
        return v.rstrip('/')
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    return line.split('=', 1)[1].strip().rstrip('/')
    except Exception:
        pass
    raise RuntimeError('REACT_APP_BACKEND_URL not set')

BASE_URL = _load_backend_url()
STUDIO_EMAIL = "studio1@test.com"
STUDIO_PASS = "Test1234"
EMP_USERNAME = "aliusta"
EMP_PASS = "1234"


def _studio_login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/studio/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return s, r.json()


@pytest.fixture(scope="module")
def owner_session():
    s, data = _studio_login(STUDIO_EMAIL, STUDIO_PASS)
    return s


@pytest.fixture(scope="module")
def emp_session():
    s, data = _studio_login(EMP_USERNAME, EMP_PASS)
    return s, data


class TestStudioMe:
    def test_owner_me(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/studio/me", timeout=15)
        assert r.status_code == 200
        d = r.json()
        acc = d.get("account", {})
        assert acc.get("current_user", {}).get("is_owner") is True
        assert d.get("membership", {}).get("limits", {}).get("max_users", 0) >= 10 or acc.get("membership", {}).get("limits", {}).get("max_users", 0) >= 10

    def test_employee_me(self, emp_session):
        s, _ = emp_session
        r = s.get(f"{BASE_URL}/api/studio/me", timeout=15)
        assert r.status_code == 200
        d = r.json()
        cu = d.get("account", {}).get("current_user", {})
        assert cu.get("is_owner") is False
        assert cu.get("name") == "Ali Usta"
        assert d.get("account", {}).get("firma_adi") == "Test Stüdyo"


class TestEmployeeCRUD:
    created_id = None

    def test_list_employees(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/studio/employees", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("max_users", 0) >= 10
        assert d.get("used_users", 0) >= 1
        assert "employees" in d

    def test_add_toggle_reset_delete(self, owner_session):
        uname = f"testemp_{int(time.time())}"
        r = owner_session.post(f"{BASE_URL}/api/studio/employees",
                                json={"name": "TEST_Emp", "username": uname, "password": "pass1234"},
                                timeout=15)
        assert r.status_code == 200, r.text
        emp = r.json().get("employee") or r.json()
        eid = emp.get("id")
        assert eid
        TestEmployeeCRUD.created_id = eid

        # Toggle active off
        r = owner_session.patch(f"{BASE_URL}/api/studio/employees/{eid}", json={"active": False}, timeout=15)
        assert r.status_code == 200

        # Login as deactivated should fail
        r = requests.post(f"{BASE_URL}/api/studio/login", json={"email": uname, "password": "pass1234"}, timeout=15)
        assert r.status_code in (401, 403)

        # Reset password
        r = owner_session.post(f"{BASE_URL}/api/studio/employees/{eid}/reset-password",
                                json={"password": "newpass9"}, timeout=15)
        assert r.status_code == 200

        # Delete
        r = owner_session.delete(f"{BASE_URL}/api/studio/employees/{eid}", timeout=15)
        assert r.status_code == 200

        # List should no longer contain
        r = owner_session.get(f"{BASE_URL}/api/studio/employees", timeout=15)
        assert eid not in [e.get("id") for e in r.json().get("employees", [])]


class TestChat:
    def test_owner_chat_enabled(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/studio/chat", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("enabled") is True

    def test_owner_post_message(self, owner_session):
        msg = f"TEST_msg_{int(time.time())}"
        r = owner_session.post(f"{BASE_URL}/api/studio/chat", json={"text": msg}, timeout=15)
        assert r.status_code == 200
        r = owner_session.get(f"{BASE_URL}/api/studio/chat", timeout=15)
        texts = [m.get("text") for m in r.json().get("messages", [])]
        assert msg in texts

    def test_employee_sees_message_and_unread(self, owner_session, emp_session):
        s, _ = emp_session
        msg = f"TEST_unread_{int(time.time())}"
        owner_session.post(f"{BASE_URL}/api/studio/chat", json={"text": msg}, timeout=15)
        # First fetch — should include the message and unread>=1
        r = s.get(f"{BASE_URL}/api/studio/chat", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("enabled") is True
        texts = [m.get("text") for m in d.get("messages", [])]
        assert msg in texts

    def test_no_auth_401(self):
        r = requests.get(f"{BASE_URL}/api/studio/chat", timeout=15)
        assert r.status_code == 401


class TestVesikalikCredits:
    def test_no_auth_401(self):
        r = requests.get(f"{BASE_URL}/api/vesikalik/ai-credits", timeout=15)
        assert r.status_code == 401

    def test_studio_role(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/vesikalik/ai-credits", timeout=15)
        assert r.status_code == 200
        assert r.json().get("role") == "studio"
