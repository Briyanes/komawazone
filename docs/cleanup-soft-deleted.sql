-- Hapus semua manga yang sudah soft-deleted (deleted_at IS NOT NULL)
DELETE FROM manga WHERE deleted_at IS NOT NULL;
