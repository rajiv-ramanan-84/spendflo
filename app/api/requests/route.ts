import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      supplier,
      description,
      amount,
      budgetCategory,
      budgetSubCategory,
    } = body;

    const customer = await prisma.customer.findFirst();
    const user = await prisma.user.findFirst();

    if (!customer || !user) {
      return NextResponse.json({ error: 'Setup incomplete' }, { status: 400 });
    }

    let budgetId = null;
    if (budgetCategory) {
      const budget = await prisma.budget.findFirst({
        where: {
          customerId: customer.id,
          department: budgetCategory,
          subCategory: budgetSubCategory || null,
        },
      });
      budgetId = budget?.id || null;
    }

    const req = await prisma.request.create({
      data: {
        customerId: customer.id,
        supplier,
        description,
        amount: parseFloat(amount),
        budgetCategory: budgetCategory || null,
        budgetId,
        status: 'pending',
        createdById: user.id,
      },
    });

    return NextResponse.json(req);
  } catch (error) {
    console.error('Error creating request:', error);
    return NextResponse.json(
      { error: 'Failed to create request' },
      { status: 500 }
    );
  }
}
