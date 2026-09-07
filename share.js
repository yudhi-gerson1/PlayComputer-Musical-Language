/* ================= PlayComputer v1.1 — share.js =================
   Gera um link compartilhável embutindo o código-fonte codificado em
   base64 no #hash da URL (não precisa de servidor/backend). Ao abrir um
   link assim, o código é decodificado e carregado automaticamente na
   textarea. Depende apenas do DOM — não depende dos módulos do parser.
   ========================================================================= */

// Codifica o texto do editor em base64 seguro para URL e monta o link
// completo usando o #hash (não é enviado ao servidor, então funciona até
// em arquivo local file:// e não precisa de backend).
function encodeCodeToShareLink(code){
  try{
    const encoded = btoa(unescape(encodeURIComponent(code)));
    const url = new URL(window.location.href);
    url.hash = 'code=' + encoded;
    return url.toString();
  }catch(e){ return null; }
}

// Lê o #hash da URL atual e devolve o código decodificado, ou null se
// não houver nenhum código compartilhado nessa URL.
function decodeCodeFromShareLink(){
  try{
    const hash = window.location.hash;
    const m = hash.match(/#code=(.+)$/);
    if(!m) return null;
    return decodeURIComponent(escape(atob(m[1])));
  }catch(e){ return null; }
}

// Copia texto para a área de transferência; retorna true/false conforme
// sucesso (a Clipboard API pode falhar por permissão ou contexto inseguro).
async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch(e){
    return false;
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  // Se a página foi aberta a partir de um link compartilhado, carrega o
  // código automaticamente na textarea antes de qualquer outra coisa.
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

      // setStatus vem de ui.js — como todos os scripts já carregaram antes
      // do usuário conseguir clicar, ele estará disponível neste ponto.
      const report = (typeof setStatus === 'function') ? setStatus : (msg)=>console.log(msg);

      if(!link){
        report('Não foi possível gerar o link de compartilhamento.');
        return;
      }
      const copied = await copyToClipboard(link);
      if(copied){
        report('Link copiado! Cole em qualquer lugar para compartilhar sua música.');
      } else {
        // Fallback para navegadores/contextos sem permissão de clipboard
        // (ex.: file:// em alguns navegadores): mostra o link num prompt
        // para cópia manual, em vez de simplesmente falhar silenciosamente.
        window.prompt('Copie o link abaixo para compartilhar:', link);
      }
    });
  }
});
