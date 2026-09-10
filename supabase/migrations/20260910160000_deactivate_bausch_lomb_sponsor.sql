-- MAT-16: temporarily deactivate Bausch + Lomb sponsor page after demo.
-- Reversible data-state change only. Preserves profile, content, images, and vendors.

UPDATE public.sponsor_vendor_profiles AS p
SET
  is_active = false,
  updated_at = now()
FROM public.vendors AS v
WHERE p.vendor_id = v.id
  AND v.slug = 'bausch_plus_lomb'
  AND p.is_active = true;
