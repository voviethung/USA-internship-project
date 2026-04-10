/**
 * Cloudinary upload utility.
 * Supports images, PDFs, PowerPoint, Word, and other documents.
 */

import { v2 as cloudinary } from 'cloudinary';

// Configure once
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/** Map MIME types to Cloudinary resource_type + folder */
function getUploadConfig(mimeType: string) {
  // Images
  if (mimeType.startsWith('image/')) {
    return { resourceType: 'image' as const, folder: 'pharma-voice/images', fileType: 'image' };
  }

  // PDFs
  if (mimeType === 'application/pdf') {
    return { resourceType: 'image' as const, folder: 'pharma-voice/documents', fileType: 'pdf' };
  }

  // PowerPoint
  if (
    mimeType === 'application/vnd.ms-powerpoint' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return { resourceType: 'raw' as const, folder: 'pharma-voice/documents', fileType: 'pptx' };
  }

  // Word
  if (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return { resourceType: 'raw' as const, folder: 'pharma-voice/documents', fileType: 'doc' };
  }

  // Excel
  if (
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return { resourceType: 'raw' as const, folder: 'pharma-voice/documents', fileType: 'xlsx' };
  }

  // Fallback — raw upload
  return { resourceType: 'raw' as const, folder: 'pharma-voice/other', fileType: 'other' };
}

/** Allowed MIME types */
const ALLOWED_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** Max file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  fileType: string;
}

/**
 * Upload a file to Cloudinary.
 * @param file  File object from FormData
 * @returns     Upload result with secure URL
 */
export async function uploadToCloudinary(
  file: File,
): Promise<CloudinaryUploadResult> {
  // Validate type
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(
      `File type "${file.type}" is not allowed. Supported: images, PDF, PowerPoint, Word, Excel.`,
    );
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File too large. Maximum 10 MB.');
  }

  const { resourceType, folder, fileType } = getUploadConfig(file.type);

  // Convert File → Buffer → base64 data URI for Cloudinary upload
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = `data:${file.type};base64,${buffer.toString('base64')}`;

  const result = await cloudinary.uploader.upload(base64, {
    resource_type: resourceType,
    folder,
    // Use original filename (sanitized)
    public_id: `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
    // For images: optimize
    ...(resourceType === 'image' && {
      transformation: [
        { quality: 'auto', fetch_format: 'auto' },
      ],
    }),
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    fileType,
  };
}

/**
 * Delete a file from Cloudinary by public_id.
 */
export async function deleteFromCloudinary(
  publicId: string,
  resourceType: 'image' | 'raw' = 'image',
): Promise<void> {
  await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
  });
}
