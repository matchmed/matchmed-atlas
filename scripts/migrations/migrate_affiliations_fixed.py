"""
Fixed Affiliations Migration
=============================
Instead of relying on Airtable linked record IDs (which are missing
for most records), resolve FKs directly via:
  - org_pac_id → practices.org_pac_id
  - NPI        → doctors.npi

Run after the main migration has completed.

Usage:
    pip install requests supabase python-dateutil
    python migrate_affiliations_fixed.py
"""

import os
import time
from supabase import create_client
import requests

AIRTABLE_PAT  = "REDACTED_PAT"
AIRTABLE_BASE = "applI3tAeZR7UltWP"


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


SUPABASE_URL = require_env("SUPABASE_URL")
SUPABASE_SECRET_KEY = require_env("SUPABASE_SECRET_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

# ── Step 1: Build lookup maps from Supabase ──────────────────
print("Building lookup maps from Supabase...")

# org_pac_id → practice UUID
practice_map = {}
offset = 0
while True:
    result = supabase.table("practices").select("id, org_pac_id").range(offset, offset + 999).execute()
    for r in result.data:
        if r["org_pac_id"]:
            practice_map[r["org_pac_id"]] = r["id"]
    if len(result.data) < 1000:
        break
    offset += 1000
print(f"  Loaded {len(practice_map)} practices")

# NPI → doctor UUID
doctor_map = {}
offset = 0
while True:
    result = supabase.table("doctors").select("id, npi").range(offset, offset + 999).execute()
    for r in result.data:
        if r["npi"]:
            doctor_map[r["npi"]] = r["id"]
    if len(result.data) < 1000:
        break
    offset += 1000
print(f"  Loaded {len(doctor_map)} doctors")

# ── Step 2: Pull all Affiliations from Airtable ─────────────
print("\nFetching Affiliations from Airtable...")
url     = f"https://api.airtable.com/v0/{AIRTABLE_BASE}/Affiliations"
headers = {"Authorization": f"Bearer {AIRTABLE_PAT}"}
all_records = []
offset_token = None
page = 0

while True:
    params = {"pageSize": 100}
    if offset_token:
        params["offset"] = offset_token
    resp = requests.get(url, headers=headers, params=params)
    if resp.status_code == 429:
        print("  [rate limited] waiting 30s...")
        time.sleep(30)
        continue
    resp.raise_for_status()
    data = resp.json()
    all_records.extend(data.get("records", []))
    page += 1
    if page % 50 == 0:
        print(f"  page {page}: {len(all_records)} records so far...")
    offset_token = data.get("offset")
    if not offset_token:
        break
    time.sleep(0.25)

print(f"  Total fetched: {len(all_records)}")

# ── Step 3: Resolve FKs via NPI and org_pac_id ──────────────
print("\nResolving foreign keys...")
rows = []
skipped_no_doctor   = 0
skipped_no_practice = 0
skipped_both        = 0
resolved            = 0

for r in all_records:
    f = r.get("fields", {})
    npi        = str(f.get("NPI", "")).strip()
    org_pac_id = str(f.get("org_pac_id", "")).strip()

    doctor_id  = doctor_map.get(npi)
    practice_id = practice_map.get(org_pac_id)

    if not doctor_id and not practice_id:
        skipped_both += 1
        continue
    if not doctor_id:
        skipped_no_doctor += 1
        continue
    if not practice_id:
        skipped_no_practice += 1
        continue

    resolved += 1
    rows.append({
        "airtable_id":                r["id"],
        "doctor_id":                  doctor_id,
        "practice_id":                practice_id,
        "npi":                        npi,
        "org_pac_id":                 org_pac_id,
        "first_seen_year_at_org":     f.get("first_seen_year_at_org"),
        "last_seen_year_at_org":      f.get("last_seen_year_at_org"),
        "tenure_years":               f.get("tenure_years"),
        "status":                     f.get("status"),
        "short_tenure_departure_flag": f.get("short_tenure_departure_flag"),
        "has_subsequent_org":         f.get("has_subsequent_org"),
        "address":                    f.get("address"),
        "city":                       f.get("city"),
        "state":                      f.get("state"),
        "city_st":                    f.get("City_St"),
        "alt_name":                   f.get("alt_name"),
        "grad_yr":                    f.get("grad_yr"),
        "grad_delta":                 f.get("grad_delta"),
    })

print(f"\nResolution results:")
print(f"  ✓ Resolved:            {resolved}")
print(f"  ✗ No doctor match:     {skipped_no_doctor}")
print(f"  ✗ No practice match:   {skipped_no_practice}")
print(f"  ✗ Neither matched:     {skipped_both}")

# ── Step 4: Upsert into Supabase ────────────────────────────
print(f"\nUpserting {len(rows)} affiliations into Supabase...")
batch_size = 500
inserted = 0

for i in range(0, len(rows), batch_size):
    batch = rows[i:i + batch_size]
    try:
        supabase.table("affiliations").upsert(
            batch, on_conflict="airtable_id"
        ).execute()
        inserted += len(batch)
        print(f"  [affiliations] upserted {inserted}/{len(rows)}")
    except Exception as e:
        print(f"  [ERROR] batch {i}-{i+batch_size}: {e}")

print(f"\n✓ Affiliations migration complete: {inserted} rows")
print(f"\nNote: {skipped_no_practice} records had no matching practice.")
print("This is expected — some org_pac_ids in Affiliations refer to")
print("non-ophthalmology orgs or practices not in your dataset.")
