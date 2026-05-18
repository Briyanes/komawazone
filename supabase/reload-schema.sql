-- Refresh PostgREST schema cache agar kolom baru terdeteksi
NOTIFY pgrst, 'reload schema';
