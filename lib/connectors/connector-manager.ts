/**
 * Connector Manager
 *
 * Manages budget data source configurations and initializes the appropriate
 * connectors for each customer.
 */

import { prisma } from '../prisma';
import {
  BudgetDataSource,
  BudgetDataSourceConfig,
  budgetDataRouter
} from './budget-data-source';
import { GoogleSheetsBudgetConnector } from './google-sheets-connector';
import { InternalBudgetConnector } from './internal-connector';

/**
 * Database model for storing connector configurations
 * Add this to your Prisma schema:
 *
 * model BudgetDataSourceConfig {
 *   id           String   @id @default(cuid())
 *   customerId   String   @unique
 *   type         String   // 'google_sheets', 'internal', 'anaplan', etc.
 *   enabled      Boolean  @default(true)
 *   credentials  Json?    // OAuth tokens, API keys, etc.
 *   columnMappings Json?  // Column mappings
 *   sourceConfig Json?    // Source-specific config
 *   cacheTTL     Int      @default(300)
 *   lastSyncedAt DateTime?
 *   createdAt    DateTime @default(now())
 *   updatedAt    DateTime @updatedAt
 *   customer     Customer @relation(fields: [customerId], references: [id])
 * }
 */

export class ConnectorManager {
  /**
   * Initialize connector for a customer
   */
  async initializeConnector(customerId: string): Promise<BudgetDataSource | null> {
    // Get connector config from database
    const config = await this.getConnectorConfig(customerId);

    if (!config || !config.enabled) {
      console.log(`[Connector Manager] No active connector for customer ${customerId}`);
      return null;
    }

    // Create appropriate connector based on type
    let connector: BudgetDataSource;

    switch (config.type) {
      case 'google_sheets':
        connector = new GoogleSheetsBudgetConnector(config);
        break;

      case 'internal':
        connector = new InternalBudgetConnector(config);
        break;

      // Future connectors
      case 'anaplan':
        throw new Error('Anaplan connector not yet implemented');
      // connector = new AnaplanBudgetConnector(config);
      // break;

      case 'prophix':
        throw new Error('Prophix connector not yet implemented');
      // connector = new ProphixBudgetConnector(config);
      // break;

      default:
        throw new Error(`Unknown connector type: ${config.type}`);
    }

    // Test connection
    const testResult = await connector.testConnection();
    if (!testResult.success) {
      console.error(`[Connector Manager] Connection test failed for ${customerId}:`, testResult.error);
      return null;
    }

    // Register with router
    budgetDataRouter.registerDataSource(customerId, connector);

    console.log(`[Connector Manager] Initialized ${config.type} connector for customer ${customerId}`);
    return connector;
  }

  /**
   * Get connector configuration from database
   */
  async getConnectorConfig(customerId: string): Promise<BudgetDataSourceConfig | null> {
    try {
      // For now, check if customer has uploaded budgets (internal)
      // or has Google Sheets auth configured
      const customer = await prisma.customer.findUnique({
        where: { id: customerId }
      });

      if (!customer) return null;

      // Check for Google Sheets OAuth
      const googleAuth = await prisma.googleAuth.findFirst({
        where: { userId: { in: customer.users?.map((u: any) => u.id) || [] } }
      });

      if (googleAuth) {
        // Try to load saved config from database
        // TODO: Create BudgetDataSourceConfig table and load from there
        return {
          type: 'google_sheets',
          customerId,
          enabled: true,
          credentials: {
            access_token: googleAuth.accessToken,
            refresh_token: googleAuth.refreshToken,
            scope: googleAuth.scope
          },
          // These would come from saved config
          columnMappings: {},
          sourceConfig: {
            spreadsheetId: undefined, // Load from saved config
            sheetName: undefined
          },
          cacheTTL: 300
        };
      }

      // Check if customer has any budgets in database
      const budgetCount = await prisma.budget.count({
        where: { customerId }
      });

      if (budgetCount > 0) {
        // Use internal database
        return {
          type: 'internal',
          customerId,
          enabled: true
        };
      }

      return null;
    } catch (error) {
      console.error('[Connector Manager] Error getting connector config:', error);
      return null;
    }
  }

