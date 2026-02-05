/**
 * Google Sheets Budget Connector
 *
 * Connects to customer's Google Sheet and reads budget data in real-time.
 * Read-only access - never writes back to the sheet.
 */

import { google } from 'googleapis';
import { suggestMappings } from '../ai/mapping-engine';
import {
  BudgetDataSource,
  BudgetDataSourceConfig,
  BudgetQuery,
  BudgetRecord
} from './budget-data-source';

interface CachedBudgetData {
  budgets: BudgetRecord[];
  timestamp: Date;
  ttl: number; // seconds
}

export class GoogleSheetsBudgetConnector extends BudgetDataSource {
  private cache: CachedBudgetData | null = null;
  private readonly DEFAULT_CACHE_TTL = 300; // 5 minutes

  constructor(config: BudgetDataSourceConfig) {
    super(config);
  }

  /**
   * Find a specific budget matching the query
   */
  async findBudget(query: BudgetQuery): Promise<BudgetRecord | null> {
    const budgets = await this.getAllBudgets(query.customerId);

    // Find matching budget
    const match = budgets.find(b => {
      const deptMatch = b.department.toLowerCase() === query.department.toLowerCase();
      const periodMatch = b.fiscalPeriod === query.fiscalPeriod;
      const subCatMatch = query.subCategory
        ? b.subCategory?.toLowerCase() === query.subCategory.toLowerCase()
        : true;

      return deptMatch && periodMatch && subCatMatch;
    });

    return match || null;
  }

  /**
   * Get all budgets from Google Sheet
   * Uses caching to avoid hitting API on every request
   */
  async getAllBudgets(customerId: string): Promise<BudgetRecord[]> {
    // Check cache first
    if (this.cache && this.isCacheValid()) {
      console.log('[Google Sheets] Using cached data');
      return this.cache.budgets;
    }

    console.log('[Google Sheets] Fetching fresh data from sheet');

    try {
      const data = await this.fetchSheetData();
      const budgets = this.transformToBudgetRecords(data, customerId);

      // Update cache
      this.cache = {
        budgets,
        timestamp: new Date(),
        ttl: this.config.cacheTTL || this.DEFAULT_CACHE_TTL
      };

      return budgets;
    } catch (error: any) {
      console.error('[Google Sheets] Error fetching data:', error);

      // Return cached data if available (stale is better than nothing)
      if (this.cache) {
        console.log('[Google Sheets] Returning stale cached data due to error');
        return this.cache.budgets;
      }

      throw error;
    }
  }

  /**
   * Test connection to Google Sheet
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const sheets = await this.getGoogleSheetsClient();
      const spreadsheetId = this.config.sourceConfig?.spreadsheetId;

      if (!spreadsheetId) {
        return { success: false, error: 'No spreadsheet ID configured' };
      }

      // Try to read metadata (lightweight check)
      await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'properties.title'
      });

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Connection test failed'
      };
    }
  }

  /**
   * Discover schema and suggest column mappings
   */
  async discoverSchema(): Promise<{
    columns: string[];
    sampleData: any[][];
    suggestedMappings: Record<string, string>;
    confidence: Record<string, number>;
  }> {
    const data = await this.fetchSheetData();

    if (data.length === 0) {
      throw new Error('Sheet is empty');
    }

    const headers = data[0];
    const sampleRows = data.slice(1, 11); // First 10 rows

    // Use AI mapping engine to suggest mappings
    const mappingResult = suggestMappings(headers, sampleRows);

    const suggestedMappings: Record<string, string> = {};
    const confidence: Record<string, number> = {};

    mappingResult.mappings.forEach(m => {
      suggestedMappings[m.sourceColumn] = m.targetField;
      confidence[m.sourceColumn] = m.confidence;
    });

    return {
      columns: headers,
      sampleData: sampleRows,
      suggestedMappings,
      confidence
    };
  }

  /**
   * This is a read-only connector
   */
  isReadOnly(): boolean {
    return true;
  }

  /**
   * Display name for UI
   */
  getDisplayName(): string {
    return 'Google Sheets';
  }

