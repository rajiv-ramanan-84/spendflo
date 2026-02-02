'use client';

import { useEffect, useState, useRef } from 'react';
import { ToastContainer, ToastProps } from '@/app/components/Toast';
import { AddBudgetModal } from '@/app/components/AddBudgetModal';
import { ReleaseBudgetModal } from '@/app/components/ReleaseBudgetModal';
import { ExportButton } from '@/app/components/ExportButton';
import { CleanupButton } from '@/app/components/CleanupButton';
import { Header } from '@/app/components/Header';
import { getCurrentUser } from '@/app/components/UserSelector';
import { colors, effects, spacing, typography, borderRadius } from '@/app/styles/design-system';

interface DashboardStats {
  summary: {
    totalBudget: number;
    totalCommitted: number;
    totalReserved: number;
    totalAvailable: number;
    totalUtilizationPercent: number;
  };
  health: {
    healthy: number;
    warning: number;
    highRisk: number;
    critical: number;
  };
  criticalBudgets: Array<{
    id: string;
    department: string;
    subCategory: string | null;
    totalBudget: number;
    utilized: number;
    available: number;
    utilizationPercent: number;
  }>;
  totalBudgets: number;
}

interface Budget {
  id: string;
  department: string;
  subCategory: string | null;
  fiscalPeriod: string;
  budgetedAmount: number;
  currency: string;
  utilization?: {
    committedAmount: number;
    reservedAmount: number;
  };
}

