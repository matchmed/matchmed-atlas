#!/usr/bin/env bash
# Anonymous Data API probe for public RPCs + post-revoke base-table denial.
# Usage:
#   ./scripts/probe-anon-public-rpcs.sh
#   PUBLIC_PRACTICE_ID='...' PUBLIC_PHYSICIAN_ID='...' ./scripts/probe-anon-public-rpcs.sh
#
# Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from .env.local.
# Uses apikey only (no user JWT). Never prints secrets.

set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:${PATH:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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
import json, os, urllib.error, urllib.request

base = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1"
apikey = os.environ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
practice_id = os.environ.get("PUBLIC_PRACTICE_ID", "").strip() or None
physician_id = os.environ.get("PUBLIC_PHYSICIAN_ID", "").strip() or None

FORBIDDEN_KEYS = {
    "retention_score",
    "experience_level",
    "tenure_0_1",
    "tenure_years",
    "graduation_year",
    "years_since_graduation",
    "grad_yr",
    "email",
    "org_pac_id",
    "latitude",
    "longitude",
    "is_admin",
    "deleted_at",
    "point_of_contact",
    "sort_doctor_count",
    "sort_rank",
    "doctor_count",
    "first_seen_year_at_org",
    "veteran_count",
}

def walk_keys(obj, found=None):
    if found is None:
        found = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            found.add(k)
            walk_keys(v, found)
    elif isinstance(obj, list):
        for item in obj:
            walk_keys(item, found)
    return found

def rpc(name: str, payload: dict) -> None:
    url = f"{base}/rpc/{name}"
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "apikey": apikey,
            "Authorization": f"Bearer {apikey}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            code = resp.status
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        code = e.code
        try:
            err = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            err = {}
        print(f"{code} rpc={name} err={err.get('code')} msg={(err.get('message') or '')[:160]}")
        return

    try:
        data = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        print(f"{code} rpc={name} parse_fail")
        return

    keys = sorted(walk_keys(data))
    leaked = sorted(set(keys) & FORBIDDEN_KEYS)
    summary = ""
    if isinstance(data, dict):
        if "practices" in data and "physicians" in data:
            summary = (
                f"practices={len(data.get('practices') or [])} "
                f"physicians={len(data.get('physicians') or [])}"
            )
        elif "current_affiliations" in data:
            summary = f"affiliations={len(data.get('current_affiliations') or [])}"
        elif "practice_count" in data:
            summary = (
                f"practice_count={data.get('practice_count')} "
                f"physician_count={data.get('physician_count')}"
            )
        else:
            summary = f"top_keys={sorted(data.keys())}"
    elif isinstance(data, list):
        summary = f"list_len={len(data)}"
    else:
        summary = f"type={type(data).__name__}"

    print(f"{code} rpc={name} {summary} leaked_forbidden={leaked or []} keys={keys}")

def table_get(path: str) -> None:
    url = f"{base}/{path}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": apikey,
            "Authorization": f"Bearer {apikey}",
            "Accept": "application/json",
            "Prefer": "count=exact",
            "Range": "0-0",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            code = resp.status
            cr = resp.headers.get("content-range", "none")
            raw = resp.read().decode()
            err_code = None
    except urllib.error.HTTPError as e:
        code = e.code
        cr = e.headers.get("content-range", "none") if e.headers else "none"
        raw = e.read().decode()
        try:
            err_code = (json.loads(raw) if raw else {}).get("code")
        except json.JSONDecodeError:
            err_code = None
    # After revoke: expect 401/403 with permission error (e.g. 42501), NOT 200 []
    print(f"{code} err={err_code} content-range={cr} path={path}")

print("=== ANON PUBLIC RPC PROBES (expect 200 for valid calls) ===")
rpc("public_search", {"q": "smith"})
rpc("public_search", {"q": "ab"})
rpc("public_search", {"q": "ab\x01c"})
rpc("public_platform_counts", {})

if practice_id:
    rpc("public_get_practice", {"p_id": practice_id})
    rpc("public_get_practice_locations", {"p_id": practice_id})
    rpc("public_get_practice_roster", {"p_id": practice_id})
else:
    print("SKIP practice detail RPCs (set PUBLIC_PRACTICE_ID)")

if physician_id:
    rpc("public_get_physician", {"p_id": physician_id})
else:
    print("SKIP physician detail RPC (set PUBLIC_PHYSICIAN_ID)")

print("=== ANON BASE TABLE (expect permission error after revoke; NOT 200 []) ===")
for path in (
    "practices?select=id,retention_score&limit=1",
    "doctors?select=id,graduation_year&limit=1",
    "affiliations?select=id,status&limit=1",
    "practice_locations?select=id,city,state&limit=1",
    "profiles?select=id,email,is_admin&limit=1",
    "shortlists?select=id&limit=1",
    "employer_leads?select=id,email,phone&limit=1",
    "practice_error_reports?select=id&limit=1",
):
    table_get(path)

print("=== PRIVATE HELPERS (expect inaccessible) ===")
for name, payload in (
    ("_public_normalize_search_query", {"q": "test"}),
    ("_public_is_current_roster_status", {"p_status": "On roster"}),
    ("_public_ilike_pattern", {"nq": "test"}),
):
    rpc(name, payload)
PY
