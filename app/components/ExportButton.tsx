'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';

interface Budget {
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

export function ExportButton({ budgets }: { budgets: Budget[] }) {
  const [exporting, setExporting] = useState(false);

  function handleExport() {
    setExporting(true);

    try {
      // Prepare data for Excel
      const data = budgets.map((budget) => {
        const committed = budget.utilization?.committedAmount || 0;
        const reserved = budget.utilization?.reservedAmount || 0;
        const available = budget.budgetedAmount - committed - reserved;
        const utilization = ((committed + reserved) / budget.budgetedAmount) * 100;

        return {
          Department: budget.department,
          'Sub-Category': budget.subCategory || '',
          'Fiscal Period': budget.fiscalPeriod,
          'Budgeted Amount': budget.budgetedAmount,
          Currency: budget.currency,
          Committed: committed,
          Reserved: reserved,
          Available: available,
          'Utilization %': utilization.toFixed(2),
        };
      });

      // Create workbook
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Budgets');

      // Set column widths
      ws['!cols'] = [
        { wch: 15 }, // Department
        { wch: 15 }, // Sub-Category
        { wch: 12 }, // Fiscal Period
        { wch: 15 }, // Budgeted Amount
        { wch: 8 },  // Currency
        { wch: 12 }, // Committed
        { wch: 12 }, // Reserved
        { wch: 12 }, // Available
        { wch: 12 }, // Utilization %
      ];

      // Generate file name with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `budgets-${timestamp}.xlsx`;

      // Download
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export budgets');
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting || budgets.length === 0}
      className="inline-flex items-center px-4 py-2 bg-white border-2 border-gray-200 text-gray-700 font-medium rounded-lg hover:border-pink-500 hover:text-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {exporting ? (
        <>
          <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Exporting...
        </>
      ) : (
        <>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export to Excel
        </>
      )}
    </button>
  );
}
