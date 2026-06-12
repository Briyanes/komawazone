import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { Footer } from '@/components/layout/Footer';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { BackToTop } from '@/components/BackToTop';
import { VIPPromoModal } from '@/components/VIPPromoModal';
import { InAppBrowserBanner } from '@/components/InAppBrowserBanner';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnnouncementBanner />
      <Header />
      <main className="flex-1 pb-24 md:pb-0">
        {children}
      </main>
      <Footer />
      <BottomNav />
      <BackToTop />
      <VIPPromoModal />
      <InAppBrowserBanner />
    </>
  );
}
