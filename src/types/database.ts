export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      concerns: {
        Row: {
          assigned_to: string | null;
          category: string;
          created_at: string;
          details: string;
          email: string | null;
          feeling: string;
          id: string;
          is_anonymous: boolean;
          name: string | null;
          resolved_at: string | null;
          reviewed_at: string | null;
          status: string;
          submitted_by: string | null;
          updated_at: string;
          year_group: string;
        };
        Insert: {
          assigned_to?: string | null;
          category: string;
          created_at?: string;
          details: string;
          email?: string | null;
          feeling: string;
          id?: string;
          is_anonymous?: boolean;
          name?: string | null;
          resolved_at?: string | null;
          reviewed_at?: string | null;
          status?: string;
          submitted_by?: string | null;
          updated_at?: string;
          year_group: string;
        };
        Update: {
          assigned_to?: string | null;
          category?: string;
          created_at?: string;
          details?: string;
          email?: string | null;
          feeling?: string;
          id?: string;
          is_anonymous?: boolean;
          name?: string | null;
          resolved_at?: string | null;
          reviewed_at?: string | null;
          status?: string;
          submitted_by?: string | null;
          updated_at?: string;
          year_group?: string;
        };
        Relationships: [
          {
            foreignKeyName: "concerns_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      peer_confirmation_email_outbox: {
        Row: {
          attempt_count: number;
          available_at: string;
          confirmation_event_id: string;
          created_at: string;
          delivered_at: string | null;
          failed_at: string | null;
          id: string;
          idempotency_key: string;
          last_attempt_started_at: string | null;
          last_error_code: string | null;
          lease_expires_at: string | null;
          lease_owner: string | null;
          notification_kind: string;
          provider_event_at: string | null;
          provider_message_id: string | null;
          recipient_address: string;
          recipient_kind: string;
          recipient_profile_id: string | null;
          request_id: string;
          session_id: string;
          status: string;
          submitted_at: string | null;
          suppressed_at: string | null;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          available_at?: string;
          confirmation_event_id: string;
          created_at?: string;
          delivered_at?: string | null;
          failed_at?: string | null;
          id?: string;
          idempotency_key: string;
          last_attempt_started_at?: string | null;
          last_error_code?: string | null;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          notification_kind?: string;
          provider_event_at?: string | null;
          provider_message_id?: string | null;
          recipient_address: string;
          recipient_kind: string;
          recipient_profile_id?: string | null;
          request_id: string;
          session_id: string;
          status?: string;
          submitted_at?: string | null;
          suppressed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          available_at?: string;
          confirmation_event_id?: string;
          created_at?: string;
          delivered_at?: string | null;
          failed_at?: string | null;
          id?: string;
          idempotency_key?: string;
          last_attempt_started_at?: string | null;
          last_error_code?: string | null;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          notification_kind?: string;
          provider_event_at?: string | null;
          provider_message_id?: string | null;
          recipient_address?: string;
          recipient_kind?: string;
          recipient_profile_id?: string | null;
          request_id?: string;
          session_id?: string;
          status?: string;
          submitted_at?: string | null;
          suppressed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "peer_confirmation_email_outbox_confirmation_event_id_fkey";
            columns: ["confirmation_event_id"];
            isOneToOne: false;
            referencedRelation: "peer_confirmation_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_confirmation_email_outbox_recipient_profile_id_fkey";
            columns: ["recipient_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_confirmation_email_outbox_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "peer_support_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_confirmation_email_outbox_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "peer_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      peer_confirmation_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          mentor_id: string;
          request_id: string;
          schedule_version: string;
          session_id: string;
          supervisor_teacher_id: string;
        };
        Insert: {
          created_at?: string;
          event_type?: string;
          id?: string;
          mentor_id: string;
          request_id: string;
          schedule_version: string;
          session_id: string;
          supervisor_teacher_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          mentor_id?: string;
          request_id?: string;
          schedule_version?: string;
          session_id?: string;
          supervisor_teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "peer_confirmation_events_mentor_id_fkey";
            columns: ["mentor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_confirmation_events_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: true;
            referencedRelation: "peer_support_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_confirmation_events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: true;
            referencedRelation: "peer_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_confirmation_events_supervisor_teacher_id_fkey";
            columns: ["supervisor_teacher_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      peer_confirmation_webhook_events: {
        Row: {
          event_created_at: string;
          event_type: string;
          provider_event_id: string;
          provider_message_id: string;
          received_at: string;
        };
        Insert: {
          event_created_at: string;
          event_type: string;
          provider_event_id: string;
          provider_message_id: string;
          received_at?: string;
        };
        Update: {
          event_created_at?: string;
          event_type?: string;
          provider_event_id?: string;
          provider_message_id?: string;
          received_at?: string;
        };
        Relationships: [];
      };
      peer_escalation_access: {
        Row: {
          created_at: string;
          granted_by: string;
          profile_id: string;
          request_id: string;
        };
        Insert: {
          created_at?: string;
          granted_by: string;
          profile_id: string;
          request_id: string;
        };
        Update: {
          created_at?: string;
          granted_by?: string;
          profile_id?: string;
          request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "peer_escalation_access_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_escalation_access_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_escalation_access_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "peer_support_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      peer_mentor_availability: {
        Row: {
          created_at: string;
          end_at: string;
          id: string;
          location: string | null;
          mentor_id: string;
          start_at: string;
          status: Database["public"]["Enums"]["peer_slot_status"];
          time_label: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_at: string;
          id?: string;
          location?: string | null;
          mentor_id: string;
          start_at: string;
          status?: Database["public"]["Enums"]["peer_slot_status"];
          time_label?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_at?: string;
          id?: string;
          location?: string | null;
          mentor_id?: string;
          start_at?: string;
          status?: Database["public"]["Enums"]["peer_slot_status"];
          time_label?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "peer_mentor_availability_mentor_id_fkey";
            columns: ["mentor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      peer_mentor_bookings: {
        Row: {
          additional_info: string | null;
          created_at: string;
          email: string;
          id: string;
          name: string;
          preferred_date: string;
          preferred_time: string;
          status: string;
          topic: string;
          year_group: string;
        };
        Insert: {
          additional_info?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          name: string;
          preferred_date: string;
          preferred_time: string;
          status?: string;
          topic: string;
          year_group: string;
        };
        Update: {
          additional_info?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
          preferred_date?: string;
          preferred_time?: string;
          status?: string;
          topic?: string;
          year_group?: string;
        };
        Relationships: [];
      };
      peer_request_access_tokens: {
        Row: {
          created_at: string;
          expires_at: string;
          request_id: string;
          revoked_at: string | null;
          token_hash: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          request_id: string;
          revoked_at?: string | null;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          request_id?: string;
          revoked_at?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "peer_request_access_tokens_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: true;
            referencedRelation: "peer_support_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      peer_request_dismissals: {
        Row: {
          created_at: string;
          mentor_id: string;
          request_id: string;
        };
        Insert: {
          created_at?: string;
          mentor_id: string;
          request_id: string;
        };
        Update: {
          created_at?: string;
          mentor_id?: string;
          request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "peer_request_dismissals_mentor_id_fkey";
            columns: ["mentor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_request_dismissals_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "peer_support_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      peer_sessions: {
        Row: {
          cancelled_at: string | null;
          completed_at: string | null;
          created_at: string;
          display_timezone: string;
          id: string;
          location: string | null;
          mentor_id: string;
          no_show_at: string | null;
          period: string | null;
          request_id: string;
          schedule_version: string;
          scheduled_end: string;
          scheduled_start: string;
          slot_id: string | null;
          status: Database["public"]["Enums"]["peer_session_status"];
          student_email_snapshot: string | null;
          supervisor_teacher_id: string | null;
          time_label: string | null;
          updated_at: string;
        };
        Insert: {
          cancelled_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          display_timezone?: string;
          id?: string;
          location?: string | null;
          mentor_id: string;
          no_show_at?: string | null;
          period?: string | null;
          request_id: string;
          schedule_version?: string;
          scheduled_end: string;
          scheduled_start: string;
          slot_id?: string | null;
          status?: Database["public"]["Enums"]["peer_session_status"];
          student_email_snapshot?: string | null;
          supervisor_teacher_id?: string | null;
          time_label?: string | null;
          updated_at?: string;
        };
        Update: {
          cancelled_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          display_timezone?: string;
          id?: string;
          location?: string | null;
          mentor_id?: string;
          no_show_at?: string | null;
          period?: string | null;
          request_id?: string;
          schedule_version?: string;
          scheduled_end?: string;
          scheduled_start?: string;
          slot_id?: string | null;
          status?: Database["public"]["Enums"]["peer_session_status"];
          student_email_snapshot?: string | null;
          supervisor_teacher_id?: string | null;
          time_label?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "peer_sessions_mentor_id_fkey";
            columns: ["mentor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_sessions_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "peer_support_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_sessions_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "peer_mentor_availability";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_sessions_supervisor_teacher_id_fkey";
            columns: ["supervisor_teacher_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      peer_submission_rate_limits: {
        Row: {
          fingerprint_hash: string;
          submission_count: number;
          window_started_at: string;
        };
        Insert: {
          fingerprint_hash: string;
          submission_count: number;
          window_started_at: string;
        };
        Update: {
          fingerprint_hash?: string;
          submission_count?: number;
          window_started_at?: string;
        };
        Relationships: [];
      };
      peer_support_actions: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: Json;
          id: number;
          request_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: never;
          request_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: never;
          request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "peer_support_actions_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_support_actions_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "peer_support_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      peer_support_periods: {
        Row: {
          end_time: string | null;
          label: string;
          period: string;
          start_time: string | null;
          updated_at: string;
        };
        Insert: {
          end_time?: string | null;
          label: string;
          period: string;
          start_time?: string | null;
          updated_at?: string;
        };
        Update: {
          end_time?: string | null;
          label?: string;
          period?: string;
          start_time?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      peer_support_requests: {
        Row: {
          assigned_at: string | null;
          assigned_by: string | null;
          assigned_mentor_id: string | null;
          assignment_method: string | null;
          cancelled_at: string | null;
          category: string;
          completed_at: string | null;
          contact_email: string;
          created_at: string;
          escalated_at: string | null;
          escalated_by: string | null;
          escalation_reason: string | null;
          id: string;
          preferred_date: string;
          preferred_periods: string[];
          preferred_time: string;
          private_explanation: string | null;
          status: Database["public"]["Enums"]["peer_request_status"];
          student_name: string;
          submission_key: string | null;
          updated_at: string;
          year_group: string;
        };
        Insert: {
          assigned_at?: string | null;
          assigned_by?: string | null;
          assigned_mentor_id?: string | null;
          assignment_method?: string | null;
          cancelled_at?: string | null;
          category: string;
          completed_at?: string | null;
          contact_email: string;
          created_at?: string;
          escalated_at?: string | null;
          escalated_by?: string | null;
          escalation_reason?: string | null;
          id?: string;
          preferred_date: string;
          preferred_periods?: string[];
          preferred_time: string;
          private_explanation?: string | null;
          status?: Database["public"]["Enums"]["peer_request_status"];
          student_name: string;
          submission_key?: string | null;
          updated_at?: string;
          year_group: string;
        };
        Update: {
          assigned_at?: string | null;
          assigned_by?: string | null;
          assigned_mentor_id?: string | null;
          assignment_method?: string | null;
          cancelled_at?: string | null;
          category?: string;
          completed_at?: string | null;
          contact_email?: string;
          created_at?: string;
          escalated_at?: string | null;
          escalated_by?: string | null;
          escalation_reason?: string | null;
          id?: string;
          preferred_date?: string;
          preferred_periods?: string[];
          preferred_time?: string;
          private_explanation?: string | null;
          status?: Database["public"]["Enums"]["peer_request_status"];
          student_name?: string;
          submission_key?: string | null;
          updated_at?: string;
          year_group?: string;
        };
        Relationships: [
          {
            foreignKeyName: "peer_support_requests_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_support_requests_assigned_mentor_id_fkey";
            columns: ["assigned_mentor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_support_requests_escalated_by_fkey";
            columns: ["escalated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      peer_support_settings: {
        Row: {
          active_weekdays: number[];
          assignment_attention_hours: number;
          display_timezone: string;
          location_guidance: string | null;
          singleton: boolean;
          supervisor_teacher_id: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          active_weekdays?: number[];
          assignment_attention_hours?: number;
          display_timezone?: string;
          location_guidance?: string | null;
          singleton?: boolean;
          supervisor_teacher_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          active_weekdays?: number[];
          assignment_attention_hours?: number;
          display_timezone?: string;
          location_guidance?: string | null;
          singleton?: boolean;
          supervisor_teacher_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "peer_support_settings_supervisor_teacher_id_fkey";
            columns: ["supervisor_teacher_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "peer_support_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_members: {
        Row: {
          booking_enabled: boolean;
          created_at: string;
          id: string;
          profile_id: string;
          staff_type: Database["public"]["Enums"]["app_role"];
          updated_at: string;
        };
        Insert: {
          booking_enabled?: boolean;
          created_at?: string;
          id?: string;
          profile_id: string;
          staff_type: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Update: {
          booking_enabled?: boolean;
          created_at?: string;
          id?: string;
          profile_id?: string;
          staff_type?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      authorize_swag_escalation: {
        Args: { p_profile_id: string; p_request_id: string };
        Returns: boolean;
      };
      cancel_my_peer_session: {
        Args: { p_request_id: string };
        Returns: boolean;
      };
      cancel_peer_request: {
        Args: { p_token: string };
        Returns: {
          outcome: string;
          success: boolean;
        }[];
      };
      cancel_peer_request_internal: {
        Args: {
          p_dispatch_secret: string;
          p_request_id: string;
          p_schedule_version: string;
          p_session_id: string;
        };
        Returns: {
          outcome: string;
          success: boolean;
        }[];
      };
      claim_confirmation_email_jobs: {
        Args: {
          p_dispatch_secret: string;
          p_lease_seconds?: number;
          p_limit?: number;
          p_worker_id: string;
        };
        Returns: {
          display_timezone: string;
          idempotency_key: string;
          job_id: string;
          location: string;
          mentor_name: string;
          mentor_role: Database["public"]["Enums"]["app_role"];
          period_label: string;
          recipient_address: string;
          recipient_kind: string;
          request_id: string;
          schedule_version: string;
          scheduled_end: string;
          scheduled_start: string;
          session_id: string;
          student_name: string;
        }[];
      };
      claim_peer_request: {
        Args: { p_request_id: string };
        Returns: {
          outcome: string;
          success: boolean;
        }[];
      };
      complete_my_peer_case: {
        Args: { p_request_id: string };
        Returns: boolean;
      };
      confirm_and_accept_peer_request: {
        Args: { p_period: string; p_request_id: string };
        Returns: {
          confirmation_event_id: string;
          outcome: string;
          session_id: string;
          success: boolean;
        }[];
      };
      confirm_peer_meeting: {
        Args: { p_period: string; p_request_id: string };
        Returns: {
          confirmation_event_id: string;
          outcome: string;
          session_id: string;
          success: boolean;
        }[];
      };
      create_peer_availability: {
        Args: {
          p_end_at: string;
          p_location: string;
          p_start_at: string;
          p_time_label: string;
        };
        Returns: string;
      };
      current_app_role: {
        Args: never;
        Returns: Database["public"]["Enums"]["app_role"];
      };
      dismiss_peer_request: { Args: { p_request_id: string }; Returns: boolean };
      escalate_my_peer_case: {
        Args: { p_reason: string; p_request_id: string };
        Returns: boolean;
      };
      finish_confirmation_email_job: {
        Args: {
          p_dispatch_secret: string;
          p_error_code?: string;
          p_job_id: string;
          p_outcome: string;
          p_provider_message_id?: string;
          p_retry_after_seconds?: number;
          p_worker_id: string;
        };
        Returns: boolean;
      };
      get_my_peer_case: {
        Args: { p_request_id: string };
        Returns: {
          assigned_at: string | null;
          assigned_by: string | null;
          assigned_mentor_id: string | null;
          assignment_method: string | null;
          cancelled_at: string | null;
          category: string;
          completed_at: string | null;
          contact_email: string;
          created_at: string;
          escalated_at: string | null;
          escalated_by: string | null;
          escalation_reason: string | null;
          id: string;
          preferred_date: string;
          preferred_periods: string[];
          preferred_time: string;
          private_explanation: string | null;
          status: Database["public"]["Enums"]["peer_request_status"];
          student_name: string;
          submission_key: string | null;
          updated_at: string;
          year_group: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "peer_support_requests";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_peer_assignment_policy: {
        Args: never;
        Returns: {
          assignment_attention_hours: number;
        }[];
      };
      get_peer_dashboard_counts: {
        Args: never;
        Returns: {
          available_count: number;
          email_attention_count: number;
          my_active_case_count: number;
          my_available_slot_count: number;
          my_upcoming_session_count: number;
        }[];
      };
      get_peer_escalation: {
        Args: { p_request_id: string };
        Returns: {
          assigned_at: string | null;
          assigned_by: string | null;
          assigned_mentor_id: string | null;
          assignment_method: string | null;
          cancelled_at: string | null;
          category: string;
          completed_at: string | null;
          contact_email: string;
          created_at: string;
          escalated_at: string | null;
          escalated_by: string | null;
          escalation_reason: string | null;
          id: string;
          preferred_date: string;
          preferred_periods: string[];
          preferred_time: string;
          private_explanation: string | null;
          status: Database["public"]["Enums"]["peer_request_status"];
          student_name: string;
          submission_key: string | null;
          updated_at: string;
          year_group: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "peer_support_requests";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_peer_request_management: {
        Args: { p_token: string };
        Returns: {
          assigned_mentor_name: string;
          category: string;
          preferred_date: string;
          preferred_time: string;
          request_id: string;
          session_end: string;
          session_id: string;
          session_label: string;
          session_location: string;
          session_start: string;
          session_status: Database["public"]["Enums"]["peer_session_status"];
          status: Database["public"]["Enums"]["peer_request_status"];
          submitted_at: string;
        }[];
      };
      get_peer_request_management_internal: {
        Args: {
          p_dispatch_secret: string;
          p_request_id: string;
          p_schedule_version: string;
          p_session_id: string;
        };
        Returns: {
          assigned_mentor_name: string;
          preferred_date: string;
          preferred_periods: string[];
          request_id: string;
          session_end: string;
          session_id: string;
          session_label: string;
          session_location: string;
          session_start: string;
          session_status: Database["public"]["Enums"]["peer_session_status"];
          status: Database["public"]["Enums"]["peer_request_status"];
        }[];
      };
      get_peer_support_settings: {
        Args: never;
        Returns: {
          active_weekdays: number[];
          display_timezone: string;
          location_guidance: string;
          periods: Json;
          schedule_ready: boolean;
          supervisor_teacher_id: string;
          supervisor_teacher_name: string;
        }[];
      };
      get_teacher_peer_support_counts: {
        Args: never;
        Returns: {
          active_count: number;
          completed_count: number;
          email_attention_count: number;
          escalated_count: number;
          open_count: number;
          scheduled_count: number;
          today_count: number;
        }[];
      };
      list_available_peer_requests: {
        Args: {
          p_include_dismissed?: boolean;
          p_page_offset?: number;
          p_page_size?: number;
        };
        Returns: {
          category: string;
          dismissed: boolean;
          preferred_date: string;
          preferred_periods: string[];
          preferred_time: string;
          private_explanation: string;
          request_id: string;
          stale: boolean;
          student_name: string;
          submitted_at: string;
          year_group: string;
        }[];
      };
      list_concern_assignees: {
        Args: never;
        Returns: {
          full_name: string;
          profile_id: string;
          role: Database["public"]["Enums"]["app_role"];
        }[];
      };
      list_my_peer_availability: {
        Args: never;
        Returns: {
          end_at: string;
          location: string;
          slot_id: string;
          start_at: string;
          status: Database["public"]["Enums"]["peer_slot_status"];
          time_label: string;
        }[];
      };
      list_my_peer_cases: {
        Args: { p_page_offset?: number; p_page_size?: number };
        Returns: {
          category: string;
          contact_email: string;
          escalated_at: string;
          escalation_reason: string;
          mentor_email_job_id: string;
          mentor_email_status: string;
          preferred_date: string;
          preferred_periods: string[];
          preferred_time: string;
          private_explanation: string;
          request_id: string;
          session_end: string;
          session_id: string;
          session_label: string;
          session_location: string;
          session_period: string;
          session_start: string;
          session_status: Database["public"]["Enums"]["peer_session_status"];
          status: Database["public"]["Enums"]["peer_request_status"];
          student_email_job_id: string;
          student_email_status: string;
          student_name: string;
          submitted_at: string;
          teacher_email_job_id: string;
          teacher_email_status: string;
          year_group: string;
        }[];
      };
      list_my_peer_sessions: {
        Args: never;
        Returns: {
          category: string;
          location: string;
          request_id: string;
          scheduled_end: string;
          scheduled_start: string;
          session_id: string;
          status: Database["public"]["Enums"]["peer_session_status"];
          time_label: string;
        }[];
      };
      list_peer_escalations: {
        Args: { p_page_offset?: number; p_page_size?: number };
        Returns: {
          assigned_mentor_name: string;
          category: string;
          escalated_at: string;
          escalation_reason: string;
          request_id: string;
        }[];
      };
      list_peer_request_slots: {
        Args: { p_token: string };
        Returns: {
          end_at: string;
          location: string;
          slot_id: string;
          start_at: string;
          time_label: string;
        }[];
      };
      list_peer_supporter_candidates: {
        Args: { p_request_id: string };
        Returns: {
          active_case_count: number;
          conflicting_periods: string[];
          full_name: string;
          profile_id: string;
          supporter_role: Database["public"]["Enums"]["app_role"];
        }[];
      };
      list_swag_escalation_assignees: {
        Args: never;
        Returns: {
          full_name: string;
          profile_id: string;
        }[];
      };
      list_teacher_candidates: {
        Args: never;
        Returns: {
          full_name: string;
          profile_id: string;
        }[];
      };
      list_teacher_peer_support_overview: {
        Args: { p_page_offset?: number; p_page_size?: number };
        Returns: {
          assigned_at: string;
          assignment_method: string;
          category: string;
          confirmed_period: string;
          location: string;
          mentor_email_job_id: string;
          mentor_email_status: string;
          mentor_id: string;
          mentor_name: string;
          near_requested_date: boolean;
          needs_attention: boolean;
          preferred_date: string;
          preferred_periods: string[];
          private_explanation: string;
          request_id: string;
          session_end: string;
          session_start: string;
          stale: boolean;
          status: Database["public"]["Enums"]["peer_request_status"];
          student_email_job_id: string;
          student_email_status: string;
          student_name: string;
          submitted_at: string;
          teacher_email_job_id: string;
          teacher_email_status: string;
          year_group: string;
        }[];
      };
      mark_peer_case_no_show: {
        Args: { p_request_id: string };
        Returns: boolean;
      };
      peer_request_id_for_token: { Args: { p_token: string }; Returns: string };
      phase5_period_label: { Args: { p_period: string }; Returns: string };
      phase5_suppress_request_email: {
        Args: { p_reason: string; p_request_id: string };
        Returns: undefined;
      };
      preview_peer_request_confirmation: {
        Args: { p_request_id: string };
        Returns: {
          display_timezone: string;
          location_guidance: string;
          period: string;
          period_label: string;
          preferred_date: string;
          readiness_issue: string;
          ready: boolean;
          request_id: string;
          scheduled_end: string;
          scheduled_start: string;
        }[];
      };
      record_confirmation_email_webhook: {
        Args: {
          p_dispatch_secret: string;
          p_event_created_at: string;
          p_event_type: string;
          p_provider_event_id: string;
          p_provider_message_id: string;
        };
        Returns: boolean;
      };
      retry_confirmation_email: {
        Args: { p_outbox_id: string };
        Returns: boolean;
      };
      save_peer_support_settings: {
        Args: {
          p_active_weekdays: number[];
          p_break_end: string;
          p_break_start: string;
          p_location_guidance: string;
          p_lunch_1_end: string;
          p_lunch_1_start: string;
          p_lunch_2_end: string;
          p_lunch_2_start: string;
          p_supervisor_teacher_id: string;
        };
        Returns: boolean;
      };
      schedule_peer_session: {
        Args: { p_slot_id: string; p_token: string };
        Returns: {
          outcome: string;
          session_id: string;
          success: boolean;
        }[];
      };
      set_concern_status: {
        Args: { p_concern_id: string; p_status: string };
        Returns: boolean;
      };
      set_peer_assignment_policy: {
        Args: { p_assignment_attention_hours: number };
        Returns: boolean;
      };
      submit_concern: {
        Args: {
          p_category: string;
          p_details: string;
          p_email: string;
          p_feeling: string;
          p_is_anonymous: boolean;
          p_name: string;
          p_year_group: string;
        };
        Returns: string;
      };
      submit_peer_support_request:
        | {
            Args: {
              p_category: string;
              p_client_fingerprint: string;
              p_contact_email: string;
              p_gateway_secret: string;
              p_preferred_date: string;
              p_preferred_time: string;
              p_private_explanation: string;
              p_student_name: string;
              p_year_group: string;
            };
            Returns: {
              expires_at: string;
              management_token: string;
              request_id: string;
            }[];
          }
        | {
            Args: {
              p_category: string;
              p_client_fingerprint: string;
              p_contact_email: string;
              p_gateway_secret: string;
              p_management_token: string;
              p_preferred_date: string;
              p_preferred_periods: string[];
              p_private_explanation: string;
              p_student_name: string;
              p_submission_key: string;
              p_year_group: string;
            };
            Returns: {
              expires_at: string;
              management_token: string;
              request_id: string;
            }[];
          };
      take_concern: {
        Args: { p_concern_id: string };
        Returns: {
          outcome: string;
          success: boolean;
        }[];
      };
      teacher_assign_peer_request: {
        Args: { p_request_id: string; p_supporter_id: string };
        Returns: {
          outcome: string;
          success: boolean;
        }[];
      };
      teacher_correct_peer_outcome: {
        Args: {
          p_expected_status: string;
          p_reason: string;
          p_request_id: string;
        };
        Returns: boolean;
      };
      teacher_reassign_peer_request: {
        Args: { p_request_id: string; p_supporter_id: string };
        Returns: {
          outcome: string;
          success: boolean;
        }[];
      };
      undo_dismiss_peer_request: {
        Args: { p_request_id: string };
        Returns: boolean;
      };
      withdraw_peer_availability: {
        Args: { p_slot_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "student" | "peer_mentor" | "swag_member" | "teacher";
      peer_request_status:
        "open" | "accepted" | "scheduled" | "completed" | "cancelled" | "escalated" | "no_show";
      peer_session_status: "confirmed" | "completed" | "cancelled" | "no_show";
      peer_slot_status: "available" | "reserved" | "withdrawn";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["student", "peer_mentor", "swag_member", "teacher"],
      peer_request_status: [
        "open",
        "accepted",
        "scheduled",
        "completed",
        "cancelled",
        "escalated",
        "no_show",
      ],
      peer_session_status: ["confirmed", "completed", "cancelled", "no_show"],
      peer_slot_status: ["available", "reserved", "withdrawn"],
    },
  },
} as const;