  /**
   * Icon for UI
   */
  getIcon(): string {
    return '📊'; // or URL to Google Sheets icon
  }

  /**
   * Invalidate cache (useful for forcing refresh)
   */
  invalidateCache() {
    this.cache = null;
  }

  /**
   * PRIVATE METHODS
   */

  /**
   * Check if cached data is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cache) return false;

    const now = new Date();
    const age = (now.getTime() - this.cache.timestamp.getTime()) / 1000; // seconds

    return age < this.cache.ttl;
  }

  /**
   * Get authenticated Google Sheets client
   */
  private async getGoogleSheetsClient() {
    const credentials = this.config.credentials;

    if (!credentials || !credentials.access_token) {
      throw new Error('Google Sheets credentials not configured');
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token
    });

    return google.sheets({ version: 'v4', auth });
  }

  /**
   * Fetch raw data from Google Sheet
   */
  private async fetchSheetData(): Promise<any[][]> {
    const sheets = await this.getGoogleSheetsClient();
    const spreadsheetId = this.config.sourceConfig?.spreadsheetId;
    const sheetName = this.config.sourceConfig?.sheetName || 'Sheet1';
    const range = this.config.sourceConfig?.range || `${sheetName}!A:Z`;

    if (!spreadsheetId) {
      throw new Error('No spreadsheet ID configured');
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    return response.data.values || [];
  }

  /**
   * Transform raw sheet data to BudgetRecord objects
   */
  private transformToBudgetRecords(
    data: any[][],
    customerId: string
  ): BudgetRecord[] {
    if (data.length === 0) return [];

    const headers = data[0];
    const mappings = this.config.columnMappings || {};

    // Create index map for quick lookup
    const getColumnIndex = (targetField: string): number => {
      const sourceColumn = Object.keys(mappings).find(
        key => mappings[key] === targetField
      );
      if (!sourceColumn) return -1;
      return headers.indexOf(sourceColumn);
    };

    const deptIndex = getColumnIndex('department');
    const periodIndex = getColumnIndex('fiscalPeriod');
    const amountIndex = getColumnIndex('budgetedAmount');
    const subCatIndex = getColumnIndex('subCategory');
    const currencyIndex = getColumnIndex('currency');

    // Validate required fields are mapped
    if (deptIndex === -1 || periodIndex === -1 || amountIndex === -1) {
      throw new Error('Required fields not mapped (department, fiscalPeriod, budgetedAmount)');
    }

    const budgets: BudgetRecord[] = [];

    // Transform each row (skip header)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      // Skip empty rows
      if (!row || row.length === 0 || row.every(cell => !cell)) continue;

      const department = row[deptIndex];
      const fiscalPeriod = row[periodIndex];
      const budgetedAmount = this.parseAmount(row[amountIndex]);

      // Skip invalid rows
      if (!department || !fiscalPeriod || isNaN(budgetedAmount)) continue;

      const budget: BudgetRecord = {
        id: `gs_${customerId}_${i}`, // Unique ID for Google Sheets row
        department: String(department).trim(),
        fiscalPeriod: String(fiscalPeriod).trim(),
        budgetedAmount,
        currency: currencyIndex >= 0 && row[currencyIndex]
          ? String(row[currencyIndex]).trim().toUpperCase()
          : 'USD',
        source: 'google_sheets',
        sourceReference: `${this.config.sourceConfig?.spreadsheetId}#row${i + 1}`
      };

      // Add optional sub-category
      if (subCatIndex >= 0 && row[subCatIndex]) {
        budget.subCategory = String(row[subCatIndex]).trim();
      }

      // Note: Google Sheets is read-only, so committed/reserved are always 0
      // If customer needs utilization tracking, they must use internal database
      budget.committedAmount = 0;
      budget.reservedAmount = 0;

      budgets.push(budget);
    }

    return budgets;
  }

  /**
   * Parse amount from cell value (handles $, commas, etc.)
   */
  private parseAmount(value: any): number {
    if (typeof value === 'number') return value;

    const cleaned = String(value)
      .replace(/[$,£€]/g, '')
      .trim();

    return parseFloat(cleaned);
  }
}
