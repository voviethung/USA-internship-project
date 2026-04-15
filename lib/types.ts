
/** Database row from conversation_segments table */
export interface ConversationSegment {
  id: string;
  conversation_id: string;
  speaker: string;
  start_time: number;
  end_time: number;
  transcript: string;
  created_at: string;
}
/** Shared types for the Pharma Voice Assistant */

// ── Roles ──────────────────────────────────────────────
export type UserRole = 'admin' | 'mentor' | 'student';

export interface ProcessResult {
  transcript: string;
  source_lang?: 'en' | 'vi';
  target_lang?: 'en' | 'vi';
  translated_vi?: string;
  translated_en?: string;
  reply_en: string;
  reply_vi: string;
  is_final?: boolean;
  is_session_end?: boolean;
}

export interface APIResponse {
  success: boolean;
  data?: ProcessResult;
  error?: string;
}

export interface UploadedFile {
  url: string;
  publicId: string;
  fileName: string;
  fileType: string; // 'image' | 'pdf' | 'pptx' | 'doc' | 'other'
  fileSize: number;
}

export interface UploadResponse {
  success: boolean;
  data?: UploadedFile;
  error?: string;
}

/** Database row from conversations table */
export interface Conversation {
  id: string;
  user_id: string;
  transcript: string;
  translated_vi: string | null;
  reply_en: string | null;
  reply_vi: string | null;
  audio_duration: number | null;
  ai_provider: string;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  created_at: string;
}

/** Database row from profiles table */
export interface Profile {
  id: string;
  full_name: string | null;
  preferred_provider: string;
  role: UserRole;
  email: string | null;
  phone: string | null;
  department: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

// ── Phase 4 Types ──────────────────────────────────────

export interface MentorStudent {
  id: string;
  mentor_id: string;
  student_id: string;
  assigned_at: string;
  notes: string | null;
  // Joined
  mentor?: Profile;
  student?: Profile;
}

export interface Lecture {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  category: string;
  created_by: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  creator?: Profile;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  lecture_id: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  assignee?: Profile;
  assigner?: Profile;
  lecture?: Lecture;
}

export type NotificationType = 'info' | 'task' | 'lecture' | 'mentor' | 'system';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  link: string | null;
  created_at: string;
}
