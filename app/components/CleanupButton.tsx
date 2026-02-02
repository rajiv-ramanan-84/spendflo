'use client';

import { useState } from 'react';
import { colors, effects, spacing, typography, borderRadius } from '@/app/styles/design-system';

interface CleanupResult {
  duplicatesFound: number;
  budgetsDeleted: number;
  details: any[];
}

export function CleanupButton({ onComplete }: { onComplete: () => void }) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);

  async function handleCleanup() {
    setLoading(true);
    try {
      const res = await fetch('/api/cleanup-duplicates', {
        method: 'POST',
      });
      const data = await res.json();
      setResult(data);
      setShowConfirm(false);
      if (data.success) {
        setTimeout(() => {
          onComplete();
        }, 3000);
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div style={{
        padding: spacing.md,
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        border: `2px solid ${colors.success}`,
        borderRadius: borderRadius.lg
      }}>
        <div className="flex items-start">
          <svg className="w-5 h-5 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
               style={{ color: colors.success }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
              marginBottom: spacing.xs
            }}>
              Cleanup Complete!
            </p>
            <p style={{
              fontSize: typography.fontSize.sm,
              color: colors.text.secondary
            }}>
              Removed {result.budgetsDeleted} duplicate budgets. Found {result.duplicatesFound} duplicate groups.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (showConfirm) {
    return (
      <div style={{
        padding: spacing.md,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        border: `2px solid ${colors.warning}`,
        borderRadius: borderRadius.lg
      }}>
        <div className="flex items-start">
          <svg className="w-5 h-5 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
               style={{ color: colors.warning }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <p style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.primary,
              marginBottom: spacing.xs
            }}>
              Remove duplicate budgets?
            </p>
            <p style={{
              fontSize: typography.fontSize.sm,
              color: colors.text.secondary,
              marginBottom: spacing.sm
            }}>
              This will keep budgets with utilization data and remove empty duplicates.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  fontSize: typography.fontSize.sm,
                  border: `2px solid ${colors.border.default}`,
                  color: colors.text.primary,
                  fontWeight: typography.fontWeight.medium,
                  borderRadius: borderRadius.md,
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  transition: effects.transition.base
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bg.hover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                Cancel
              </button>
              <button
                onClick={handleCleanup}
                disabled={loading}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  fontSize: typography.fontSize.sm,
                  backgroundColor: colors.warning,
                  color: colors.bg.primary,
                  fontWeight: typography.fontWeight.medium,
                  borderRadius: borderRadius.md,
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                  transition: effects.transition.base
                }}
                onMouseEnter={(e) => !loading && (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => !loading && (e.currentTarget.style.opacity = '1')}
              >
                {loading ? 'Cleaning...' : 'Yes, Clean Up'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: `${spacing.sm} ${spacing.md}`,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        border: `2px solid ${colors.warning}`,
        color: colors.warning,
        fontWeight: typography.fontWeight.medium,
        borderRadius: borderRadius.md,
        cursor: 'pointer',
        transition: effects.transition.base
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(245, 158, 11, 0.2)'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(245, 158, 11, 0.1)'}
    >
      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
      Clean Duplicates
    </button>
  );
}
