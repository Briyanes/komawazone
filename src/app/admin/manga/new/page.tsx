import { MangaForm } from '@/components/admin/MangaForm';

export default function NewMangaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Add New Manga</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Fill in the details below to add a new manga to the library.
        </p>
      </div>
      <MangaForm mode="create" />
    </div>
  );
}
