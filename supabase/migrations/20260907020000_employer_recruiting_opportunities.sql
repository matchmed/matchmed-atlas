-- Physician-ready V1 — specialty recruiting opportunities + reasons.
-- No row-level publication status: physician_ready_at is the sole public gate.
-- Authorized editors may save incomplete rows; public overlay omits them until ready.

CREATE TABLE IF NOT EXISTS public.employer_practice_recruiting_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  clinical_focus text NOT NULL,
  hiring_horizon text NOT NULL,
  hiring_notes text NULL,
  base_compensation_min_usd integer NOT NULL,
  base_compensation_max_usd integer NULL,
  base_compensation_max_is_open_ended boolean NOT NULL DEFAULT false,
  productivity_structure_available boolean NOT NULL,
  signing_bonus_available boolean NOT NULL,
  relocation_assistance_available boolean NOT NULL,
  reported_by uuid NULL REFERENCES auth.users(id),
  reported_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employer_recruiting_opp_clinical_focus_check
    CHECK (clinical_focus IN (
      'Cataract Surgery / Refractive Surgery',
      'Glaucoma (medical and/or surgical)',
      'Retinal Diseases +/- Uveitis',
      'Corneal Disease',
      'Dry Eye / Ocular Surface Disease',
      'Oculoplastics',
      'Neuro-ophthalmology / Strabismus',
      'Pediatric Ophthalmology',
      'General Ophthalmology (multiple areas)'
    )),
  CONSTRAINT employer_recruiting_opp_hiring_horizon_check
    CHECK (hiring_horizon IN (
      'now',
      'within_1_year',
      'within_2_years',
      'within_3_to_5_years'
    )),
  CONSTRAINT employer_recruiting_opp_hiring_notes_len
    CHECK (hiring_notes IS NULL OR char_length(hiring_notes) <= 500),
  CONSTRAINT employer_recruiting_opp_comp_min_ladder
    CHECK (base_compensation_min_usd IN (
      100000,150000,200000,250000,300000,350000,400000,450000,500000,
      550000,600000,650000,700000,750000,800000,850000,900000,950000,1000000
    )),
  CONSTRAINT employer_recruiting_opp_comp_max_ladder
    CHECK (
      base_compensation_max_usd IS NULL
      OR base_compensation_max_usd IN (
        100000,150000,200000,250000,300000,350000,400000,450000,500000,
        550000,600000,650000,700000,750000,800000,850000,900000,950000,1000000
      )
    ),
  CONSTRAINT employer_recruiting_opp_comp_open_ended_consistency
    CHECK (
      (
        base_compensation_max_is_open_ended = true
        AND base_compensation_max_usd IS NULL
        AND base_compensation_min_usd <= 1000000
      )
      OR (
        base_compensation_max_is_open_ended = false
        AND base_compensation_max_usd IS NOT NULL
        AND base_compensation_min_usd <= base_compensation_max_usd
      )
    )
);

COMMENT ON TABLE public.employer_practice_recruiting_opportunities IS
  'Employer-reported specialty recruiting opportunities with structured compensation. Not publicly visible until physician_ready_at is set.';

CREATE UNIQUE INDEX IF NOT EXISTS employer_recruiting_opp_one_per_specialty
  ON public.employer_practice_recruiting_opportunities (practice_id, clinical_focus);

CREATE INDEX IF NOT EXISTS employer_recruiting_opp_practice_idx
  ON public.employer_practice_recruiting_opportunities (practice_id);

