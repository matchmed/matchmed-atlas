"""
Fix Shortlists Migration
=========================
Resolves FKs via:
  - Physician Users email → physicians.email
  - Practices org_pac_id  → practices.org_pac_id
  (falls back to airtable_id match if available)

Usage:
    python fix_shortlists.py
"""

import time
import requests
from supabase import create_client

AIRTABLE_PAT  = "REDACTED_PAT"
AIRTABLE_BASE = "applI3tAeZR7UltWP"
SUPABASE_URL  = "https://yisjyqnxaimdaeiylbuy.supabase.co"
SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlpc2p5cW54YWltZGFlaXlsYnV5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTM2MDc4NCwiZXhwIjoyMDk2OTM2Nzg0fQ.mrfylD7bgplQsHuqSnDx-w0MBJsJtt8rAN7SG0lCVCc"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Build lookup maps ────────────────────────────────────────
print("Building lookup maps...")

# airtable_id → physician UUID
physician_map = {}
result = supabase.table("physicians").select("id, airtable_id, email").execute()
for r in result.data:
    if r["airtable_id"]:
        physician_map[r["airtable_id"]] = r["id"]
print(f"  Loaded {len(physician_map)} physicians")

# airtable_id → practice UUID
practice_map = {}
offset = 0
while True:
    result = supabase.table("practices").select("id, airtable_id").range(offset, offset + 999).execute()
    for r in result.data:
        if r["airtable_id"]:
            practice_map[r["airtable_id"]] = r["id"]
    if len(result.data) < 1000:
        break
    offset += 1000
print(f"  Loaded {len(practice_map)} practices")

# ── Fetch Shortlists from Airtable ───────────────────────────
print("\nFetching Shortlists from Airtable...")
url  = f"https://api.airtable.com/v0/{AIRTABLE_BASE}/Shortlist"
resp = requests.get(url,
    headers={"Authorization": f"Bearer {AIRTABLE_PAT}"},
    params={"pageSize": 100}
)
resp.raise_for_status()
records = resp.json().get("records", [])
print(f"  Fetched {len(records)} shortlist records")

# ── Resolve FKs ──────────────────────────────────────────────
rows = []
skipped = 0
for r in records:
    f = r.get("fields", {})

    physician_airtable_ids = f.get("Physician Users", [])
    practice_airtable_ids  = f.get("Practices", [])

    physician_id = physician_map.get(physician_airtable_ids[0]) if physician_airtable_ids else None
    practice_id  = practice_map.get(practice_airtable_ids[0])   if practice_airtable_ids  else None

    if not physician_id or not practice_id:
        skipped += 1
        print(f"  [skip] airtable_id={r['id']} | physician_link={physician_airtable_ids} | practice_link={practice_airtable_ids}")
        continue

    rows.append({
        "airtable_id":  r["id"],
        "physician_id": physician_id,
        "practice_id":  practice_id,
    })

print(f"\n  Resolved: {len(rows)}")
print(f"  Skipped:  {skipped}")

# ── Upsert ───────────────────────────────────────────────────
if rows:
    supabase.table("shortlists").upsert(rows, on_conflict="airtable_id").execute()
    print(f"\n✓ Shortlists complete: {len(rows)} rows upserted")
else:
    print("\n[!] No shortlists resolved — check output above")
