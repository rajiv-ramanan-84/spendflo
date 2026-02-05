'use client';

/**
 * Budget Sync Admin Dashboard
 *
 * Test UI for:
 * - Configuring sync sources
 * - Triggering manual syncs
 * - Viewing sync history
 * - Uploading test files
 */

import { useState, useEffect } from 'react';

interface SyncConfig {
  id: string;
  sourceType: string;
  enabled: boolean;
  frequency: string;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  nextSyncAt?: string;
}

interface SyncHistoryItem {
  id: string;
  syncId: string;
  status: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  stats: {
    totalRows: number;
    created: number;
    updated: number;
    unchanged: number;
    softDeleted: number;
    errors: number;
  };
  sourceType: string;
  triggeredBy: string;
}

export default function BudgetSyncDashboard() {
  const [customerId, setCustomerId] = useState('test_customer_123');
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [history, setHistory] = useState<SyncHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Form state for new config
  const [sourceType, setSourceType] = useState('sftp');
  const [frequency, setFrequency] = useState('every_4_hours');
  const [sftpHost, setSftpHost] = useState('');
  const [sftpUser, setSftpUser] = useState('');
  const [sftpPassword, setSftpPassword] = useState('');
  const [sftpPath, setSftpPath] = useState('/uploads/budgets/');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadConfigs();
    loadHistory();
  }, [customerId]);

  const loadConfigs = async () => {
    try {
      const res = await fetch(`/api/sync/config?customerId=${customerId}`);
      const data = await res.json();
      setConfigs(data.configs || []);
    } catch (error) {
      console.error('Failed to load configs:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await fetch(`/api/sync/history?customerId=${customerId}&limit=20`);
      const data = await res.json();
      setHistory(data.history || []);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const createConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/sync/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          sourceType,
          enabled: true,
          frequency,
          sourceConfig: {
            host: sftpHost,
            port: 22,
            username: sftpUser,
            password: sftpPassword,
            remotePath: sftpPath
          }
        })
      });

      const data = await res.json();
      if (data.success) {
        setMessage('✅ Configuration created successfully');
        loadConfigs();
        // Reset form
        setSftpHost('');
        setSftpUser('');
        setSftpPassword('');
      } else {
        setMessage('❌ ' + (data.error || 'Failed to create configuration'));
      }
    } catch (error) {
      setMessage('❌ Error: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setMessage('❌ Please select a file first');
      return;
    }

    setUploading(true);
    setMessage('');

    try {
      // Step 1: Upload file
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('customerId', customerId);

      const uploadRes = await fetch('/api/sync/upload', {
        method: 'POST',
        body: formData
      });

      const uploadData = await uploadRes.json();
      if (!uploadData.success) {
        setMessage('❌ Upload failed: ' + (uploadData.error || 'Unknown error'));
        setUploading(false);
        return;
      }

      setMessage('✅ File uploaded: ' + uploadData.fileName);

      // Step 2: Trigger direct sync (bypasses scheduler, works for uploads)
      setTimeout(async () => {
        const syncRes = await fetch('/api/sync/direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId,
            fileName: uploadData.fileName
          })
        });

        const syncData = await syncRes.json();
        if (syncData.success) {
          setMessage('✅ File uploaded and sync triggered successfully! Check history below.');
          setUploadFile(null);
          setTimeout(() => loadHistory(), 2000);
        } else {
          setMessage('⚠️ File uploaded but sync failed: ' + (syncData.error || 'Unknown error'));
        }
        setUploading(false);
      }, 1000);

    } catch (error) {
      setMessage('❌ Error: ' + (error as Error).message);
      setUploading(false);
    }
  };

  const triggerSync = async () => {
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/sync/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId })
      });

      const data = await res.json();
      if (data.success) {
        setMessage('✅ Sync triggered successfully');
        setTimeout(() => loadHistory(), 2000); // Reload history after 2 seconds
      } else {
        setMessage('❌ ' + (data.error || 'Failed to trigger sync'));
      }
    } catch (error) {
      setMessage('❌ Error: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'partial': return 'text-yellow-600';
      case 'failed': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Budget Sync Admin Dashboard
        </h1>

        {/* Message Banner */}
        {message && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            {message}
          </div>
        )}

        {/* Customer ID Selector */}
        <div className="mb-8 bg-white p-6 rounded-lg shadow">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Customer ID
          </label>
          <input
            type="text"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter customer ID"
          />
        </div>

        {/* Quick Upload & Sync - No Config Needed */}
        <div className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg shadow-lg border-2 border-blue-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Quick Upload & Sync
          </h2>
          <p className="text-gray-600 mb-6">
            Upload a budget file and sync immediately. No configuration required!
          </p>

          <form onSubmit={handleFileUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Budget File (CSV or Excel)
              </label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-white focus:outline-none p-2"
              />
              {uploadFile && (
                <p className="mt-2 text-sm text-gray-600">
                  Selected: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={uploading || !uploadFile}
              className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-bold text-lg shadow-md"
            >
              {uploading ? 'Uploading & Syncing...' : 'Upload & Sync Now'}
            </button>
          </form>
        </div>

        {/* Divider */}
        <div className="mb-8 flex items-center">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="px-4 text-gray-500 font-medium">Advanced: Automated Syncs</span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Create New Sync Config */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Configure Automated Sync (SFTP/S3)
            </h2>
            <form onSubmit={createConfig} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source Type
                </label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="sftp">SFTP</option>
                  <option value="s3">Amazon S3</option>
                  <option value="upload">Manual Upload</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sync Frequency
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="hourly">Hourly</option>
                  <option value="every_4_hours">Every 4 Hours (Recommended)</option>
                  <option value="every_12_hours">Every 12 Hours</option>
                  <option value="daily">Daily</option>
                  <option value="manual">Manual Only</option>
                </select>
              </div>

              {sourceType === 'sftp' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SFTP Host
                    </label>
                    <input
                      type="text"
                      value={sftpHost}
                      onChange={(e) => setSftpHost(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      placeholder="sftp.example.com"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={sftpUser}
                      onChange={(e) => setSftpUser(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      placeholder="username"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      value={sftpPassword}
                      onChange={(e) => setSftpPassword(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      placeholder="••••••••"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Remote Path
                    </label>
                    <input
                      type="text"
                      value={sftpPath}
                      onChange={(e) => setSftpPath(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      placeholder="/uploads/budgets/"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'Creating...' : 'Create Configuration'}
              </button>
            </form>
          </div>

          {/* Existing Configs */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Sync Configurations
            </h2>
            {configs.length === 0 ? (
              <p className="text-gray-500">No configurations found</p>
            ) : (
              <div className="space-y-4">
                {configs.map((config) => (
                  <div key={config.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          {config.sourceType}
                        </span>
                        <span className="ml-2 text-xs text-gray-500">
                          {config.frequency}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${config.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {config.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    {config.lastSyncAt && (
                      <div className="text-xs text-gray-600">
                        Last sync: {formatDate(config.lastSyncAt)}
                        <span className={`ml-2 ${getStatusColor(config.lastSyncStatus || '')}`}>
                          ({config.lastSyncStatus})
                        </span>
                      </div>
                    )}
                    {config.nextSyncAt && (
                      <div className="text-xs text-gray-600">
                        Next sync: {formatDate(config.nextSyncAt)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Manual Trigger for Configured Syncs */}
        <div className="mb-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Manual Trigger (for Configured Sources)
          </h2>
          <p className="text-gray-600 mb-4">
            Trigger a sync for files already uploaded via SFTP/S3, or check for existing files in the upload directory.
          </p>

          <button
            type="button"
            onClick={triggerSync}
            disabled={loading}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Syncing...' : 'Sync Existing Files'}
          </button>
        </div>

        {/* Sync History */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Sync History
          </h2>
          {history.length === 0 ? (
            <p className="text-gray-500">No sync history found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stats
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(item.startTime)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${getStatusColor(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {(item.durationMs / 1000).toFixed(1)}s
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="space-y-1">
                          <div>Total: {item.stats.totalRows}</div>
                          <div className="text-xs">
                            Created: {item.stats.created} |
                            Updated: {item.stats.updated} |
                            Errors: {item.stats.errors}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.sourceType}
                        <div className="text-xs text-gray-400">
                          {item.triggeredBy}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
