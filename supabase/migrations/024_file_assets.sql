CREATE TABLE IF NOT EXISTS public.file_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'cloudflare_r2',
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  folder TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  metadata JSONB,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_file_assets_uploaded_by ON public.file_assets(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_file_assets_folder ON public.file_assets(folder);
CREATE INDEX IF NOT EXISTS idx_file_assets_deleted_at ON public.file_assets(deleted_at);

ALTER TABLE public.file_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read file assets" ON public.file_assets;
DROP POLICY IF EXISTS "Admins can insert file assets" ON public.file_assets;
DROP POLICY IF EXISTS "Admins can update file assets" ON public.file_assets;
DROP POLICY IF EXISTS "Admins can delete file assets" ON public.file_assets;

CREATE POLICY "Admins can read file assets"
ON public.file_assets FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'ADMIN'
  )
);

CREATE POLICY "Admins can insert file assets"
ON public.file_assets FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'ADMIN'
  )
);

CREATE POLICY "Admins can update file assets"
ON public.file_assets FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'ADMIN'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'ADMIN'
  )
);

CREATE POLICY "Admins can delete file assets"
ON public.file_assets FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'ADMIN'
  )
);