/**
 * Sync Scheduler - Cron-based Job Management
 *
 * Manages scheduled syncs for all customers with:
 * - Cron-based scheduling
 * - Parallel execution (multiple customers)
 * - Rate limiting (respect API quotas)
 * - Graceful shutdown
 * - Health monitoring
 */

import { CronJob } from 'cron';
import { syncEngine, SyncConfig } from './sync-engine';
import { prisma } from '../prisma';

interface ScheduledJob {
  customerId: string;
  job: CronJob;
  config: SyncConfig;
  lastRun?: Date;
  nextRun?: Date;
  status: 'running' | 'idle' | 'error';
}

export class SyncScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private runningJobs: Set<string> = new Set();
  private maxConcurrentJobs: number = 5; // Limit parallel syncs

  /**
   * Initialize scheduler and load all customer syncs
   */
  async initialize(): Promise<void> {
    console.log('[Sync Scheduler] Initializing...');

    // Load all customers with sync enabled
    const customers = await this.loadCustomersWithSync();

    console.log(`[Sync Scheduler] Found ${customers.length} customers with sync enabled`);

    for (const customer of customers) {
      try {
        await this.scheduleSync(customer.config);
      } catch (error: any) {
        console.error(`[Sync Scheduler] Failed to schedule sync for ${customer.id}:`, error.message);
      }
    }

    console.log(`[Sync Scheduler] Initialized ${this.jobs.size} scheduled jobs`);
  }

  /**
   * Load customers with sync configurations
   */
  private async loadCustomersWithSync(): Promise<Array<{ id: string; config: SyncConfig }>> {
    const configs = await prisma.budgetDataSourceConfig.findMany({
      where: {
        enabled: true,
        syncEnabled: true
      }
    });

    return configs.map(config => ({
      id: config.customerId,
      config: {
        customerId: config.customerId,
        sourceType: config.sourceType as any,
        sourceConfig: config.sourceConfig as any,
        frequency: config.frequency as any,
        enabled: config.enabled
      }
    }));
  }

  /**
   * Schedule a sync job for a customer
   */
  async scheduleSync(config: SyncConfig): Promise<void> {
    const { customerId, frequency } = config;

    // Stop existing job if any
    await this.stopSync(customerId);

    // Skip if manual-only
    if (frequency === 'manual') {
      console.log(`[Sync Scheduler] Customer ${customerId} is manual-only, skipping schedule`);
      return;
    }

    // Create cron schedule
    const cronSchedule = this.frequencyToCron(frequency);

    if (!cronSchedule) {
      throw new Error(`Invalid frequency: ${frequency}`);
    }

    // Create cron job
    const job = new CronJob(
      cronSchedule,
      async () => {
        await this.executeSyncJob(customerId, config);
      },
      null, // onComplete
      false, // start immediately? No - we'll call start()
      'America/New_York' // timezone
    );

    // Store job
    const scheduledJob: ScheduledJob = {
      customerId,
      job,
      config,
      nextRun: job.nextDate().toJSDate(),
      status: 'idle'
    };

    this.jobs.set(customerId, scheduledJob);

    // Start job
    job.start();

    console.log(`[Sync Scheduler] Scheduled sync for ${customerId} (${frequency})`);
    console.log(`[Sync Scheduler] Next run: ${scheduledJob.nextRun?.toISOString()}`);
  }

  /**
   * Execute a sync job (called by cron)
   */
  private async executeSyncJob(customerId: string, config: SyncConfig): Promise<void> {
    const job = this.jobs.get(customerId);
    if (!job) {
      console.error(`[Sync Scheduler] Job not found for ${customerId}`);
      return;
    }

    // Check if already running
    if (this.runningJobs.has(customerId)) {
      console.log(`[Sync Scheduler] Sync already running for ${customerId}, skipping`);
      return;
    }

    // Check concurrent job limit
    if (this.runningJobs.size >= this.maxConcurrentJobs) {
      console.log(`[Sync Scheduler] Max concurrent jobs reached (${this.maxConcurrentJobs}), skipping ${customerId}`);
      return;
    }

    // Mark as running
    this.runningJobs.add(customerId);
    job.status = 'running';
    job.lastRun = new Date();

    console.log(`[Sync Scheduler] Starting sync for ${customerId}`);

    try {
      const result = await syncEngine.executeSyncWithRetry(config);

      console.log(`[Sync Scheduler] Sync completed for ${customerId}: ${result.status}`);
      console.log(`[Sync Scheduler] Stats:`, result.stats);

      // Update job status
      job.status = 'idle';
      job.nextRun = job.job.nextDate().toJSDate();

      // Send notifications if needed
      if (result.status === 'failed') {
        await this.notifyFailure(customerId, result);
      } else if (result.status === 'partial') {
        await this.notifyPartialSuccess(customerId, result);
      }

    } catch (error: any) {
      console.error(`[Sync Scheduler] Sync failed for ${customerId}:`, error);

      job.status = 'error';
      await this.notifyFailure(customerId, error);

    } finally {
      // Mark as not running
      this.runningJobs.delete(customerId);
    }
  }

  /**
   * Trigger manual sync (on-demand)
   */
  async triggerManualSync(customerId: string): Promise<void> {
    const job = this.jobs.get(customerId);
    if (!job) {
      throw new Error(`No sync configuration found for ${customerId}`);
    }

    console.log(`[Sync Scheduler] Manual sync triggered for ${customerId}`);

    await this.executeSyncJob(customerId, job.config);
  }

  /**
   * Stop sync for a customer
   */
  async stopSync(customerId: string): Promise<void> {
    const job = this.jobs.get(customerId);
    if (job) {
      job.job.stop();
      this.jobs.delete(customerId);
      console.log(`[Sync Scheduler] Stopped sync for ${customerId}`);
    }
  }

  /**
   * Stop all syncs (graceful shutdown)
   */
  async stopAll(): Promise<void> {
    console.log(`[Sync Scheduler] Stopping all ${this.jobs.size} jobs...`);

    for (const [customerId, job] of this.jobs.entries()) {
      job.job.stop();
    }

    this.jobs.clear();

    // Wait for running jobs to complete (max 30 seconds)
    const timeout = 30000;
    const startTime = Date.now();

    while (this.runningJobs.size > 0 && Date.now() - startTime < timeout) {
      console.log(`[Sync Scheduler] Waiting for ${this.runningJobs.size} jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.runningJobs.size > 0) {
      console.warn(`[Sync Scheduler] ${this.runningJobs.size} jobs still running after timeout`);
    }

    console.log('[Sync Scheduler] All jobs stopped');
  }

  /**
   * Get sync status for a customer
   */
  getSyncStatus(customerId: string): {
    scheduled: boolean;
    frequency?: string;
    lastRun?: Date;
    nextRun?: Date;
    status?: string;
  } {
    const job = this.jobs.get(customerId);

    if (!job) {
      return { scheduled: false };
    }

    return {
      scheduled: true,
      frequency: job.config.frequency,
      lastRun: job.lastRun,
      nextRun: job.nextRun,
      status: job.status
    };
  }

  /**
   * Get all scheduled jobs (for monitoring)
   */
  getAllJobs(): Array<{
    customerId: string;
    frequency: string;
    lastRun?: Date;
    nextRun?: Date;
    status: string;
  }> {
    return Array.from(this.jobs.values()).map(job => ({
      customerId: job.customerId,
      frequency: job.config.frequency,
      lastRun: job.lastRun,
      nextRun: job.nextRun,
      status: job.status
    }));
  }

  /**
   * Convert frequency to cron schedule
   */
  private frequencyToCron(frequency: string): string | null {
    switch (frequency) {
      case 'hourly':
        return '0 * * * *'; // Every hour on the hour
      case 'every_4_hours':
        return '0 */4 * * *'; // Every 4 hours
      case 'every_12_hours':
        return '0 */12 * * *'; // Every 12 hours
      case 'daily':
        return '0 2 * * *'; // Daily at 2 AM
      case 'manual':
        return null; // No automatic schedule
      default:
        throw new Error(`Unknown frequency: ${frequency}`);
    }
  }

  /**
   * Send failure notification
   */
  private async notifyFailure(customerId: string, error: any): Promise<void> {
    // TODO: Implement notifications (email, Slack, etc.)
    console.error(`[Sync Scheduler] NOTIFICATION: Sync failed for ${customerId}:`, error);

    // In production:
    // - Send email to customer admin
    // - Post to Slack channel
    // - Create in-app notification
    // - Log to monitoring system (DataDog, Sentry, etc.)
  }

  /**
   * Send partial success notification
   */
  private async notifyPartialSuccess(customerId: string, result: any): Promise<void> {
    console.warn(`[Sync Scheduler] NOTIFICATION: Partial sync for ${customerId}:`, result.stats);

    // In production: Send warning notification
  }
}

// Singleton instance
export const syncScheduler = new SyncScheduler();

/**
 * Initialize scheduler on app startup
 * Call this in your main server file
 */
export async function initializeSyncScheduler(): Promise<void> {
  await syncScheduler.initialize();

  // Graceful shutdown handlers
  process.on('SIGTERM', async () => {
    console.log('[Sync Scheduler] SIGTERM received, stopping all jobs...');
    await syncScheduler.stopAll();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[Sync Scheduler] SIGINT received, stopping all jobs...');
    await syncScheduler.stopAll();
    process.exit(0);
  });
}
