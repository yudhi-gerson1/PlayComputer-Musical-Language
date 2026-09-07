/* ================= PlayComputer v1.1 — share.js =================
   Gera um link compartilhável embutindo o código-fonte codificado em
   base64 no #hash da URL (não precisa de servidor/backend). Ao abrir um
   link assim, o código é decodificado e carregado automaticamente na
   textarea. Depende apenas do DOM — não depende dos módulos do parser.
   ========================================================================= */

function encodeCodeToShareLink(code){
  try{
    if(!code || !code.trim()) return null;
    const encoded = btoa(unescape(encodeURIComponent(code)));
    const url = new URL(window.location.href);
    url.hash = 'code=' + encoded;
    return url.toString();
  }catch(e){ return null; }
}

function decodeCodeFromShareLink(){
  try{
    const hash = window.location.hash;
    const m = hash.match(/[#&]code=([^&]+)/);
    if(!m) return null;
    return decodeURIComponent(escape(atob(m[1])));
  }catch(e){ return null; }
}

async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch(e){
    return false;
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  const shared = decodeCodeFromShareLink();
  if(shared){
    const codeArea = document.getElementById('code');
    if(codeArea) codeArea.value = shared;
  }

  const btnShare = document.getElementById('btnShare');
  if(btnShare){
    btnShare.addEventListener('click', async ()=>{
      const codeArea = document.getElementById('code');
      const code = codeArea ? codeArea.value : '';
      const link = encodeCodeToShareLink(code);

      const report = (typeof setStatus === 'function') ? setStatus : (msg)=>console.log(msg);

      if(!link){
        report('Escreva algum código antes de gerar o link de compartilhamento!');
        return;
      }
      
      const copied = await copyToClipboard(link);
      if(copied){
        report('Link copiado! Cole em qualquer lugar para compartilhar sua música.');
      } else {
        window.prompt('Copie o link abaixo para compartilhar:', link);
      }
    });
  }
});

