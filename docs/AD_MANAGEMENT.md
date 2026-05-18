# 📢 Ad Management System Guide

Complete guide for the no-code ad injection and management system.

## Quick Overview

Manga Zone's ad system allows admins to:
- ✅ Add multiple ad providers (Adstera, custom banners, pixel scripts, videos)
- ✅ Create ad campaigns without coding
- ✅ Target specific zones, devices, user types
- ✅ Schedule campaigns with dates
- ✅ View real-time analytics
- ✅ Live preview before publishing

---

## Architecture

### Components

```
Ad System Flow:
┌─────────────────────────────────────────────────┐
│ Admin Dashboard                                 │
│ ├─ Providers (add/edit/delete)                 │
│ ├─ Zones (configure zones)                     │
│ ├─ Campaigns (create/edit/schedule)            │
│ └─ Analytics (view performance)                │
└────────────┬────────────────────────────────────┘
             │
             ↓ Store in database
             │
    ┌────────────────────────────┐
    │ Supabase Database          │
    │ ├─ ad_providers            │
    │ ├─ ad_zones                │
    │ ├─ ad_campaigns            │
    │ ├─ ad_placements_config    │
    │ └─ ad_analytics            │
    └────────────┬───────────────┘
                 │
                 ↓ Fetch active campaigns
                 │
    ┌────────────────────────────┐
    │ Frontend: <AdZone />       │
    │ ├─ Filter by conditions    │
    │ ├─ Render provider type    │
    │ ├─ Track impressions       │
    │ └─ Track clicks            │
    └────────────┬───────────────┘
                 │
                 ↓ Display to user
                 │
            ┌─────────┐
            │ User    │
            └─────────┘
```

---

## Database Schema

### ad_providers Table

Stores information about ad providers/networks.

```sql
CREATE TABLE ad_providers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,                    -- "Adstera", "Custom Banner", etc.
  type TEXT NOT NULL,                    -- 'adstera' | 'banner' | 'pixel' | 'video'
  api_key TEXT,                          -- API key (encrypted)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

Example:
{
  id: "abc-123",
  name: "Adstera",
  type: "adstera",
  api_key: "[encrypted-key]",
  is_active: true,
  created_at: "2026-05-15"
}
```

### ad_zones Table

Defines all available ad zones across the platform.

```sql
CREATE TABLE ad_zones (
  id UUID PRIMARY KEY,
  zone_name TEXT NOT NULL,               -- "home_top", "reader_bottom", etc.
  description TEXT,                      -- "Homepage, above manga list"
  location TEXT NOT NULL,                -- Where on page
  page_type TEXT NOT NULL,               -- 'home' | 'reader' | 'profile' | etc
  size_constraint TEXT,                  -- "728x90" | "300x250" | "fluid"
  priority INTEGER DEFAULT 0,            -- Higher = render first
  created_at TIMESTAMP DEFAULT NOW()
);

Example zones:
{
  id: "zone-1",
  zone_name: "home_top",
  description: "Homepage, above manga list",
  location: "Top",
  page_type: "home",
  size_constraint: "728x90",
  priority: 100
}

{
  id: "zone-2",
  zone_name: "reader_bottom",
  description: "Below last chapter image",
  location: "Bottom",
  page_type: "chapter_reader",
  size_constraint: "300x250",
  priority: 50
}
```

### ad_campaigns Table

Actual ad campaigns created by admins.

```sql
CREATE TABLE ad_campaigns (
  id UUID PRIMARY KEY,
  provider_id UUID NOT NULL,             -- References ad_providers
  zone_id UUID NOT NULL,                 -- References ad_zones
  ad_code TEXT NOT NULL,                 -- HTML/script/image URL
  title TEXT NOT NULL,                   -- "Anime Ad Campaign #1"
  start_date TIMESTAMP,                  -- When campaign starts
  end_date TIMESTAMP,                    -- When campaign ends
  is_active BOOLEAN DEFAULT true,        -- Can be paused
  rotation_order INTEGER DEFAULT 0,      -- Higher = shown first (rotation)
  created_at TIMESTAMP DEFAULT NOW()
);

Example:
{
  id: "campaign-1",
  provider_id: "abc-123",
  zone_id: "zone-1",
  ad_code: "<img src='ad-image.jpg' />",
  title: "Summer Anime Promo",
  start_date: "2026-05-20",
  end_date: "2026-06-20",
  is_active: true,
  rotation_order: 100,
  created_at: "2026-05-15"
}
```

### ad_placements_config Table

Advanced configuration for ad display conditions.

```sql
CREATE TABLE ad_placements_config (
  id UUID PRIMARY KEY,
  zone_id UUID NOT NULL,
  campaign_id UUID NOT NULL,
  display_conditions TEXT,               -- JSON with conditions
  device_target TEXT,                    -- 'all' | 'mobile' | 'desktop' | 'tablet'
  created_at TIMESTAMP DEFAULT NOW()
);

Display conditions JSON:
{
  type: "always" | "logged_in_only" | "guest_only" | "after_scrolls" | "time_based",
  
  // For after_scrolls
  scroll_offset: 3,                      // Show after 3 scrolls
  
  // For time_based
  start_time: "09:00",
  end_time: "17:00",
  timezone: "UTC"
}
```

