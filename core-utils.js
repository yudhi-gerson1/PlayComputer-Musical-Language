/* ================= PlayComputer v1.1 — core-utils.js =================
   Funções de parsing genéricas, reutilizadas por todos os outros módulos.
   Não conhecem nada de música/sintaxe do PlayComputer — só manipulam texto.
   ========================================================================= */

// Remove comentários de linha (//) e de bloco (/* */) antes de qualquer
// outro processamento.
function stripComments(src){
  src = src.replace(/\/\*[\s\S]*?\*\//g, '');
  src = src.replace(/\/\/.*$/gm, '');
  return src;
}

// Divide uma string por um separador, mas SÓ no nível mais externo —
// ignora separadores que estejam dentro de (), {} ou [].
function splitTopLevel(str, sep){
  const parts = []; 
  let depth = 0; 
  let cur = '';
  for(const ch of str){
    if(ch === '(' || ch === '{' || ch === '[') depth++;
    else if(ch === ')' || ch === '}' || ch === ']') depth--;
    
    if(ch === sep && depth <= 0){ 
      parts.push(cur); 
      cur = ''; 
    } else {
      cur += ch;
    }
  }
  if(cur.trim() !== '') parts.push(cur);
  return parts;
}

// Encontra blocos "cabeçalho { corpo }", tratando chaves aninhadas com precisão.
function extractBraceBlocks(src, headPattern){
  const blocks = [];
  const re = new RegExp(headPattern, 'g');
  let m;
  
  while((m = re.exec(src))){
    // CORREÇÃO: Avança o cursor pulando eventuais espaços até encontrar a chave '{'
    let braceStart = re.lastIndex - 1;
    while (braceStart < src.length && src[braceStart] !== '{') {
      braceStart++;
    }
    
    if(braceStart >= src.length || src[braceStart] !== '{') continue;
    
    let depth = 1;
    let i = braceStart + 1;
    while(i < src.length && depth > 0){
      if(src[i] === '{') depth++;
      else if(src[i] === '}') depth--;
      i++;
    }
    
    const body = src.slice(braceStart + 1, Math.max(braceStart + 1, i - 1));
    blocks.push({ groups: m, body, start: m.index, end: i });
    
    // Atualiza o ponteiro de busca para o final do bloco extraído
    re.lastIndex = i;
  }
  return blocks;
}

// ADIÇÃO v1.1: Extrai blocos de escopo de oitava ex: "[8+] { ... }" ou "[8-2] { ... }"
function extractOctaveScopeBlocks(src){
  // CORREÇÃO: Regex ajustada para evitar falsos positivos e loops infinitos
  return extractBraceBlocks(src, '\\[8(?:\\+\\+|--|\\+\\d*|-\\d*)\\]\\s*\\{');
}

// Remove do texto original os blocos extraídos
function removeBlocks(src, blocks){
  if (!blocks.length) return src;
  let result = '';
  let lastIdx = 0;
  
  // Ordena do início pro fim para reconstruir a string em O(N)
  const sorted = [...blocks].sort((a,b) => a.start - b.start);
  
  for(const b of sorted){
    result += src.slice(lastIdx, b.start);
    lastIdx = b.end;
  }
  result += src.slice(lastIdx);
  return result;
}

// ADIÇÃO v1.1: Expande sufixos "xN" e grupos "[a, b]xN"
function expandRepeatTokens(rawList){
  const out = [];
  rawList.forEach(tok => {
    const t = tok.trim();
    if (!t) return;

    // Grupo: [1, 2, 3]x2
    const groupMatch = t.match(/^\[([\s\S]*)\]\s*x\s*(\d+)$/);
    if(groupMatch){
      const inner = splitTopLevel(groupMatch[1], ',').map(s => s.trim());
      const times = parseInt(groupMatch[2], 10) || 1;
      for(let i = 0; i < times; i++) out.push(...inner);
      return;
    }

    // Token individual: 3x2 ou note(1)x4
    const singleMatch = t.match(/^(.*?)\s*x\s*(\d+)$/);
    if(singleMatch){
      const times = parseInt(singleMatch[2], 10) || 1;
      for(let i = 0; i < times; i++) out.push(singleMatch[1].trim());
      return;
    }

    out.push(t);
  });
  return out;
}

// ADIÇÃO v1.1: Zip-Cycle Alignment
function zipCycleAlign(arrA, arrB){
  if (!arrA.length || !arrB.length) return [];
  const len = Math.max(arrA.length, arrB.length);
  const pairs = [];
  for(let i = 0; i < len; i++){
    pairs.push({
      a: arrA[i % arrA.length],
      b: arrB[i % arrB.length]
    });
  }
  return pairs;
}

