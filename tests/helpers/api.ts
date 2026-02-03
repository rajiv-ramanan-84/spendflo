import { APIRequestContext } from '@playwright/test';

/**
 * API helper functions for tests
 */

export async function createApiKey(
  request: APIRequestContext,
  data: {
    customerId: string;
    createdById: string;
    name: string;
    permissions: string[];
    expiresInDays?: number;
  }
) {
  const response = await request.post('/api/api-keys', {
    data,
  });

  return await response.json();
}

export async function listApiKeys(
  request: APIRequestContext,
  customerId: string
) {
  const response = await request.get(`/api/api-keys?customerId=${customerId}`);
  return await response.json();
}

export async function revokeApiKey(
  request: APIRequestContext,
  apiKeyId: string
) {
  const response = await request.patch('/api/api-keys', {
    data: {
      apiKeyId,
      status: 'revoked',
    },
  });

  return await response.json();
}

export async function deleteApiKey(
  request: APIRequestContext,
  apiKeyId: string
) {
  const response = await request.delete(`/api/api-keys?apiKeyId=${apiKeyId}`);
  return await response.json();
}

export async function checkBudget(
  request: APIRequestContext,
  data: {
    customerId: string;
    department: string;
    subCategory?: string;
    fiscalPeriod: string;
    amount: number;
  }
) {
  const response = await request.post('/api/budget/check', {
    data,
  });

  return await response.json();
}

export async function submitRequest(
  request: APIRequestContext,
  data: {
    customerId: string;
    supplier: string;
    description: string;
    amount: number;
    department: string;
    subCategory?: string;
    fiscalPeriod: string;
    createdById: string;
  }
) {
  const response = await request.post('/api/requests/submit', {
    data,
  });

  return await response.json();
}
