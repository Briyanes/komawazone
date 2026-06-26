import NextTopLoader from 'nextjs-toploader';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { Footer } from '@/components/layout/Footer';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { BackToTop } from '@/components/BackToTop';
import { VIPPromoModal } from '@/components/VIPPromoModal';
import { InAppBrowserBanner } from '@/components/InAppBrowserBanner';
import { ScrollToTop } from '@/components/ScrollToTop';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Route transition progress bar — Olluq orange */}
      <NextTopLoader
        color="#FF6B35"
        initialPosition={0.08}
        crawlSpeed={200}
        height={3}
        crawl={true}
        showSpinner={false}
        easing="ease"
        speed={200}
        shadow="0 0 10px #FF6B35,0 0 5px #FF6B35"
      />
      <ScrollToTop />
      <AnnouncementBanner />
      <Header />
      <main className="flex-1 pb-20 md:pb-0">
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
