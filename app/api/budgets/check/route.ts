import { NextResponse } from 'next/server';                                                                                                                                                               
  import { prisma } from '@/lib/prisma';                                                                                                                                                                    
                                                                                                                                                                                                            
  export async function POST(request: Request) {                                                                                                                                                            
    try {                                                                                                                                                                                                   
      const body = await request.json();                                                                                                                                                                    
      const { department, subCategory, amount } = body;                                                                                                                                                     
                                                                                                                                                                                                            
      const customer = await prisma.customer.findFirst();                                                                                                                                                   
      if (!customer) {                                                                                                                                                                                      
        return NextResponse.json({                                                                                                                                                                          
          budget_found: false,                                                                                                                                                                              
          budget_status: 'no_budget',                                                                                                                                                                       
        });                                                                                                                                                                                                 
      }                                                                                                                                                                                                     
                                                                                                                                                                                                            
      const budget = await prisma.budget.findFirst({                                                                                                                                                        
        where: {                                                                                                                                                                                            
          customerId: customer.id,                                                                                                                                                                          
          department,                                                                                                                                                                                       
          subCategory: subCategory || null,                                                                                                                                                                 
          fiscalPeriod: 'FY2025',                                                                                                                                                                           
        },                                                                                                                                                                                                  
        include: {                                                                                                                                                                                          
          utilization: true,                                                                                                                                                                                
        },                                                                                                                                                                                                  
      });                                                                                                                                                                                                   
                                                                                                                                                                                                            
      if (!budget) {                                                                                                                                                                                        
        return NextResponse.json({                                                                                                                                                                          
          budget_found: false,                                                                                                                                                                              
          budget_status: 'no_budget',                                                                                                                                                                       
        });                                                                                                                                                                                                 
      }                                                                                                                                                                                                     
                                                                                                                                                                                                            
      const committed = budget.utilization?.committedAmount || 0;                                                                                                                                           
      const reserved = budget.utilization?.reservedAmount || 0;                                                                                                                                             
      const available = budget.budgetedAmount - committed - reserved;                                                                                                                                       
      const currentUtilization = (committed / budget.budgetedAmount) * 100;                                                                                                                                 
      const newUtilization = ((committed + amount) / budget.budgetedAmount) * 100;                                                                                                                          
                                                                                                                                                                                                            
      const inBudget = available >= amount;                                                                                                                                                                 
                                                                                                                                                                                                            
      return NextResponse.json({                                                                                                                                                                            
        budget_found: true,                                                                                                                                                                                 
        budget_id: budget.id,                                                                                                                                                                               
        budget_status: inBudget ? 'in_budget' : 'out_of_budget',                                                                                                                                            
        budget_details: {                                                                                                                                                                                   
          budgeted_amount: budget.budgetedAmount,                                                                                                                                                           
          committed_amount: committed,                                                                                                                                                                      
          reserved_amount: reserved,                                                                                                                                                                        
          available_amount: available,                                                                                                                                                                      
          utilization_pct: currentUtilization,                                                                                                                                                              
          new_utilization_pct: newUtilization,                                                                                                                                                              
        },                                                                                                                                                                                                  
      });                                                                                                                                                                                                   
    } catch (error) {                                                                                                                                                                                       
      console.error('Error checking budget:', error);                                                                                                                                                       
      return NextResponse.json(                                                                                                                                                                             
        { error: 'Failed to check budget' },                                                                                                                                                                
        { status: 500 }                                                                                                                                                                                     
      );                                                                                                                                                                                                    
    }                                                                                                                                                                                                       
  }       

