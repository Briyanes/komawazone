import OlluqLoader from '@/components/ui/OlluqLoader';

export default function Loading() {
  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <OlluqLoader size="xl" text="Memuat chapter..." />
    </div>
  );
}
