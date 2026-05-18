-- Add uploaded_by to manga table
ALTER TABLE public.manga
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_manga_uploaded_by ON public.manga(uploaded_by);
