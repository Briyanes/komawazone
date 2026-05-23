// Supabase Database types — auto-generated shape
// Run: npx supabase gen types typescript --project-id <id> > src/types/database.ts
// For now this is a manual stub that matches our schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          username: string | null;
          avatar_url: string | null;
          role: 'USER' | 'ADMIN';
          bio: string | null;
          theme_preference: 'light' | 'dark';
          vip_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          username?: string | null;
          avatar_url?: string | null;
          role?: 'USER' | 'ADMIN';
          bio?: string | null;
          theme_preference?: 'light' | 'dark';
          vip_expires_at?: string | null;
        };
        Update: {
          username?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          theme_preference?: 'light' | 'dark';
          vip_expires_at?: string | null;
        };
        Relationships: [];
      };
      manga: {
        Row: {
          id: string;
          slug: string;
          title: string;
          alt_title: string | null;
          description: string | null;
          cover_url: string | null;
          banner_url: string | null;
          status: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';
          type: 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON';
          author: string | null;
          artist: string | null;
          genres: string[];
          release_year: number | null;
          rating: number;
          rating_count: number;
          views: number;
          is_featured: boolean;
          content_rating: 'general' | 'mature';
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          slug: string;
          title: string;
          alt_title?: string | null;
          description?: string | null;
          cover_url?: string | null;
          banner_url?: string | null;
          status?: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';
          type?: 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON';
          author?: string | null;
          artist?: string | null;
          genres?: string[];
          release_year?: number | null;
          rating?: number;
          is_featured?: boolean;
          content_rating?: 'general' | 'mature';
        };
        Update: {
          title?: string;
          alt_title?: string | null;
          description?: string | null;
          cover_url?: string | null;
          banner_url?: string | null;
          status?: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';
          type?: 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON';
          author?: string | null;
          artist?: string | null;
          genres?: string[];
          release_year?: number | null;
          rating?: number;
          is_featured?: boolean;
          content_rating?: 'general' | 'mature';
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      chapters: {
        Row: {
          id: string;
          manga_id: string;
          number: number;
          title: string | null;
          release_date: string;
          views: number;
          thumbnail_url: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          manga_id: string;
          number: number;
          title?: string | null;
          release_date?: string;
          thumbnail_url?: string | null;
        };
        Update: {
          title?: string | null;
          thumbnail_url?: string | null;
        };
        Relationships: [];
      };
      chapter_images: {
        Row: {
          id: string;
          chapter_id: string;
          number: number;
          image_url: string;
          width: number;
          height: number;
          created_at: string;
        };
        Insert: {
          chapter_id: string;
          number: number;
          image_url: string;
          width?: number;
          height?: number;
        };
        Update: {
          image_url?: string;
        };
        Relationships: [];
      };
      reading_progress: {
        Row: {
          id: string;
          user_id: string;
          manga_id: string;
          chapter_id: string;
          page_number: number;
          read_percentage: number;
          last_read_at: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          manga_id: string;
          chapter_id: string;
          page_number?: number;
          read_percentage?: number;
          last_read_at?: string;
        };
        Update: {
          chapter_id?: string;
          page_number?: number;
          read_percentage?: number;
          last_read_at?: string;
        };
        Relationships: [];
      };
      bookmarks: {
        Row: {
          id: string;
          user_id: string;
          manga_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          manga_id: string;
        };
        Update: {
          user_id?: string;
          manga_id?: string;
        };
        Relationships: [];
      };
      likes: {
        Row: {
          id: string;
          user_id: string;
          manga_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          manga_id: string;
        };
        Update: {
          user_id?: string;
          manga_id?: string;
        };
        Relationships: [];
      };
      chapter_likes: {
        Row: {
          id: string;
          user_id: string;
          chapter_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          chapter_id: string;
        };
        Update: { user_id?: string; chapter_id?: string };
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          user_id: string;
          chapter_id: string | null;
          manga_id: string | null;
          content: string;
          parent_id: string | null;
          likes_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          chapter_id?: string | null;
          manga_id?: string | null;
          content: string;
          parent_id?: string | null;
        };
        Update: { content?: string; likes_count?: number };
        Relationships: [];
      };
      comment_likes: {
        Row: {
          id: string;
          user_id: string;
          comment_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          comment_id: string;
        };
        Update: { user_id?: string; comment_id?: string };
        Relationships: [];
      };
      manga_reports: {
        Row: {
          id: string;
          user_id: string | null;
          manga_id: string;
          reason: string;
          notes: string | null;
          status: 'pending' | 'reviewed' | 'resolved';
          created_at: string;
        };
        Insert: {
          user_id?: string | null;
          manga_id: string;
          reason: string;
          notes?: string | null;
          status?: string;
        };
        Update: { reason?: string; notes?: string | null; status?: string };
        Relationships: [];
      };
      chapter_reports: {
        Row: {
          id: string;
          user_id: string | null;
          chapter_id: string;
          reason: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          user_id?: string | null;
          chapter_id: string;
          reason: string;
          notes?: string | null;
        };
        Update: { reason?: string; notes?: string | null };
        Relationships: [];
      };
      genres: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          is_mature: boolean;
        };
        Insert: {
          name: string;
          slug: string;
          description?: string | null;
          is_mature?: boolean;
        };
        Update: {
          name?: string;
          slug?: string;
          description?: string | null;
          is_mature?: boolean;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan: string;
          amount: number;
          started_at: string;
          expires_at: string;
          status: 'active' | 'expired' | 'cancelled';
          payment_method: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          plan?: string;
          amount?: number;
          started_at?: string;
          expires_at: string;
          status?: 'active' | 'expired' | 'cancelled';
          payment_method?: string | null;
          notes?: string | null;
        };
        Update: {
          status?: 'active' | 'expired' | 'cancelled';
          notes?: string | null;
        };
        Relationships: [];
      };
      ad_providers: {
        Row: {
          id: string;
          name: string;
          type: string;
          pixel_code: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          type: string;
          pixel_code?: string | null;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          pixel_code?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      ad_zones: {
        Row: {
          id: string;
          name: string;
          placement: string;
          description: string | null;
          provider_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          placement: string;
          provider_id: string;
          description?: string | null;
          is_active?: boolean;
        };
        Update: {
          is_active?: boolean;
          description?: string | null;
        };
        Relationships: [];
      };
      ad_campaigns: {
        Row: {
          id: string;
          name: string;
          zone_id: string;
          type: string;
          html_content: string | null;
          image_url: string | null;
          link_url: string | null;
          is_active: boolean;
          priority: number;
          start_date: string | null;
          end_date: string | null;
          target_mobile: boolean;
          target_desktop: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          zone_id: string;
          type: string;
          html_content?: string | null;
          image_url?: string | null;
          link_url?: string | null;
          is_active?: boolean;
          priority?: number;
          start_date?: string | null;
          end_date?: string | null;
          target_mobile?: boolean;
          target_desktop?: boolean;
        };
        Update: {
          is_active?: boolean;
          html_content?: string | null;
          priority?: number;
        };
        Relationships: [];
      };
      ad_analytics: {
        Row: {
          id: string;
          campaign_id: string;
          event: 'impression' | 'click';
          user_id: string | null;
          ip_hash: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          campaign_id: string;
          event: 'impression' | 'click';
          user_id?: string | null;
          ip_hash?: string | null;
          user_agent?: string | null;
        };
        Update: {
          event?: 'impression' | 'click';
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          updated_at?: string;
        };
        Update: {
          value?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_ratings: {
        Row: {
          id: string;
          user_id: string;
          manga_id: string;
          rating: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          manga_id: string;
          rating: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          rating?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string | null;
          manga_id: string | null;
          chapter_id: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type?: string;
          title: string;
          body?: string | null;
          manga_id?: string | null;
          chapter_id?: string | null;
          read?: boolean;
          created_at?: string;
        };
        Update: {
          read?: boolean;
        };
        Relationships: [];
      };
      reading_list: {
        Row: {
          id: string;
          user_id: string;
          manga_id: string;
          status: 'reading' | 'plan_to_read' | 'completed' | 'on_hold' | 'dropped';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          manga_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      increment_manga_views: {
        Args: { manga_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      manga_status: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';
      user_role: 'USER' | 'ADMIN';
      ad_type: 'BANNER' | 'PIXEL' | 'CUSTOM_HTML' | 'NATIVE';
    };
    CompositeTypes: { [_ in never]: never };
  };
}

// Convenience type helpers
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
