(function(){
 const cfg=window.VG_CONFIG||{};
 async function request(path, options={}){
  if(!cfg.API_BASE_URL) throw new Error('API_BASE_URL is not configured.');
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12000);
  const token=window.VGAuth?await window.VGAuth.getAccessToken():sessionStorage.getItem('vg_token');
  try { const res=await fetch(cfg.API_BASE_URL.replace(/\/$/,'')+path,{...options,signal:controller.signal,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...options.headers}}); const body=res.status===204?null:await res.json().catch(()=>null); if(!res.ok) throw new Error(body?.detail||body?.message||`Request failed (${res.status})`); return body; }
  catch(e){if(e.name==='AbortError') throw new Error('The backend request timed out.'); throw e;} finally{clearTimeout(timer);}
 }
 window.VGApi={request,get:p=>request(p),post:(p,b)=>request(p,{method:'POST',body:JSON.stringify(b)}),put:(p,b)=>request(p,{method:'PUT',body:JSON.stringify(b)}),patch:(p,b)=>request(p,{method:'PATCH',body:JSON.stringify(b)}),delete:p=>request(p,{method:'DELETE'})};
})();
