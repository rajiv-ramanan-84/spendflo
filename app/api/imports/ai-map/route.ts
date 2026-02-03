import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { suggestMappings } from '@/lib/ai/mapping-engine';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * AI-Powered Column Mapping Endpoint
 * Accepts CSV or Excel file and returns intelligent mapping suggestions
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(fileExtension || '')) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload CSV or Excel file.' },
        { status: 400 }
      );
    }

    // Read file buffer
    const buffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(buffer);

    let headers: string[] = [];
    let sampleRows: any[][] = [];

    // Parse based on file type
    if (fileExtension === 'csv') {
      // Parse CSV
      const csvContent = fileBuffer.toString('utf-8');
      const records = parse(csvContent, {
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });

      if (records.length === 0) {
        return NextResponse.json(
          { error: 'CSV file is empty' },
          { status: 400 }
        );
      }

      headers = records[0];
      sampleRows = records.slice(1, Math.min(6, records.length)); // Get up to 5 sample rows
    } else {
      // Parse Excel
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        return NextResponse.json(
          { error: 'Excel file has no sheets' },
          { status: 400 }
        );
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (jsonData.length === 0) {
        return NextResponse.json(
          { error: 'Excel file is empty' },
          { status: 400 }
        );
      }

      headers = jsonData[0];
      sampleRows = jsonData.slice(1, Math.min(6, jsonData.length)); // Get up to 5 sample rows
    }

    // Validate headers
    if (!headers || headers.length === 0) {
      return NextResponse.json(
        { error: 'No headers found in file' },
        { status: 400 }
      );
    }

    // Clean headers (remove empty/null values)
    headers = headers.filter(h => h && String(h).trim());

    if (headers.length === 0) {
      return NextResponse.json(
        { error: 'No valid headers found in file' },
        { status: 400 }
      );
    }

    // Use AI mapping engine to suggest mappings
    const mappingResult = suggestMappings(headers, sampleRows);

    // Calculate file stats
    const totalRows = fileExtension === 'csv'
      ? parse(fileBuffer.toString('utf-8'), { skip_empty_lines: true }).length - 1
      : XLSX.utils.sheet_to_json(XLSX.read(fileBuffer, { type: 'buffer' }).Sheets[XLSX.read(fileBuffer, { type: 'buffer' }).SheetNames[0]], { header: 1 }).length - 1;

    return NextResponse.json({
      success: true,
      file: {
        name: file.name,
        size: file.size,
        type: fileExtension,
        totalRows,
        totalColumns: headers.length,
      },
      mappings: mappingResult.mappings,
      unmappedColumns: mappingResult.unmappedColumns,
      requiredFieldsMissing: mappingResult.requiredFieldsMissing,
      suggestions: mappingResult.suggestions,
      canProceed: mappingResult.requiredFieldsMissing.length === 0,
    });

  } catch (error: any) {
    console.error('[AI Map] Error:', error);

    // Handle specific parsing errors
    if (error.message?.includes('CSV')) {
      return NextResponse.json(
        { error: 'Failed to parse CSV file. Please check file format.', details: error.message },
        { status: 400 }
      );
    }

    if (error.message?.includes('Excel') || error.message?.includes('XLSX')) {
      return NextResponse.json(
        { error: 'Failed to parse Excel file. Please check file format.', details: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to process file', details: error.message },
      { status: 500 }
    );
  }
}
