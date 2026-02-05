/**
 * Budget Data Source - Abstract Connector Interface
 *
 * This defines the contract that all budget data sources must implement,
 * whether it's Google Sheets, Anaplan, Prophix, or internal database.
 */

export interface BudgetQuery {
  customerId: string;
  department: string;
  fiscalPeriod: string;
  subCategory?: string;
  currency?: string;
}

export interface BudgetRecord {
  id: string;
  department: string;
  subCategory?: string;
  fiscalPeriod: string;
  budgetedAmount: number;
  currency: string;
  committedAmount?: number;
  reservedAmount?: number;
  source: string; // 'google_sheets', 'internal', 'anaplan', etc.
  sourceReference?: string; // Sheet URL, Anaplan model ID, etc.
}

export interface BudgetDataSourceConfig {
  type: 'google_sheets' | 'internal' | 'anaplan' | 'prophix' | 'custom';
  customerId: string;
  enabled: boolean;

  // Authentication
  credentials?: any; // OAuth tokens, API keys, etc.

  // Column mappings (AI-detected and user-confirmed)
  columnMappings?: Record<string, string>; // { "Dept" => "department", "FY" => "fiscalPeriod" }

  // Source-specific config
  sourceConfig?: {
    // Google Sheets
    spreadsheetId?: string;
    sheetName?: string;
    range?: string;

    // Anaplan
    workspaceId?: string;
    modelId?: string;
    moduleId?: string;

    // Prophix
    databaseId?: string;
    cubeId?: string;

    // Custom
    apiEndpoint?: string;
    authMethod?: string;
  };

  // Caching config
  cacheTTL?: number; // Cache time-to-live in seconds (default: 300 = 5 minutes)
  lastSyncedAt?: Date;
}

export interface BudgetCheckResult {
  available: boolean;
  budget: BudgetRecord | null;
  reason: string;
  utilizationPercent?: number;
  canAutoApprove?: boolean;
  source: string; // Which data source was used
  cachedData?: boolean; // Whether this came from cache
  timestamp: Date;
}

/**
 * Abstract base class for all budget data sources
 */
export abstract class BudgetDataSource {
  protected config: BudgetDataSourceConfig;

  constructor(config: BudgetDataSourceConfig) {
    this.config = config;
  }

  /**
   * Find a budget matching the query
   */
  abstract findBudget(query: BudgetQuery): Promise<BudgetRecord | null>;

  /**
   * Get all budgets for a customer (used for dashboard, reports)
   */
  abstract getAllBudgets(customerId: string): Promise<BudgetRecord[]>;

  /**
   * Test connection to data source
   */
  abstract testConnection(): Promise<{ success: boolean; error?: string }>;

  /**
   * Discover column structure and suggest mappings
   */
  abstract discoverSchema(): Promise<{
    columns: string[];
    sampleData: any[][];
    suggestedMappings: Record<string, string>;
    confidence: Record<string, number>;
  }>;

  /**
   * Update utilization (reserve/commit/release budget)
   * Only applicable to internal data source
   * External sources are read-only
   */
  async updateUtilization(
    budgetId: string,
    type: 'reserve' | 'commit' | 'release',
    amount: number
  ): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: 'This data source is read-only'
    };
  }

  /**
   * Check if this data source is read-only
   */
  abstract isReadOnly(): boolean;

  /**
   * Get data source display name
   */
  abstract getDisplayName(): string;

  /**
   * Get data source icon
   */
  abstract getIcon(): string;
}

/**
 * Budget Data Router
 * Routes budget queries to the appropriate data source based on customer config
 */
export class BudgetDataRouter {
  private dataSources: Map<string, BudgetDataSource> = new Map();

  /**
   * Register a data source for a customer
   */
  registerDataSource(customerId: string, dataSource: BudgetDataSource) {
    this.dataSources.set(customerId, dataSource);
  }

  /**
   * Get data source for a customer
   */
  getDataSource(customerId: string): BudgetDataSource | null {
    return this.dataSources.get(customerId) || null;
  }

  /**
   * Route a budget check query to the appropriate data source
   */
  async checkBudget(query: BudgetQuery): Promise<BudgetCheckResult> {
    const dataSource = this.getDataSource(query.customerId);

    if (!dataSource) {
      return {
        available: false,
        budget: null,
        reason: 'No budget data source configured for this customer',
        source: 'none',
        timestamp: new Date()
      };
    }

    try {
      const budget = await dataSource.findBudget(query);

      if (!budget) {
        return {
          available: false,
          budget: null,
          reason: 'No budget found for this department/category',
          source: dataSource.getDisplayName(),
          timestamp: new Date()
        };
      }

      // Calculate availability
      const committed = budget.committedAmount || 0;
      const reserved = budget.reservedAmount || 0;
      const available = budget.budgetedAmount - committed - reserved;
      const utilizationPercent = ((committed + reserved) / budget.budgetedAmount) * 100;

      const requestedAmount = parseFloat(String(query.currency === budget.currency ? 1 : 1.27)); // Simplified conversion

      return {
        available: available > 0,
        budget,
        reason: available > 0
          ? `Budget available: ${available.toLocaleString()} ${budget.currency}`
          : `Insufficient budget: ${available.toLocaleString()} ${budget.currency} available`,
        utilizationPercent,
        canAutoApprove: available > 0 && utilizationPercent < 90,
        source: dataSource.getDisplayName(),
        timestamp: new Date()
      };
    } catch (error: any) {
      console.error('[Budget Router] Error checking budget:', error);
      return {
        available: false,
        budget: null,
        reason: `Error checking budget: ${error.message}`,
        source: dataSource.getDisplayName(),
        timestamp: new Date()
      };
    }
  }
}

// Global router instance
export const budgetDataRouter = new BudgetDataRouter();
