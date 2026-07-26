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
          trial_claimed_at: string | null;
          trial_source: string | null;
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
          trial_claimed_at?: string | null;
          trial_source?: string | null;
        };
        Update: {
          username?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          theme_preference?: 'light' | 'dark';
          vip_expires_at?: string | null;
          trial_claimed_at?: string | null;
          trial_source?: string | null;
          role?: 'USER' | 'ADMIN';
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
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          source_url: string | null;
        };
        Insert: {
          slug: string;
          title: string;
          alt_title?: string | null;
          description?: string | null;
          cover_url?: string | null;
          banner_url?: string | null;
          status?: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';
          type?: 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON' | null;
          author?: string | null;
          artist?: string | null;
          genres?: string[];
          release_year?: number | null;
          rating?: number;
          is_featured?: boolean;
          content_rating?: 'general' | 'mature';
          uploaded_by?: string | null;
          source_url?: string | null;
        };
        Update: {
          slug?: string;
          title?: string;
          alt_title?: string | null;
          description?: string | null;
          cover_url?: string | null;
          banner_url?: string | null;
          status?: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';
          type?: 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON' | null;
          author?: string | null;
          artist?: string | null;
          genres?: string[];
          release_year?: number | null;
          rating?: number;
          is_featured?: boolean;
          content_rating?: 'general' | 'mature';
          deleted_at?: string | null;
          source_url?: string | null;
          views?: number;
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
          number?: number;
          title?: string | null;
          release_date?: string | null;
          thumbnail_url?: string | null;
          views?: number;
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
          number?: number;
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
          payment_id: string | null;
          auto_renew: boolean;
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
          payment_id?: string | null;
          auto_renew?: boolean;
          notes?: string | null;
        };
        Update: {
          status?: 'active' | 'expired' | 'cancelled';
          notes?: string | null;
          auto_renew?: boolean;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          user_id: string;
          subscription_id: string | null;
          amount: number;
          payment_method: string;
          payment_channel: string | null;
          payment_status: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded';
          tripay_transaction_id: string | null;
          tripay_payment_url: string | null;
          tripay_qr_string: string | null;
          tripay_status: string | null;
          fraud_status: string;
          paid_at: string | null;
          expired_at: string;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          subscription_id?: string | null;
          amount: number;
          payment_method?: string;
          payment_channel?: string | null;
          payment_status?: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded';
          tripay_transaction_id?: string | null;
          tripay_payment_url?: string | null;
          tripay_qr_string?: string | null;
          tripay_status?: string | null;
          fraud_status?: string;
          paid_at?: string | null;
          expired_at: string;
          metadata?: Json | null;
        };
        Update: {
          payment_channel?: string | null;
          payment_status?: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded';
          tripay_transaction_id?: string | null;
          tripay_payment_url?: string | null;
          tripay_qr_string?: string | null;
          tripay_status?: string | null;
          fraud_status?: string;
          paid_at?: string | null;
          metadata?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_subscription_id_fkey';
            columns: ['subscription_id'];
            referencedRelation: 'subscriptions';
            referencedColumns: ['id'];
          }
        ];
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
      manga_sources: {
        Row: {
          id: string;
          name: string;
          base_url: string;
          sitemap_urls: string[];
          /** Per-sitemap rating override: { [sitemapUrl]: 'general' | 'mature' } */
          sitemap_content_ratings: Record<string, 'general' | 'mature'>;
          is_active: boolean;
          type: 'MANHWA' | 'MANGA' | 'MANHUA' | 'MIXED';
          content_rating: 'general' | 'mature';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          base_url: string;
          sitemap_urls?: string[];
          sitemap_content_ratings?: Record<string, 'general' | 'mature'>;
          is_active?: boolean;
          type?: 'MANHWA' | 'MANGA' | 'MANHUA' | 'MIXED';
          content_rating?: 'general' | 'mature';
          notes?: string | null;
        };
        Update: {
          name?: string;
          sitemap_urls?: string[];
          sitemap_content_ratings?: Record<string, 'general' | 'mature'>;
          is_active?: boolean;
          type?: 'MANHWA' | 'MANGA' | 'MANHUA' | 'MIXED';
          content_rating?: 'general' | 'mature';
          notes?: string | null;
        };
        Relationships: [];
      };
      manga_reviews: {
        Row: {
          id: string;
          manga_id: string;
          user_id: string;
          rating: number;
          text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          manga_id: string;
          user_id: string;
          rating: number;
          text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          rating?: number;
          text?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      file_assets: {
        Row: {
          id: string;
          provider: string;
          bucket: string;
          object_key: string;
          public_url: string;
          folder: string;
          file_name: string;
          content_type: string;
          size_bytes: number;
          metadata: Json | null;
          uploaded_by: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          provider?: string;
          bucket: string;
          object_key: string;
          public_url: string;
          folder: string;
          file_name: string;
          content_type: string;
          size_bytes: number;
          metadata?: Json | null;
          uploaded_by?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          provider?: string;
          bucket?: string;
          object_key?: string;
          public_url?: string;
          folder?: string;
          file_name?: string;
          content_type?: string;
          size_bytes?: number;
          metadata?: Json | null;
          uploaded_by?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      import_jobs: {
        Row: {
          id: string;
          job_type: string;
          status: 'running' | 'completed' | 'failed' | 'cancelled';
          total_items: number;
          processed_items: number;
          new_manga: number;
          updated_manga: number;
          skipped_items: number;
          errors: Json | null;
          config: Json | null;
          started_at: string;
          completed_at: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          job_type: string;
          status?: 'running' | 'completed' | 'failed' | 'cancelled';
          total_items: number;
          processed_items?: number;
          new_manga?: number;
          updated_manga?: number;
          skipped_items?: number;
          errors?: Json | null;
          config?: Json | null;
          started_at?: string;
          completed_at?: string | null;
          created_by?: string | null;
        };
        Update: {
          status?: 'running' | 'completed' | 'failed' | 'cancelled';
          total_items?: number;
          processed_items?: number;
          new_manga?: number;
          updated_manga?: number;
          skipped_items?: number;
          errors?: Json | null;
          config?: Json | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      vip_codes: {
        Row: {
          id: string;
          code: string;
          plan: '1-month' | '3-month' | '6-month';
          created_by: string | null;
          used_by: string | null;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          plan: '1-month' | '3-month' | '6-month';
          created_by?: string | null;
          used_by?: string | null;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          code?: string;
          plan?: '1-month' | '3-month' | '6-month';
          created_by?: string | null;
          used_by?: string | null;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vip_codes_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vip_codes_used_by_fkey';
            columns: ['used_by'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      vip_trial_log: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          ip_address: string | null;
          user_agent: string | null;
          claimed_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          claimed_at?: string;
          expires_at: string;
        };
        Update: {
          source?: string;
          ip_address?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'vip_trial_log_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
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
