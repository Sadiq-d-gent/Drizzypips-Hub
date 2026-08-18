/**
 * Supabase database types.
 *
 * GENERATED FILE — DO NOT HAND-EDIT.
 *
 * Produced by `supabase gen types` against the linked project. To change anything
 * here, change the SQL migration, apply it, then regenerate:
 *
 *   supabase gen types typescript --project-id <project-ref> > src/types/database.types.ts
 *
 * Covers migrations 001-010. Everything below this comment is generator output.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          created_at: string
          enrollment_enabled: boolean
          enrollment_paused_message: string | null
          id: boolean
          notification_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enrollment_enabled?: boolean
          enrollment_paused_message?: string | null
          id?: boolean
          notification_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enrollment_enabled?: boolean
          enrollment_paused_message?: string | null
          id?: boolean
          notification_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      admins: {
        Row: {
          auth_id: string
          created_at: string
          email: string
          id: string
          name: string
        }
        Insert: {
          auth_id: string
          created_at?: string
          email: string
          id?: string
          name: string
        }
        Update: {
          auth_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          created_at: string
          currency: string
          description: string
          duration: string
          id: string
          learnings: string[]
          price: number
          published: boolean
          requirements: string[]
          short_description: string
          slug: string
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description: string
          duration: string
          id?: string
          learnings?: string[]
          price: number
          published?: boolean
          requirements?: string[]
          short_description: string
          slug: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string
          duration?: string
          id?: string
          learnings?: string[]
          price?: number
          published?: boolean
          requirements?: string[]
          short_description?: string
          slug?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      enrollment_status_history: {
        Row: {
          changed_by: string | null
          changed_by_role: string | null
          created_at: string
          enrollment_id: string
          from_status: Database["public"]["Enums"]["enrollment_status"] | null
          id: string
          note: string | null
          to_status: Database["public"]["Enums"]["enrollment_status"]
        }
        Insert: {
          changed_by?: string | null
          changed_by_role?: string | null
          created_at?: string
          enrollment_id: string
          from_status?: Database["public"]["Enums"]["enrollment_status"] | null
          id?: string
          note?: string | null
          to_status: Database["public"]["Enums"]["enrollment_status"]
        }
        Update: {
          changed_by?: string | null
          changed_by_role?: string | null
          created_at?: string
          enrollment_id?: string
          from_status?: Database["public"]["Enums"]["enrollment_status"] | null
          id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["enrollment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_status_history_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          access_token_hash: string
          admin_note: string | null
          course_id: string
          course_slug_snapshot: string
          course_title_snapshot: string
          created_at: string
          id: string
          order_id: string
          price_amount: number
          price_currency: string
          receipt_filename: string | null
          receipt_mime_type: string | null
          receipt_path: string | null
          receipt_size_bytes: number | null
          receipt_uploaded_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["enrollment_status"]
          student_email: string
          student_name: string
          student_note: string | null
          student_phone: string
          updated_at: string
        }
        Insert: {
          access_token_hash: string
          admin_note?: string | null
          course_id: string
          course_slug_snapshot: string
          course_title_snapshot: string
          created_at?: string
          id?: string
          order_id: string
          price_amount: number
          price_currency: string
          receipt_filename?: string | null
          receipt_mime_type?: string | null
          receipt_path?: string | null
          receipt_size_bytes?: number | null
          receipt_uploaded_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_email: string
          student_name: string
          student_note?: string | null
          student_phone: string
          updated_at?: string
        }
        Update: {
          access_token_hash?: string
          admin_note?: string | null
          course_id?: string
          course_slug_snapshot?: string
          course_title_snapshot?: string
          created_at?: string
          id?: string
          order_id?: string
          price_amount?: number
          price_currency?: string
          receipt_filename?: string | null
          receipt_mime_type?: string | null
          receipt_path?: string | null
          receipt_size_bytes?: number | null
          receipt_uploaded_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_email?: string
          student_name?: string
          student_note?: string | null
          student_phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          account_name: string
          account_number: string
          additional_details: string | null
          bank_name: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          payment_instructions: string
          review_window_hours: number
          support_whatsapp_number: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          additional_details?: string | null
          bank_name: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          payment_instructions: string
          review_window_hours?: number
          support_whatsapp_number?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          additional_details?: string | null
          bank_name?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          payment_instructions?: string
          review_window_hours?: number
          support_whatsapp_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_course_stats: {
        Args: never
        Returns: {
          course_id: string
          pending: number
          total: number
        }[]
      }
      admin_enrollment_stats: {
        Args: never
        Returns: {
          approved: number
          cancelled: number
          pending_review: number
          rejected: number
          total: number
        }[]
      }
      create_enrollment: {
        Args: {
          p_course_slug: string
          p_receipt_filename?: string
          p_receipt_mime_type?: string
          p_receipt_path?: string
          p_receipt_size_bytes?: number
          p_student_email: string
          p_student_name: string
          p_student_note?: string
          p_student_phone: string
        }
        Returns: {
          access_token: string
          created_at: string
          order_id: string
          status: Database["public"]["Enums"]["enrollment_status"]
        }[]
      }
      get_enrollment_availability: {
        Args: never
        Returns: {
          enrollment_enabled: boolean
          paused_message: string
        }[]
      }
      get_enrollment_by_token: {
        Args: { p_access_token: string }
        Returns: {
          course_slug: string
          course_title: string
          created_at: string
          order_id: string
          price_amount: number
          price_currency: string
          receipt_filename: string
          receipt_mime_type: string
          receipt_size_bytes: number
          receipt_uploaded_at: string
          status: Database["public"]["Enums"]["enrollment_status"]
          student_email: string
          student_name: string
          student_note: string
          student_phone: string
          updated_at: string
        }[]
      }
      get_enrollment_history: {
        Args: { p_enrollment_id: string }
        Returns: {
          changed_by_name: string
          changed_by_role: string
          created_at: string
          from_status: Database["public"]["Enums"]["enrollment_status"]
          id: string
          note: string
          to_status: Database["public"]["Enums"]["enrollment_status"]
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_valid_receipt_path: { Args: { candidate: string }; Returns: boolean }
      next_enrollment_order_id: { Args: never; Returns: string }
      review_enrollment: {
        Args: {
          p_admin_note?: string
          p_enrollment_id: string
          p_status: string
        }
        Returns: {
          admin_note: string
          id: string
          order_id: string
          reviewed_at: string
          reviewed_by: string
          status: Database["public"]["Enums"]["enrollment_status"]
          updated_at: string
        }[]
      }
    }
    Enums: {
      enrollment_status:
        | "pending_review"
        | "approved"
        | "rejected"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      enrollment_status: [
        "pending_review",
        "approved",
        "rejected",
        "cancelled",
      ],
    },
  },
} as const
