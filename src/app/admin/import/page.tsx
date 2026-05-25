import { ImportTool } from '@/components/admin/ImportTool';
import { ImportDashboard } from '@/components/admin/ImportDashboard';
import { SourcesManager } from '@/components/admin/SourcesManager';

export const metadata = { title: 'Import — Admin' };

export default function ImportPage() {
  return (
    <div className="space-y-8">
      <ImportDashboard />
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
        <SourcesManager />
      </div>
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
        <h2 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Import Manual dari Sitemap URL</h2>
        <ImportTool />
      </div>
    </div>
  );
}
