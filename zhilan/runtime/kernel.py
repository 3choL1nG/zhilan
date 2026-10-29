"""Private control socket, real persistent ipykernel. Rich output is MIME-whitelisted."""
import os,json,socket,time,traceback
from jupyter_client import KernelManager
SOCKET='/work/.control.sock'
os.makedirs('/work',exist_ok=True)
for name in os.listdir('/materials'):
 if name not in os.listdir('/work'):os.symlink('/materials/'+name,'/work/'+name)
# Preserve the supplied Windows font path without rewriting answers.
os.makedirs('/work/C:/Windows/Fonts',exist_ok=True)
font='/usr/share/fonts/truetype/wqy/wqy-microhei.ttc'
if os.path.exists(font):os.symlink(font,'/work/C:/Windows/Fonts/simhei.ttf')
km=KernelManager(connection_file='/tmp/kernel.json');km.start_kernel(cwd='/work');client=km.client();client.start_channels();client.wait_for_ready(timeout=40)
# Legacy ONNX initializers emit enough native warnings to block the notebook stderr pipe.
# Keep errors visible while suppressing warning noise; standard student code stays unchanged.
client.execute("import onnxruntime as _ort\n_ort.set_default_logger_severity(3)\ndel _ort\n%matplotlib inline\nimport matplotlib.pyplot as plt\nplt.rcParams['font.sans-serif'] = ['WenQuanYi Micro Hei']\nplt.rcParams['axes.unicode_minus'] = False")
try:os.unlink(SOCKET)
except FileNotFoundError:pass
sock=socket.socket(socket.AF_UNIX);sock.bind(SOCKET);os.chmod(SOCKET,0o600);sock.listen(4)
LIMIT=1024*1024
active_qid=None
while True:
 conn,_=sock.accept()
 try:
  raw=b''
  while not raw.endswith(b'\n'):
   chunk=conn.recv(65536)
   if not chunk:break
   raw+=chunk
   if len(raw)>LIMIT:raise ValueError('请求过大')
  request=json.loads(raw)
  code=request.get('code','')
  if not isinstance(code,str) or len(code)>200000:raise ValueError('代码过长')
  qid=request.get('qid')
  if qid:
   import re
   if not re.fullmatch(r'[1-4]\.[12]\.[1-5]',qid):raise ValueError('题号无效')
   if qid!=active_qid:
    directory='/work/'+qid;os.makedirs(directory,exist_ok=True)
    materials='/bank/'+qid
    if os.path.isdir(materials):
     for item in os.listdir(materials):
      target=directory+'/'+item
      if not os.path.lexists(target):os.symlink(materials+'/'+item,target)
    compat=directory+'/C:/Windows/Fonts';os.makedirs(compat,exist_ok=True)
    if os.path.exists(font) and not os.path.lexists(compat+'/simhei.ttf'):os.symlink(font,compat+'/simhei.ttf')
    prep="get_ipython().run_line_magic('reset','-f')\nimport os,gc\nos.chdir("+repr(directory)+")\ngc.collect()\n%matplotlib inline\nimport matplotlib.pyplot as plt\nplt.rcParams['font.sans-serif']=['WenQuanYi Micro Hei']\nplt.rcParams['axes.unicode_minus']=False"
    client.execute(prep,silent=True,store_history=False,stop_on_error=True)
    active_qid=qid
  msg_id=client.execute(code,stop_on_error=True);events=[];length=0;deadline=time.monotonic()+min(180,int(request.get('timeout',120)))
  while True:
   remaining=deadline-time.monotonic()
   if remaining<=0:km.interrupt_kernel();raise TimeoutError('运行超过时限，已中断；可以修改后重试。')
   try:m=client.get_iopub_msg(timeout=min(remaining,1))
   except Exception:continue
   if m.get('parent_header',{}).get('msg_id')!=msg_id:continue
   kind=m['header']['msg_type'];content=m['content'];event=None
   if kind=='stream':event={'type':'stream','name':content['name'],'text':content['text']}
   elif kind in ('display_data','execute_result'):
    data={k:v for k,v in content.get('data',{}).items() if k in ('text/plain','image/png','image/jpeg')}
    event={'type':'display','data':data,'execution_count':content.get('execution_count')}
   elif kind=='error':event={'type':'error','name':content['ename'],'message':content['evalue'],'traceback':content.get('traceback',[])}
   if event:
    length+=len(json.dumps(event).encode())
    if length>LIMIT:km.interrupt_kernel();raise ValueError('输出超过1MB限制，运行已中断。请减少输出。')
    events.append(event)
   if kind=='status' and content.get('execution_state')=='idle':break
  result={'ok':not any(e['type']=='error' for e in events),'events':events}
 except Exception as e:result={'ok':False,'events':[{'type':'error','name':type(e).__name__,'message':str(e)}]}
 try:conn.sendall((json.dumps(result,ensure_ascii=False)+'\n').encode())
 except BrokenPipeError:pass
 conn.close()
