const JSON_HEADERS = {"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const response = (value, status=200) => new Response(JSON.stringify(value),{status,headers:JSON_HEADERS});

export function parseXUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  let u; try {u=new URL(value.trim());} catch {return null;}
  if(u.protocol!=="https:" || u.username || u.password || u.port || !["x.com","www.x.com","twitter.com","www.twitter.com","mobile.twitter.com"].includes(u.hostname.toLowerCase())) return null;
  const m=/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{8,25})(?:\/.*)?$/.exec(u.pathname);
  return m ? {username:m[1],id:m[2]} : null;
}
export function isTrustedMp4(value) {
  try {
    const u=new URL(value);
    return u.protocol==="https:" && u.hostname==="video.twimg.com" && u.pathname.toLowerCase().endsWith(".mp4") && !u.port && !u.username && !u.password;
  } catch { return false; }
}
function quality(url) {
  const m=/\/(\d{2,4})x(\d{2,4})\//.exec(url);
  return m ? {label:`${Math.max(+m[1],+m[2])}p · ${m[1]} × ${m[2]}`, pixels:+m[1]*+m[2]} : {label:"MP4",pixels:0};
}
export function extractMedia(payload) {
  const urls=new Set(),seen=new WeakSet();
  function scan(v,depth=0) {
    if(depth>12 || urls.size>50 || v==null) return;
    if(typeof v==="string") {if(isTrustedMp4(v)) urls.add(v); return;}
    if(typeof v!=="object"||seen.has(v)) return;
    seen.add(v);
    if(Array.isArray(v)) {v.slice(0,100).forEach(x=>scan(x,depth+1));return;}
    Object.entries(v).forEach(([k,x])=>{if(depth<3||/url|uri|variant|format|video|media|all|tweet|status|stream|source/i.test(k)) scan(x,depth+1);});
  }
  scan(payload);
  const tweet=payload?.tweet??payload?.status??payload?.data?.tweet??{};
  const media=tweet.media??{};
  const preview=[media?.videos?.[0]?.thumbnail_url,media?.all?.[0]?.thumbnail_url,media?.videos?.[0]?.poster,media?.thumbnail_url].find(x=>typeof x==="string"&&/^https:\/\/pbs\.twimg\.com\//.test(x))??null;
  return {title:typeof tweet.text==="string"?tweet.text.slice(0,160):"Public video",author:tweet.author?.screen_name??null,preview,sources:[...urls].map((url)=>({url,quality:quality(url).label,pixels:quality(url).pixels})).sort((a,b)=>b.pixels-a.pixels).map(({pixels,...v},i)=>({...v,filename:`VidLoad_X_${i+1}.mp4`}))};
}
async function resolveX(raw) {
  const post=parseXUrl(raw);
  if(!post) return response({error:"Enter a public X/Twitter post URL."},400);
  let data;
  try {
    const upstream=await fetch(`https://api.fxtwitter.com/${post.username}/status/${post.id}`,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
    if(!upstream.ok) return response({error:"The post is unavailable through the public media index."},422);
    if(Number(upstream.headers.get("content-length"))>2000000) return response({error:"Response too large."},502);
    const body=await upstream.text();
    if(body.length>2000000) return response({error:"Response too large."},502);
    data=JSON.parse(body);
  } catch {return response({error:"Could not reach the public media index."},502);}
  const result=extractMedia(data);
  return result.sources.length?response({...result,service:"X / Twitter"}):response({error:"No publicly downloadable MP4 found. Private or DRM media is not supported."},422);
}
async function download(request,raw) {
  if(!isTrustedMp4(raw)) return response({error:"Only verified X CDN MP4 URLs are supported."},400);
  try {
    const headers=new Headers({Accept:"video/mp4"});
    const range=request.headers.get("range");
    if(range && /^bytes=\d*-\d*$/.test(range))headers.set("range",range);
    const upstream=await fetch(raw,{method:request.method,headers,redirect:"manual",signal:AbortSignal.timeout(30000)});
    if(![200,206].includes(upstream.status)|| !/^(video\/mp4|application\/octet-stream)/i.test(upstream.headers.get("content-type")||""))return response({error:"The CDN did not return an MP4 video."},502);
    const out=new Headers({"content-type":"video/mp4","content-disposition":"attachment; filename=\"VidLoad_X_video.mp4\"","cache-control":"private, no-store","x-content-type-options":"nosniff"});
    for(const k of ["content-length","content-range","accept-ranges"])if(upstream.headers.has(k))out.set(k,upstream.headers.get(k));
    return new Response(request.method==="HEAD"?null:upstream.body,{status:upstream.status,headers:out});
  } catch {return response({error:"Could not stream this public video."},502);}
}
export default {async fetch(request,env) {
  const u=new URL(request.url);
  if(u.pathname==="/api/health")return response({ok:true,name:"VidLoad",version:"1.0.0"});
  if(u.pathname==="/api/resolve")return request.method==="GET"?resolveX(u.searchParams.get("url")||""):response({error:"Method not allowed"},405);
  if(u.pathname==="/api/download")return ["GET","HEAD"].includes(request.method)?download(request,u.searchParams.get("url")||""):response({error:"Method not allowed"},405);
  return env.ASSETS.fetch(request);
}};
