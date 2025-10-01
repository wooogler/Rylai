import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          username: string;
          common_system_prompt: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          username: string;
          common_system_prompt?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          common_system_prompt?: string;
          created_at?: string;
        };
      };
      scenarios: {
        Row: {
          id: number;
          user_id: string;
          slug: string;
          name: string;
          predator_name: string;
          handle: string;
          system_prompt: string;
          preset_messages: Array<{
            id: string;
            text: string;
            sender: 'user' | 'other';
            timestamp: string;
          }>;
          description: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          slug: string;
          name: string;
          predator_name: string;
          handle: string;
          system_prompt: string;
          preset_messages: Array<{
            id: string;
            text: string;
            sender: 'user' | 'other';
            timestamp: string;
          }>;
          description: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          slug?: string;
          name?: string;
          predator_name?: string;
          handle?: string;
          system_prompt?: string;
          preset_messages?: Array<{
            id: string;
            text: string;
            sender: 'user' | 'other';
            timestamp: string;
          }>;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}
