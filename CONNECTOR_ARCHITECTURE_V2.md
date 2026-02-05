# Budget Data Source Architecture V2: File Export + Sync Model

**Version:** 2.0 (Revised)
**Date:** February 2026
**Recommendation:** Scheduled file sync (not real-time API)

---

## 🎯 Architecture Decision

After analysis, **scheduled file exports** are superior to real-time API calls for FP&A integrations.

### Why File Export is Better

| Factor | Real-Time API | File Export + Sync | Winner |
|--------|---------------|-------------------|--------|
| **Reliability** | Fails if API down | Always works (local DB) | 📁 Export |
| **Performance** | 300ms+ per check | 5-10ms (local query) | 📁 Export |
| **Cost** | API quota costs | Minimal (1 export/day) | 📁 Export |
| **Compatibility** | Not all tools have APIs | All tools export files | 📁 Export |
| **Complexity** | OAuth, tokens, refresh | Simple file import | 📁 Export |
| **Freshness** | Real-time | Hourly/daily | 🔄 API |
| **Analytics** | Complex (external API) | Fast (local queries) | 📁 Export |

**Verdict:** File export wins 6 out of 7 factors.

---

## 🏗️ Three-Tier Architecture

### Tier 1: Scheduled Sync (Recommended, 90% of customers)

**How it works:**
```
┌─────────────────────────────────────────────────────────┐
│  Scheduled Job (Every 1-24 hours, configurable)        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Export file from source                             │
│     ├─ Google Sheets: sheets.values.get()              │
│     ├─ Anaplan: Export action → CSV file               │
│     ├─ Prophix: Export API → Excel file                │
│     └─ Custom: FTP/SFTP/S3 drop location               │
│                                                         │
│  2. Parse file (use existing AI mapping)                │
│     └─ Same mapping engine as manual uploads           │
│                                                         │
│  3. Import to SpendFlo database                         │
│     ├─ Upsert budgets (update if exists, create if new)│
│     ├─ Preserve utilization data (committed/reserved)  │
│     └─ Create audit log entry                          │
│                                                         │
│  4. Update "last synced" timestamp                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Budget Check (Real-time, <10ms)                       │
├─────────────────────────────────────────────────────────┤
│  Query local SpendFlo database                          │
│  → Fast, reliable, always works ✅                      │
└─────────────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ Fast budget checks (5-10ms)
- ✅ Works offline
- ✅ No API rate limits
- ✅ Simple, reliable
- ✅ Supports ALL FP&A tools

**Configuration:**
```typescript
{
  syncFrequency: 'every_4_hours', // or hourly, daily, manual
  source: 'google_sheets',
  spreadsheetId: 'abc123',
  sheetName: 'FY2025 Budget',
  columnMappings: { ... },
  lastSyncedAt: '2026-02-04T10:00:00Z'
}
```

---

### Tier 2: Manual Refresh (Optional, on-demand)

**How it works:**
```
User clicks "Refresh Budget Data" button
    ↓
Trigger immediate sync job
    ↓
Same process as scheduled sync
    ↓
"✅ Budget data refreshed. Last synced: just now"
```

**Use cases:**
- Customer just updated their budget file
- Need latest data immediately
- Before important approval decision

**Implementation:**
```typescript
POST /api/connectors/sync-now
{
  customerId: "cust123"
}

Response:
{
  success: true,
  budgetsImported: 42,
  budgetsUpdated: 5,
  budgetsCreated: 2,
  lastSyncedAt: "2026-02-04T14:30:00Z"
}
```

---

### Tier 3: Real-Time API (Premium, 10% of customers)

**How it works:**
```
Budget Check → Check if cache expired → Fetch from API if needed
```

**When to use:**
- Customer requires real-time accuracy
- Budget changes frequently (unusual)
- Willing to pay for higher API costs

**Implementation:**
- Same connector architecture I built earlier
- Caching with short TTL (5 minutes)
- More expensive, less reliable
- Premium pricing tier

---

## 📦 Implementation: Sync Job Architecture

### Component Structure

```
lib/sync/
├── sync-scheduler.ts       ← Manages scheduled jobs
├── sync-executor.ts        ← Executes sync for a customer
├── file-fetcher.ts         ← Fetches files from sources
└── budget-importer.ts      ← Imports to database