  /**
   * Save connector configuration
   */
  async saveConnectorConfig(config: BudgetDataSourceConfig): Promise<void> {
    // TODO: Save to BudgetDataSourceConfig table
    // For now, this is a placeholder
    console.log('[Connector Manager] Saving connector config:', config);

    // In production, this would be:
    // await prisma.budgetDataSourceConfig.upsert({
    //   where: { customerId: config.customerId },
    //   update: { ...config },
    //   create: { ...config }
    // });
  }

  /**
   * Setup Google Sheets connector for a customer
   */
  async setupGoogleSheetsConnector(
    customerId: string,
    spreadsheetId: string,
    sheetName: string,
    columnMappings: Record<string, string>,
    cacheTTL: number = 300
  ): Promise<BudgetDataSource> {
    const config: BudgetDataSourceConfig = {
      type: 'google_sheets',
      customerId,
      enabled: true,
      columnMappings,
      sourceConfig: {
        spreadsheetId,
        sheetName
      },
      cacheTTL
    };

    // Get OAuth credentials
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { users: true }
    });

    if (!customer || !customer.users || customer.users.length === 0) {
      throw new Error('Customer or users not found');
    }

    const googleAuth = await prisma.googleAuth.findFirst({
      where: { userId: { in: customer.users.map((u: any) => u.id) } }
    });

    if (!googleAuth) {
      throw new Error('Google Sheets authentication not configured');
    }

    config.credentials = {
      access_token: googleAuth.accessToken,
      refresh_token: googleAuth.refreshToken,
      scope: googleAuth.scope
    };

    // Save configuration
    await this.saveConnectorConfig(config);

    // Initialize connector
    const connector = new GoogleSheetsBudgetConnector(config);

    // Test connection
    const testResult = await connector.testConnection();
    if (!testResult.success) {
      throw new Error(`Connection test failed: ${testResult.error}`);
    }

    // Register with router
    budgetDataRouter.registerDataSource(customerId, connector);

    console.log('[Connector Manager] Google Sheets connector setup complete');
    return connector;
  }

  /**
   * Disable connector for a customer (switch back to internal)
   */
  async disableConnector(customerId: string): Promise<void> {
    // TODO: Update database config
    console.log('[Connector Manager] Disabling connector for customer:', customerId);

    // Switch to internal connector
    const internalConfig: BudgetDataSourceConfig = {
      type: 'internal',
      customerId,
      enabled: true
    };

    const connector = new InternalBudgetConnector(internalConfig);
    budgetDataRouter.registerDataSource(customerId, connector);
  }

  /**
   * Get list of available connector types
   */
  getAvailableConnectors(): Array<{
    type: string;
    name: string;
    icon: string;
    description: string;
    status: 'available' | 'coming_soon';
  }> {
    return [
      {
        type: 'internal',
        name: 'SpendFlo Database',
        icon: '🗄️',
        description: 'Upload Excel/CSV files to SpendFlo',
        status: 'available'
      },
      {
        type: 'google_sheets',
        name: 'Google Sheets',
        icon: '📊',
        description: 'Connect to your Google Sheets budget file',
        status: 'available'
      },
      {
        type: 'anaplan',
        name: 'Anaplan',
        icon: '📈',
        description: 'Connect to Anaplan models',
        status: 'coming_soon'
      },
      {
        type: 'prophix',
        name: 'Prophix',
        icon: '💼',
        description: 'Connect to Prophix budgets',
        status: 'coming_soon'
      },
      {
        type: 'adaptive',
        name: 'Adaptive Insights',
        icon: '📉',
        description: 'Connect to Adaptive Planning',
        status: 'coming_soon'
      }
    ];
  }
}

// Singleton instance
export const connectorManager = new ConnectorManager();

/**
 * Initialize all customer connectors on app startup
 */
export async function initializeAllConnectors(): Promise<void> {
  console.log('[Connector Manager] Initializing connectors for all customers...');

  const customers = await prisma.customer.findMany({
    select: { id: true, name: true }
  });

  for (const customer of customers) {
    try {
      await connectorManager.initializeConnector(customer.id);
    } catch (error) {
      console.error(`[Connector Manager] Failed to initialize connector for ${customer.name}:`, error);
    }
  }

  console.log(`[Connector Manager] Initialized connectors for ${customers.length} customers`);
}
