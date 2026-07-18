CREATE TABLE practice_error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL REFERENCES profiles(id),
  field_flagged text NOT NULL CHECK (
    field_flagged IN ('practice_name', 'address', 'phone', 'website', 'other')
  ),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
  snapshot jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'reviewing', 'fixed', 'rejected')
  ),
  admin_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_practice_error_reports_status_created
  ON practice_error_reports(status, created_at DESC);
CREATE INDEX idx_practice_error_reports_practice
  ON practice_error_reports(practice_id);

ALTER TABLE practice_error_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit their own practice error reports"
  ON practice_error_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = practice_error_reports.reported_by
        AND profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view practice error reports"
  ON practice_error_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.is_admin IS TRUE
    )
  );

CREATE POLICY "Admins can update practice error reports"
  ON practice_error_reports
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.is_admin IS TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.is_admin IS TRUE
    )
  );
