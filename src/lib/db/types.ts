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
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          is_admin: boolean;
          library_role: string;
          disabled_at: string | null;
          disabled_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          display_name?: string | null;
          is_admin?: boolean;
          library_role?: string;
          disabled_at?: string | null;
          disabled_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          is_admin?: boolean;
          library_role?: string;
          disabled_at?: string | null;
          disabled_reason?: string | null;
          created_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: 'user' | 'assistant';
          content: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: 'user' | 'assistant';
          content: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: 'user' | 'assistant';
          content?: string;
          metadata?: Json;
          created_at?: string;
        };
      };
      library_documents: {
        Row: {
          id: string;
          user_id: string;
          filename: string;
          mime_type: string | null;
          byte_size: number | null;
          text_content: string | null;
          source: 'upload' | 'sharepoint' | 'local';
          external_ref: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          filename: string;
          mime_type?: string | null;
          byte_size?: number | null;
          text_content?: string | null;
          source?: 'upload' | 'sharepoint' | 'local';
          external_ref?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          filename?: string;
          mime_type?: string | null;
          byte_size?: number | null;
          text_content?: string | null;
          source?: 'upload' | 'sharepoint' | 'local';
          external_ref?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      directory_contacts: {
        Row: DirectoryContactRow;
        Insert: DirectoryContactRow;
        Update: Partial<DirectoryContactRow>;
      };
      events: {
        Row: EventRow;
        Insert: EventRow;
        Update: Partial<EventRow>;
      };
      publications: {
        Row: PublicationRow;
        Insert: PublicationRow;
        Update: Partial<PublicationRow>;
      };
    };
  };
}

export interface DirectoryContactRow {
  id: string;
  category: string;
  name: string;
  role: string | null;
  team: string | null;
  organization: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  location: string | null;
  expertise: string[];
  tags: string[];
  notes: string | null;
  avatar_initials: string | null;
  avatar_color: string | null;
  updated_at?: string;
}

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  date_note: string | null;
  type: string;
  strategic_purpose: string | null;
  work_package: string | null;
  owner: string | null;
  partners: string | null;
  funder: string | null;
  programme: string | null;
  location: string | null;
  modality: string;
  level: string;
  total_participants: number | null;
  countries_represented: string | null;
  global_south_participants: number | null;
  global_south_pct: number | null;
  female_participants: number | null;
  female_pct: number | null;
  youth_participants: number | null;
  south_south_exchange: boolean | null;
  key_outputs: string | null;
  internal_file_link: string | null;
  cross_wp_collaboration: string | null;
  website_article: string | null;
  media_coverage: string | null;
  social_media: string | null;
  high_level_participants: string | null;
  status: string | null;
  staff_count: number | null;
  updated_at?: string;
}

export interface PublicationRow {
  id: string;
  title: string;
  date: string | null;
  first_author: string | null;
  other_authors: string | null;
  type: string | null;
  outlet: string | null;
  link: string | null;
  doi: string | null;
  collections_link: string | null;
  external_link: string | null;
  url: string | null;
  full_citation: string | null;
  pelikan_project_id: string | null;
  in_collections: boolean | null;
  isbn: string | null;
  files: string | null;
  work_package: string | null;
  target_audience: string | null;
  global_south: boolean | null;
  purpose: string | null;
  updated_at?: string;
}
