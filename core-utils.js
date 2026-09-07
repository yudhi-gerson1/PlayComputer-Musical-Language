/* ================= PlayComputer v1.1 — core-utils.js =================
   Funções de parsing genéricas, reutilizadas por todos os outros módulos.
   Não conhecem nada de música/sintaxe do PlayComputer — só manipulam texto.
   ========================================================================= */

// Remove comentários de linha (//) e de bloco (/* */) antes de qualquer
// outro processamento.
function stripComments(src){
  src = src.replace(/\/\*[\s\S]*?\*\//g,'');
  src = src.replace(/\/\/.*$/gm,'');
  return src;
}

// Divide uma string por um separador, mas SÓ no nível mais externo —
// ignora separadores que estejam dentro de (), {} ou []. Essencial para
// não quebrar coisas como "note(1, 2, 3) rhythm(4)" ao separar por vírgula.
function splitTopLevel(str, sep){
  const parts=[]; let depth=0; let cur='';
  for(const ch of str){
    if(ch==='('||ch==='{'||ch==='[') depth++;
    if(ch===')'||ch==='}'||ch===']') depth--;
    if(ch===sep && depth<=0){ parts.push(cur); cur=''; }
    else cur+=ch;
  }
  if(cur.trim()!=='') parts.push(cur);
  return parts;
}

// Encontra blocos "cabeçalho { corpo }" no texto, usando contagem de
// chaves para achar o fechamento correto (suporta chaves aninhadas).
// headPattern é uma regex (string) que deve terminar bem antes da chave
// de abertura — a função confirma que o próximo caractere não-espaço é '{'.
function extractBraceBlocks(src, headPattern){
  const blocks=[];
  const re=new RegExp(headPattern,'g');
  let m;
  while((m=re.exec(src))){
    const braceStart = re.lastIndex-1;
    if(src[braceStart]!=='{'){ continue; }
    let depth=1, i=braceStart+1;
    while(i<src.length && depth>0){
      if(src[i]==='{') depth++;
      else if(src[i]==='}') depth--;
      i++;
    }
    const body = src.slice(braceStart+1, Math.max(braceStart+1,i-1));
    blocks.push({groups:m, body, start:m.index, end:i});
    re.lastIndex = i;
  }
  return blocks;
}

// ADIÇÃO v1.1: mesma ideia de extractBraceBlocks, mas para blocos que
// abrem com colchetes em vez de chaves — necessário para os escopos de
// oitava "[8+] { ... }", onde o [8+] é o cabeçalho literal e { } é o corpo.
// (O corpo continua sendo delimitado por CHAVES; só o "rótulo" do escopo
// é que vem entre colchetes, então isso reaproveita extractBraceBlocks
// internamente — mantido aqui por clareza semântica do nome.)
function extractOctaveScopeBlocks(src){
  // Ex.: "[8+] {", "[8++] {", "[8-2] {", "[8+3] {"
  return extractBraceBlocks(src, '\\[8(\\+\\+|\\+\\d*|--|-\\d*)\\]\\s*\\{');
}

// Remove do texto original os blocos já extraídos, na ordem inversa
// (do fim pro começo) para não invalidar os índices dos blocos anteriores.
function removeBlocks(src, blocks){
  let result = src;
  const sorted = [...blocks].sort((a,b)=>b.start-a.start);
  for(const b of sorted){ result = result.slice(0,b.start) + result.slice(b.end); }
  return result;
}

// ADIÇÃO v1.1: expande uma lista de tokens que pode conter o sufixo "xN"
// (repetição) em cada item, e também um grupo inteiro "[a, b, c]xN".
// Usado tanto para note(1, 2, 3x2, 4x4) quanto para note([1,2,3,4]x2).
// Retorna um array simples de tokens (strings), já expandido.
function expandRepeatTokens(rawList){
  // Primeiro trata grupos "[ ... ]xN" no nível externo, pois eles podem
  // conter vírgulas internas que splitTopLevel já preserva como 1 item.
  const out = [];
  rawList.forEach(tok=>{
    const t = tok.trim();
    const groupMatch = t.match(/^\[([\s\S]*)\]\s*x\s*(\d+)$/);
    if(groupMatch){
      const inner = splitTopLevel(groupMatch[1], ',').map(s=>s.trim());
      const times = parseInt(groupMatch[2])||1;
      for(let i=0;i<times;i++) out.push(...inner);
      return;
    }
    const singleMatch = t.match(/^(.*?)\s*x\s*(\d+)$/);
    if(singleMatch){
      const times = parseInt(singleMatch[2])||1;
      for(let i=0;i<times;i++) out.push(singleMatch[1].trim());
      return;
    }
    out.push(t);
  });
  return out;
}

// ADIÇÃO v1.1: Zip-Cycle Alignment — combina dois arrays (ex.: notas e
// ritmos) pareando por índice com módulo no MENOR entre eles até cobrir
// o comprimento do MAIOR. Ex.: 4 notas + 3 ritmos -> ritmo reinicia no 4º.
// Retorna array de pares [ {a: itemA, b: itemB}, ... ] do tamanho do maior.
function zipCycleAlign(arrA, arrB){
  const len = Math.max(arrA.length, arrB.length);
  const pairs = [];
  for(let i=0;i<len;i++){
    pairs.push({
      a: arrA[i % arrA.length],
      b: arrB[i % arrB.length]
    });
  }
  return pairs;
                                                  }
