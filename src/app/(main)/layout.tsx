import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { BackToTop } from '@/components/BackToTop';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnnouncementBanner />
      <Header />
      <main className="flex-1 pb-16 md:pb-0">
        {children}
      </main>
      <BottomNav />
      <BackToTop />
    </>
  );
}
