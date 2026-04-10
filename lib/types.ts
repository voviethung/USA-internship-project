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
