#!/usr/bin/env bash
# Authenticated regression after anon base-table privilege revocation.
# Usage:
#   export TEST_USER_JWT='...'          # onboarded non-admin preferred
#   export TEST_ADMIN_JWT='...'         # optional admin JWT for lead checks
#   ./scripts/probe-authenticated-regression.sh
#
# Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from .env.local.
# Never prints JWTs. Reports status codes, row counts, and column names only.

set -euo pipefail
# Prefer Homebrew/python.org interpreters over macOS /usr/bin/python3 (often 3.9).
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${TEST_USER_JWT:-}" ]]; then
  echo "ERROR: TEST_USER_JWT is not set in the environment." >&2
  exit 1
fi

eval "$(python3 - <<'PY'
from pathlib import Path
path = Path(".env.local")
if not path.exists():
    raise SystemExit("missing .env.local")
for line in path.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    if k in ("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"):
        v = v.strip().strip('"').strip("'")
        print(f"export {k}={v!r}")
PY
)"

python3 - <<'PY'
import json
import os
import urllib.error
import urllib.request

base = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1"
apikey = os.environ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
user_jwt = os.environ["TEST_USER_JWT"]
admin_jwt = (os.environ.get("TEST_ADMIN_JWT") or "").strip() or None


def _header(headers, name, default="none"):
    if not headers:
        return default
    value = headers.get(name)
    if value is None or value == "":
        return default
    return value


def _keys_from_row(row):
    if isinstance(row, dict):
        return sorted(row.keys())
    return []


def request(method, path, jwt, body=None):
    url = f"{base}/{path}"
    data = None if body is None else json.dumps(body).encode()
    headers = {
        "apikey": apikey,
        "Authorization": f"Bearer {jwt}",
        "Accept": "application/json",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    else:
        headers["Prefer"] = "count=exact"
        headers["Range"] = "0-0"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    raw = ""
    code = 0
    cr = "none"
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode() if resp is not None else ""
            code = getattr(resp, "status", 0) or 0
            cr = _header(getattr(resp, "headers", None), "content-range")
    except urllib.error.HTTPError as e:
        raw = e.read().decode() if e is not None else ""
        code = getattr(e, "code", 0) or 0
        cr = _header(getattr(e, "headers", None), "content-range")
    parsed = None
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = None
    return code, cr, parsed


def probe_select(label, path, jwt, expect_rows=True):
    # expect_rows: True => warn if empty; False => warn if non-empty; None => no row assertion
    code, cr, data = request("GET", path, jwt)
    n = len(data) if isinstance(data, list) else None
    keys = _keys_from_row(data[0]) if isinstance(data, list) and data else []
    note = ""
    if expect_rows is True and code == 200 and (n == 0 or n is None):
        note = " WARN_expected_rows"
    if expect_rows is False and isinstance(data, list) and n is not None and n > 0:
        note = " WARN_expected_empty"
    print(f"{code} rows={n} content-range={cr} keys={keys} {label}{note}")


def probe_rpc(label, name, payload, jwt):
    code, cr, data = request("POST", f"rpc/{name}", jwt, payload)
    if isinstance(data, dict):
        err_code = data.get("code")
        message = data.get("message")
        if message is not None or err_code is not None:
            msg = "" if message is None else str(message)[:120]
            print(f"{code} rpc={name} err={err_code} msg={msg} {label}")
            return
    summary = ""
    if isinstance(data, list):
        summary = f"list_len={len(data)}"
    elif isinstance(data, dict):
        summary = f"keys={sorted(data.keys())}"
    elif data is None:
        summary = "null"
    else:
        summary = f"type={type(data).__name__}"
    print(f"{code} rpc={name} {summary} {label}")


print("=== ONBOARDED USER — Stage C analysis SELECT (expect rows) ===")
probe_select("practices_scores", "practices?select=id,retention_score&limit=1", user_jwt, True)
probe_select("doctors_grad", "doctors?select=id,graduation_year&limit=1", user_jwt, True)
probe_select("affiliations", "affiliations?select=id,status&limit=1", user_jwt, True)
probe_select("practice_locations", "practice_locations?select=id,city,state&limit=1", user_jwt, True)

print("=== ONBOARDED USER — Stage B surfaces ===")
probe_select("shortlists_own_only", "shortlists?select=id&limit=20", user_jwt, None)
probe_select("employer_leads_non_admin", "employer_leads?select=id,email&limit=1", user_jwt, False)

print("=== ONBOARDED USER — Jobs RPCs ===")
probe_rpc("list_jobs", "list_physician_jobs", {"p_limit": 5, "p_offset": 0}, user_jwt)
probe_rpc("count_jobs", "count_physician_jobs", {}, user_jwt)

print("=== ONBOARDED USER — public RPCs still callable when authenticated ===")
probe_rpc("public_search", "public_search", {"q": "smith"}, user_jwt)
probe_rpc("public_counts", "public_platform_counts", {}, user_jwt)

if admin_jwt:
    print("=== ADMIN — employer_leads + locations write posture ===")
    probe_select("employer_leads_admin", "employer_leads?select=id,email&limit=1", admin_jwt, True)
else:
    print("SKIP admin probes (set TEST_ADMIN_JWT)")
PY
