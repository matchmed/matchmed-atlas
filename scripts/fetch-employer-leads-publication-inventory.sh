#!/usr/bin/env bash
# Fetch sanitized employer_leads publication inventory via Data API.
# Requires TEST_USER_JWT (preferably admin). Never prints the token.
# Does not request email/phone/POC/source.
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:${PATH:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${TEST_USER_JWT:-}" ]]; then
  echo "ERROR: set TEST_USER_JWT (do not commit it)." >&2
  exit 1
fi

eval "$(python3 - <<'PY'
from pathlib import Path
for line in Path(".env.local").read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    if k in ("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"):
        print(f"export {k}={v.strip().strip(chr(34)).strip(chr(39))!r}")
PY
)"

OUT="${1:-docs/security/employer-leads-publication-inventory.csv}"
python3 - <<PY
import csv, json, os, urllib.error, urllib.parse, urllib.request
from pathlib import Path

base = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1"
apikey = os.environ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
jwt = os.environ["TEST_USER_JWT"]
out = Path("$OUT")

select = ",".join([
    "id",
    "practice_name",
    "practice_id",
    "primary_location",
    "practice_setting",
    "clinical_surgical_mix",
    "ideal_hiring_timeline",
    "subspecialties_interest",
    "additional_details",
    "received_at",
])
# page through all rows
rows = []
start = 0
page = 1000
while True:
    end = start + page - 1
    url = f"{base}/employer_leads?select={urllib.parse.quote(select)}&order=received_at.desc.nullslast&offset={start}&limit={page}"
    req = urllib.request.Request(url, headers={
        "apikey": apikey,
        "Authorization": f"Bearer {jwt}",
        "Accept": "application/json",
        "Range": f"{start}-{end}",
        "Prefer": "count=exact",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            chunk = json.loads(resp.read().decode() or "[]")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {(e.read().decode() or '')[:200]}")
    if not chunk:
        break
    rows.extend(chunk)
    if len(chunk) < page:
        break
    start += page

def nonempty(s):
    return bool(s and str(s).strip())

def complete(r):
    if not r.get("practice_id"):
        return False
    if not nonempty(r.get("practice_name")):
        return False
    if not nonempty(r.get("primary_location")):
        return False
    subs = r.get("subspecialties_interest") or []
    if not nonempty(r.get("additional_details")) and not r.get("practice_setting") and not r.get("clinical_surgical_mix") and not r.get("ideal_hiring_timeline") and len(subs) == 0:
        return False
    return True

def bucket(r):
    if not r.get("practice_id"):
        return "unlinked_admin_only"
    if not nonempty(r.get("practice_name")):
        return "incomplete_missing_name"
    if not nonempty(r.get("primary_location")):
        return "incomplete_missing_location"
    if not complete(r):
        return "sparse_content"
    return "candidate_for_manual_publish"

out.parent.mkdir(parents=True, exist_ok=True)
fields = [
    "id",
    "practice_name",
    "has_practice_id",
    "primary_location",
    "practice_setting",
    "ideal_hiring_timeline",
    "received_date",
    "has_additional_details",
    "appears_complete_enough",
    "proposed_is_published",
    "review_bucket",
]
with out.open("w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    for r in rows:
        recv = r.get("received_at")
        w.writerow({
            "id": r.get("id"),
            "practice_name": r.get("practice_name"),
            "has_practice_id": bool(r.get("practice_id")),
            "primary_location": r.get("primary_location"),
            "practice_setting": r.get("practice_setting"),
            "ideal_hiring_timeline": r.get("ideal_hiring_timeline"),
            "received_date": (recv or "")[:10] if recv else "",
            "has_additional_details": nonempty(r.get("additional_details")),
            "appears_complete_enough": complete(r),
            "proposed_is_published": False,
            "review_bucket": bucket(r),
        })

from collections import Counter
c = Counter(bucket(r) for r in rows)
print(f"wrote {out} rows={len(rows)}")
print("buckets", dict(c))
print("candidates", c.get("candidate_for_manual_publish", 0))
print("NOTE: proposed_is_published is false for all rows; publish only after human review.")
PY
