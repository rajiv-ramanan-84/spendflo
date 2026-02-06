import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { suggestMappings } from '@/lib/ai/mapping-engine';
import formidable from 'formidable';
import fs from 'fs';

/**
 * Analyze Excel file and return headers, samples, and AI mappings
 * POST /api/excel/analyze
 */
export async function POST(req: NextRequest) {
  try {
    // Parse form data with formidable
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // userId is optional for file analysis (only needed for import)

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV file.' },
        { status: 400 }
      );
    }

    // Read file buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse Excel file
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Failed to parse Excel file. Please ensure the file is not corrupted.' },
        { status: 400 }
      );
    }

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json(
        { error: 'No sheets found in the Excel file' },
        { status: 400 }
      );
    }

    const worksheet = workbook.Sheets[sheetName];

    // Convert to array of arrays
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Excel file is empty' },
        { status: 400 }
      );
    }

    // Extract headers and sample rows
    const headers = rows[0].map(h => String(h || '').trim()).filter(h => h);
    const sampleRows = rows.slice(1, Math.min(6, rows.length)); // Get up to 5 sample rows
    const totalRows = rows.length - 1; // Exclude header row

    if (headers.length === 0) {
      return NextResponse.json(
        { error: 'No valid headers found in the Excel file' },
        { status: 400 }
      );
    }

    // Use AI mapping engine to suggest mappings
    const mappingResult = suggestMappings(headers, sampleRows);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      sheetName,
      totalRows,
      totalColumns: headers.length,
      headers,
      sampleRows,
      mappings: mappingResult.mappings,
      unmappedColumns: mappingResult.unmappedColumns,
      requiredFieldsMissing: mappingResult.requiredFieldsMissing,
      suggestions: mappingResult.suggestions,
      canProceed: mappingResult.requiredFieldsMissing.length === 0,
      fileTypeDetection: mappingResult.fileTypeDetection,
    });
  } catch (error: any) {
    console.error('[Excel Analyze] Error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze Excel file', details: error.message },
      { status: 500 }
    );
  }
}
