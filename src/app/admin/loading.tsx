import OlluqLoader from '@/components/ui/OlluqLoader';

export default function Loading() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <OlluqLoader size="md" text="Memuat admin..." />
    </div>
  );
}
