import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  return POST();
}

export async function POST() {
  try {
    console.log('Seeding database...');

    // Create customer
    const customer = await prisma.customer.upsert({
      where: { domain: 'acme.com' },
      update: {},
      create: {
        name: 'Acme Corporation',
        domain: 'acme.com',
      },
    });

    // Create users
    const admin = await prisma.user.upsert({
      where: { email: 'admin@acme.com' },
      update: {},
      create: {
        email: 'admin@acme.com',
        password: 'admin123',
        name: 'Admin User',
        role: 'admin',
        customerId: customer.id,
      },
    });

    const manager = await prisma.user.upsert({
      where: { email: 'manager@acme.com' },
      update: {},
      create: {
        email: 'manager@acme.com',
        password: 'manager123',
        name: 'Finance Manager',
        role: 'manager',
        customerId: customer.id,
      },
    });

    // Create budgets
    const engineeringBudget = await prisma.budget.upsert({
      where: {
        customerId_department_subCategory_fiscalPeriod: {
          customerId: customer.id,
          department: 'Engineering',
          subCategory: 'Software',
          fiscalPeriod: 'FY2025',
        },
      },
      update: {},
      create: {
        customerId: customer.id,
        department: 'Engineering',
        subCategory: 'Software',
        fiscalPeriod: 'FY2025',
        budgetedAmount: 500000,
        source: 'manual',
      },
    });

    const salesBudget = await prisma.budget.upsert({
      where: {
        customerId_department_subCategory_fiscalPeriod: {
          customerId: customer.id,
          department: 'Sales',
          subCategory: 'Tools',
          fiscalPeriod: 'FY2025',
        },
      },
      update: {},
      create: {
        customerId: customer.id,
        department: 'Sales',
        subCategory: 'Tools',
        fiscalPeriod: 'FY2025',
        budgetedAmount: 250000,
        source: 'manual',
      },
    });

    const marketingBudget = await prisma.budget.upsert({
      where: {
        customerId_department_subCategory_fiscalPeriod: {
          customerId: customer.id,
          department: 'Marketing',
          subCategory: 'Advertising',
          fiscalPeriod: 'FY2025',
        },
      },
      update: {},
      create: {
        customerId: customer.id,
        department: 'Marketing',
        subCategory: 'Advertising',
        fiscalPeriod: 'FY2025',
        budgetedAmount: 300000,
        source: 'manual',
      },
    });

    const financeBudget = await prisma.budget.upsert({
      where: {
        customerId_department_subCategory_fiscalPeriod: {
          customerId: customer.id,
          department: 'Finance Department',
          subCategory: 'Software',
          fiscalPeriod: 'FY2025',
        },
      },
      update: {},
      create: {
        customerId: customer.id,
        department: 'Finance Department',
        subCategory: 'Software',
        fiscalPeriod: 'FY2025',
        budgetedAmount: 400000,
        source: 'manual',
      },
    });

    const hrBudget = await prisma.budget.upsert({
      where: {
        customerId_department_subCategory_fiscalPeriod: {
          customerId: customer.id,
          department: 'Human Resources',
          subCategory: 'Software',
          fiscalPeriod: 'FY2025',
        },
      },
      update: {},
      create: {
        customerId: customer.id,
        department: 'Human Resources',
        subCategory: 'Software',
        fiscalPeriod: 'FY2025',
        budgetedAmount: 200000,
        source: 'manual',
      },
    });

    const operationsBudget = await prisma.budget.upsert({
      where: {
        customerId_department_subCategory_fiscalPeriod: {
          customerId: customer.id,
          department: 'Operations',
          subCategory: 'Tools',
          fiscalPeriod: 'FY2025',
        },
      },
      update: {},
      create: {
        customerId: customer.id,
        department: 'Operations',
        subCategory: 'Tools',
        fiscalPeriod: 'FY2025',
        budgetedAmount: 350000,
        source: 'manual',
      },
    });

    // Create budget utilization records
    await prisma.budgetUtilization.upsert({
      where: { budgetId: engineeringBudget.id },
      update: { committedAmount: 350000, reservedAmount: 50000 },
      create: {
        budgetId: engineeringBudget.id,
        committedAmount: 350000,
        reservedAmount: 50000,
      },
    });

    await prisma.budgetUtilization.upsert({
      where: { budgetId: salesBudget.id },
      update: { committedAmount: 180000, reservedAmount: 20000 },
      create: {
        budgetId: salesBudget.id,
        committedAmount: 180000,
        reservedAmount: 20000,
      },
    });

    await prisma.budgetUtilization.upsert({
      where: { budgetId: marketingBudget.id },
      update: { committedAmount: 150000, reservedAmount: 30000 },
      create: {
        budgetId: marketingBudget.id,
        committedAmount: 150000,
        reservedAmount: 30000,
      },
    });

    await prisma.budgetUtilization.upsert({
      where: { budgetId: financeBudget.id },
      update: { committedAmount: 250000, reservedAmount: 40000 },
      create: {
        budgetId: financeBudget.id,
        committedAmount: 250000,
        reservedAmount: 40000,
      },
    });

    await prisma.budgetUtilization.upsert({
      where: { budgetId: hrBudget.id },
      update: { committedAmount: 120000, reservedAmount: 15000 },
      create: {
        budgetId: hrBudget.id,
        committedAmount: 120000,
        reservedAmount: 15000,
      },
    });

    await prisma.budgetUtilization.upsert({
      where: { budgetId: operationsBudget.id },
      update: { committedAmount: 200000, reservedAmount: 50000 },
      create: {
        budgetId: operationsBudget.id,
        committedAmount: 200000,
        reservedAmount: 50000,
      },
    });

    // Create sample requests
    await prisma.request.upsert({
      where: { id: 'sample-request-1' },
      update: {},
      create: {
        id: 'sample-request-1',
        customerId: customer.id,
        supplier: 'AWS',
        description: 'Cloud infrastructure services',
        amount: 25000,
        budgetCategory: 'Engineering',
        budgetId: engineeringBudget.id,
        status: 'approved',
        createdById: admin.id,
      },
    });

    await prisma.request.upsert({
      where: { id: 'sample-request-2' },
      update: {},
      create: {
        id: 'sample-request-2',
        customerId: customer.id,
        supplier: 'Salesforce',
        description: 'CRM subscription renewal',
        amount: 15000,
        budgetCategory: 'Sales',
        budgetId: salesBudget.id,
        status: 'pending',
        createdById: manager.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Database seeded successfully',
      customer: {
        id: customer.id,
        name: customer.name,
        domain: customer.domain,
      },
      users: [
        { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
        { id: manager.id, email: manager.email, name: manager.name, role: manager.role },
      ],
      budgets: [
        { dept: engineeringBudget.department, amount: engineeringBudget.budgetedAmount },
        { dept: salesBudget.department, amount: salesBudget.budgetedAmount },
        { dept: marketingBudget.department, amount: marketingBudget.budgetedAmount },
        { dept: financeBudget.department, amount: financeBudget.budgetedAmount },
        { dept: hrBudget.department, amount: hrBudget.budgetedAmount },
        { dept: operationsBudget.department, amount: operationsBudget.budgetedAmount },
      ],
    });
  } catch (error) {
    console.error('Error seeding database:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to seed database' },
      { status: 500 }
    );
  }
}
