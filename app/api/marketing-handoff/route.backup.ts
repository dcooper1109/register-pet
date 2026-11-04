import { NextRequest, NextResponse } from "next/server";

const COOKIE = "pvr_marketing_handoff";
function allowedReturnUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const configured = process.env.MARKETING_SITE_ORIGIN;
    const allowed = [configured, ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:8080", "http://127.0.0.1:8080"])].filter(Boolean);
    if (allowed.includes(u.origin) && u.protocol !== "javascript:") return u.origin + u.pathname + "#signup";
  } catch {}
  return "";
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const raw = String(form.get("draft") || "");
  if (raw.length > 3500) return NextResponse.json({message:"Registration is too large for the secure handoff."},{status:413});
  let draft: any;
  try { draft = JSON.parse(raw); } catch { return NextResponse.json({message:"Invalid registration draft."},{status:400}); }
  if (!draft || !["one","two","three"].includes(draft.plan) || !Array.isArray(draft.pets) || draft.pets.length > 15 || !draft.memberFirst || !draft.memberLast || !draft.memberEmail) {
    return NextResponse.json({message:"Invalid registration fields."},{status:400});
  }
  const returnUrl = allowedReturnUrl(String(form.get("returnUrl") || ""));
  const target = new URL("/",request.url);
  target.searchParams.set("marketing","1");
  if (returnUrl) target.searchParams.set("returnUrl",returnUrl);
  const response = NextResponse.redirect(target,303);
  response.cookies.set(COOKIE,JSON.stringify(draft),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/marketing-handoff",maxAge:600});
  return response;
}
export async function GET(request: NextRequest) {
  const raw=request.cookies.get(COOKIE)?.value;
  const response=NextResponse.json(raw ? {draft:JSON.parse(raw)} : {draft:null});
  response.cookies.set(COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/marketing-handoff",maxAge:0});
  return response;
}