CREATE TABLE IF NOT EXISTS public.employer_practice_recruiting_opportunity_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL
    REFERENCES public.employer_practice_recruiting_opportunities(id) ON DELETE CASCADE,
  reason text NOT NULL,
  other_text text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employer_recruiting_reason_check
    CHECK (reason IN (
      'growth',
      'retiring_doctor',
      'new_subspecialty_offering',
      'recent_loss_of_doctor',
      'other'
    )),
  CONSTRAINT employer_recruiting_reason_other_text_len
    CHECK (other_text IS NULL OR char_length(btrim(other_text)) BETWEEN 1 AND 200),
  CONSTRAINT employer_recruiting_reason_other_consistency
    CHECK (reason = 'other' OR other_text IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS employer_recruiting_reason_unique
  ON public.employer_practice_recruiting_opportunity_reasons (opportunity_id, reason);

CREATE INDEX IF NOT EXISTS employer_recruiting_reason_opp_idx
  ON public.employer_practice_recruiting_opportunity_reasons (opportunity_id);

-- Explicit mapping table for published employer_leads specialty strings → clinical_focus.
-- Only confident mappings are seeded; unmapped leads do not infer "Actively recruiting now".
CREATE TABLE IF NOT EXISTS public.employer_leads_clinical_focus_map (
  lead_specialty text PRIMARY KEY,
  clinical_focus text NOT NULL,
  CONSTRAINT employer_leads_clinical_focus_map_focus_check
    CHECK (clinical_focus IN (
      'Cataract Surgery / Refractive Surgery',
      'Glaucoma (medical and/or surgical)',
      'Retinal Diseases +/- Uveitis',
      'Corneal Disease',
      'Dry Eye / Ocular Surface Disease',
      'Oculoplastics',
      'Neuro-ophthalmology / Strabismus',
      'Pediatric Ophthalmology',
      'General Ophthalmology (multiple areas)'
    ))
);

COMMENT ON TABLE public.employer_leads_clinical_focus_map IS
  'Explicit legacy mapping from employer_leads.subspecialties_interest values to clinical_focus. No fuzzy matching.';

-- Seed confident identity mappings for values that already equal clinical_focus.
INSERT INTO public.employer_leads_clinical_focus_map (lead_specialty, clinical_focus)
VALUES
  ('Cataract Surgery / Refractive Surgery', 'Cataract Surgery / Refractive Surgery'),
  ('Glaucoma (medical and/or surgical)', 'Glaucoma (medical and/or surgical)'),
  ('Retinal Diseases +/- Uveitis', 'Retinal Diseases +/- Uveitis'),
  ('Corneal Disease', 'Corneal Disease'),
  ('Dry Eye / Ocular Surface Disease', 'Dry Eye / Ocular Surface Disease'),
  ('Oculoplastics', 'Oculoplastics'),
  ('Neuro-ophthalmology / Strabismus', 'Neuro-ophthalmology / Strabismus'),
  ('Pediatric Ophthalmology', 'Pediatric Ophthalmology'),
  ('General Ophthalmology (multiple areas)', 'General Ophthalmology (multiple areas)')
ON CONFLICT (lead_specialty) DO UPDATE
SET clinical_focus = EXCLUDED.clinical_focus;

-- RLS
ALTER TABLE public.employer_practice_recruiting_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_practice_recruiting_opportunity_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_leads_clinical_focus_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employer_recruiting_opp_select ON public.employer_practice_recruiting_opportunities;
CREATE POLICY employer_recruiting_opp_select
  ON public.employer_practice_recruiting_opportunities
  FOR SELECT TO authenticated
  USING (
    public.is_atlas_admin()
    OR public.can_edit_practice((SELECT auth.uid()), practice_id)
  );

DROP POLICY IF EXISTS employer_recruiting_opp_insert ON public.employer_practice_recruiting_opportunities;
CREATE POLICY employer_recruiting_opp_insert
  ON public.employer_practice_recruiting_opportunities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_atlas_admin()
    OR public.can_edit_practice((SELECT auth.uid()), practice_id)
  );

DROP POLICY IF EXISTS employer_recruiting_opp_update ON public.employer_practice_recruiting_opportunities;
CREATE POLICY employer_recruiting_opp_update
  ON public.employer_practice_recruiting_opportunities
  FOR UPDATE TO authenticated
  USING (
    public.is_atlas_admin()
    OR public.can_edit_practice((SELECT auth.uid()), practice_id)
  )
  WITH CHECK (
    public.is_atlas_admin()
    OR public.can_edit_practice((SELECT auth.uid()), practice_id)
  );

