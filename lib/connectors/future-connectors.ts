/**
 * Future Budget Connectors (Stubs)
 *
 * These are placeholder implementations for future FP&A tool integrations.
 * Each connector follows the same pattern as Google Sheets connector.
 */

import {
  BudgetDataSource,
  BudgetDataSourceConfig,
  BudgetQuery,
  BudgetRecord
} from './budget-data-source';

/**
 * Anaplan Connector (Coming Soon)
 *
 * Anaplan is a cloud-based FP&A platform.
 * API Docs: https://help.anaplan.com/develop-integrations-anapedia
 *
 * Integration approach:
 * 1. OAuth 2.0 authentication
 * 2. Connect to customer's Anaplan workspace
 * 3. Select model and module containing budgets
 * 4. Map dimensions (Department, Time Period) to our fields
 * 5. Query budget data via Anaplan API
 */
export class AnaplanBudgetConnector extends BudgetDataSource {
  constructor(config: BudgetDataSourceConfig) {
    super(config);
  }

  async findBudget(query: BudgetQuery): Promise<BudgetRecord | null> {
    // TODO: Implement Anaplan API query
    // 1. Build Anaplan MDX query based on department + fiscal period
    // 2. Execute query via Anaplan Transactional API
    // 3. Transform result to BudgetRecord
    throw new Error('Anaplan connector not yet implemented');
  }

  async getAllBudgets(customerId: string): Promise<BudgetRecord[]> {
    // TODO: Implement full budget export from Anaplan
    // 1. Query entire budget cube/module
    // 2. Transform all results to BudgetRecord[]
    throw new Error('Anaplan connector not yet implemented');
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    // TODO: Test Anaplan API connection
    // 1. Verify OAuth token validity
    // 2. Check workspace/model access
    // 3. Validate module exists
    throw new Error('Anaplan connector not yet implemented');
  }

  async discoverSchema(): Promise<{
    columns: string[];
    sampleData: any[][];
    suggestedMappings: Record<string, string>;
    confidence: Record<string, number>;
  }> {
    // TODO: Discover Anaplan model structure
    // 1. List dimensions (e.g., Department, Time, Account)
    // 2. Map Anaplan dimensions to our fields
    // 3. Return sample data for validation
    throw new Error('Anaplan connector not yet implemented');
  }

  isReadOnly(): boolean {
    return true; // Anaplan connector is read-only
  }

  getDisplayName(): string {
    return 'Anaplan';
  }

  getIcon(): string {
    return '📈';
  }
}

/**
 * Prophix Connector (Coming Soon)
 *
 * Prophix is a corporate performance management (CPM) software.
 * API Docs: https://www.prophix.com/platform/integrations/
 *
 * Integration approach:
 * 1. API key authentication
 * 2. Connect to customer's Prophix instance
 * 3. Select database and cube containing budgets
 * 4. Map dimensions to our fields
 * 5. Query via Prophix REST API
 */
export class ProphixBudgetConnector extends BudgetDataSource {
  constructor(config: BudgetDataSourceConfig) {
    super(config);
  }

  async findBudget(query: BudgetQuery): Promise<BudgetRecord | null> {
    // TODO: Implement Prophix API query
    throw new Error('Prophix connector not yet implemented');
  }

  async getAllBudgets(customerId: string): Promise<BudgetRecord[]> {
    // TODO: Implement full budget export from Prophix
    throw new Error('Prophix connector not yet implemented');
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    // TODO: Test Prophix API connection
    throw new Error('Prophix connector not yet implemented');
  }

  async discoverSchema(): Promise<{
    columns: string[];
    sampleData: any[][];
    suggestedMappings: Record<string, string>;
    confidence: Record<string, number>;
  }> {
    // TODO: Discover Prophix cube structure
    throw new Error('Prophix connector not yet implemented');
  }

  isReadOnly(): boolean {
    return true;
  }

  getDisplayName(): string {
    return 'Prophix';
  }

  getIcon(): string {
    return '💼';
  }
}

