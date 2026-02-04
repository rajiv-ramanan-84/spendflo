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
  headers?: string[];
  sampleRows?: any[][];
}

interface SourceColumn {
  name: string;
  samples: string[];
  mappedTo: string | null;
  aiSuggestion?: string;
  confidence?: number;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [showMappingInterface, setShowMappingInterface] = useState(false);
  const [sourceColumns, setSourceColumns] = useState<SourceColumn[]>([]);
  const [finalMappings, setFinalMappings] = useState<ColumnMapping[]>([]);

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
      // Clear URL params and reload to refresh connection status
      window.history.replaceState({}, '', '/fpa/google-sheets');
      // Simple page reload to refresh all state
      setTimeout(() => {
        window.location.reload();
      }, 1500);
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

        // Prepare source columns for visual mapping
        const headers = data.headers || [];
        const sampleRows = data.sampleRows || [];
        const aiMappings = data.mappings || [];

        const columns: SourceColumn[] = headers.map((header: string, idx: number) => {
          const samples = sampleRows.map((row: any[]) => row[idx]).filter(Boolean).slice(0, 3);
          const aiMapping = aiMappings.find((m: ColumnMapping) => m.sourceColumn === header);

          return {
            name: header,
            samples,
            mappedTo: aiMapping ? aiMapping.targetField : null,
            aiSuggestion: aiMapping?.targetField,
            confidence: aiMapping?.confidence,
          };
        });

