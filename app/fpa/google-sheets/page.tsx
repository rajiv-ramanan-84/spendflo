'use client';

import { useState, useEffect } from 'react';
import { ToastContainer, ToastProps } from '@/app/components/Toast';

interface Spreadsheet {
  id: string;
  name: string;
  modifiedTime: string;
}

interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: number;
  reason: string;
  sampleValues: string[];
}

interface ReadResponse {
  success: boolean;
  spreadsheetId?: string;
  availableSheets?: string[];
  sheetName?: string;
  totalRows?: number;
  totalColumns?: number;
  mappings?: ColumnMapping[];
  unmappedColumns?: string[];
  requiredFieldsMissing?: string[];
  canProceed?: boolean;
  message?: string;
}

export default function GoogleSheetsImportPage() {
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([]);
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<string>('');
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [readResponse, setReadResponse] = useState<ReadResponse | null>(null);
  const [importing, setImporting] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [customerId, setCustomerId] = useState<string>('');
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    initializeUser();
    checkUrlParams();
  }, []);

  function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');

    if (success === 'true') {
      addToast('success', 'Connected!', 'Google Sheets connected successfully');
      // Clear URL params
      window.history.replaceState({}, '', '/fpa/google-sheets');
      // Refresh connection status
      setTimeout(() => {
        if (userId) checkConnection(userId);
      }, 1000);
    } else if (error) {
      const errorMessages: Record<string, string> = {
        access_denied: 'You denied access to Google Sheets',
        invalid_callback: 'Invalid OAuth callback parameters',
        token_exchange_failed: 'Failed to exchange authorization code',
        callback_error: 'An error occurred during OAuth callback',
      };
      addToast('error', 'Connection failed', errorMessages[error] || 'Unknown error');
      // Clear URL params
      window.history.replaceState({}, '', '/fpa/google-sheets');
    }
  }

  async function initializeUser() {
    try {
      // Get or create a default user and customer
      const res = await fetch('/api/seed');
      const data = await res.json();

      if (data.customer && data.users) {
        setCustomerId(data.customer.id);
        // Use the first user (should be the FP&A user)
        setUserId(data.users[0].id);

        // Now check connection
        await checkConnection(data.users[0].id);
      }
    } catch (error) {
      console.error('Failed to initialize user:', error);
      addToast('error', 'Initialization failed', 'Please refresh the page');
    } finally {
      setInitializing(false);
    }
  }

  async function checkConnection(userIdToCheck?: string) {
    const uid = userIdToCheck || userId;
    if (!uid) return;

    try {
      const res = await fetch(`/api/google-sheets/list?userId=${uid}`);
      const data = await res.json();

      if (data.success) {
        setConnected(true);
        setSpreadsheets(data.spreadsheets || []);
      }
    } catch (error) {
      // Not connected yet
      setConnected(false);
    }
  }

  async function handleConnect() {
    if (!userId || !customerId) {
      addToast('error', 'Not ready', 'Please wait for initialization to complete');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/google-sheets/auth?userId=${userId}&customerId=${customerId}`);
      const data = await res.json();

      if (data.success && data.authUrl) {
        // Open OAuth flow in new window
        window.location.href = data.authUrl;
      } else {
        addToast('error', 'Failed to initiate connection', data.error);
      }
    } catch (error: any) {
      addToast('error', 'Connection failed', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSpreadsheetSelect(spreadsheetId: string) {
    setSelectedSpreadsheet(spreadsheetId);
    setSelectedSheet('');
    setAvailableSheets([]);
    setMappings([]);
    setReadResponse(null);

    // Get available sheets
    try {
      setLoading(true);
      const res = await fetch('/api/google-sheets/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          spreadsheetId,
        }),
      });

      const data = await res.json();

      if (data.success && data.availableSheets) {
        setAvailableSheets(data.availableSheets);
        addToast('success', 'Sheets loaded', `Found ${data.availableSheets.length} sheet(s)`);
      }
    } catch (error: any) {
      addToast('error', 'Failed to load sheets', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSheetSelect(sheetName: string) {
    setSelectedSheet(sheetName);

    try {
      setLoading(true);
      const res = await fetch('/api/google-sheets/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          spreadsheetId: selectedSpreadsheet,
          sheetName,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setReadResponse(data);
        setMappings(data.mappings || []);
        addToast('success', 'AI Mapping Complete', `Mapped ${data.mappings?.length || 0} columns`);
      } else {
        addToast('error', 'Failed to read sheet', data.error);
      }
    } catch (error: any) {
      addToast('error', 'Failed to read sheet', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!readResponse?.canProceed) {
      addToast('error', 'Cannot import', 'Please fix required field mappings first');
      return;
    }

    try {
      setImporting(true);
      const selectedSpreadsheetObj = spreadsheets.find(s => s.id === selectedSpreadsheet);

      const res = await fetch('/api/google-sheets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          customerId,
          spreadsheetId: selectedSpreadsheet,
          sheetName: selectedSheet,
          spreadsheetName: selectedSpreadsheetObj?.name || 'Unknown',
          mappings: mappings.map(m => ({
            sourceColumn: m.sourceColumn,
            targetField: m.targetField,
          })),
        }),
      });

      const data = await res.json();

      if (data.success) {
        addToast('success', 'Import Complete', `Imported ${data.successCount} budgets successfully`);

        // Reset form
        setSelectedSpreadsheet('');
        setSelectedSheet('');
        setAvailableSheets([]);
        setMappings([]);
        setReadResponse(null);
      } else {
        addToast('error', 'Import failed', data.error);
      }
    } catch (error: any) {
      addToast('error', 'Import failed', error.message);
    } finally {
      setImporting(false);
    }
  }

  function addToast(type: ToastProps['type'], message: string, description?: string) {
    const id = Math.random().toString(36);
    setToasts((prev) => [...prev, { id, type, message, description, onClose: removeToast }]);
  }

  function removeToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  if (initializing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Google Sheets Import</h1>
              <p className="mt-2 text-gray-600">Import budgets directly from Google Sheets</p>
            </div>
            <a
              href="/"
              className="px-4 py-2 text-gray-600 hover:text-pink-600 transition-colors"
            >
              ← Back to Home
            </a>
          </div>
        </div>

        {/* Connection Status */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-3 ${connected ? 'bg-green-500' : 'bg-gray-300'}`}></div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {connected ? 'Google Sheets Connected' : 'Google Sheets Not Connected'}
                </h2>
                <p className="text-sm text-gray-600">
                  {connected ? 'You can import from your Google Sheets' : 'Connect to access your spreadsheets'}
                </p>
              </div>
            </div>

            {!connected && (
              <button
                onClick={handleConnect}
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-semibold rounded-xl hover:from-pink-600 hover:to-pink-700 transition-all disabled:opacity-50"
              >
                {loading ? 'Connecting...' : 'Connect Google Sheets'}
              </button>
            )}
          </div>
        </div>

        {connected && (
          <>
            {/* Step 1: Select Spreadsheet */}
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Step 1: Select Spreadsheet</h2>

              {spreadsheets.length === 0 ? (
                <p className="text-gray-600">No spreadsheets found in your Google Drive</p>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {spreadsheets.map((sheet) => (
                    <button
                      key={sheet.id}
                      onClick={() => handleSpreadsheetSelect(sheet.id)}
                      className={`p-4 border-2 rounded-xl text-left transition-all ${
                        selectedSpreadsheet === sheet.id
                          ? 'border-pink-500 bg-pink-50'
                          : 'border-gray-200 hover:border-pink-300'
                      }`}
                    >
                      <div className="font-semibold text-gray-900">{sheet.name}</div>
                      <div className="text-sm text-gray-500">
                        Modified: {new Date(sheet.modifiedTime).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Select Sheet */}
            {availableSheets.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Step 2: Select Sheet</h2>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {availableSheets.map((sheet) => (
                    <button
                      key={sheet}
                      onClick={() => handleSheetSelect(sheet)}
                      className={`p-4 border-2 rounded-xl transition-all ${
                        selectedSheet === sheet
                          ? 'border-pink-500 bg-pink-50 text-pink-700'
                          : 'border-gray-200 hover:border-pink-300 text-gray-700'
                      }`}
                    >
                      {sheet}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Review AI Mappings */}
            {readResponse && mappings.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Step 3: Review AI Mappings</h2>

                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900">
                    AI detected <strong>{readResponse.totalRows} rows</strong> and{' '}
                    <strong>{readResponse.totalColumns} columns</strong>
                  </p>
                  {readResponse.requiredFieldsMissing && readResponse.requiredFieldsMissing.length > 0 && (
                    <p className="text-sm text-red-700 mt-2">
                      ⚠️ Missing required fields: {readResponse.requiredFieldsMissing.join(', ')}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  {mappings.map((mapping, idx) => (
                    <div
                      key={idx}
                      className="p-4 border-2 border-green-200 bg-green-50 rounded-xl"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center">
                            <span className="font-semibold text-gray-900">{mapping.sourceColumn}</span>
                            <svg className="w-5 h-5 mx-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                            <span className="font-semibold text-pink-600">{mapping.targetField}</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{mapping.reason}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Sample: {mapping.sampleValues.slice(0, 3).join(', ')}
                          </p>
                        </div>
                        <div className="ml-4">
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                            {(mapping.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {readResponse.unmappedColumns && readResponse.unmappedColumns.length > 0 && (
                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-900">
                      Unmapped columns: {readResponse.unmappedColumns.join(', ')}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleImport}
                  disabled={!readResponse.canProceed || importing}
                  className="mt-6 w-full px-6 py-3 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-semibold rounded-xl hover:from-pink-600 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Importing...
                    </span>
                  ) : (
                    'Import Budgets'
                  )}
                </button>
              </div>
            )}
          </>
        )}

        {/* Documentation */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">How to Use</h2>
          <ol className="space-y-3 text-sm text-gray-700">
            <li className="flex items-start">
              <span className="font-bold text-pink-600 mr-3">1.</span>
              <span>Click "Connect Google Sheets" and grant permission to access your spreadsheets</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-pink-600 mr-3">2.</span>
              <span>Select the spreadsheet containing your budget data</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-pink-600 mr-3">3.</span>
              <span>Choose the specific sheet to import</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-pink-600 mr-3">4.</span>
              <span>Review AI-suggested column mappings</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-pink-600 mr-3">5.</span>
              <span>Click "Import Budgets" to complete the import</span>
            </li>
          </ol>

          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              <strong>Required columns:</strong> Department, FiscalPeriod, BudgetedAmount, Currency
            </p>
            <p className="text-sm text-blue-700 mt-1">
              The AI mapping engine will automatically detect these columns even if they have different names.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
