import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest){
  const { pass } = await req.json().catch(()=>({}));
  const ok = typeof pass === "string" && pass.length > 0 && process.env.PRIVATE_COLLECTION_PASS && pass === process.env.PRIVATE_COLLECTION_PASS;
  if(!ok){
    return NextResponse.json({ ok:false }, { status: 401 });
  }
  const res = NextResponse.json({ ok:true });
  res.cookies.set("pc_auth","ok",{ httpOnly:true, sameSite:"lax", secure:true, path:"/" });
  return res;
}
