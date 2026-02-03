'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import EmptyState from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import Toast from '@/components/ui/Toast';
import { formatDate, copyToClipboard, cn } from '@/lib/design/utils';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  permissions: string[];
  usageCount: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdBy: {
    name: string;
    email: string;
  };
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ show: boolean; message: string; variant: 'success' | 'error' }>({
    show: false,
    message: '',
    variant: 'success',
  });

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    permissions: [] as string[],
    expiresInDays: 0,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Mock customer and user IDs
  const customerId = 'test_customer';
  const userId = 'test_user';

  const availablePermissions = [
    { id: 'budget.read', label: 'Read Budgets', description: 'View budget data' },
    { id: 'budget.create', label: 'Create Budgets', description: 'Create new budgets' },
    { id: 'budget.update', label: 'Update Budgets', description: 'Modify existing budgets' },
    { id: 'budget.delete', label: 'Delete Budgets', description: 'Remove budgets' },
    { id: 'request.read', label: 'Read Requests', description: 'View budget requests' },
    { id: 'request.create', label: 'Create Requests', description: 'Submit budget requests' },
    { id: 'request.approve', label: 'Approve Requests', description: 'Approve budget requests' },
    { id: 'request.reject', label: 'Reject Requests', description: 'Reject budget requests' },
    { id: 'import.create', label: 'Import Data', description: 'Import budgets from files' },
    { id: 'import.read', label: 'View Imports', description: 'View import history' },
  ];

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/api-keys?customerId=${customerId}`);
      const data = await response.json();
      if (data.success) {
        setApiKeys(data.apiKeys);
      }
    } catch (error) {
      showToast('Failed to fetch API keys', 'error');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    if (formData.permissions.length === 0) {
      errors.permissions = 'Select at least one permission';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateKey = async () => {
    if (!validateForm()) return;

    try {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          createdById: userId,
          ...formData,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setNewKey(data.apiKey.key);
        setShowCreateModal(false);
        setShowKeyModal(true);
        setFormData({ name: '', permissions: [], expiresInDays: 0 });
        setFormErrors({});
        fetchApiKeys();
      } else {
        showToast(data.error || 'Failed to create API key', 'error');
      }
    } catch (error) {
      showToast('Failed to create API key', 'error');
    }
  };

  const handleRevokeKey = async (apiKeyId: string) => {
    try {
      const response = await fetch('/api/api-keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKeyId, status: 'revoked' }),
      });

      const data = await response.json();
      if (data.success) {
        showToast('API key revoked successfully', 'success');
        fetchApiKeys();
      } else {
        showToast(data.error || 'Failed to revoke API key', 'error');
      }
    } catch (error) {
      showToast('Failed to revoke API key', 'error');
    }
  };

  const handleDeleteKey = async (apiKeyId: string) => {
    try {
      const response = await fetch(`/api/api-keys?apiKeyId=${apiKeyId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        showToast('API key deleted successfully', 'success');
        fetchApiKeys();
      } else {
        showToast(data.error || 'Failed to delete API key', 'error');
      }
    } catch (error) {
      showToast('Failed to delete API key', 'error');
    }
  };

  const handleCopyKey = async () => {
    if (newKey) {
      const success = await copyToClipboard(newKey);
      if (success) {
        showToast('API key copied to clipboard', 'success');
      } else {
        showToast('Failed to copy API key', 'error');
      }
    }
  };

  const showToast = (message: string, variant: 'success' | 'error') => {
    setToast({ show: true, message, variant });
  };

  const togglePermission = (permission: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((p) => p !== permission)
        : [...prev.permissions, permission],
    }));
    if (formErrors.permissions) {
      setFormErrors((prev) => ({ ...prev, permissions: '' }));
    }
  };

  const getStatusVariant = (status: string): 'success' | 'warning' | 'danger' => {
    switch (status) {
      case 'active':
        return 'success';
      case 'expired':
        return 'warning';
      case 'revoked':
        return 'danger';
      default:
        return 'warning';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                API Keys
              </h1>
              <p className="text-gray-600 mt-1">
                Manage API keys for programmatic access to your budgets
              </p>
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              variant="primary"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Create API Key
            </Button>
          </div>
        </motion.div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
        >
          {loading ? (
            <div className="p-6">
              <TableSkeleton rows={5} />
            </div>
          ) : apiKeys.length === 0 ? (
            <EmptyState
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              }
              title="No API keys yet"
              description="Create your first API key to start using the SpendFlo API programmatically"
              action={{
                label: 'Create API Key',
                onClick: () => setShowCreateModal(true),
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Key
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usage
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Used
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Expires
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {apiKeys.map((key, index) => (
                    <motion.tr
                      key={key.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {key.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {key.createdBy.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded">
                          {key.keyPrefix}...
                        </code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={getStatusVariant(key.status)} dot>
                          {key.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {key.usageCount.toLocaleString()} requests
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(key.lastUsedAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(key.expiresAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          {key.status === 'active' && (
                            <button
                              onClick={() => handleRevokeKey(key.id)}
                              className="text-yellow-600 hover:text-yellow-900 transition-colors"
                            >
                              Revoke
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteKey(key.id)}
                            className="text-red-600 hover:text-red-900 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Create Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setFormData({ name: '', permissions: [], expiresInDays: 0 });
            setFormErrors({});
          }}
          title="Create API Key"
          description="Generate a new API key for programmatic access"
          size="lg"
        >
          <div className="space-y-6">
            {/* Name */}
            <Input
              label="Name"
              placeholder="Production API Key"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (formErrors.name) {
                  setFormErrors({ ...formErrors, name: '' });
                }
              }}
              error={formErrors.name}
              hint="A descriptive name to identify this API key"
            />

            {/* Permissions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Permissions
              </label>
              <div className="grid grid-cols-2 gap-3">
                {availablePermissions.map((permission) => (
                  <label
                    key={permission.id}
                    className={cn(
                      'flex items-start space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all',
                      formData.permissions.includes(permission.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={formData.permissions.includes(permission.id)}
                      onChange={() => togglePermission(permission.id)}
                      className="mt-1 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {permission.label}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {permission.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {formErrors.permissions && (
                <p className="mt-2 text-sm text-red-600">{formErrors.permissions}</p>
              )}
            </div>

            {/* Expiry */}
            <Input
              type="number"
              label="Expires In (days)"
              placeholder="0"
              value={formData.expiresInDays || ''}
              onChange={(e) =>
                setFormData({ ...formData, expiresInDays: parseInt(e.target.value) || 0 })
              }
              hint="Set to 0 for no expiration"
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                onClick={() => {
                  setShowCreateModal(false);
                  setFormData({ name: '', permissions: [], expiresInDays: 0 });
                  setFormErrors({});
                }}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button onClick={handleCreateKey} variant="primary">
                Create Key
              </Button>
            </div>
          </div>
        </Modal>

        {/* New Key Modal */}
        <Modal
          isOpen={showKeyModal}
          onClose={() => {
            setShowKeyModal(false);
            setNewKey(null);
          }}
          title="API Key Created!"
          size="lg"
        >
          <div className="space-y-4">
            {/* Warning */}
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
              <div className="flex gap-3">
                <svg
                  className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium text-yellow-800">
                    Save this API key now
                  </p>
                  <p className="text-sm text-yellow-700 mt-1">
                    This is the only time you'll see this key. Make sure to copy it and store it securely.
                  </p>
                </div>
              </div>
            </div>

            {/* Key Display */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <code className="text-sm font-mono text-gray-900 break-all flex-1">
                  {newKey}
                </code>
                <Button onClick={handleCopyKey} size="sm" variant="secondary">
                  Copy
                </Button>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={() => {
                  setShowKeyModal(false);
                  setNewKey(null);
                }}
                variant="primary"
              >
                Done
              </Button>
            </div>
          </div>
        </Modal>

        {/* Toast */}
        <Toast
          isOpen={toast.show}
          onClose={() => setToast({ ...toast, show: false })}
          message={toast.message}
          variant={toast.variant}
        />
      </div>
    </div>
  );
}