        setSourceColumns(columns);
        setShowMappingInterface(true);
        addToast('success', 'Sheet Loaded', `Found ${headers.length} columns`);
      } else {
        addToast('error', 'Failed to read sheet', data.error);
      }
    } catch (error: any) {
      addToast('error', 'Failed to read sheet', error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleColumnMappingChange(columnName: string, targetField: string) {
    setSourceColumns(prev => prev.map(col =>
      col.name === columnName ? { ...col, mappedTo: targetField || null } : col
    ));
  }

  function handleConfirmMappings() {
    // Convert sourceColumns to final mappings format
    const confirmedMappings: ColumnMapping[] = sourceColumns
      .filter(col => col.mappedTo)
      .map(col => ({
        sourceColumn: col.name,
        targetField: col.mappedTo!,
        confidence: col.confidence || 1.0,
        reason: col.aiSuggestion === col.mappedTo
          ? `AI suggestion (${Math.round((col.confidence || 0) * 100)}% confidence)`
          : 'Manually mapped',
        sampleValues: col.samples,
      }));

    setFinalMappings(confirmedMappings);
    setMappings(confirmedMappings);
    setShowMappingInterface(false);
    addToast('success', 'Mappings Confirmed', `${confirmedMappings.length} columns mapped`);
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
          actorId: userId,
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
        setShowMappingInterface(false);
        setSourceColumns([]);
        setFinalMappings([]);
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

  const filteredSpreadsheets = spreadsheets.filter((sheet) =>
    sheet.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Step 1: Select Spreadsheet</h2>
                <div className="text-sm text-gray-600">
                  {spreadsheets.length} spreadsheet{spreadsheets.length !== 1 ? 's' : ''} found
                </div>
              </div>

              {spreadsheets.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-600 mb-4">No spreadsheets found in your Google Drive</p>
                  <a
                    href="https://sheets.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-pink-600 hover:text-pink-700 font-medium"
                  >
                    Create a new spreadsheet
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              ) : (
                <>
                  {/* Search Bar */}
                  <div className="mb-4">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search spreadsheets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-pink-500 focus:ring-0 transition-colors"
                      />
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {searchQuery && (
                      <div className="mt-2 text-sm text-gray-600">
                        Found {filteredSpreadsheets.length} result{filteredSpreadsheets.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  {/* Spreadsheet List */}
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {filteredSpreadsheets.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        No spreadsheets match "{searchQuery}"
                      </div>
                    ) : (
                      filteredSpreadsheets.map((sheet) => (
                        <button
                          key={sheet.id}
                          onClick={() => handleSpreadsheetSelect(sheet.id)}
                          className={`w-full p-4 border-2 rounded-xl text-left transition-all group ${
                            selectedSpreadsheet === sheet.id
                              ? 'border-pink-500 bg-pink-50 shadow-sm'
                              : 'border-gray-200 hover:border-pink-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start">
                            <div className="flex-shrink-0 mt-1">
                              <svg className={`w-8 h-8 ${selectedSpreadsheet === sheet.id ? 'text-pink-600' : 'text-green-600'}`} fill="currentColor" viewBox="0 0 24 24">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                                <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/>
                              </svg>
                            </div>
                            <div className="ml-4 flex-1">
                              <div className="font-semibold text-gray-900 group-hover:text-pink-600">
                                {sheet.name}
                              </div>
                              <div className="text-sm text-gray-500 mt-1">
                                Modified {new Date(sheet.modifiedTime).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            </div>
                            {selectedSpreadsheet === sheet.id && (
                              <div className="flex-shrink-0 ml-4">
                                <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
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

            {/* Visual Mapping Interface */}
            {showMappingInterface && sourceColumns.length > 0 && (
              <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl p-8 mb-6 border border-gray-700">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Column Mapping</h2>
                    <p className="text-gray-400">Connect your data to budget fields</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowMappingInterface(false);
                      setSourceColumns([]);
                    }}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Progress Stats */}
                {(() => {
                  const REQUIRED_FIELDS = ['department', 'fiscalPeriod', 'budgetedAmount'];
                  const mappedFields = sourceColumns.filter(col => col.mappedTo).map(col => col.mappedTo);
                  const mappedRequired = REQUIRED_FIELDS.filter(field => mappedFields.includes(field));
                  const totalMapped = sourceColumns.filter(col => col.mappedTo).length;

                  return (
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                        <div className="text-2xl font-bold text-white">{totalMapped}/{sourceColumns.length}</div>
                        <div className="text-sm text-gray-400 mt-1">Total Mapped</div>
                      </div>
                      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                        <div className="text-2xl font-bold text-green-400">{mappedRequired.length}/3</div>
                        <div className="text-sm text-gray-400 mt-1">Required Fields</div>
                      </div>
                      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                        <div className="text-2xl font-bold text-purple-400">
                          {sourceColumns.filter(col => col.aiSuggestion && col.mappedTo === col.aiSuggestion).length}
                        </div>
                        <div className="text-sm text-gray-400 mt-1">AI Mapped</div>
                      </div>
                    </div>
                  );
                })()}

                {/* Mapping List - Single flowing interface */}
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                  {sourceColumns.map((column, idx) => {
                    const TARGET_FIELD_INFO: Record<string, { label: string; required: boolean; color: string }> = {
                      department: { label: 'Department', required: true, color: 'blue' },
                      subCategory: { label: 'Sub-Category', required: false, color: 'purple' },
                      fiscalPeriod: { label: 'Fiscal Period', required: true, color: 'green' },
                      budgetedAmount: { label: 'Budgeted Amount', required: true, color: 'orange' },
                      currency: { label: 'Currency', required: false, color: 'gray' },
                    };

                    const targetInfo = column.mappedTo ? TARGET_FIELD_INFO[column.mappedTo] : null;

                    return (
                      <div
                        key={column.name}
                        className={`relative overflow-hidden rounded-xl border-2 transition-all ${
                          column.mappedTo
                            ? 'border-green-500/50 bg-gradient-to-r from-gray-800 to-green-900/20'
                            : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                        }`}
                      >
                        <div className="p-4">
                          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                            {/* Source Column */}
                            <div className="text-left">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                                <div className="font-bold text-white">{column.name}</div>
                              </div>
                              <div className="text-xs text-gray-400 ml-4">
                                {column.samples.slice(0, 2).join(', ') || 'No data'}
                              </div>
                              {column.aiSuggestion && (
                                <div className="mt-2 ml-4">
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                    AI suggests: {TARGET_FIELD_INFO[column.aiSuggestion]?.label}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Arrow Connector */}
                            <div className="flex items-center justify-center">
                              {column.mappedTo ? (
                                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                              ) : (
                                <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                            </div>

                            {/* Target Field Selector */}
                            <div className="text-left">
                              <select
                                value={column.mappedTo || ''}
                                onChange={(e) => handleColumnMappingChange(column.name, e.target.value)}
                                className={`w-full px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                                  column.mappedTo
                                    ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white border-2 border-pink-400'
                                    : 'bg-gray-700 text-gray-300 border-2 border-gray-600 hover:border-gray-500'
                                } focus:outline-none focus:ring-2 focus:ring-pink-500`}
                              >
                                <option value="" className="bg-gray-800">— Select Target Field —</option>
                                <option value="department" className="bg-gray-800">Department (required)</option>
                                <option value="subCategory" className="bg-gray-800">Sub-Category</option>
                                <option value="fiscalPeriod" className="bg-gray-800">Fiscal Period (required)</option>
                                <option value="budgetedAmount" className="bg-gray-800">Budgeted Amount (required)</option>
                                <option value="currency" className="bg-gray-800">Currency</option>
                              </select>
                              {targetInfo && (
                                <div className="flex items-center gap-2 mt-2">
                                  <div className={`w-2 h-2 rounded-full ${
                                    targetInfo.required ? 'bg-red-400' : 'bg-gray-500'
                                  }`}></div>
                                  <span className="text-xs text-gray-400">
                                    {targetInfo.required ? 'Required field' : 'Optional field'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* AI confidence indicator */}
                        {column.aiSuggestion && column.mappedTo === column.aiSuggestion && (
                          <div className="absolute top-0 right-0">
                            <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-xl">
                              AI {Math.round((column.confidence || 0) * 100)}%
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Validation Message */}
                {(() => {
                  const REQUIRED_FIELDS = ['department', 'fiscalPeriod', 'budgetedAmount'];
                  const mappedFields = sourceColumns.filter(col => col.mappedTo).map(col => col.mappedTo);
                  const mappedRequired = REQUIRED_FIELDS.filter(field => mappedFields.includes(field));
                  const missingRequired = REQUIRED_FIELDS.filter(field => !mappedFields.includes(field));
                  const canProceed = mappedRequired.length === REQUIRED_FIELDS.length;

                  return !canProceed ? (
                    <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                      <div className="flex items-start gap-3">
                        <svg className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <div>
                          <div className="font-bold text-red-400 mb-1">Missing Required Fields</div>
                          <div className="text-sm text-red-300">
                            Please map: {missingRequired.join(', ')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                      <div className="flex items-start gap-3">
                        <svg className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <div>
                          <div className="font-bold text-green-400 mb-1">Ready to Import</div>
                          <div className="text-sm text-green-300">
                            All required fields are mapped. Click "Confirm Mappings" to proceed.
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-gray-700">
                  <button
                    onClick={() => {
                      setShowMappingInterface(false);
                      setSourceColumns([]);
                    }}
                    className="px-6 py-3 bg-gray-700 text-gray-300 font-semibold rounded-xl hover:bg-gray-600 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmMappings}
                    disabled={(() => {
                      const REQUIRED_FIELDS = ['department', 'fiscalPeriod', 'budgetedAmount'];
                      const mappedFields = sourceColumns.filter(col => col.mappedTo).map(col => col.mappedTo);
                      const mappedRequired = REQUIRED_FIELDS.filter(field => mappedFields.includes(field));
                      return mappedRequired.length !== REQUIRED_FIELDS.length;
                    })()}
                    className="px-8 py-3 bg-gradient-to-r from-pink-500 to-pink-600 text-white font-bold rounded-xl hover:from-pink-600 hover:to-pink-700 transition-all shadow-lg shadow-pink-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    Confirm Mappings →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Review AI Mappings */}
            {!showMappingInterface && readResponse && mappings.length > 0 && (
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
