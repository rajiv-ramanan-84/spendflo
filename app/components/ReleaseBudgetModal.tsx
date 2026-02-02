'use client';

import { useState } from 'react';
import { colors, effects, spacing, typography, borderRadius } from '@/app/styles/design-system';

interface ReleaseBudgetModalProps {
  budget: any;
  onClose: () => void;
  onRelease: (budgetId: string, type: 'reserved' | 'committed' | 'both') => Promise<void>;
}

export function ReleaseBudgetModal({ budget, onClose, onRelease }: ReleaseBudgetModalProps) {
  const [loading, setLoading] = useState(false);
  const [releaseType, setReleaseType] = useState<'reserved' | 'committed' | 'both'>('reserved');

  const committed = budget.utilization?.committedAmount || 0;
  const reserved = budget.utilization?.reservedAmount || 0;

  async function handleRelease() {
    setLoading(true);
    try {
      await onRelease(budget.id, releaseType);
      onClose();
    } catch (error) {
      console.error('Release failed:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)' }}>
      <div style={{
        backgroundColor: colors.bg.secondary,
        borderRadius: borderRadius.xl,
        boxShadow: effects.shadow.xl,
        border: `1px solid ${colors.border.default}`,
        maxWidth: '28rem',
        width: '100%',
        padding: spacing.lg
      }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: spacing.lg }}>
          <div>
            <h2 style={{
              fontSize: typography.fontSize['2xl'],
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary
            }}>Release Budget</h2>
            <p style={{
              fontSize: typography.fontSize.sm,
              color: colors.text.secondary,
              marginTop: spacing.xs
            }}>Free up locked budget amounts</p>
          </div>
          <button
            onClick={onClose}
            style={{
              color: colors.text.tertiary,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: spacing.xs,
              transition: effects.transition.base
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = colors.text.secondary}
            onMouseLeave={(e) => e.currentTarget.style.color = colors.text.tertiary}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Budget Info */}
        <div style={{
          marginBottom: spacing.lg,
          padding: spacing.md,
          backgroundColor: colors.bg.tertiary,
          borderRadius: borderRadius.lg,
          border: `1px solid ${colors.border.default}`
        }}>
          <div style={{
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
            fontSize: typography.fontSize.lg
          }}>{budget.department}</div>
          {budget.subCategory && (
            <div style={{
              fontSize: typography.fontSize.sm,
              color: colors.text.secondary
            }}>{budget.subCategory}</div>
          )}
          <div style={{
            fontSize: typography.fontSize.xs,
            color: colors.text.tertiary,
            marginTop: spacing.xs
          }}>{budget.fiscalPeriod}</div>
        </div>

        {/* Current Amounts */}
        <div style={{ marginBottom: spacing.lg, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div className="flex items-center justify-between" style={{
            padding: spacing.sm,
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderRadius: borderRadius.md,
            border: `2px solid ${colors.warning}`
          }}>
            <div>
              <div style={{
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.semibold,
                color: colors.warning,
                textTransform: 'uppercase'
              }}>Reserved</div>
              <div style={{
                fontSize: typography.fontSize.sm,
                color: colors.text.secondary
              }}>Pending approval</div>
            </div>
            <div style={{
              fontSize: typography.fontSize.xl,
              fontWeight: typography.fontWeight.bold,
              color: colors.warning
            }}>
              ${reserved.toLocaleString()}
            </div>
          </div>

          <div className="flex items-center justify-between" style={{
            padding: spacing.sm,
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderRadius: borderRadius.md,
            border: `2px solid ${colors.info}`
          }}>
            <div>
              <div style={{
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.semibold,
                color: colors.info,
                textTransform: 'uppercase'
              }}>Committed</div>
              <div style={{
                fontSize: typography.fontSize.sm,
                color: colors.text.secondary
              }}>Approved spend</div>
            </div>
            <div style={{
              fontSize: typography.fontSize.xl,
              fontWeight: typography.fontWeight.bold,
              color: colors.info
            }}>
              ${committed.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Release Options */}
        <div style={{ marginBottom: spacing.lg }}>
          <label style={{
            display: 'block',
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
            marginBottom: spacing.sm
          }}>
            What would you like to release?
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            <button
              onClick={() => setReleaseType('reserved')}
              disabled={reserved === 0}
              style={{
                width: '100%',
                padding: spacing.md,
                borderRadius: borderRadius.lg,
                border: `2px solid ${releaseType === 'reserved' ? colors.brand.primary : colors.border.default}`,
                backgroundColor: releaseType === 'reserved' ? 'rgba(233, 30, 99, 0.1)' : 'transparent',
                textAlign: 'left',
                transition: effects.transition.base,
                opacity: reserved === 0 ? 0.3 : 1,
                cursor: reserved === 0 ? 'not-allowed' : 'pointer'
              }}
              onMouseEnter={(e) => reserved > 0 && releaseType !== 'reserved' && (e.currentTarget.style.borderColor = colors.border.hover)}
              onMouseLeave={(e) => reserved > 0 && releaseType !== 'reserved' && (e.currentTarget.style.borderColor = colors.border.default)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div style={{
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.text.primary
                  }}>Reserved only</div>
                  <div style={{
                    fontSize: typography.fontSize.sm,
                    color: colors.text.secondary
                  }}>Release pending approvals</div>
                </div>
                <div style={{
                  fontSize: typography.fontSize.lg,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.warning
                }}>
                  ${reserved.toLocaleString()}
                </div>
              </div>
            </button>

            <button
              onClick={() => setReleaseType('committed')}
              disabled={committed === 0}
              style={{
                width: '100%',
                padding: spacing.md,
                borderRadius: borderRadius.lg,
                border: `2px solid ${releaseType === 'committed' ? colors.brand.primary : colors.border.default}`,
                backgroundColor: releaseType === 'committed' ? 'rgba(233, 30, 99, 0.1)' : 'transparent',
                textAlign: 'left',
                transition: effects.transition.base,
                opacity: committed === 0 ? 0.3 : 1,
                cursor: committed === 0 ? 'not-allowed' : 'pointer'
              }}
              onMouseEnter={(e) => committed > 0 && releaseType !== 'committed' && (e.currentTarget.style.borderColor = colors.border.hover)}
              onMouseLeave={(e) => committed > 0 && releaseType !== 'committed' && (e.currentTarget.style.borderColor = colors.border.default)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div style={{
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.text.primary
                  }}>Committed only</div>
                  <div style={{
                    fontSize: typography.fontSize.sm,
                    color: colors.text.secondary
                  }}>Release approved spend</div>
                </div>
                <div style={{
                  fontSize: typography.fontSize.lg,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.info
                }}>
                  ${committed.toLocaleString()}
                </div>
              </div>
            </button>

            <button
              onClick={() => setReleaseType('both')}
              disabled={reserved === 0 && committed === 0}
              style={{
                width: '100%',
                padding: spacing.md,
                borderRadius: borderRadius.lg,
                border: `2px solid ${releaseType === 'both' ? colors.brand.primary : colors.border.default}`,
                backgroundColor: releaseType === 'both' ? 'rgba(233, 30, 99, 0.1)' : 'transparent',
                textAlign: 'left',
                transition: effects.transition.base,
                opacity: (reserved === 0 && committed === 0) ? 0.3 : 1,
                cursor: (reserved === 0 && committed === 0) ? 'not-allowed' : 'pointer'
              }}
              onMouseEnter={(e) => (reserved > 0 || committed > 0) && releaseType !== 'both' && (e.currentTarget.style.borderColor = colors.border.hover)}
              onMouseLeave={(e) => (reserved > 0 || committed > 0) && releaseType !== 'both' && (e.currentTarget.style.borderColor = colors.border.default)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div style={{
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.text.primary
                  }}>Both reserved & committed</div>
                  <div style={{
                    fontSize: typography.fontSize.sm,
                    color: colors.text.secondary
                  }}>Release all locked amounts</div>
                </div>
                <div style={{
                  fontSize: typography.fontSize.lg,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.error
                }}>
                  ${(reserved + committed).toLocaleString()}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Warning */}
        <div style={{
          marginBottom: spacing.lg,
          padding: spacing.md,
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: `2px solid ${colors.error}`,
          borderRadius: borderRadius.lg
        }}>
          <div className="flex items-start">
            <svg className="w-5 h-5 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                 style={{ color: colors.error }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div style={{
              fontSize: typography.fontSize.sm,
              color: colors.text.primary
            }}>
              <strong>Warning:</strong> This action will immediately free up the selected budget amounts. This cannot be undone.
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: `${spacing.sm} ${spacing.md}`,
              border: `2px solid ${colors.border.default}`,
              color: colors.text.primary,
              fontWeight: typography.fontWeight.semibold,
              borderRadius: borderRadius.lg,
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
            onClick={handleRelease}
            disabled={loading || (reserved === 0 && committed === 0)}
            style={{
              flex: 1,
              padding: `${spacing.sm} ${spacing.md}`,
              backgroundColor: colors.error,
              color: colors.text.primary,
              fontWeight: typography.fontWeight.semibold,
              borderRadius: borderRadius.lg,
              border: 'none',
              cursor: (loading || (reserved === 0 && committed === 0)) ? 'not-allowed' : 'pointer',
              opacity: (loading || (reserved === 0 && committed === 0)) ? 0.5 : 1,
              transition: effects.transition.base
            }}
            onMouseEnter={(e) => !loading && (reserved > 0 || committed > 0) && (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => !loading && (reserved > 0 || committed > 0) && (e.currentTarget.style.opacity = '1')}
          >
            {loading ? 'Releasing...' : 'Release Budget'}
          </button>
        </div>
      </div>
    </div>
  );
}
