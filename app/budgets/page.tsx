import { prisma } from '@/lib/prisma';

async function getBudgets() {
  try {
    console.log('[Budgets Page] Fetching budgets...');
    const budgets = await prisma.budget.findMany({
      include: {
        utilization: true,
        customer: true,
      },
      orderBy: {
        department: 'asc',
      },
    });
    console.log('[Budgets Page] Found budgets:', budgets.length);
    return budgets;
  } catch (error) {
    console.error('[Budgets Page] Error fetching budgets:', error);
    return [];
  }
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BudgetsPage() {
  const budgets = await getBudgets();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Budget Management</h1>
            <p className="mt-2 text-gray-600">
              View and manage budgets across all departments
            </p>
          </div>
          <a
            href="/fpa/upload"
            className="px-4 py-2 bg-gradient-to-r from-pink-500 to-pink-600 text-white rounded-lg hover:from-pink-600 hover:to-pink-700 transition"
          >
            {budgets.length === 0 ? 'Add Budgets' : 'Modify Budgets'}
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500 mb-1">
              Total Budgets
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {budgets.length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500 mb-1">
              Total Allocated
            </div>
            <div className="text-3xl font-bold text-gray-900">
              ${budgets.reduce((sum: number, b: any) => sum + b.budgetedAmount, 0).toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500 mb-1">
              Avg Utilization
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {budgets.length > 0
                ? Math.round(
                    budgets.reduce((sum: number, b: any) => {
                      const util = b.utilization
                        ? (b.utilization.committedAmount / b.budgetedAmount) * 100
                        : 0;
                      return sum + util;
                    }, 0) / budgets.length
                  )
                : 0}%
            </div>
          </div>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sub-category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Budgeted
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Committed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Available
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Utilization
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {budgets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <div className="text-lg mb-2">No budgets found</div>
                    <div className="text-sm">
                      Click "Add Budget" to create your first budget
                    </div>
                  </td>
                </tr>
              ) : (
                budgets.map((budget: any) => {
                  const committed = budget.utilization?.committedAmount || 0;
                  const available = budget.budgetedAmount - committed;
                  const utilization = (committed / budget.budgetedAmount) * 100;

                  return (
                    <tr key={budget.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {budget.department}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {budget.subCategory || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {budget.fiscalPeriod}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${budget.budgetedAmount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${committed.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                        ${available.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className={`h-2 rounded-full ${
                                utilization >= 90
                                  ? 'bg-red-500'
                                  : utilization >= 75
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(utilization, 100)}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-700">
                            {utilization.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
