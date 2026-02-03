import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { generateToken } from '@/lib/auth/jwt';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, customerId, role } = await req.json();

    // Validation
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Get or create customer
    let customerIdToUse = customerId;
    if (!customerIdToUse) {
      // Find first customer or create default
      let customer = await prisma.customer.findFirst();
      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            name: 'Default Organization',
            domain: 'default.local',
          },
        });
      }
      customerIdToUse = customer.id;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        customerId: customerIdToUse,
        role: role || 'business_user',
        isActive: true,
      },
      include: {
        customer: true,
      },
    });

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      customerId: user.customerId,
      role: user.role,
      permissions: user.permissions,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        customerId: user.customerId,
      },
      token,
    });
  } catch (error: any) {
    console.error('[Register] Error:', error);
    return NextResponse.json(
      { error: 'Failed to register user', details: error.message },
      { status: 500 }
    );
  }
}
