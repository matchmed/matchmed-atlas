-- Physician-ready V1 — infrastructure category seed (idempotent).

INSERT INTO public.infrastructure_categories (slug, display_label, physician_facing, sort_order)
VALUES
  ('diagnostics_imaging', 'Diagnostics & Imaging', true, 10),
  ('clinic_lane_equipment', 'Clinic Lane Equipment', true, 20),
  ('cataract_phaco', 'Cataract / Phaco', true, 30),
  ('iol_lens_platforms', 'IOL / Lens Platforms', true, 40),
  ('glaucoma_migs', 'Glaucoma / MIGS', true, 50),
  ('retina', 'Retina', true, 60),
  ('refractive_surgery', 'Refractive Surgery', true, 70),
  ('or_microscopes_visualization', 'OR Microscopes / Visualization', true, 80),
  ('surgical_instruments_consumables', 'Surgical Instruments / Consumables', true, 90),
  ('asc_office_based_surgery', 'ASC / Office-Based Surgery', true, 100),
  ('emr_practice_management', 'EMR / Practice Management', true, 110),
  ('billing_revenue_cycle', 'Billing / Revenue Cycle', false, 120),
  ('patient_engagement', 'Patient Engagement', false, 130),
  ('it_cybersecurity', 'IT / Cybersecurity', false, 140),
  ('supply_materials', 'Supply / Materials', false, 150)
ON CONFLICT (slug) DO UPDATE SET
  display_label = EXCLUDED.display_label,
  physician_facing = EXCLUDED.physician_facing,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();
