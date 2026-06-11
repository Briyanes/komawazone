export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      import_jobs: {
        Row: {
          id: string
          job_type: string
          status: 'running' | 'completed' | 'failed' | 'cancelled'
          total_items: number
          processed_items: number
          new_manga: number
          updated_manga: number
          skipped_items: number
          errors: Json | null
          config: Json | null
          started_at: string
          completed_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          job_type: string
          status?: 'running' | 'completed' | 'failed' | 'cancelled'
          total_items: number
          processed_items?: number
          new_manga?: number
          updated_manga?: number
          skipped_items?: number
          errors?: Json | null
          config?: Json | null
          started_at?: string
          completed_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          job_type?: string
          status?: 'running' | 'completed' | 'failed' | 'cancelled'
          total_items?: number
          processed_items?: number
          new_manga?: number
          updated_manga?: number
          skipped_items?: number
          errors?: Json | null
          config?: Json | null
          started_at?: string
          completed_at?: string | null
          created_by?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          user_id: string
          subscription_id: string | null
          amount: number
          payment_method: string
          payment_channel: string | null
          payment_status: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded'
          tripay_transaction_id: string | null
          tripay_payment_url: string | null
          tripay_qr_string: string | null
          tripay_status: string | null
          fraud_status: string
          paid_at: string | null
          expired_at: string
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          subscription_id?: string | null
          amount: number
          payment_method?: string
          payment_channel?: string | null
          payment_status?: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded'
          tripay_transaction_id?: string | null
          tripay_payment_url?: string | null
          tripay_qr_string?: string | null
          tripay_status?: string | null
          fraud_status?: string
          paid_at?: string | null
          expired_at: string
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          subscription_id?: string | null
          amount?: number
          payment_method?: string
          payment_channel?: string | null
          payment_status?: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded'
          tripay_transaction_id?: string | null
          tripay_payment_url?: string | null
          tripay_qr_string?: string | null
          tripay_status?: string | null
          fraud_status?: string
          paid_at?: string | null
          expired_at?: string
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payments_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_subscription_id_fkey'
            columns: ['subscription_id']
            referencedRelation: 'subscriptions'
            referencedColumns: ['id']
          }
        ]
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          payment_id: string | null
          plan_duration: number
          auto_renew: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          payment_id?: string | null
          plan_duration: number
          auto_renew?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          payment_id?: string | null
          plan_duration?: number
          auto_renew?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'subscriptions_payment_id_fkey'
            columns: ['payment_id']
            referencedRelation: 'payments'
            referencedColumns: ['id']
          }
        ]
      }
      vip_codes: {
        Row: {
          id: string
          code: string
          plan: '1-month' | '3-month' | '6-month'
          created_by: string | null
          used_by: string | null
          used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          plan: '1-month' | '3-month' | '6-month'
          created_by?: string | null
          used_by?: string | null
          used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          plan?: '1-month' | '3-month' | '6-month'
          created_by?: string | null
          used_by?: string | null
          used_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'vip_codes_created_by_fkey'
            columns: ['created_by']
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'vip_codes_used_by_fkey'
            columns: ['used_by']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