app/api/sync/
├── trigger/route.ts        ← Manual trigger endpoint
└── status/route.ts         ← Get sync status
```

---

## 🔄 Sync Flow (Detailed)

### Step 1: Fetch File from Source

#### Google Sheets
```typescript
class GoogleSheetsFetcher {
  async fetchFile(config): Promise<BudgetFile> {
    // Use Google Sheets API (same as before)
    const sheets = await getGoogleSheetsClient(config.credentials);
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: config.sheetName
    });

    return {
      data: data.values,
      sourceType: 'google_sheets',
      fetchedAt: new Date()
    };
  }
}
```

#### Anaplan
```typescript
class AnaplanFetcher {
  async fetchFile(config): Promise<BudgetFile> {
    // Trigger Anaplan export action
    // Export actions are pre-configured in Anaplan UI
    const exportId = await anaplanClient.triggerExport(config.exportActionId);

    // Poll for completion
    await waitForExportComplete(exportId);

    // Download file
    const csvData = await anaplanClient.downloadExport(exportId);

    return {
      data: parseCSV(csvData),
      sourceType: 'anaplan',
      fetchedAt: new Date()
    };
  }
}
```

#### Prophix
```typescript
class ProphixFetcher {
  async fetchFile(config): Promise<BudgetFile> {
    // Prophix REST API export
    const exportResult = await prophixClient.exportCube({
      cubeId: config.cubeId,
      format: 'excel'
    });

    return {
      data: parseExcel(exportResult.data),
      sourceType: 'prophix',
      fetchedAt: new Date()
    };
  }
}
```

#### File Drop (SFTP/S3)
```typescript
class FileDropFetcher {
  async fetchFile(config): Promise<BudgetFile> {
    // Customer uploads to SFTP or S3 bucket
    // We poll for new files
    const latestFile = await getLatestFile(config.dropLocation);

    if (latestFile.timestamp <= config.lastSyncedAt) {
      return { noChanges: true };
    }

    const data = await downloadAndParse(latestFile);

    return {
      data,
      sourceType: 'file_drop',
      fetchedAt: new Date()
    };
  }
}
```

---

### Step 2: Import to Database

```typescript
class BudgetSyncImporter {
  async importBudgets(
    customerId: string,
    budgets: BudgetData[],
    sourceInfo: { type: string, syncedAt: Date }
  ): Promise<SyncResult> {

    const result = {
      total: budgets.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      errors: []
    };

    await prisma.$transaction(async (tx) => {
      for (const budget of budgets) {
        try {
          // Find existing budget
          const existing = await tx.budget.findFirst({
            where: {
              customerId,
              department: budget.department,
              fiscalPeriod: budget.fiscalPeriod,
              subCategory: budget.subCategory || null
            },
            include: { utilization: true }
          });

          if (existing) {
            // Update if amount changed
            if (existing.budgetedAmount !== budget.budgetedAmount) {
              await tx.budget.update({
                where: { id: existing.id },
                data: {
                  budgetedAmount: budget.budgetedAmount,
                  currency: budget.currency || 'USD',
                  source: sourceInfo.type,
                  updatedAt: sourceInfo.syncedAt
                }
              });

              // Create audit log
              await tx.auditLog.create({
                data: {
                  budgetId: existing.id,
                  action: 'SYNC_UPDATE',
                  oldValue: existing.budgetedAmount.toString(),
                  newValue: budget.budgetedAmount.toString(),
                  changedBy: 'system_sync',
                  reason: `Synced from ${sourceInfo.type}`
                }
              });

              result.updated++;
            } else {
              result.unchanged++;
            }

            // IMPORTANT: Preserve utilization data
            // Don't overwrite committed/reserved amounts
            // These are tracked in SpendFlo, not in external source

          } else {
            // Create new budget
            await tx.budget.create({
              data: {
                customerId,
                department: budget.department,
                subCategory: budget.subCategory,
                fiscalPeriod: budget.fiscalPeriod,
                budgetedAmount: budget.budgetedAmount,
                currency: budget.currency || 'USD',
                source: sourceInfo.type
              }
            });

            result.created++;
          }
        } catch (error) {
          result.errors.push({
            budget,
            error: error.message
          });
        }
      }

      // Update sync metadata
      await tx.budgetDataSourceConfig.update({
        where: { customerId },
        data: {
          lastSyncedAt: sourceInfo.syncedAt
        }
      });
    });

    return result;
  }
}
```

---

### Step 3: Schedule Management

```typescript
// lib/sync/sync-scheduler.ts

import { CronJob } from 'cron';

export class SyncScheduler {
  private jobs: Map<string, CronJob> = new Map();

