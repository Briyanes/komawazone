'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { createClient } from '@/lib/supabase/client';

interface SaveProgressOptions {
  mangaId: string;
  chapterId: string;
  pageNumber: number;
  readPercentage: number;
}

export function useReadingProgress() {
  const { user, isAuthenticated } = useAuth();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const saveProgress = useCallback(async (opts: SaveProgressOptions) => {
    if (!isAuthenticated || !user) return;

    const supabase = createClient();
    await supabase
      .from('reading_progress')
      .upsert(
        {
          user_id: user.id,
          manga_id: opts.mangaId,
          chapter_id: opts.chapterId,
          page_number: opts.pageNumber,
          read_percentage: opts.readPercentage,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,manga_id' }
      );
  }, [isAuthenticated, user]);

  // Debounced save — 2s after last update
  const debouncedSave = useCallback((opts: SaveProgressOptions) => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveProgress(opts), 2000);
  }, [saveProgress]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeout(saveTimerRef.current);
  }, []);

  return { debouncedSave, saveProgress };
}

export async function getReadingProgress(mangaId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('reading_progress')
    .select('chapter_id, page_number, read_percentage, last_read_at')
    .eq('user_id', user.id)
    .eq('manga_id', mangaId)
    .single();

  return data;
}