export function DashboardClient() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingBudget, setDeletingBudget] = useState<string | null>(null);
  const [releasingBudget, setReleasingBudget] = useState<Budget | null>(null);

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ budgetId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [statsRes, budgetsRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/budgets')
      ]);
      const statsData = await statsRes.json();
      const budgetsData = await budgetsRes.json();
      setStats(statsData);
      setBudgets(budgetsData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      addToast('error', 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  // Inline editing handlers
  function startEditing(budgetId: string, field: string, currentValue: string | number) {
    setEditingCell({ budgetId, field });
    setEditValue(currentValue.toString());
    setTimeout(() => editInputRef.current?.focus(), 0);
  }

  function cancelEditing() {
    setEditingCell(null);
    setEditValue('');
  }

  async function saveInlineEdit() {
    if (!editingCell) return;

    const budget = budgets.find(b => b.id === editingCell.budgetId);
    if (!budget) return;

    try {
      const data: any = {};

      if (editingCell.field === 'department') {
        data.department = editValue;
      } else if (editingCell.field === 'subCategory') {
        data.subCategory = editValue || null;
      } else if (editingCell.field === 'fiscalPeriod') {
        data.fiscalPeriod = editValue;
      } else if (editingCell.field === 'budgetedAmount') {
        const amount = parseFloat(editValue);
        if (isNaN(amount) || amount <= 0) {
          addToast('error', 'Invalid amount', 'Please enter a valid positive number');
          return;
        }
        data.budgetedAmount = amount;
      }

      const res = await fetch(`/api/budgets/${editingCell.budgetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, userId: getCurrentUser() }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error);
      }

      addToast('success', 'Budget updated', 'Changes saved successfully');
      fetchData();
      cancelEditing();
    } catch (error: any) {
      addToast('error', 'Failed to update budget', error.message);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      saveInlineEdit();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  }

  async function handleAddBudget(data: any) {
    try {
      const res = await fetch('/api/budgets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, userId: getCurrentUser() }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error);
      }

      addToast('success', 'Budget added', `${data.department} budget created successfully`);
      fetchData();
    } catch (error: any) {
      addToast('error', 'Failed to add budget', error.message);
      throw error;
    }
  }

  async function handleDeleteBudget(budgetId: string) {
    try {
      const res = await fetch(`/api/budgets/${budgetId}?userId=${getCurrentUser()}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error);
      }

      addToast('success', 'Budget deleted', 'Budget removed successfully');
      fetchData();
      setDeletingBudget(null);
    } catch (error: any) {
      addToast('error', 'Failed to delete budget', error.message);
    }
  }

  async function handleReleaseBudget(budgetId: string, type: 'reserved' | 'committed' | 'both') {
    try {
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) return;

      const committed = budget.utilization?.committedAmount || 0;
      const reserved = budget.utilization?.reservedAmount || 0;

      if (type === 'both') {
        // Release both
        if (reserved > 0) {
          await fetch('/api/budget/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              budgetId,
              amount: reserved,
              type: 'reserved',
              userId: getCurrentUser(),
              reason: 'Manual release by FP&A',
            }),
          });
        }
        if (committed > 0) {
          await fetch('/api/budget/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              budgetId,
              amount: committed,
              type: 'committed',
              userId: getCurrentUser(),
              reason: 'Manual release by FP&A',
            }),
          });
        }
        addToast('success', 'Budget released', `Released $${(reserved + committed).toLocaleString()} total`);
      } else {
        const amount = type === 'reserved' ? reserved : committed;
        await fetch('/api/budget/release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            budgetId,
            amount,
            type,
            userId: getCurrentUser(),
            reason: 'Manual release by FP&A',
          }),
        });
        addToast('success', 'Budget released', `Released $${amount.toLocaleString()} from ${type}`);
      }

      fetchData();
    } catch (error: any) {
      addToast('error', 'Failed to release budget', error.message);
      throw error;
    }
  }

  function addToast(type: ToastProps['type'], message: string, description?: string) {
    const id = Math.random().toString(36);
    setToasts((prev) => [...prev, { id, type, message, description, onClose: removeToast }]);
  }

  function removeToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: colors.bg.primary }}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4"
               style={{ borderColor: `${colors.brand.primary} transparent transparent transparent` }}></div>
          <p style={{ color: colors.text.secondary }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: colors.bg.primary }}>
        <p style={{ color: colors.error }}>Failed to load dashboard</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.bg.primary }}>
      <Header />
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Modals */}
      {showAddModal && (
        <AddBudgetModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddBudget}
        />
      )}

      {releasingBudget && (
        <ReleaseBudgetModal
          budget={releasingBudget}
          onClose={() => setReleasingBudget(null)}
          onRelease={handleReleaseBudget}
        />
      )}

      {/* Delete Confirmation - Railway Style */}
      {deletingBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)' }}>
          <div style={{
            backgroundColor: colors.bg.secondary,
            border: `1px solid ${colors.border.default}`,
            borderRadius: borderRadius.xl,
            boxShadow: effects.shadow.lg
          }} className="max-w-md w-full p-6">
            <h2 style={{
              fontSize: typography.fontSize.xl,
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary,
              marginBottom: spacing.md
            }}>Confirm Delete</h2>
            <p style={{ color: colors.text.secondary, marginBottom: spacing.xl }}>
              Are you sure you want to delete this budget? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingBudget(null)}
                style={{
                  flex: 1,
                  padding: `${spacing.sm} ${spacing.md}`,
                  border: `2px solid ${colors.border.default}`,
                  color: colors.text.primary,
                  fontWeight: typography.fontWeight.semibold,
                  borderRadius: borderRadius.lg,
                  backgroundColor: 'transparent',
                  transition: effects.transition.base
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bg.hover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteBudget(deletingBudget)}
                style={{
                  flex: 1,
                  padding: `${spacing.sm} ${spacing.md}`,
                  backgroundColor: colors.error,
                  color: colors.text.primary,
                  fontWeight: typography.fontWeight.semibold,
                  borderRadius: borderRadius.lg,
                  border: 'none',
                  transition: effects.transition.base
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header - Railway Style */}
        <div style={{ marginBottom: spacing['2xl'] }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 style={{
                fontSize: typography.fontSize['3xl'],
                fontWeight: typography.fontWeight.bold,
                color: colors.text.primary,
                marginBottom: spacing.xs
              }}>Budget Dashboard</h1>
              <p style={{ color: colors.text.secondary }}>Monitor budget health and utilization</p>
            </div>
            <div className="flex gap-3">
              <CleanupButton onComplete={fetchData} />
              <ExportButton budgets={budgets} />
              <button
                onClick={() => setShowAddModal(true)}
                style={{
                  padding: `${spacing.sm} ${spacing.md}`,
                  background: colors.brand.gradient,
                  color: colors.text.primary,
                  fontWeight: typography.fontWeight.medium,
                  borderRadius: borderRadius.md,
                  border: 'none',
                  transition: effects.transition.base,
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                + Add Budget
              </button>
            </div>
          </div>
        </div>

        {/* Rest of dashboard content - summary cards, health status, budgets table */}
        {/* (Keeping the same structure as before, adding action buttons to each row) */}

        {/* Summary Cards - Railway Style Glassmorphism */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div style={{
            ...effects.glass,
            backgroundColor: colors.bg.secondary,
            borderLeft: `4px solid ${colors.brand.primary}`,
            borderRadius: borderRadius.lg,
            padding: spacing.lg,
            boxShadow: effects.shadow.sm
          }}>
            <div style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.text.tertiary,
              marginBottom: spacing.xs
            }}>Total Budget</div>
            <div style={{
              fontSize: typography.fontSize['3xl'],
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary
            }}>
              ${stats.summary.totalBudget.toLocaleString()}
            </div>
          </div>
          <div style={{
            ...effects.glass,
            backgroundColor: colors.bg.secondary,
            borderLeft: `4px solid ${colors.info}`,
            borderRadius: borderRadius.lg,
            padding: spacing.lg,
            boxShadow: effects.shadow.sm
          }}>
            <div style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.text.tertiary,
              marginBottom: spacing.xs
            }}>Committed</div>
            <div style={{
              fontSize: typography.fontSize['3xl'],
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary
            }}>
              ${stats.summary.totalCommitted.toLocaleString()}
            </div>
          </div>
          <div style={{
            ...effects.glass,
            backgroundColor: colors.bg.secondary,
            borderLeft: `4px solid ${colors.warning}`,
            borderRadius: borderRadius.lg,
            padding: spacing.lg,
            boxShadow: effects.shadow.sm
          }}>
            <div style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.text.tertiary,
              marginBottom: spacing.xs
            }}>Reserved</div>
            <div style={{
              fontSize: typography.fontSize['3xl'],
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary
            }}>
              ${stats.summary.totalReserved.toLocaleString()}
            </div>
          </div>
          <div style={{
            ...effects.glass,
            backgroundColor: colors.bg.secondary,
            borderLeft: `4px solid ${colors.success}`,
            borderRadius: borderRadius.lg,
            padding: spacing.lg,
            boxShadow: effects.shadow.sm
          }}>
            <div style={{
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.text.tertiary,
              marginBottom: spacing.xs
            }}>Available</div>
            <div style={{
              fontSize: typography.fontSize['3xl'],
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary
            }}>
              ${stats.summary.totalAvailable.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Utilization Overview - Railway Style */}
        <div style={{
          ...effects.glass,
          backgroundColor: colors.bg.secondary,
          borderRadius: borderRadius.lg,
          padding: spacing.lg,
          marginBottom: spacing['2xl'],
          boxShadow: effects.shadow.sm
        }}>
          <h2 style={{
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text.primary,
            marginBottom: spacing.md
          }}>Overall Utilization</h2>
          <div className="flex items-center">
            <div className="flex-1 rounded-full h-8" style={{ backgroundColor: colors.bg.tertiary }}>
              <div
                className="h-8 rounded-full flex items-center justify-end pr-4"
                style={{
                  background: colors.brand.gradient,
                  width: `${Math.min(stats.summary.totalUtilizationPercent, 100)}%`,
                  transition: effects.transition.slow
                }}
              >
                <span style={{
                  color: colors.text.primary,
                  fontWeight: typography.fontWeight.bold,
                  fontSize: typography.fontSize.sm
                }}>
                  {stats.summary.totalUtilizationPercent.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Health Status - Railway Style */}
        <div style={{
          ...effects.glass,
          backgroundColor: colors.bg.secondary,
          borderRadius: borderRadius.lg,
          padding: spacing.lg,
          marginBottom: spacing['2xl'],
          boxShadow: effects.shadow.sm
        }}>
          <h2 style={{
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text.primary,
            marginBottom: spacing.lg
          }}>Budget Health Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg" style={{
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: `1px solid rgba(16, 185, 129, 0.3)`
            }}>
              <div style={{
                fontSize: typography.fontSize['3xl'],
                fontWeight: typography.fontWeight.bold,
                color: colors.success,
                marginBottom: spacing.xs
              }}>{stats.health.healthy}</div>
              <div style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.medium,
                color: colors.text.primary
              }}>Healthy</div>
              <div style={{
                fontSize: typography.fontSize.xs,
                color: colors.text.tertiary,
                marginTop: spacing.xs
              }}>&lt; 70% utilized</div>
            </div>
            <div className="text-center p-4 rounded-lg" style={{
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: `1px solid rgba(245, 158, 11, 0.3)`
            }}>
              <div style={{
                fontSize: typography.fontSize['3xl'],
                fontWeight: typography.fontWeight.bold,
                color: colors.warning,
                marginBottom: spacing.xs
              }}>{stats.health.warning}</div>
              <div style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.medium,
                color: colors.text.primary
              }}>Warning</div>
              <div style={{
                fontSize: typography.fontSize.xs,
                color: colors.text.tertiary,
                marginTop: spacing.xs
              }}>70-80% utilized</div>
            </div>
            <div className="text-center p-4 rounded-lg" style={{
              backgroundColor: 'rgba(249, 115, 22, 0.1)',
              border: `1px solid rgba(249, 115, 22, 0.3)`
            }}>
              <div style={{
                fontSize: typography.fontSize['3xl'],
                fontWeight: typography.fontWeight.bold,
                color: '#F97316',
                marginBottom: spacing.xs
              }}>{stats.health.highRisk}</div>
              <div style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.medium,
                color: colors.text.primary
              }}>High Risk</div>
              <div style={{
                fontSize: typography.fontSize.xs,
                color: colors.text.tertiary,
                marginTop: spacing.xs
              }}>80-90% utilized</div>
            </div>
            <div className="text-center p-4 rounded-lg" style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: `1px solid rgba(239, 68, 68, 0.3)`
            }}>
              <div style={{
                fontSize: typography.fontSize['3xl'],
                fontWeight: typography.fontWeight.bold,
                color: colors.error,
                marginBottom: spacing.xs
              }}>{stats.health.critical}</div>
              <div style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.medium,
                color: colors.text.primary
              }}>Critical</div>
              <div style={{
                fontSize: typography.fontSize.xs,
                color: colors.text.tertiary,
                marginTop: spacing.xs
              }}>&gt; 90% utilized</div>
            </div>
          </div>
        </div>

        {/* Critical Budgets - Railway Style */}
        {stats.criticalBudgets.length > 0 && (
          <div style={{
            ...effects.glass,
            backgroundColor: colors.bg.secondary,
            borderRadius: borderRadius.lg,
            padding: spacing.lg,
            marginBottom: spacing['2xl'],
            boxShadow: effects.shadow.sm
          }}>
            <h2 style={{
              fontSize: typography.fontSize.xl,
              fontWeight: typography.fontWeight.bold,
              color: colors.error,
              marginBottom: spacing.md,
              display: 'flex',
              alignItems: 'center'
            }}>
              <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Critical Budgets Requiring Attention
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border.default}` }}>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Department</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Sub-Category</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Total Budget</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Utilized</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Available</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.criticalBudgets.map((budget) => (
                    <tr key={budget.id} style={{
                      borderBottom: `1px solid ${colors.border.default}`,
                      transition: effects.transition.fast
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bg.hover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <td style={{
                        padding: spacing.md,
                        fontSize: typography.fontSize.sm,
                        fontWeight: typography.fontWeight.medium,
                        color: colors.text.primary
                      }}>
                        {budget.department}
                      </td>
                      <td style={{
                        padding: spacing.md,
                        fontSize: typography.fontSize.sm,
                        color: colors.text.secondary
                      }}>
                        {budget.subCategory || '-'}
                      </td>
                      <td style={{
                        padding: spacing.md,
                        fontSize: typography.fontSize.sm,
                        color: colors.text.primary
                      }}>
                        ${budget.totalBudget.toLocaleString()}
                      </td>
                      <td style={{
                        padding: spacing.md,
                        fontSize: typography.fontSize.sm,
                        color: colors.error,
                        fontWeight: typography.fontWeight.medium
                      }}>
                        ${budget.utilized.toLocaleString()}
                      </td>
                      <td style={{
                        padding: spacing.md,
                        fontSize: typography.fontSize.sm,
                        color: colors.text.primary
                      }}>
                        ${budget.available.toLocaleString()}
                      </td>
                      <td style={{ padding: spacing.md }}>
                        <div className="flex items-center">
                          <div className="w-24 rounded-full h-2 mr-2" style={{ backgroundColor: colors.bg.tertiary }}>
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${Math.min(budget.utilizationPercent, 100)}%`,
                                backgroundColor: colors.error
                              }}
                            ></div>
                          </div>
                          <span style={{
                            fontSize: typography.fontSize.sm,
                            fontWeight: typography.fontWeight.medium,
                            color: colors.error
                          }}>
                            {budget.utilizationPercent.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {stats.criticalBudgets.length === 0 && (
          <div style={{
            ...effects.glass,
            backgroundColor: colors.bg.secondary,
            borderRadius: borderRadius.lg,
            padding: spacing['3xl'],
            textAlign: 'center',
            marginBottom: spacing['2xl'],
            boxShadow: effects.shadow.sm
          }}>
            <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                 style={{ color: colors.success }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 style={{
              fontSize: typography.fontSize.xl,
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary,
              marginBottom: spacing.xs
            }}>All budgets are healthy!</h3>
            <p style={{ color: colors.text.secondary }}>No critical budget alerts at this time.</p>
          </div>
        )}

        {/* All Budgets Table with Inline Editing - Railway Style */}
        <div style={{
          ...effects.glass,
          backgroundColor: colors.bg.secondary,
          borderRadius: borderRadius.lg,
          overflow: 'hidden',
          boxShadow: effects.shadow.md
        }}>
          <div style={{
            padding: spacing.lg,
            borderBottom: `1px solid ${colors.border.default}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <h2 style={{
                fontSize: typography.fontSize.xl,
                fontWeight: typography.fontWeight.bold,
                color: colors.text.primary
              }}>All Budgets</h2>
              <p style={{
                fontSize: typography.fontSize.sm,
                color: colors.text.secondary,
                marginTop: spacing.xs
              }}>Click any cell to edit inline. Press Enter to save, Escape to cancel.</p>
            </div>
          </div>

          {budgets.length === 0 ? (
            <div style={{
              padding: spacing['3xl'],
              textAlign: 'center',
              color: colors.text.secondary
            }}>
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                   style={{ color: colors.text.tertiary }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p style={{
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.medium,
                marginBottom: spacing.xs,
                color: colors.text.primary
              }}>No budgets found</p>
              <p style={{ fontSize: typography.fontSize.sm }}>Click "Add Budget" to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border.default}` }}>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Department</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Sub-Category</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Period</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Currency</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Budgeted</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Committed</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Reserved</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Available</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'left',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Utilization</th>
                    <th style={{
                      padding: spacing.sm,
                      textAlign: 'right',
                      fontSize: typography.fontSize.xs,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.text.tertiary,
                      textTransform: 'uppercase'
                    }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {budgets.map((budget) => {
                    const committed = budget.utilization?.committedAmount || 0;
                    const reserved = budget.utilization?.reservedAmount || 0;
                    const available = budget.budgetedAmount - committed - reserved;
                    const utilization = ((committed + reserved) / budget.budgetedAmount) * 100;

                    const isEditingDept = editingCell?.budgetId === budget.id && editingCell?.field === 'department';
                    const isEditingSub = editingCell?.budgetId === budget.id && editingCell?.field === 'subCategory';
                    const isEditingPeriod = editingCell?.budgetId === budget.id && editingCell?.field === 'fiscalPeriod';
                    const isEditingAmount = editingCell?.budgetId === budget.id && editingCell?.field === 'budgetedAmount';

                    return (
                      <tr key={budget.id} style={{
                        borderBottom: `1px solid ${colors.border.default}`,
                        transition: effects.transition.fast
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bg.hover}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        {/* Department - Editable */}
                        <td style={{ padding: spacing.sm }}>
                          {isEditingDept ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={saveInlineEdit}
                              style={{
                                width: '100%',
                                padding: spacing.xs,
                                backgroundColor: colors.bg.tertiary,
                                border: `1px solid ${colors.border.focus}`,
                                borderRadius: borderRadius.sm,
                                color: colors.text.primary,
                                fontSize: typography.fontSize.sm,
                                outline: 'none'
                              }}
                            />
                          ) : (
                            <div
                              onClick={() => startEditing(budget.id, 'department', budget.department)}
                              style={{
                                padding: spacing.xs,
                                fontSize: typography.fontSize.sm,
                                fontWeight: typography.fontWeight.medium,
                                color: colors.text.primary,
                                cursor: 'pointer',
                                borderRadius: borderRadius.sm,
                                transition: effects.transition.fast
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bg.tertiary}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              {budget.department}
                            </div>
                          )}
                        </td>

                        {/* Sub-Category - Editable */}
                        <td style={{ padding: spacing.sm }}>
                          {isEditingSub ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={saveInlineEdit}
                              style={{
                                width: '100%',
                                padding: spacing.xs,
                                backgroundColor: colors.bg.tertiary,
                                border: `1px solid ${colors.border.focus}`,
                                borderRadius: borderRadius.sm,
                                color: colors.text.primary,
                                fontSize: typography.fontSize.sm,
                                outline: 'none'
                              }}
                            />
                          ) : (
                            <div
                              onClick={() => startEditing(budget.id, 'subCategory', budget.subCategory || '')}
                              style={{
                                padding: spacing.xs,
                                fontSize: typography.fontSize.sm,
                                color: colors.text.secondary,
                                cursor: 'pointer',
                                borderRadius: borderRadius.sm,
                                transition: effects.transition.fast
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bg.tertiary}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              {budget.subCategory || '-'}
                            </div>
                          )}
                        </td>

                        {/* Period - Editable */}
                        <td style={{ padding: spacing.sm }}>
                          {isEditingPeriod ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={saveInlineEdit}
                              style={{
                                width: '100%',
                                padding: spacing.xs,
                                backgroundColor: colors.bg.tertiary,
                                border: `1px solid ${colors.border.focus}`,
                                borderRadius: borderRadius.sm,
                                color: colors.text.primary,
                                fontSize: typography.fontSize.sm,
                                outline: 'none'
                              }}
                            />
                          ) : (
                            <div
                              onClick={() => startEditing(budget.id, 'fiscalPeriod', budget.fiscalPeriod)}
                              style={{
                                padding: spacing.xs,
                                fontSize: typography.fontSize.sm,
                                color: colors.text.secondary,
                                cursor: 'pointer',
                                borderRadius: borderRadius.sm,
                                transition: effects.transition.fast
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bg.tertiary}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              {budget.fiscalPeriod}
                            </div>
                          )}
                        </td>

                        {/* Currency - Read only */}
                        <td style={{
                          padding: spacing.md,
                          fontSize: typography.fontSize.sm,
                          color: colors.text.secondary
                        }}>
                          {budget.currency}
                        </td>

                        {/* Budgeted Amount - Editable */}
                        <td style={{ padding: spacing.sm }}>
                          {isEditingAmount ? (
                            <input
                              ref={editInputRef}
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={saveInlineEdit}
                              style={{
                                width: '100%',
                                padding: spacing.xs,
                                backgroundColor: colors.bg.tertiary,
                                border: `1px solid ${colors.border.focus}`,
                                borderRadius: borderRadius.sm,
                                color: colors.text.primary,
                                fontSize: typography.fontSize.sm,
                                outline: 'none'
                              }}
                            />
                          ) : (
                            <div
                              onClick={() => startEditing(budget.id, 'budgetedAmount', budget.budgetedAmount)}
                              style={{
                                padding: spacing.xs,
                                fontSize: typography.fontSize.sm,
                                color: colors.text.primary,
                                cursor: 'pointer',
                                borderRadius: borderRadius.sm,
                                transition: effects.transition.fast
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bg.tertiary}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              {budget.currency === 'GBP' ? '£' : '$'}{budget.budgetedAmount.toLocaleString()}
                            </div>
                          )}
                        </td>

                        {/* Committed - Read only */}
                        <td style={{
                          padding: spacing.md,
                          fontSize: typography.fontSize.sm,
                          color: colors.text.primary
                        }}>
                          {budget.currency === 'GBP' ? '£' : '$'}{committed.toLocaleString()}
                        </td>

                        {/* Reserved - Read only */}
                        <td style={{
                          padding: spacing.md,
                          fontSize: typography.fontSize.sm,
                          color: colors.warning,
                          fontWeight: typography.fontWeight.medium
                        }}>
                          {budget.currency === 'GBP' ? '£' : '$'}{reserved.toLocaleString()}
                        </td>

                        {/* Available - Read only */}
                        <td style={{
                          padding: spacing.md,
                          fontSize: typography.fontSize.sm,
                          color: colors.success,
                          fontWeight: typography.fontWeight.medium
                        }}>
                          {budget.currency === 'GBP' ? '£' : '$'}{available.toLocaleString()}
                        </td>

                        {/* Utilization */}
                        <td style={{ padding: spacing.md }}>
                          <div className="flex items-center">
                            <div className="w-20 rounded-full h-2 mr-2" style={{ backgroundColor: colors.bg.tertiary }}>
                              <div
                                className="h-2 rounded-full"
                                style={{
                                  width: `${Math.min(utilization, 100)}%`,
                                  backgroundColor:
                                    utilization >= 90 ? colors.error :
                                    utilization >= 80 ? '#F97316' :
                                    utilization >= 70 ? colors.warning :
                                    colors.success
                                }}
                              ></div>
                            </div>
                            <span style={{
                              fontSize: typography.fontSize.sm,
                              color: colors.text.primary,
                              fontWeight: typography.fontWeight.medium
                            }}>
                              {utilization.toFixed(0)}%
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: spacing.md }}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setReleasingBudget(budget)}
                              disabled={committed === 0 && reserved === 0}
                              style={{
                                color: colors.info,
                                opacity: committed === 0 && reserved === 0 ? 0.3 : 1,
                                cursor: committed === 0 && reserved === 0 ? 'not-allowed' : 'pointer',
                                background: 'none',
                                border: 'none',
                                padding: spacing.xs
                              }}
                              title={committed === 0 && reserved === 0 ? "No locked amounts to release" : "Release budget"}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeletingBudget(budget.id)}
                              disabled={committed > 0 || reserved > 0}
                              style={{
                                color: colors.error,
                                opacity: committed > 0 || reserved > 0 ? 0.3 : 1,
                                cursor: committed > 0 || reserved > 0 ? 'not-allowed' : 'pointer',
                                background: 'none',
                                border: 'none',
                                padding: spacing.xs
                              }}
                              title={committed > 0 || reserved > 0 ? "Cannot delete budget with commitments" : "Delete budget"}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
