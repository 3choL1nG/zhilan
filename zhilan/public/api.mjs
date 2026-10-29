export const state={user:null,csrf:'',meta:null,exam:null,examIndex:0,route:'overview',editors:[]};
export const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function api(url,method='GET',data){const r=await fetch('/api'+url,{method,headers:{'Content-Type':'application/json','x-csrf-token':state.csrf},body:data===undefined?undefined:JSON.stringify(data),credentials:'same-origin'});const d=await r.json();if(!r.ok){if(r.status===401)window.dispatchEvent(new Event('auth-expired'));throw Object.assign(Error(d.error||'请求未完成'),{status:r.status})}return d}
export function toast(title,body='',kind='info'){window.notifyA?.(kind,title,body)}
let dialogTrigger=null;
document.addEventListener('click',e=>{const target=e.target.closest('button,a');if(target&&!target.closest('#dialog'))dialogTrigger=target},true);
export function dialog(html){const active=document.activeElement;if(active&&active!==document.body&&!active.closest('#dialog'))dialogTrigger=active;$('#dialog-content').innerHTML=html;const reference=!!$('#dialog-content .answer-page');$('#dialog-caption').textContent=reference?'参考答案':'查看内容';$('#dialog-close').textContent=reference?'← 返回作答':'关闭窗口';$('#dialog').showModal();$('#dialog-content').scrollTop=0;$('#dialog-close').focus({preventScroll:true})}
$('#dialog').addEventListener('close',()=>{if(dialogTrigger?.isConnected&&!dialogTrigger.disabled)dialogTrigger.focus({preventScroll:true})});
export function download(name,blob){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
export function bytes(n){return n>1048576?(n/1048576).toFixed(1)+' MB':(n/1024).toFixed(1)+' KB'}
export function busy(button,fn){return async(...args)=>{button.disabled=true;try{return await fn(...args)}catch(e){if(e.queue)toast('已加入运行队列',e.message,'info');else toast(e.message,'请检查后重试','err')}finally{button.disabled=false}}}