### ad_analytics Table

Tracks impressions and clicks.

```sql
CREATE TABLE ad_analytics (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL,
  impressions INTEGER DEFAULT 0,         -- Times shown to user
  clicks INTEGER DEFAULT 0,              -- Times clicked
  ctr DECIMAL(5, 4),                    -- Click-through rate (0.00-1.00)
  updated_at TIMESTAMP DEFAULT NOW()
);

Example:
{
  id: "analytics-1",
  campaign_id: "campaign-1",
  impressions: 1500,
  clicks: 45,
  ctr: 0.03,                            -- 3% CTR
  updated_at: "2026-05-15T18:30:00Z"
}
```

---

## Frontend: AdZone Component

### Basic Usage

```tsx
// Import
import { AdZone } from '@/components/ads/AdZone'

// Use in any page
export function HomePage() {
  return (
    <>
      <header>Manga Zone</header>
      
      {/* Ad zone above manga list */}
      <AdZone zoneId="home_top" />
      
      <div className="manga-grid">
        {/* Manga cards */}
      </div>
      
      {/* Ad zone in sidebar */}
      <AdZone zoneId="home_sidebar" className="sidebar" />
    </>
  )
}
```

### Component Implementation

```tsx
// components/ads/AdZone.tsx
'use client'

import { useAdZone } from '@/hooks/useAds'
import { AdRenderer } from './AdRenderer'
import { SkeletonAd } from './SkeletonAd'

interface AdZoneProps {
  zoneId: string
  className?: string
  fallback?: React.ReactNode
}

export function AdZone({ zoneId, className, fallback }: AdZoneProps) {
  const { data: campaigns, isLoading } = useAdZone(zoneId)
  
  if (isLoading) {
    return <SkeletonAd className={className} />
  }
  
  // Filter active campaigns
  const activeCampaigns = campaigns?.filter(campaign => {
    const now = new Date()
    
    // Check date range
    if (campaign.start_date && new Date(campaign.start_date) > now) {
      return false
    }
    if (campaign.end_date && new Date(campaign.end_date) < now) {
      return false
    }
    
    // Check if active
    if (!campaign.is_active) return false
    
    // Check display conditions
    if (!checkDisplayConditions(campaign)) return false
    
    return true
  })
  
  if (!activeCampaigns || activeCampaigns.length === 0) {
    return fallback || null
  }
  
  // Get first campaign (rotation by priority)
  const campaign = activeCampaigns[0]
  
  return (
    <div className={`ad-zone ${className}`}>
      <AdRenderer 
        campaign={campaign}
        onImpression={() => trackImpression(campaign.id)}
        onClose={() => handleAdClose(campaign.id)}
      />
    </div>
  )
}

function checkDisplayConditions(campaign: any): boolean {
  const user = getCurrentUser()
  const device = getDeviceType()
  
  const config = campaign.placement_config
  
  switch (config?.display_conditions?.type) {
    case 'always':
      return true
    
    case 'logged_in_only':
      return !!user
    
    case 'guest_only':
      return !user
    
    case 'device_target':
      return config.device_target === 'all' || 
             config.device_target === device
    
    case 'after_scrolls':
      return getScrollCount() >= (config.scroll_offset || 0)
    
    case 'time_based':
      const now = new Date()
      const hours = now.getHours()
      const [startStr, endStr] = [config.start_time, config.end_time]
      const start = parseInt(startStr.split(':')[0])
      const end = parseInt(endStr.split(':')[0])
      return hours >= start && hours < end
    
    default:
      return true
  }
}
```

### AdRenderer Component

```tsx
// components/ads/AdRenderer.tsx
'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import DOMPurify from 'isomorphic-dompurify'

interface AdRendererProps {
  campaign: AdCampaign
  onImpression: () => void
  onClose: () => void
}

export function AdRenderer({ campaign, onImpression, onClose }: AdRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Track impression after 1 second in viewport
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        const timeout = setTimeout(() => {
          onImpression()
        }, 1000)
        
        return () => clearTimeout(timeout)
      }
    }, { threshold: 0.5 })
    
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }
    
    return () => observer.disconnect()
  }, [onImpression])
  
  // Render based on provider type
  switch (campaign.provider.type) {
    case 'adstera':
      return (
        <div ref={containerRef} className="ad-container ad-adstera">
          <button onClick={onClose} className="ad-close">
            <X size={16} />
          </button>
          {/* Adstera script injection */}
          <div 
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(campaign.ad_code)
            }}
          />
        </div>
      )
    
    case 'banner':
      return (
        <div ref={containerRef} className="ad-container ad-banner">
          <button onClick={onClose} className="ad-close">
            <X size={16} />
          </button>
          <a 
            href={campaign.link} 
            target="_blank" 
            rel="noopener noreferrer"
            onClick={() => trackClick(campaign.id)}
          >
            <img 
              src={campaign.image_url} 
              alt={campaign.title}
              className="ad-image"
            />
          </a>
        </div>
      )
    
    case 'video':
      return (
        <div ref={containerRef} className="ad-container ad-video">
          <button onClick={onClose} className="ad-close">
            <X size={16} />
          </button>
          <video controls width="100%" height="auto">
            <source src={campaign.video_url} type="video/mp4" />
          </video>
        </div>
      )
    
    case 'pixel_script':
      return (
        <div ref={containerRef}>
          <script 
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(campaign.ad_code)
            }}
          />
        </div>
      )
    
    default:
      return null
  }
}

function trackClick(campaignId: string) {
  fetch('/api/ads/tracking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaign_id: campaignId,
      event: 'click'
    })
  })
}
```

