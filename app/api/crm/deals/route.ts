import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json([
    { id: '1', address: '123 Park Ave', side: 'SELL', status: 'Lead', price: 1200000 },
    { id: '2', address: '456 Lex Ave', side: 'BUY', status: 'Contract', price: 850000 },
  ])
}
