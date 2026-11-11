import { Redis } from "@upstash/redis";
import { getPricing, pricingPartner } from "@/lib/getPricing";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE = "pvr_checkout_";
function allowedReturnUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const origins = [process.env.MARKETING_SITE_ORIGIN, ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:8080", "http://127.0.0.1:8080"])].filter(Boolean);
    if (origins.includes(u.origin)) return u.origin + u.pathname + "#signup";
  } catch {}
  return "";
}
function unpack(data:any):any {
  let v = data?.response?.body ?? data?.body ?? data?.response ?? data;
  for(let i=0;i<3;i++) {if(typeof v === "string") {try{v=JSON.parse(v);}catch{break;}} else if(v?.body && typeof v.body !== "undefined") {v=v.body;} else break;}
  return v;
}
function fail(message:string,status=400){return new NextResponse(`Registration could not continue: ${message}. Please return to the Join page and try again.`,{status,headers:{"Content-Type":"text/plain; charset=utf-8"}});}
export async function POST(request:NextRequest) {
  const contentLength=Number(request.headers.get("content-length")||0);
  if(contentLength>16000)return fail("Request too large",413);
  let form:FormData;
  try{form=await request.formData();}catch{return fail("Invalid form");}
  const raw=String(form.get("draft")||"");
  if(raw.length>12000)return fail("Too many registration details",413);
  let draft:any;
  try{draft=JSON.parse(raw);}catch{return fail("Invalid registration details");}
  let prices: Awaited<ReturnType<typeof getPricing>>;
  let partnerName: string;
  try { [prices, partnerName] = await Promise.all([getPricing(), Promise.resolve(pricingPartner())]); }
  catch (error) { console.error("Marketing pricing lookup failed:", error); return fail("Subscription pricing is temporarily unavailable",503); }
  const selected=prices[draft?.plan as keyof typeof prices];
  if(!selected || draft?.termsAccepted!==true || draft?.termsVersion!=="2026-06-24")return fail("Please accept the current Terms and Conditions");
  const first=String(draft.memberFirst||"").trim(),last=String(draft.memberLast||"").trim(),email=String(draft.memberEmail||"").trim();
  const phone=String(draft.memberPhone||"").trim();
  if(!first||!last||first.length>100||last.length>100||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||phone.length>40)return fail("Invalid member information");
  if(!Array.isArray(draft.pets)||draft.pets.length<selected.minimum||draft.pets.length>15)return fail("Invalid pet count");
  const pets=[];
  for(const p of draft.pets){
    const petName=String(p.petName||"").trim(),petSpecies=String(p.petSpecies||"").trim(),petBreed=String(p.petBreed||"").trim(),petSex=String(p.petSex||"").trim();
    if(!petName||!petSpecies||[petName,petSpecies,petBreed,petSex].some(v=>v.length>100))return fail("Invalid pet information");
    pets.push({petName,petSpecies,petBreed,...(petSex?{petSex}:{})});
  }
  // Require a known Marketing origin. Browser Origin may be absent on some form navigations,
  // so validate the return URL and Origin when provided.
  const returnUrl=allowedReturnUrl(String(form.get("returnUrl")||""));
  if(!returnUrl)return fail("Marketing return address not allowed",403);

  const origin=request.headers.get("origin");
  if(origin && origin!==new URL(returnUrl).origin)return fail("Origin mismatch",403);
  // The browser passes a one-time ticket, not an authentication cookie shared across domains.
  const googleTicket=String(form.get("googleTicket")||"");
  let googleIdentity: { email:string; oauthSub:string; authenticationMethod:string } | null=null;
  if(googleTicket){
    if(!/^[a-f0-9]{64}$/.test(googleTicket))return fail("Invalid Google verification",403);
    const redis=Redis.fromEnv();
    const pending=await redis.get<{email:string;oauthSub:string;authenticationMethod:string}>(`pvr:marketing-google:${googleTicket}`);
    if(!pending || pending.authenticationMethod!=="google" || !pending.oauthSub?.startsWith("google-oauth2|") || pending.email!==email.toLowerCase())return fail("Google account does not match the registration email, or verification expired",403);
    googleIdentity=await redis.getdel<{email:string;oauthSub:string;authenticationMethod:string}>(`pvr:marketing-google:${googleTicket}`);
    if(!googleIdentity)return fail("Google verification was already used",403);
  }
  const memberSubID=`PRX${Date.now()}${randomBytes(6).toString("hex")}`;
  const registrationToken=memberSubID;
  const payload={partnerName,affinityGroup:"D2C",subscriptionType:selected.type,subscriptionPrice:selected.price,memberFirst:first,memberLast:last,memberSubID,registrationToken,memberEmail:email,memberPhone:phone,mobilePhone:phone,pets,termsAccepted:true,termsVersion:"2026-06-24"};
  const base=new URL(request.url).origin;
  const totalStart=Date.now();
  const logTiming=(step:string,started:number,details:Record<string,unknown>={})=>
    console.log("[PVR TIMING]",JSON.stringify({route:"marketing-handoff",step,elapsedMs:Date.now()-started,memberSubID,...details}));
  try {
    // Prepare Google identity before starting either independent operation.
    // The one-time marketing ticket was verified and consumed above.
    const googleStart=Date.now();
    let checkoutCookie="";
    if(googleIdentity){
      const id=randomBytes(32).toString("hex");
      const stored=await Redis.fromEnv().set(`pvr:google-registration:${id}`,googleIdentity,{ex:3600,nx:true});
      if(stored!=="OK")return fail("Unable to prepare Google checkout",500);
      checkoutCookie=`pvr_google_registration=${id}`;
    }

    logTiming("google-session-preparation",googleStart);

    // The payment-record API requires the Contact created by Add Member.
    // Wait for Add Member to complete before starting Stripe Checkout.
    const memberStart=Date.now();
    const memberResponse=await fetch(`${base}/api/pet-service`,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-forwarded-for":request.headers.get("x-forwarded-for")||""},
      body:JSON.stringify({action:"addMemberAndPet",payload}),
      cache:"no-store"
    });
    const memberData=await memberResponse.json().catch(()=>null);
    const verified=unpack(memberData);
    logTiming("add-member-api",memberStart,{status:memberResponse.status,success:verified?.success===true});
    if(!memberResponse.ok||verified?.success!==true){
      console.error("[Marketing Add Member failed]",{memberSubID,status:memberResponse.status});
      return fail(String(verified?.message||verified?.results||"Unable to save registration"),502);
    }
    // The API now echoes memberSubID as registrationToken. Never use its returned
    // token or price as inputs to Stripe; these are only consistency checks.
    const returnedToken=String(verified.registrationToken||"").trim();
    const returnedType=String(verified.subscriptionType||"").trim();
    const returnedPrice=Number(verified.subscriptionPrice);
    if(returnedToken!==registrationToken||returnedType!==selected.type||
       !Number.isFinite(returnedPrice)||
       Math.round(returnedPrice*100)!==Math.round(Number(selected.price)*100)){
      console.error("[Marketing Add Member response mismatch]",{memberSubID});
      return fail("Add Member response does not match registration details",409);
    }
    // Contact now exists. Stripe may safely create its related payment record.
    const checkoutStart=Date.now();
    const checkoutResponse=await fetch(`${base}/api/stripe/create-checkout-session`,{
      method:"POST",
      headers:{"Content-Type":"application/json",...(checkoutCookie?{"Cookie":checkoutCookie}:{})},
      body:JSON.stringify({
        registrationToken,subscriptionType:selected.type,subscriptionPrice:selected.price,
        memberEmail:email,memberSubID,partnerName,affinityGroup:"D2C",
        returnUrl,authenticationMethod:googleIdentity?"google":"password"
      }),
      cache:"no-store"
    });
    const checkout=await checkoutResponse.json().catch(()=>null);
    logTiming("stripe-checkout-api",checkoutStart,{status:checkoutResponse.status,success:checkout?.success===true});
    if(!checkoutResponse.ok||checkout?.success!==true||!checkout?.checkoutUrl||!checkout?.sessionId){
      console.error("[Marketing Stripe checkout failed]",{memberSubID,status:checkoutResponse.status});
      return fail(String(checkout?.message||"Unable to start secure checkout"),502);
    }
    const stripeUrl=new URL(String(checkout.checkoutUrl));
    if(stripeUrl.protocol!=="https:"||!(stripeUrl.hostname==="stripe.com"||stripeUrl.hostname.endsWith(".stripe.com")))return fail("Invalid checkout destination",502);
    const redirect=NextResponse.redirect(stripeUrl,303);
    // Transfer the HttpOnly checkout binding from the internal checkout response
    // to the browser; required by /api/stripe/complete-registration after payment.
    const binding=checkoutResponse.headers.get("set-cookie")||"";
    const expected=COOKIE+String(checkout.sessionId);
    if(!binding.includes(expected+"="))return fail("Checkout binding was not created",502);
    const cookie=checkoutResponse.headers.getSetCookie?.().find(v=>v.startsWith(expected+"="))||binding;
    redirect.headers.append("set-cookie",cookie);
    logTiming("total-to-stripe-redirect",totalStart,{success:true});
    return redirect;
  }catch(e){console.error("Marketing registration error",e);logTiming("total-to-error",totalStart,{success:false});return fail("Server error during registration",500);}
}
