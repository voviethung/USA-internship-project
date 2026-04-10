/** Shared types for the Pharma Voice Assistant */

export interface ProcessResult {
  transcript: string;
  translated_vi: string;
  reply_en: string;
  reply_vi: string;
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
  created_at: string;
  updated_at: string;
}
