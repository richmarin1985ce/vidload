const $=id=>document.getElementById(id);
const field=$("video-url"),results=$("results"),message=$("message"),button=$("submit-button");
const X_PATTERN=/^https:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d{8,25})(?:[/?#]|$)/i;
const VIDEO_PATTERN=/\.(mp4|webm|mov|m4v)(?:[?#]|$)/i;
function showMessage(text,error=false){message.textContent=text;message.hidden=!text;message.classList.toggle("is-error",error);}
function isDirectLink(value){try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&VIDEO_PATTERN.test(u.pathname);}catch{return false;}}
function directMedia(url){const ext=new URL(url).pathname.split(".").pop().toLowerCase();return{title:"Direct video file",service:"Direct video",originalUrl:url,preview:null,sources:[{url,quality:"Original · "+ext.toUpperCase(),filename:"VidLoad_video."+ext}]};}
function trustedXMedia(raw){try{const u=new URL(raw);return u.protocol==="https:"&&u.hostname==="video.twimg.com"&&u.pathname.endsWith(".mp4")&&!u.port&&!u.username&&!u.password;}catch{return false;}}
function quality(raw){const m=/\/(\d{2,4})x(\d{2,4})\//.exec(raw);return m?`${Math.max(+m[1],+m[2])}p · ${m[1]} × ${m[2]}`:"Original MP4";}
function area(raw){const m=/\/(\d{2,4})x(\d{2,4})\//.exec(raw);return m?+m[1]*+m[2]:0;}
function flattenPublicPayload(data,originalUrl){
  const found=new Set(),visited=new WeakSet();
  function walk(x,d=0){if(d>12||found.size>60||x==null)return;if(typeof x==="string"){if(trustedXMedia(x))found.add(x);return;}
    if(typeof x!=="object"||visited.has(x))return;visited.add(x);
    if(Array.isArray(x)){x.slice(0,100).forEach(v=>walk(v,d+1));return;}
    Object.entries(x).forEach(([k,v])=>{if(d<3||/url|uri|variant|format|media|video|stream|source|tweet|status|all/i.test(k))walk(v,d+1);});
  }walk(data);
  const t=data?.tweet||data?.status||data?.data?.tweet||{},m=t.media||{};
  const p=[m?.videos?.[0]?.thumbnail_url,m?.all?.[0]?.thumbnail_url,m?.videos?.[0]?.poster,m?.thumbnail_url].find(x=>typeof x==="string"&&/^https:\/\/pbs\.twimg\.com\//.test(x))||null;
  return{title:t.text||"Public X video",author:t.author?.screen_name||null,preview:p,service:"X / Twitter",originalUrl,sources:[...found].sort((a,b)=>area(b)-area(a)).map((u,i)=>({url:u,quality:quality(u),filename:`VidLoad_X_${i+1}.mp4`}))};
}
function nativeResolveX(url){
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{window.VidLoadNativeResult=null;reject(new Error("Video lookup timed out."));},25000);
    window.VidLoadNativeResult=raw=>{clearTimeout(timeout);window.VidLoadNativeResult=null;try{const x=JSON.parse(raw);if(!x.ok)throw new Error(x.error||"Could not find public video.");resolve(x.data);}catch(e){reject(e);}};
    try{window.VidLoadAndroid.resolveX(url);}catch(e){clearTimeout(timeout);reject(e);}
  });
}
async function lookup(url){
  if(isDirectLink(url))return directMedia(url);
  const match=url.match(X_PATTERN);
  if(!match)throw Error("Supported links: public X/Twitter posts and direct HTTPS MP4, WebM, MOV or M4V files.");
  if(window.VidLoadAndroid){const raw=await nativeResolveX(url);return flattenPublicPayload(raw,url);}
  const r=await fetch("/api/resolve?url="+encodeURIComponent(url),{signal:AbortSignal.timeout(18000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(data.error||"Could not find downloadable video.");
  return{...data,originalUrl:url};
}
function render(data){
  $("video-title").textContent=data.title||"Public video";
  $("video-author").textContent=data.author?"@"+data.author:"";
  $("video-service").textContent=data.service||"Video";
  const source=$("source-link");
  source.href=data.originalUrl||data.sources[0].url;
  if(window.VidLoadAndroid)source.onclick=e=>{e.preventDefault();window.VidLoadAndroid.openUrl(source.href);};
  const preview=$("preview-wrap");
  if(data.preview&&/^https:\/\/pbs\.twimg\.com\//.test(data.preview)){$("video-preview").src=data.preview;preview.hidden=false;}
  else{preview.hidden=true;$("video-preview").removeAttribute("src");}
  $("qualities-count").textContent=data.sources.length+" "+(data.sources.length===1?"option":"options");
  const list=$("qualities");list.replaceChildren();
  for(const [idx,s] of data.sources.slice(0,15).entries()){
    const item=document.createElement("div");item.className="quality";
    const meta=document.createElement("div");meta.className="quality-details";
    const title=document.createElement("span");title.className="quality-name";title.textContent=s.quality||"MP4";
    const sub=document.createElement("span");sub.className="quality-format";sub.textContent=idx===0?"Best available quality":"Video file";
    meta.append(title,sub);
    const actions=document.createElement("div");actions.className="quality-actions";
    const save=document.createElement("a");save.className="download-link";save.textContent="↓ Save";
    const isX=trustedXMedia(s.url);
    if(window.VidLoadAndroid){
      save.href="#";save.addEventListener("click",e=>{e.preventDefault();window.VidLoadAndroid.download(s.url,s.filename||"VidLoad_video.mp4");});
    }else {
      save.href=isX?"/api/download?url="+encodeURIComponent(s.url):s.url;
      save.download=s.filename||"VidLoad_video.mp4";
      save.rel="noopener noreferrer";
      if(!isX)save.target="_blank";
      if(isX){const direct=document.createElement("a");direct.className="direct-link";direct.href=s.url;direct.target="_blank";direct.rel="noopener noreferrer";direct.textContent="Direct file";actions.append(direct);}
    }
    actions.append(save);item.append(meta,actions);list.append(item);
  }
  results.hidden=false;results.scrollIntoView({behavior:"smooth",block:"nearest"});
}
$("download-form").addEventListener("submit",async e=>{
  e.preventDefault();results.hidden=true;showMessage("");
  const url=field.value.trim();if(!url)return showMessage("Paste a public video link to begin.",true);
  button.disabled=true;$("button-text").textContent="Finding your video…";
  try{const data=await lookup(url);if(!data.sources?.length)throw Error("No accessible MP4 found.");render(data);}
  catch(err){showMessage(err?.message||"Download lookup failed.",true);}
  finally{button.disabled=false;$("button-text").textContent="Find video";}
});
$("paste-button").addEventListener("click",async()=>{try{field.value=(await navigator.clipboard.readText()).trim();field.focus();showMessage("");}catch{field.focus();showMessage("Touch and hold the input field to paste.");}});
const initial=new URLSearchParams(location.search).get("url");
if(initial&&initial.length<2048){field.value=initial;$("download-form").requestSubmit();}
if("serviceWorker" in navigator&&location.protocol.startsWith("http"))addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
