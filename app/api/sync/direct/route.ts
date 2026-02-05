/**
 * API: Direct File Sync (bypasses scheduler)
 *
 * POST /api/sync/direct
 *
 * Directly syncs an uploaded file without requiring scheduler configuration
 * Perfect for testing and manual uploads
 */

import { NextRequest, NextResponse } from 'next/server';
import { fileSyncOrchestrator } from '@/lib/sync/file-sync-orchestrator';
import { fileReceiver } from '@/lib/sync/file-receiver';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerId, fileName } = body;

    if (!customerId) {
      return NextResponse.json(
        { error: 'Missing required field: customerId' },
        { status: 400 }
      );
    }

    console.log(`[Direct Sync API] Starting direct sync for customer ${customerId}`);

    // Look for uploaded file
    const uploadDir = '/tmp/spendflo-budget-imports';

    let targetFile: string | null = null;

    if (fileName) {
      // Use specific file
      targetFile = path.join(uploadDir, fileName);
      if (!fs.existsSync(targetFile)) {
        return NextResponse.json(
          { error: `File not found: ${fileName}` },
          { status: 404 }
        );
      }
    } else {
      // Find most recent file for this customer
      const files = fs.readdirSync(uploadDir);
      const customerFiles = files
        .filter(f => f.startsWith(customerId))
        .map(f => ({
          name: f,
          path: path.join(uploadDir, f),
          mtime: fs.statSync(path.join(uploadDir, f)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (customerFiles.length === 0) {
        return NextResponse.json(
          { error: 'No files found for this customer. Please upload a file first.' },
          { status: 404 }
        );
      }

      targetFile = customerFiles[0].path;
      console.log(`[Direct Sync API] Using most recent file: ${customerFiles[0].name}`);
    }

    // Parse the file
    const stats = fs.statSync(targetFile);
    const file = {
      fileName: path.basename(targetFile),
      filePath: targetFile,
      fileSize: stats.size,
      receivedAt: stats.mtime,
      source: 'upload' as const
    };

    // Execute sync directly
    const result = await fileSyncOrchestrator.executeFileSync({
      customerId,
      sourceType: 'upload',
      fileSource: {
        type: 'upload',
        config: {
          localPath: uploadDir
        }
      },
      autoApplyMapping: true,
      minConfidence: 0.5
    });

    console.log(`[Direct Sync API] Sync completed: ${result.status}`);
    console.log(`[Direct Sync API] Stats:`, result.stats);

    return NextResponse.json({
      success: result.status === 'success' || result.status === 'partial',
      syncId: result.syncId,
      status: result.status,
      stats: result.stats,
      duration: `${(result.durationMs / 1000).toFixed(2)}s`,
      errors: result.errors,
      file: {
        name: file.fileName,
        size: file.fileSize
      }
    });

  } catch (error: any) {
    console.error('[Direct Sync API] Sync failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Sync failed',
        details: error.message,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}