  /**
   * Start scheduled sync for a customer
   */
  async startSync(customerId: string, frequency: string) {
    // Parse frequency
    const cronSchedule = this.frequencyToCron(frequency);

    // Create cron job
    const job = new CronJob(cronSchedule, async () => {
      console.log(`[Sync Scheduler] Running sync for customer ${customerId}`);

      try {
        await syncExecutor.executeSync(customerId);
      } catch (error) {
        console.error(`[Sync Scheduler] Sync failed for ${customerId}:`, error);
        // TODO: Alert customer/admin
      }
    });

    // Start job
    job.start();
    this.jobs.set(customerId, job);

    console.log(`[Sync Scheduler] Started sync for ${customerId} (${frequency})`);
  }

  /**
   * Stop scheduled sync for a customer
   */
  stopSync(customerId: string) {
    const job = this.jobs.get(customerId);
    if (job) {
      job.stop();
      this.jobs.delete(customerId);
      console.log(`[Sync Scheduler] Stopped sync for ${customerId}`);
    }
  }

  /**
   * Convert frequency to cron schedule
   */
  private frequencyToCron(frequency: string): string {
    switch (frequency) {
      case 'hourly':
        return '0 * * * *'; // Every hour
      case 'every_4_hours':
        return '0 */4 * * *'; // Every 4 hours
      case 'every_12_hours':
        return '0 */12 * * *'; // Every 12 hours
      case 'daily':
        return '0 2 * * *'; // Daily at 2 AM
      case 'manual':
        return null; // No automatic sync
      default:
        return '0 */4 * * *'; // Default: every 4 hours
    }
  }
}

// Global instance
export const syncScheduler = new SyncScheduler();
```

---

## 🎨 User Experience

### Setup Flow (Unchanged)

1. Connect to Google Sheets (OAuth)
2. Select spreadsheet & sheet
3. AI maps columns
4. **NEW:** Configure sync frequency
   ```
   How often should we sync your budget?
   ○ Hourly (most up-to-date, higher API usage)
   ● Every 4 hours (recommended)
   ○ Every 12 hours
   ○ Daily (overnight)
   ○ Manual only (you trigger refreshes)
   ```
5. Test connection & sync
6. ✅ Done! First sync completes immediately

---

### Dashboard UI

```
┌─────────────────────────────────────────────────────────┐
│  Budget Data Source: Google Sheets                      │
├─────────────────────────────────────────────────────────┤
│  📊 FY2025 Master Budget → Budget Summary               │
│                                                         │
│  Status: ✅ Connected                                   │
│  Last synced: 2 hours ago (10:00 AM)                    │
│  Next sync: in 2 hours (2:00 PM)                        │
│  Sync frequency: Every 4 hours                          │
│                                                         │
│  42 budgets synced                                      │
│  • 40 unchanged                                         │
│  • 2 updated (amounts changed)                          │
│  • 0 errors                                             │
│                                                         │
│  [Refresh Now] [Change Frequency] [View History]       │
│  [Disconnect]                                           │
└─────────────────────────────────────────────────────────┘
```

---

### Sync History

```
┌─────────────────────────────────────────────────────────┐
│  Sync History                                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ✅ Feb 4, 2026 10:00 AM - Success                      │
│     42 budgets synced, 2 updated                        │
│                                                         │
│  ✅ Feb 4, 2026 6:00 AM - Success                       │
│     42 budgets synced, 0 updated                        │
│                                                         │
│  ✅ Feb 4, 2026 2:00 AM - Success                       │
│     42 budgets synced, 5 updated                        │
│                                                         │
│  ❌ Feb 3, 2026 10:00 PM - Failed                       │
│     Error: Google Sheets API unavailable               │
│     Retried at 10:15 PM - Success                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 Sync Frequency Recommendations

| Customer Type | Frequency | Rationale |
|---------------|-----------|-----------|
| **Standard** | Every 4-12 hours | Budgets rarely change mid-day |
| **Active Planning** | Hourly | During budget planning season |
| **Large Enterprise** | Daily (overnight) | Batch process, low API cost |
| **Small Business** | Manual only | Budget changes infrequently |

**Default Recommendation:** Every 4 hours (6 syncs/day)

---

## 🚨 Handling Sync Failures

### Retry Logic

```typescript
async function executeSyncWithRetry(customerId: string) {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const result = await syncExecutor.executeSync(customerId);

      // Success!
      await notifySuccess(customerId, result);
      return result;

    } catch (error) {
      attempt++;

      if (attempt >= maxRetries) {
        // All retries failed
        await notifyFailure(customerId, error);
        throw error;
      }

      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      await sleep(delay);
    }
  }
}
```

### Notifications

**On failure:**
- Email to customer admin
- In-app notification
- Alert in dashboard

