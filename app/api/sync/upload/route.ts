/**
 * API: Upload Budget File
 *
 * POST /api/sync/upload
 *
 * Handles file uploads for manual sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const customerId = formData.get('customerId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!customerId) {
      return NextResponse.json(
        { error: 'No customerId provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name;
    const ext = path.extname(fileName).toLowerCase();
    if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only CSV and Excel files are supported.' },
        { status: 400 }
      );
    }

    // Create upload directory if it doesn't exist
    const uploadDir = '/tmp/spendflo-budget-imports';
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Save file with timestamp and sanitize filename
    const timestamp = Date.now();
    // Remove spaces and special characters, keep only alphanumeric, dots, dashes, underscores
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const safeFileName = `${customerId}_${timestamp}_${sanitizedName}`;
    const filePath = path.join(uploadDir, safeFileName);

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    console.log(`[Upload API] File uploaded: ${safeFileName} (${buffer.length} bytes)`);

    return NextResponse.json({
      success: true,
      message: 'File uploaded successfully',
      fileName: safeFileName,
      filePath,
      fileSize: buffer.length
    });

  } catch (error: any) {
    console.error('[Upload API] Upload failed:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error.message },
      { status: 500 }
    );
  }
}