DROP POLICY IF EXISTS employer_recruiting_opp_delete ON public.employer_practice_recruiting_opportunities;
CREATE POLICY employer_recruiting_opp_delete
  ON public.employer_practice_recruiting_opportunities
  FOR DELETE TO authenticated
  USING (
    public.is_atlas_admin()
    OR public.can_edit_practice((SELECT auth.uid()), practice_id)
  );

DROP POLICY IF EXISTS employer_recruiting_reason_select ON public.employer_practice_recruiting_opportunity_reasons;
CREATE POLICY employer_recruiting_reason_select
  ON public.employer_practice_recruiting_opportunity_reasons
  FOR SELECT TO authenticated
  USING (
    public.is_atlas_admin()
    OR EXISTS (
      SELECT 1
      FROM public.employer_practice_recruiting_opportunities AS o
      WHERE o.id = opportunity_id
        AND public.can_edit_practice((SELECT auth.uid()), o.practice_id)
    )
  );

DROP POLICY IF EXISTS employer_recruiting_reason_insert ON public.employer_practice_recruiting_opportunity_reasons;
CREATE POLICY employer_recruiting_reason_insert
  ON public.employer_practice_recruiting_opportunity_reasons
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_atlas_admin()
    OR EXISTS (
      SELECT 1
      FROM public.employer_practice_recruiting_opportunities AS o
      WHERE o.id = opportunity_id
        AND public.can_edit_practice((SELECT auth.uid()), o.practice_id)
    )
  );

DROP POLICY IF EXISTS employer_recruiting_reason_update ON public.employer_practice_recruiting_opportunity_reasons;
CREATE POLICY employer_recruiting_reason_update
  ON public.employer_practice_recruiting_opportunity_reasons
  FOR UPDATE TO authenticated
  USING (
    public.is_atlas_admin()
    OR EXISTS (
      SELECT 1
      FROM public.employer_practice_recruiting_opportunities AS o
      WHERE o.id = opportunity_id
        AND public.can_edit_practice((SELECT auth.uid()), o.practice_id)
    )
  )
  WITH CHECK (
    public.is_atlas_admin()
    OR EXISTS (
      SELECT 1
      FROM public.employer_practice_recruiting_opportunities AS o
      WHERE o.id = opportunity_id
        AND public.can_edit_practice((SELECT auth.uid()), o.practice_id)
    )
  );

DROP POLICY IF EXISTS employer_recruiting_reason_delete ON public.employer_practice_recruiting_opportunity_reasons;
CREATE POLICY employer_recruiting_reason_delete
  ON public.employer_practice_recruiting_opportunity_reasons
  FOR DELETE TO authenticated
  USING (
    public.is_atlas_admin()
    OR EXISTS (
      SELECT 1
      FROM public.employer_practice_recruiting_opportunities AS o
      WHERE o.id = opportunity_id
        AND public.can_edit_practice((SELECT auth.uid()), o.practice_id)
    )
  );

-- Mapping table is read-only for authenticated; admin may manage.
DROP POLICY IF EXISTS employer_leads_focus_map_select ON public.employer_leads_clinical_focus_map;
CREATE POLICY employer_leads_focus_map_select
  ON public.employer_leads_clinical_focus_map
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS employer_leads_focus_map_admin_write ON public.employer_leads_clinical_focus_map;
CREATE POLICY employer_leads_focus_map_admin_write
  ON public.employer_leads_clinical_focus_map
  FOR ALL TO authenticated
  USING (public.is_atlas_admin())
  WITH CHECK (public.is_atlas_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_practice_recruiting_opportunities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employer_practice_recruiting_opportunity_reasons TO authenticated;
GRANT SELECT ON public.employer_leads_clinical_focus_map TO authenticated;

REVOKE ALL ON TABLE public.employer_practice_recruiting_opportunities FROM anon;
REVOKE ALL ON TABLE public.employer_practice_recruiting_opportunity_reasons FROM anon;
REVOKE ALL ON TABLE public.employer_leads_clinical_focus_map FROM anon;
