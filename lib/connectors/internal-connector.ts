/**
 * Internal Database Budget Connector
 *
 * Connects to SpendFlo's internal Prisma database.
 * This is the default connector for customers who upload budget files.
 * Unlike external connectors, this one supports write operations (reserve/commit/release).
 */

import { prisma } from '../prisma';
import {
  BudgetDataSource,
  BudgetDataSourceConfig,
  BudgetQuery,
  BudgetRecord
} from './budget-data-source';

export class InternalBudgetConnector extends BudgetDataSource {
  constructor(config: BudgetDataSourceConfig) {
    super(config);
  }

  /**
   * Find a specific budget matching the query
   */
  async findBudget(query: BudgetQuery): Promise<BudgetRecord | null> {
    const budget = await prisma.budget.findFirst({
      where: {
        customerId: query.customerId,
        department: query.department,
        fiscalPeriod: query.fiscalPeriod,
        subCategory: query.subCategory || null
      },
      include: {
        utilization: true
      }
    });

    if (!budget) return null;

    return this.transformToBudgetRecord(budget);
  }

  /**
   * Get all budgets for a customer
   */
  async getAllBudgets(customerId: string): Promise<BudgetRecord[]> {
    const budgets = await prisma.budget.findMany({
      where: { customerId },
      include: { utilization: true },
      orderBy: [
        { department: 'asc' },
        { fiscalPeriod: 'desc' }
      ]
    });

    return budgets.map(b => this.transformToBudgetRecord(b));
  }

  /**
   * Test connection (always succeeds for internal DB)
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Database connection failed'
      };
    }
  }

  /**
   * Not applicable for internal database (data already imported)
   */
  async discoverSchema(): Promise<{
    columns: string[];
    sampleData: any[][];
    suggestedMappings: Record<string, string>;
    confidence: Record<string, number>;
  }> {
    throw new Error('Schema discovery not applicable for internal database');
  }

  /**
   * Internal database supports write operations
   */
  isReadOnly(): boolean {
    return false;
  }

  /**
   * Update utilization (reserve/commit/release)
   * This is unique to internal connector - external sources are read-only
   */
  async updateUtilization(
    budgetId: string,
    type: 'reserve' | 'commit' | 'release',
    amount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const budget = await prisma.budget.findUnique({
        where: { id: budgetId },
        include: { utilization: true }
      });

      if (!budget) {
        return { success: false, error: 'Budget not found' };
      }

      const committed = budget.utilization?.committedAmount || 0;
      const reserved = budget.utilization?.reservedAmount || 0;

      let newCommitted = committed;
      let newReserved = reserved;

      switch (type) {
        case 'reserve':
          newReserved += amount;
          break;
        case 'commit':
          newCommitted += amount;
          // If this was previously reserved, release it
          newReserved = Math.max(0, reserved - amount);
          break;
        case 'release':
          // Assume releasing from reserved by default
          newReserved = Math.max(0, reserved - amount);
          break;
      }

      // Update utilization
      await prisma.budgetUtilization.upsert({
        where: { budgetId },
        update: {
          committedAmount: newCommitted,
          reservedAmount: newReserved
        },
        create: {
          budgetId,
          committedAmount: newCommitted,
          reservedAmount: newReserved
        }
      });

      return { success: true };
    } catch (error: any) {
      console.error('[Internal Connector] Update utilization error:', error);
      return {
        success: false,
        error: error.message || 'Failed to update utilization'
      };
    }
  }

  /**
   * Display name for UI
   */
  getDisplayName(): string {
    return 'SpendFlo Database';
  }

  /**
   * Icon for UI
   */
  getIcon(): string {
    return '🗄️';
  }

  /**
   * PRIVATE METHODS
   */

  /**
   * Transform Prisma model to BudgetRecord
   */
  private transformToBudgetRecord(budget: any): BudgetRecord {
    return {
      id: budget.id,
      department: budget.department,
      subCategory: budget.subCategory || undefined,
      fiscalPeriod: budget.fiscalPeriod,
      budgetedAmount: budget.budgetedAmount,
      currency: budget.currency || 'USD',
      committedAmount: budget.utilization?.committedAmount || 0,
      reservedAmount: budget.utilization?.reservedAmount || 0,
      source: 'internal',
      sourceReference: budget.id
    };
  }
}
