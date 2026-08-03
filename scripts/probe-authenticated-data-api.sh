#!/usr/bin/env bash
# Local authenticated Supabase Data API probe.
# Usage:
#   export TEST_USER_JWT='...'   # short-lived user access token; never commit
#   ./scripts/probe-authenticated-data-api.sh
#
# Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from .env.local.
# Never prints or writes TEST_USER_JWT. Reports only status codes, row counts, and column names.

set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:${PATH:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${TEST_USER_JWT:-}" ]]; then
  echo "ERROR: TEST_USER_JWT is not set in the environment." >&2
  exit 1
fi

# Load URL + publishable key without printing values
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

BASE="${NEXT_PUBLIC_SUPABASE_URL%/}/rest/v1"
APIKEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"

python3 - <<'PY'
import json, os, urllib.error, urllib.request

base = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1"
apikey = os.environ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
jwt = os.environ["TEST_USER_JWT"]

# Touch jwt only for length/class checks — never print it
print("jwt_present", True)
print("jwt_len", len(jwt))
print("jwt_looks_like_jwt", jwt.startswith("eyJ") and jwt.count(".") == 2)

def probe(path: str) -> None:
    url = f"{base}/{path}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": apikey,
            "Authorization": f"Bearer {jwt}",
            "Accept": "application/json",
            "Prefer": "count=exact",
            "Range": "0-0",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode()
            code = resp.status
            headers = {k.lower(): v for k, v in resp.headers.items()}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        code = e.code
        headers = {k.lower(): v for k, v in e.headers.items()} if e.headers else {}

    cr = headers.get("content-range", "none")
    try:
        data = json.loads(body) if body else None
    except json.JSONDecodeError:
        print(f"{code} parse_fail content-range={cr} path={path}")
        return

    if isinstance(data, list):
        keys = sorted(data[0].keys()) if data else []
        print(f"{code} rows={len(data)} content-range={cr} keys={keys} path={path}")
    elif isinstance(data, dict):
        msg = (data.get("message") or "")[:160]
        print(f"{code} err={data.get('code')} msg={msg} content-range={cr} path={path}")
    else:
        print(f"{code} unexpected_type content-range={cr} path={path}")

print("=== AUTHENTICATED SELECT PROBES ===")
paths = [
    "practices?select=id&limit=1",
    "practices?select=id,practice_name,retention_score,experience_level,tenure_0_1,total_physicians_all_time&limit=1",
    "doctors?select=id,physician_name,npi,graduation_year,years_since_graduation&limit=1",
    "affiliations?select=id,status,first_seen_year_at_org,last_seen_year_at_org,tenure_years,grad_yr&limit=1",
    "affiliations?select=status&limit=50",
    "practice_locations?select=id,practice_id,city,state&limit=1",
    "profiles?select=id,user_id,onboarding_complete,is_admin,is_internal,deleted_at&limit=1",
    "shortlists?select=id&limit=1",
    "employer_leads?select=id,email,phone&limit=1",
    "practice_error_reports?select=id&limit=1",
]
for p in paths:
    probe(p)

# Distinct affiliation statuses from up to 1000 rows (column names + unique status values only)
print("=== AFFILIATION STATUS SAMPLE (values only; no PII rows) ===")
url = f"{base}/affiliations?select=status&limit=1000"
req = urllib.request.Request(
    url,
    headers={
        "apikey": apikey,
        "Authorization": f"Bearer {jwt}",
        "Accept": "application/json",
    },
)
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode() or "[]")
        code = resp.status
except urllib.error.HTTPError as e:
    print(f"{e.code} affiliation_status_sample_failed msg={(e.read().decode()[:160])}")
else:
    counts = {}
    for row in data if isinstance(data, list) else []:
        s = row.get("status")
        key = repr(s)
        counts[key] = counts.get(key, 0) + 1
    print(f"{code} sample_rows={len(data) if isinstance(data, list) else 0}")
    for key in sorted(counts, key=lambda k: (-counts[k], k)):
        print(f"  status={key} count={counts[key]}")
PY
