import { NextRequest, NextResponse } from 'next/server';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // ── Rate limit ──────────────────────────────────────
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'anonymous';

    if (!checkRateLimit(ip, 20, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Try again in 1 minute.' },
        { status: 429 },
      );
    }

    // ── Parse form data ─────────────────────────────────
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No file provided.' },
        { status: 400 },
      );
    }

    // ── Upload to Cloudinary ────────────────────────────
    const result = await uploadToCloudinary(file);

    return NextResponse.json({
      success: true,
      data: {
        url: result.url,
        publicId: result.publicId,
        fileName: file.name,
        fileType: result.fileType,
        fileSize: file.size,
      },
    });
  } catch (err) {
    console.error('[upload-file] Error:', err);

    const message =
      err instanceof Error ? err.message : 'Failed to upload file';

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
