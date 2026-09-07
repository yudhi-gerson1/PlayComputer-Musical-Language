/* ================= PlayComputer v1.1 — parser-vars.js =================
   Variáveis de PARTE (sintaxe <nome> part { ... }), incluindo redefinição
   (o último valor escrito vence) e resolução de <nome>.repeat()/.tone()/
   .escape() quando referenciadas dentro de um play.
   Depende de: core-utils.js, theory.js, parser-statements.js
   ========================================================================= */

// Extrai todas as declarações "<nome> part { ... }" do texto-fonte
function extractPartVariables(src, state, existingVars){
  const vars = existingVars || {};

  const blocks = extractBraceBlocks(src, '<([A-Za-z_]\\w*)>\\s*part\\s*\\{');
  blocks.forEach(b=>{
    try{
      const varName = b.groups[1];
      const bodyStmts = splitTopLevel(b.body.replace(/\n/g,' '), ',');
      const events = [];
      
      // Trava de segurança temporária para evitar autorreferência/recursão infinita
      vars[varName] = { type: 'part', events: [] };

      bodyStmts.forEach(s=>{
        const ev = parseGenericStatement(s, state, vars, 0);
        if(ev) events.push(...ev);
      });

      // Sobrescreve — última declaração vence.
      vars[varName] = { type: 'part', events };
    }catch(e){}
  });

  return { vars, blocksFound: blocks };
}

// Remove declarações "<nome> part { ... }" processadas
function removePartVariableDeclarations(src, blocksFound){
  return removeBlocks(src, blocksFound);
}

// Resolve uma REFERÊNCIA a variável de parte
function resolveVarToken(stmtRaw, state, vars, groupOctaveShift, toneSemitoneShift){
  const stmt = (stmtRaw||'').trim();
  // Regex tolerante a espaços antes dos métodos encadeados
  const m = stmt.match(/^<([A-Za-z_]\w*)>\s*(((?:\.\s*(?:repeat|tone|escape)\([^)]*\)\s*))*)$/);
  if(!m) return null;

  const varName = m[1];
  const varData = vars[varName];
  if(!varData || varData.type!=='part') return null;

  const chain = m[2] || '';
  const callRe = /\.\s*(repeat|tone|escape)\(([^)]*)\)/g;
  let repeatCount = 1;
  let localToneStep = 0;
  let escapeSeconds = 0;
  let c;

  while((c=callRe.exec(chain))){
    const fn = c[1], arg = c[2].trim();
    if(fn==='repeat'){ 
      const n = parseInt(arg, 10); 
      if(n > 0) repeatCount = n; 
    }
    else if(fn==='tone'){ 
      localToneStep = modToSemitone(arg); 
    }
    else if(fn==='escape'){ 
      escapeSeconds = (parseFloat(arg)||0) * (60 / (state.bpm || 120)); 
    }
  }

  const effectiveToneStep = (toneSemitoneShift!==undefined && toneSemitoneShift!==null)
    ? toneSemitoneShift
    : localToneStep;

  const baseFactor = Math.pow(2, (effectiveToneStep)/12) * Math.pow(2, groupOctaveShift||0);

  const out = [];
  for(let r=0; r<repeatCount; r++){
    varData.events.forEach(ev=>{
      if(ev.pause){ 
        out.push({...ev}); 
        return; 
      }
      if(ev.type==='note'){
        out.push({...ev, freq: ev.freq * baseFactor});
      } else if(ev.type==='chord'){
        out.push({...ev, freqs: ev.freqs.map(f => f * baseFactor)});
      }
    });
  }

  if(escapeSeconds > 0) {
    out._escapeSeconds = escapeSeconds;
  }

  return out;
}

// Helper para resolver <var>.tone(^) acumulado dentro de repeat(n) { }
function resolveVarInAccumulatingRepeat(stmtRaw, state, vars, groupOctaveShift, iterations){
  const stmt = (stmtRaw||'').trim();
  const m = stmt.match(/^<([A-Za-z_]\w*)>\s*\.\s*tone\(([^)]*)\)$/);
  
  if(!m){
    const events = [];
    for(let i=0; i<iterations; i++){
      const single = resolveVarToken(stmt, state, vars, groupOctaveShift, 0);
      if(single) {
        events.push(...single);
        if(single._escapeSeconds) events._escapeSeconds = single._escapeSeconds;
      }
    }
    return events;
  }

  const step = modToSemitone(m[2]);
  const events = [];
  for(let i=0; i<iterations; i++){
    const single = resolveVarToken('<'+m[1]+'>', state, vars, groupOctaveShift, step * i);
    if(single) {
      events.push(...single);
      if(single._escapeSeconds) events._escapeSeconds = single._escapeSeconds;
    }
  }
  return events;
}

