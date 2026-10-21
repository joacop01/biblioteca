-- Supabase's default privileges hand every new public table to anon and
-- authenticated. Keep only what the page needs: read and add.
REVOKE ALL ON public.recommendations FROM anon, authenticated;
GRANT SELECT, INSERT ON public.recommendations TO anon, authenticated;
