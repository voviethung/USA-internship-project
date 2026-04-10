'use client';

import { useState, useRef } from 'react';
import type { UploadedFile } from '@/lib/types';

/** Accepted file extensions */
const ACCEPT =
  'image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx';

/** Human-readable file size */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Icon by file type */
function FileIcon({ type }: { type: string }) {
  switch (type) {
    case 'image':
      return <span className="text-lg">🖼️</span>;
    case 'pdf':
      return <span className="text-lg">📄</span>;
    case 'pptx':
      return <span className="text-lg">📊</span>;
    case 'doc':
      return <span className="text-lg">📝</span>;
    case 'xlsx':
      return <span className="text-lg">📗</span>;
    default:
      return <span className="text-lg">📎</span>;
  }
}

interface FileAttachmentProps {
  onFileUploaded: (file: UploadedFile) => void;
  disabled?: boolean;
}

export default function FileAttachment({
  onFileUploaded,
  disabled = false,
}: FileAttachmentProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload-file', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      const uploaded: UploadedFile = data.data;
      setUploadedFile(uploaded);
      onFileUploaded(uploaded);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Upload failed';
      setError(message);
    } finally {
      setIsUploading(false);
      // Reset input so same file can be re-selected
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    setUploadedFile(null);
    setError(null);
  };

  return (
    <div className="px-4">
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {/* Uploaded file preview */}
      {uploadedFile ? (
        <div className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2 shadow-sm">
          <FileIcon type={uploadedFile.fileType} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-700">
              {uploadedFile.fileName}
            </p>
            <p className="text-[10px] text-slate-400">
              {formatSize(uploadedFile.fileSize)} • Uploaded ✓
            </p>
          </div>

          {/* Preview link for images/pdf */}
          <a
            href={uploadedFile.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-primary-600 hover:bg-primary-100"
            title="Open file"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          {/* Remove button */}
          <button
            onClick={handleRemove}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-500"
            title="Remove file"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        /* Upload button */
        <button
          onClick={() => inputRef.current?.click()}
          disabled={disabled || isUploading}
          className={`flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-2 text-xs transition-colors
            ${
              disabled || isUploading
                ? 'border-slate-200 text-slate-300 cursor-not-allowed'
                : 'border-primary-200 text-primary-500 hover:border-primary-400 hover:bg-primary-50 active:bg-primary-100'
            }`}
        >
          {isUploading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
              Uploading…
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              Attach file (image, PDF, PPT, Word…)
            </>
          )}
        </button>
      )}

      {/* Error */}
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
