import { ChapterForm } from '@/components/admin/ChapterForm';

export default function NewChapterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          Add New Chapter
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Paste image URLs one per line in the bulk paste area, or add them individually.
        </p>
      </div>
      <ChapterForm />
    </div>
  );
}