---

## Admin Dashboard

### Adding a Provider

Steps:
1. Go to `/admin/ads/providers`
2. Click "+ Add Provider"
3. Fill form:
   - **Name:** "Adstera" (your label)
   - **Type:** Select from dropdown
   - **API Key:** Paste credentials (if needed)
   - **Status:** Active/Inactive toggle
4. Click "Save"

### Creating a Campaign

Steps:
1. Go to `/admin/ads/campaigns`
2. Click "+ Create Campaign"
3. Fill form:
   - **Title:** "Summer Promo Ad"
   - **Provider:** Select from dropdown
   - **Zone:** Select where to show
   - **Ad Code/Image:** Paste HTML or upload image
   - **Start Date:** When campaign begins
   - **End Date:** When campaign ends
   - **Display Condition:** Choose from options
   - **Device Target:** All/Mobile/Desktop/Tablet
4. **PREVIEW** in Light & Dark modes
5. Click "Publish" → Live immediately

### Viewing Analytics

1. Go to `/admin/ads/analytics`
2. Select date range (7 days, 30 days, 90 days)
3. See KPIs:
   - Total Impressions
   - Total Clicks
   - CTR (Click-Through Rate)
   - Revenue (if applicable)
4. See charts:
   - Impressions over time
   - Top performing zones
   - Top performing campaigns

---

## API Endpoints

### POST `/api/ads/campaigns`

Create new campaign.

```
Request:
{
  "provider_id": "abc-123",
  "zone_id": "zone-1",
  "ad_code": "<img src='...' />",
  "title": "Campaign title",
  "start_date": "2026-05-20",
  "end_date": "2026-06-20",
  "is_active": true,
  "rotation_order": 100
}

Response:
{
  "id": "campaign-123",
  "status": "created"
}
```

### GET `/api/ads/campaigns/:zone_id`

Get active campaigns for zone.

```
Response:
[
  {
    "id": "campaign-1",
    "provider": { "type": "adstera" },
    "ad_code": "...",
    "title": "Campaign 1",
    "is_active": true
  }
]
```

### POST `/api/ads/tracking`

Track impressions & clicks.

```
Request:
{
  "campaign_id": "campaign-123",
  "event": "impression" | "click"
}

Response:
{ "status": "recorded" }
```

### GET `/api/ads/analytics`

Get analytics for date range.

```
Query params:
  ?timeRange=7d|30d|90d

Response:
{
  "total_impressions": 15000,
  "total_clicks": 450,
  "ctr": 0.03,
  "impressions_chart": [...],
  "zones_chart": [...],
  "campaigns": [...]
}
```

---

## Best Practices

### For Admins

1. **Test First:** Always preview in both light/dark modes
2. **Schedule Wisely:** Set realistic date ranges
3. **Rotate Campaigns:** Use rotation_order to manage multiple ads in zone
4. **Monitor Performance:** Check analytics weekly
5. **Clean Up:** Archive ended campaigns
6. **No Intrusive Ads:** Avoid "between chapters" placement

### For Developers

1. **Always Sanitize:** Use DOMPurify for user-generated HTML
2. **Track Events:** Log impressions & clicks
3. **Handle Errors:** Gracefully handle failed ad loads
4. **Optimize:** Cache campaigns, revalidate hourly
5. **Responsive:** Ads should work on all breakpoints

---

## Troubleshooting

### Ads Not Showing

✅ Check:
- Campaign is_active = true
- Today is within start_date and end_date
- Display conditions met (if user is logged in, if device matches)
- Zone exists and is configured

### Ad Looks Wrong

✅ Check:
- HTML is valid (validate with W3C validator)
- Images load correctly (check URL)
- JavaScript doesn't conflict with page
- Mobile/desktop responsiveness

### Analytics Not Updating

✅ Check:
- Tracking endpoint is being called
- Database permissions (RLS policies)
- No console errors
- Try hard-refresh browser cache

---

## FAQ

**Q: Can I have multiple ads in one zone?**  
A: Yes! Use rotation_order. Higher number = shown first when multiple are active.

**Q: Can I pause an ad without deleting it?**  
A: Yes! Toggle is_active to false. It saves but doesn't display.

**Q: How do I track ad revenue?**  
A: Add revenue field to ad_analytics table. Track in click/impression callback.

**Q: Can users block ads?**  
A: Not built-in. Implement user preference in settings if needed.

**Q: What happens if an ad script errors?**  
A: Error boundary catches it. Ad won't display but page continues working.

---

**Happy ad managing! 📢**
