"""
MatchMed Atlas — Airtable → Supabase Migration Script
======================================================
Run once to migrate all data from Airtable to Supabase/Postgres.

Requirements:
    pip install requests supabase python-dateutil

Usage:
    1. Set SUPABASE_URL and SUPABASE_SECRET_KEY in the environment
    2. Run: python migrate_atlas.py
"""

import os
import time
import re
from datetime import datetime, timezone
from dateutil import parser as dateparser
import requests
from supabase import create_client, Client

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
AIRTABLE_PAT   = "REDACTED_PAT"
AIRTABLE_BASE  = "applI3tAeZR7UltWP"


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


SUPABASE_URL = require_env("SUPABASE_URL")
SUPABASE_SECRET_KEY = require_env("SUPABASE_SECRET_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def airtable_get_all(table_name: str) -> list[dict]:
    """Fetch all records from an Airtable table with pagination and rate limiting."""
    url     = f"https://api.airtable.com/v0/{AIRTABLE_BASE}/{requests.utils.quote(table_name)}"
    headers = {"Authorization": f"Bearer {AIRTABLE_PAT}"}
    records = []
    offset  = None
    page    = 0

    while True:
        params = {"pageSize": 100}
        if offset:
            params["offset"] = offset

        resp = requests.get(url, headers=headers, params=params)
        if resp.status_code == 429:
            print(f"    [rate limited] waiting 30s...")
            time.sleep(30)
            continue
        resp.raise_for_status()
        data = resp.json()

        batch = data.get("records", [])
        records.extend(batch)
        page += 1
        print(f"    page {page}: fetched {len(batch)} records (total so far: {len(records)})")

        offset = data.get("offset")
        if not offset:
            break

        time.sleep(0.25)   # stay well under 5 req/sec

    return records


def clean_timestamp(value) -> str | None:
    """Parse and clean potentially malformed timestamp strings."""
    if not value:
        return None
    # Strip escaped quotes e.g. "\"2026-02-12T21:02:21.000Z\""
    value = str(value).strip().strip('"').strip("'")
    try:
        return dateparser.parse(value).isoformat()
    except Exception:
        return None


def upsert(table: str, rows: list[dict], conflict_col: str = None) -> None:
    """Upsert rows into Supabase table in batches of 500."""
    if not rows:
        print(f"  [skip] no rows to insert for {table}")
        return

    batch_size = 500
    total = len(rows)
    inserted = 0

    for i in range(0, total, batch_size):
        batch = rows[i:i + batch_size]
        try:
            if conflict_col:
                supabase.table(table).upsert(batch, on_conflict=conflict_col).execute()
            else:
                supabase.table(table).upsert(batch).execute()
            inserted += len(batch)
            print(f"  [{table}] upserted {inserted}/{total}")
        except Exception as e:
            print(f"  [ERROR] {table} batch {i}-{i+batch_size}: {e}")
            # print first row for debugging
            print(f"  sample row: {batch[0]}")

    print(f"  ✓ {table}: {inserted} rows complete")


# ─────────────────────────────────────────────
# 1. PRACTICES
# ─────────────────────────────────────────────

def migrate_practices() -> dict[str, str]:
    """Returns {airtable_id: supabase_uuid} map for FK resolution."""
    print("\n── Practices ──────────────────────────────")
    raw = airtable_get_all("Practices")

    rows = []
    for r in raw:
        f = r.get("fields", {})
        rows.append({
            "airtable_id":                  r["id"],
            "specialty_id":                 1,
            "practice_name":                f.get("Practice Name"),
            "dba":                          f.get("DBA"),
            "alt_name":                     f.get("alt_name"),
            "org_pac_id":                   f.get("org_pac_id"),
            "address":                      f.get("Address"),
            "city":                         f.get("City"),
            "state":                        f.get("State"),
            "city_st":                      f.get("City_St"),
            "latitude":                     f.get("latitude"),
            "longitude":                    f.get("longitude"),
            "phone":                        f.get("phone"),
            "website":                      f.get("website"),
            "latest_roster_size":           f.get("latest_roster_size"),
            "total_physicians_all_time":    f.get("Total_Physicians_All_Time"),
            "veteran_count":                f.get("veteran_count"),
            "has_name":                     f.get("has_name"),
            "tenure_0_1":                   f.get("tenure_0_1"),
            "tenure_2_3":                   f.get("tenure_2_3"),
            "tenure_4_5":                   f.get("tenure_4_5"),
            "tenure_6_7":                   f.get("tenure_6_7"),
            "tenure_8_plus":                f.get("tenure_8_plus"),
            "short_tenure_departure_count": f.get("short_tenure_departure_count"),
            "retention_score":              f.get("Retention Score"),
            "retention_score_delta":        f.get("Retention Score Delta"),
            "experience_level":             f.get("Experience Level"),
            "experience_level_delta":       f.get("Experience Level Delta"),
            "med_yrs_grad":                 f.get("med_yrs_grad"),
            "last_modified":                clean_timestamp(f.get("Last Modified")),
        })

    upsert("practices", rows, conflict_col="airtable_id")

    # Build airtable_id → supabase uuid map
    result = supabase.table("practices").select("id, airtable_id").execute()
    return {r["airtable_id"]: r["id"] for r in result.data}


# ─────────────────────────────────────────────
# 2. DOCTORS
# ─────────────────────────────────────────────

def migrate_doctors() -> dict[str, str]:
    """Returns {airtable_id: supabase_uuid} map for FK resolution."""
    print("\n── Doctors ─────────────────────────────────")
    raw = airtable_get_all("Doctors")

    rows = []
    for r in raw:
        f = r.get("fields", {})
        rows.append({
            "airtable_id":          r["id"],
            "specialty_id":         1,
            "npi":                  f.get("NPI"),
            "physician_name":       f.get("physician_name"),
            "first_name":           f.get("frst_nm"),
            "middle_name":          f.get("mid_nm"),
            "last_name":            f.get("lst_nm"),
            "graduation_year":      f.get("graduation_year"),
            "years_since_graduation": f.get("Years Since Graduation"),
            "last_known_affiliation": f.get("last_known_affiliation"),
        })

    upsert("doctors", rows, conflict_col="airtable_id")

    result = supabase.table("doctors").select("id, airtable_id").execute()
    return {r["airtable_id"]: r["id"] for r in result.data}


# ─────────────────────────────────────────────
# 3. AFFILIATIONS
# ─────────────────────────────────────────────

def migrate_affiliations(practice_map: dict, doctor_map: dict) -> None:
    print("\n── Affiliations ────────────────────────────")
    raw = airtable_get_all("Affiliations")

    rows = []
    skipped = 0
    for r in raw:
        f = r.get("fields", {})

        # Resolve FKs from linked record arrays
        doctor_airtable_ids  = f.get("Doctors", [])
        practice_airtable_ids = f.get("Practices", [])

        doctor_id  = doctor_map.get(doctor_airtable_ids[0])  if doctor_airtable_ids  else None
        practice_id = practice_map.get(practice_airtable_ids[0]) if practice_airtable_ids else None

        if not doctor_id or not practice_id:
            skipped += 1
            continue

        rows.append({
            "airtable_id":               r["id"],
            "doctor_id":                 doctor_id,
            "practice_id":               practice_id,
            "npi":                       f.get("NPI"),
            "org_pac_id":                f.get("org_pac_id"),
            "first_seen_year_at_org":    f.get("first_seen_year_at_org"),
            "last_seen_year_at_org":     f.get("last_seen_year_at_org"),
            "tenure_years":              f.get("tenure_years"),
            "status":                    f.get("status"),
            "short_tenure_departure_flag": f.get("short_tenure_departure_flag"),
            "has_subsequent_org":        f.get("has_subsequent_org"),
            "address":                   f.get("address"),
            "city":                      f.get("city"),
            "state":                     f.get("state"),
            "city_st":                   f.get("City_St"),
            "alt_name":                  f.get("alt_name"),
            "grad_yr":                   f.get("grad_yr"),
            "grad_delta":                f.get("grad_delta"),
        })

    if skipped:
        print(f"  [warning] skipped {skipped} affiliations with unresolved doctor/practice FKs")

    upsert("affiliations", rows, conflict_col="airtable_id")


# ─────────────────────────────────────────────
# 4. PHYSICIANS  (Atlas signed-up users)
# ─────────────────────────────────────────────

def migrate_physicians() -> dict[str, str]:
    print("\n── Physicians (users) ──────────────────────")
    raw = airtable_get_all("Physician Users")

    rows = []
    for r in raw:
        f = r.get("fields", {})
        rows.append({
            "airtable_id":        r["id"],
            "first_name":         f.get("first_name"),
            "last_name":          f.get("last_name"),
            "email":              f.get("email"),
            "phone":              f.get("phone"),
            "npi":                f.get("NPI"),
            "npi_verified":       f.get("npi_verified", False),
            "training_status":    f.get("training_status"),
            "subspecialty":       f.get("subspecialty", []),
            "clinical_focus":     f.get("clinical_focus", []),
            "current_practice":   f.get("current_practice"),
            "start_year":         f.get("start_year"),
            "preferred_state":    f.get("preferred_state", []),
            "procedures_performed": f.get("procedures_performed", []),
            "procedures_desired": f.get("procedures_desired", []),
            "terms_accepted":     f.get("terms_accepted", False),
            "data_sharing":       f.get("data_sharing", False),
            "signup_date":        clean_timestamp(f.get("signup_date")),
        })

    upsert("physicians", rows, conflict_col="airtable_id")

    result = supabase.table("physicians").select("id, airtable_id").execute()
    return {r["airtable_id"]: r["id"] for r in result.data}


# ─────────────────────────────────────────────
# 5. SHORTLISTS
# ─────────────────────────────────────────────

def migrate_shortlists(physician_map: dict, practice_map: dict) -> None:
    print("\n── Shortlists ──────────────────────────────")
    raw = airtable_get_all("Shortlist")

    rows = []
    skipped = 0
    for r in raw:
        f = r.get("fields", {})

        physician_airtable_ids = f.get("Physician Users", [])
        practice_airtable_ids  = f.get("Practices", [])

        physician_id = physician_map.get(physician_airtable_ids[0]) if physician_airtable_ids else None
        practice_id  = practice_map.get(practice_airtable_ids[0])   if practice_airtable_ids  else None

        if not physician_id or not practice_id:
            skipped += 1
            continue

        rows.append({
            "airtable_id":  r["id"],
            "physician_id": physician_id,
            "practice_id":  practice_id,
            "created_at":   clean_timestamp(f.get("Created")),
        })

    if skipped:
        print(f"  [warning] skipped {skipped} shortlists with unresolved FKs")

    upsert("shortlists", rows, conflict_col="airtable_id")


# ─────────────────────────────────────────────
# 6. EMPLOYER LEADS  (Ophthalmology Directory)
# ─────────────────────────────────────────────

def migrate_employer_leads(practice_map: dict) -> None:
    print("\n── Employer Leads ──────────────────────────")
    raw = airtable_get_all("Ophthalmology Directory")

    rows = []
    for r in raw:
        f = r.get("fields", {})

        # Use "Practices 2" only (ignore obsolete "Ophthalmology Practices (Complete) 3")
        practice_airtable_ids = f.get("Practices 2", [])
        practice_id = practice_map.get(practice_airtable_ids[0]) if practice_airtable_ids else None

        rows.append({
            "airtable_id":            r["id"],
            "practice_id":            practice_id,
            "practice_name":          f.get("Practice Name"),
            "point_of_contact":       f.get("Point of Contact"),
            "email":                  f.get("Email"),
            "phone":                  f.get("Phone"),
            "primary_location":       f.get("Primary Location"),
            "source":                 f.get("Source"),
            "message_id":             f.get("Message ID"),
            "practice_setting":       f.get("Practice Setting"),
            "clinical_surgical_mix":  f.get("Clinical/Surgical Mix"),
            "ideal_hiring_timeline":  f.get("Ideal Hiring Timeline"),
            "subspecialties_interest": f.get("Subspecialties of Interest", []),
            "additional_details":     f.get("Additional Details"),
            "received_at":            clean_timestamp(f.get("Received At")),
        })

    upsert("employer_leads", rows, conflict_col="airtable_id")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

if __name__ == "__main__":
    start = datetime.now(timezone.utc)
    print("=" * 55)
    print("  MatchMed Atlas Migration — Airtable → Supabase")
    print("=" * 55)

    practice_map  = migrate_practices()
    doctor_map    = migrate_doctors()
    migrate_affiliations(practice_map, doctor_map)
    physician_map = migrate_physicians()
    migrate_shortlists(physician_map, practice_map)
    migrate_employer_leads(practice_map)

    elapsed = (datetime.now(timezone.utc) - start).seconds // 60
    print(f"\n{'=' * 55}")
    print(f"  Migration complete in ~{elapsed} minutes")
    print(f"{'=' * 55}")
    print("\nNext steps:")
    print("  1. Check row counts in Supabase Table Editor")
    print("  2. Spot-check a few practices and doctors")
    print("  3. Revoke and regenerate your Airtable PAT")
