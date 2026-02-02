import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const customers = await prisma.customer.findMany();
    const users = await prisma.user.findMany();
    const budgets = await prisma.budget.findMany({
      include: {
        utilization: true,
      },
    });
    const requests = await prisma.request.findMany();

    return NextResponse.json({
      counts: {
        customers: customers.length,
        users: users.length,
        budgets: budgets.length,
        requests: requests.length,
      },
      data: {
        customers,
        users: users.map(u => ({ id: u.id, email: u.email, name: u.name })),
        budgets,
        requests,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
