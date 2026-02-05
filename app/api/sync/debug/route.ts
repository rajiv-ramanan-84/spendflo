/**
 * API: Debug Sync System
 *
 * GET /api/sync/debug?customerId=xxx
 *
 * Returns debug information about sync system state
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');

    const uploadDir = '/tmp/spendflo-budget-imports';

    // Check if upload directory exists
    const dirExists = fs.existsSync(uploadDir);

    let files: any[] = [];
    if (dirExists) {
      const allFiles = fs.readdirSync(uploadDir);
      files = allFiles.map(f => {
        const stats = fs.statSync(path.join(uploadDir, f));
        return {
          name: f,
          size: stats.size,
          modified: stats.mtime,
          matchesCustomer: customerId ? f.startsWith(customerId) : null
        };
      });
    }

    return NextResponse.json({
      uploadDirectory: {
        path: uploadDir,
        exists: dirExists,
        totalFiles: files.length,
        files: files
      },
      filter: {
        customerId: customerId || 'all',
        matchingFiles: customerId ? files.filter(f => f.matchesCustomer) : files
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        cwd: process.cwd(),
        tmpDir: '/tmp/spendflo-budget-imports'
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Debug failed', details: error.message },
      { status: 500 }
    );
  }
}
