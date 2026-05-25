import { SourcesManager } from '@/components/admin/SourcesManager';

export const metadata = { title: 'Sumber Manga — Admin' };

export default function SourcesPage() {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
      <SourcesManager />
    </div>
  );
}
