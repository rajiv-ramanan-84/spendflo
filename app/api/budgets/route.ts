import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    // Get customerId from query params
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');

    const where = customerId ? { customerId } : {};

    const budgets = await prisma.budget.findMany({
      where,
      include: {
        utilization: true,
      },
      orderBy: {
        department: 'asc',
      },
    });
    return NextResponse.json({
      success: true,
      budgets,
    });
  } catch (error) {
    console.error('Error fetching budgets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch budgets' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerId, department, subCategory, budgetedAmount, fiscalPeriod, currency } = body;

    if (!customerId || !department || !budgetedAmount || !fiscalPeriod) {
      return NextResponse.json(
        { error: 'Missing required fields: customerId, department, budgetedAmount, fiscalPeriod' },
        { status: 400 }
      );
    }

    const budget = await prisma.budget.create({
      data: {
        customerId,
        department,
        subCategory: subCategory || null,
        budgetedAmount: parseFloat(budgetedAmount),
        fiscalPeriod,
        currency: currency || 'USD',
        source: 'manual',
      },
      include: {
        utilization: true,
      },
    });

    await prisma.budgetUtilization.create({
      data: {
        budgetId: budget.id,
        committedAmount: 0,
        reservedAmount: 0,
      },
    });

    return NextResponse.json({
      success: true,
      budget,
    });
  } catch (error) {
    console.error('Error creating budget:', error);
    return NextResponse.json(
      { error: 'Failed to create budget' },
      { status: 500 }
    );
  }
}     
