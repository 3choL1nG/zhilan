export function practicalAnswer(v){
 const error=()=>{throw Object.assign(Error('实操作答格式不正确或文字过长'),{status:400})};
 if(!v||typeof v!=='object'||Array.isArray(v))error();const out={code:{},text:'',notebook:[]};
 if(v.code!==undefined){if(!v.code||typeof v.code!=='object'||Array.isArray(v.code))error();const entries=Object.entries(v.code);if(entries.length>300)error();for(const [k,t]of entries){if(k.length>100||typeof t!=='string'||t.length>20000)error();out.code[k]=t}}
 if(v.text!==undefined){if(typeof v.text!=='string'||v.text.length>60000)error();out.text=v.text}
 if(v.notebook!==undefined){if(!Array.isArray(v.notebook)||v.notebook.length>100||v.notebook.some(t=>typeof t!=='string'||t.length>200000))error();out.notebook=v.notebook}
 if(v.document){const d=v.document;if(!Array.isArray(d.paragraphs)||d.paragraphs.length>500||!Array.isArray(d.tables)||d.tables.length>20)error();const paragraphs=d.paragraphs.map(p=>{if(!p||!Number.isInteger(p.index)||p.index<0||p.index>500||typeof p.text!=='string'||p.text.length>20000)error();return {index:p.index,text:p.text}});const tables=d.tables.map(t=>{if(!Array.isArray(t)||t.length>200)error();return t.map(r=>{if(!Array.isArray(r)||r.length>50||r.some(c=>typeof c!=='string'||c.length>10000))error();return r})});if(d.template!==null&&(typeof d.template!=='string'||!/^([^/\\]{1,150})\.docx$/i.test(d.template)))error();out.document={template:d.template,paragraphs,tables}}
 if(JSON.stringify(out).length>150000)error();return out
}
