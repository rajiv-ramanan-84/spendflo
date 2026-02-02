import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const budgets = await prisma.budget.findMany({
      include: {
        utilization: true,
      },
      orderBy: {
        department: 'asc',
      },
    });
    return NextResponse.json(budgets);
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
      const { department, subCategory, budgetedAmount, fiscalPeriod } = body;                                                                                                                               
                                                                                                                                                                                                            
      const customer = await prisma.customer.findFirst();                                                                                                                                                   
      if (!customer) {                                                                                                                                                                                      
        return NextResponse.json({ error: 'No customer found' }, { status: 404 });                                                                                                                          
      }                                                                                                                                                                                                     
                                                                                                                                                                                                            
      const budget = await prisma.budget.create({                                                                                                                                                           
        data: {                                                                                                                                                                                             
          customerId: customer.id,                                                                                                                                                                          
          department,                                                                                                                                                                                       
          subCategory: subCategory || null,                                                                                                                                                                 
          budgetedAmount: parseFloat(budgetedAmount),                                                                                                                                                       
          fiscalPeriod,                                                                                                                                                                                     
          source: 'manual',                                                                                                                                                                                 
        },                                                                                                                                                                                                  
      });                                                                                                                                                                                                   
                                                                                                                                                                                                            
      await prisma.budgetUtilization.create({                                                                                                                                                               
        data: {                                                                                                                                                                                             
          budgetId: budget.id,                                                                                                                                                                              
          committedAmount: 0,                                                                                                                                                                               
          reservedAmount: 0,                                                                                                                                                                                
        },                                                                                                                                                                                                  
      });                                                                                                                                                                                                   
                                                                                                                                                                                                            
      return NextResponse.json(budget);                                                                                                                                                                     
    } catch (error) {                                                                                                                                                                                       
      console.error('Error creating budget:', error);                                                                                                                                                       
      return NextResponse.json(                                                                                                                                                                             
        { error: 'Failed to create budget' },                                                                                                                                                               
        { status: 500 }                                                                                                                                                                                     
      );                                                                                                                                                                                                    
    }                                                                                                                                                                                                       
  }     