/**
 * Adaptive Insights Connector (Coming Soon)
 *
 * Adaptive Insights (now Workday Adaptive Planning) is a cloud FP&A tool.
 * API Docs: https://doc.workday.com/adaptive-planning/en-us/integration/cloud-integration-services
 *
 * Integration approach:
 * 1. OAuth 2.0 authentication
 * 2. Connect to customer's Adaptive instance
 * 3. Select version and account structure
 * 4. Map accounts/dimensions to our fields
 * 5. Query via Adaptive Planning API
 */
export class AdaptiveBudgetConnector extends BudgetDataSource {
  constructor(config: BudgetDataSourceConfig) {
    super(config);
  }

  async findBudget(query: BudgetQuery): Promise<BudgetRecord | null> {
    // TODO: Implement Adaptive API query
    throw new Error('Adaptive Insights connector not yet implemented');
  }

  async getAllBudgets(customerId: string): Promise<BudgetRecord[]> {
    // TODO: Implement full budget export from Adaptive
    throw new Error('Adaptive Insights connector not yet implemented');
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    // TODO: Test Adaptive API connection
    throw new Error('Adaptive Insights connector not yet implemented');
  }

  async discoverSchema(): Promise<{
    columns: string[];
    sampleData: any[][];
    suggestedMappings: Record<string, string>;
    confidence: Record<string, number>;
  }> {
    // TODO: Discover Adaptive model structure
    throw new Error('Adaptive Insights connector not yet implemented');
  }

  isReadOnly(): boolean {
    return true;
  }

  getDisplayName(): string {
    return 'Adaptive Insights';
  }

  getIcon(): string {
    return '📉';
  }
}

/**
 * Generic REST API Connector (Future)
 *
 * For custom integrations where customers have their own budget API.
 *
 * Integration approach:
 * 1. Customer provides API endpoint and auth details
 * 2. Customer defines JSON response structure
 * 3. We map JSON fields to our required fields
 * 4. Query customer's API on-demand
 */
export class CustomAPIBudgetConnector extends BudgetDataSource {
  constructor(config: BudgetDataSourceConfig) {
    super(config);
  }

  async findBudget(query: BudgetQuery): Promise<BudgetRecord | null> {
    // TODO: Implement custom API query based on customer config
    throw new Error('Custom API connector not yet implemented');
  }

  async getAllBudgets(customerId: string): Promise<BudgetRecord[]> {
    // TODO: Implement full budget fetch from custom API
    throw new Error('Custom API connector not yet implemented');
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    // TODO: Test custom API endpoint
    throw new Error('Custom API connector not yet implemented');
  }

  async discoverSchema(): Promise<{
    columns: string[];
    sampleData: any[][];
    suggestedMappings: Record<string, string>;
    confidence: Record<string, number>;
  }> {
    // TODO: Discover custom API response structure
    throw new Error('Custom API connector not yet implemented');
  }

  isReadOnly(): boolean {
    return true; // Custom APIs are read-only by default
  }

  getDisplayName(): string {
    return 'Custom API';
  }

  getIcon(): string {
    return '🔌';
  }
}

/**
 * Connector Implementation Checklist
 *
 * When adding a new connector, implement these methods:
 *
 * Required:
 * - findBudget(query) - Find specific budget matching query
 * - getAllBudgets(customerId) - Get all budgets for customer
 * - testConnection() - Verify API/auth works
 * - discoverSchema() - Analyze data structure and suggest mappings
 * - isReadOnly() - Return true (most external sources)
 * - getDisplayName() - Return human-readable name
 * - getIcon() - Return icon/emoji for UI
 *
 * Optional:
 * - updateUtilization() - Only if source supports writes (rare)
 *
 * Architecture notes:
 * - All connectors must extend BudgetDataSource
 * - All connectors must transform their data to BudgetRecord format
 * - External connectors should implement caching (see GoogleSheetsBudgetConnector)
 * - Handle auth token refresh automatically
 * - Log errors with context for debugging
 * - Return helpful error messages to users
 */