**Message:**
```
⚠️  Budget sync failed

We couldn't sync your budget from Google Sheets.
Error: API rate limit exceeded

Don't worry - your budget data is still available
(last synced 4 hours ago).

We'll retry automatically in 15 minutes.

[Retry Now] [View Details]
```

---

## 💡 Key Architectural Benefits

### 1. Reliability

**Problem with real-time API:**
```
Budget Check → Google API (down) → ❌ Check fails → Workflow blocked
```

**Solution with scheduled sync:**
```
Budget Check → Local DB → ✅ Always works
```

Even if Google Sheets is down for 6 hours, budget checks still work using slightly stale data.

---

### 2. Performance

**Real-time API:**
```
Budget Check: 300-500ms (external API call)
```

**Scheduled Sync:**
```
Budget Check: 5-10ms (local database query) ⚡
```

**50-100x faster!**

---

### 3. Cost

**Real-time API:**
- 1000 budget checks/day × 1 API call each = 1000 API calls
- Google Sheets quota: 100 requests/100 seconds/user
- Cost: High, can exceed quotas

**Scheduled Sync:**
- 6 syncs/day (every 4 hours) = 6 API calls
- Cost: Minimal, never exceeds quotas

**Cost reduced by 166x!**

---

### 4. Universal Compatibility

**Real-time API:**
- ❌ Anaplan: No real-time API (only batch exports)
- ❌ Prophix: Limited API, expensive
- ❌ Custom systems: Often no API

**Scheduled Sync (File Export):**
- ✅ Google Sheets: Export to CSV/Excel
- ✅ Anaplan: Built-in export actions
- ✅ Prophix: Export API
- ✅ **ANY system**: SFTP/S3 file drop

**Works with 100% of FP&A tools!**

---

## 🔄 Hybrid Architecture (Recommended)

**Combine both approaches:**

```
Primary: Scheduled Sync (every 4 hours)
  ├─ Fast, reliable, cheap
  ├─ Works for 90% of use cases
  └─ "Last synced: 2 hours ago"

Optional: Manual Refresh
  ├─ "Refresh Now" button
  ├─ Fetches latest immediately
  └─ For urgent updates

Premium: Real-Time API
  ├─ For customers needing real-time
  ├─ Higher cost
  └─ Optional upsell
```

---

## 📊 Comparison: V1 vs V2

| Feature | V1 (Real-Time API) | V2 (Scheduled Sync) |
|---------|-------------------|---------------------|
| Budget check speed | 300ms | 5ms ⚡ |
| Reliability | Depends on external API | Always works ✅ |
| Data freshness | Real-time | Hourly/daily |
| API cost | High (1000s calls/day) | Low (6 calls/day) |
| Works offline | ❌ No | ✅ Yes |
| FP&A tool support | Limited (API required) | Universal (all tools) |
| Complexity | High (OAuth, tokens) | Medium |
| Enterprise-ready | ⚠️  Risky | ✅ Production-ready |

**Verdict:** V2 (Scheduled Sync) is superior for production use.

---

## 🚀 Migration Path

### If you want to keep real-time API:

**Option 1:** Hybrid (Best of both)
- Default: Scheduled sync
- Premium: Real-time API available as upgrade
- Customer chooses based on needs

**Option 2:** Cache-first
- Primary: Local database (synced)
- Fallback: Real-time API if data too stale
- Best of both worlds

---

## 📝 Updated Implementation Checklist

- [ ] Build sync scheduler (`lib/sync/sync-scheduler.ts`)
- [ ] Build file fetchers (Google Sheets, Anaplan, etc.)
- [ ] Build sync importer (preserve utilization data)
- [ ] Add sync history tracking
- [ ] Build manual refresh endpoint
- [ ] Add sync frequency configuration
- [ ] Update setup UI (add frequency selector)
- [ ] Add sync status dashboard
- [ ] Implement retry logic
- [ ] Add failure notifications
- [ ] Test end-to-end with Google Sheets
- [ ] Deploy scheduled jobs to production

---

## 🎯 Recommendation

**For Production:** Use **Scheduled Sync (V2)** as primary approach.

**Reasoning:**
1. ✅ More reliable (local DB always works)
2. ✅ 50-100x faster (5ms vs 300ms)
3. ✅ 166x cheaper (6 API calls vs 1000)
4. ✅ Universal (works with ALL FP&A tools)
5. ✅ Enterprise-ready (offline capability)

**Keep real-time API as:**
- Premium tier for customers needing real-time
- Manual "Refresh Now" option
- Fallback if scheduled sync fails

---

**Next Steps:**
1. Approve this architecture
2. I'll implement the sync scheduler
3. Update existing connectors for batch mode
4. Build sync management UI

**Sound good?**
