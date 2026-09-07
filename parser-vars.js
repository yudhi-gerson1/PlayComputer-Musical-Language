/* ================= PlayComputer v1.1 — parser-vars.js =================
   Variáveis de PARTE (sintaxe <nome> part { ... }), incluindo redefinição
   (o último valor escrito vence) e resolução de <nome>.repeat()/.tone()/
   .escape() quando referenciadas dentro de um play.
   Depende de: core-utils.js, theory.js, parser-statements.js
   (especificamente de parseGenericStatement).
   ========================================================================= */

// Extrai todas as declarações "<nome> part { ... }" do texto-fonte e
// devolve um mapa { nome: eventsArray }. Se o mesmo nome aparecer mais de
// uma vez, o ÚLTIMO declarado sobrescreve os anteriores (regra confirmada
// pelo usuário) — por isso iteramos em ordem e sempre sobrescrevemos.
function extractPartVariables(src, state, existingVars){
  const vars = existingVars || {};

  const blocks = extractBraceBlocks(src, '<([A-Za-z_]\\w*)>\\s*part\\s*\\{');
  blocks.forEach(b=>{
    try{
      const varName = b.groups[1];
      const bodyStmts = splitTopLevel(b.body.replace(/\n/g,' '), ',');
      const events = [];
      bodyStmts.forEach(s=>{
        const ev = parseGenericStatement(s, state, vars, 0);
        if(ev) events.push(...ev);
      });
      // Sobrescreve — última declaração vence.
      vars[varName] = {type:'part', events};
    }catch(e){}
  });

  return { vars, blocksFound: blocks };
}

// Remove do texto todas as declarações "<nome> part { ... }" já
// processadas, para que o restante do compilador não tente reinterpretá-
// -las como outra coisa.
function removePartVariableDeclarations(src, blocksFound){
  return removeBlocks(src, blocksFound);
}

// Resolve uma REFERÊNCIA a variável de parte usada dentro de um play,
// como "<melodia>" sozinha, ou com encadeamento de .repeat(n)/.tone(mod)/
// .escape(n) — ex.: "<melodia>.tone(^)" dentro de um repeat(4) { }.
//
// IMPORTANTE: quando <var>.tone(^) aparece dentro de um repeat(n) { },
// quem controla a iteração e acumula a transposição é o CHAMADOR (o
// repeat externo, tratado em parser-play.js) — esta função apenas aplica
// UM shift de tom (em semitons) de cada vez que é chamada, e quem decide
// "chamar 4 vezes com shift crescente" é o parser do repeat.
// Por isso o 3º parâmetro aqui, toneSemitoneShift, já vem PRONTO
// (multiplicado pelo índice da iteração) de quem chamou.
function resolveVarToken(stmtRaw, state, vars, groupOctaveShift, toneSemitoneShift){
  const stmt = (stmtRaw||'').trim();
  const m = stmt.match(/^<([A-Za-z_]\w*)>((?:\.(?:repeat|tone|escape)\([^)]*\))*)$/);
  if(!m) return null;

  const varName = m[1];
  const varData = vars[varName];
  if(!varData || varData.type!=='part') return null;

  const chain = m[2] || '';
  const callRe = /\.(repeat|tone|escape)\(([^)]*)\)/g;
  let repeatCount = 1;
  let localToneStep = 0;
  let escapeSeconds = 0;
  let c;
  while((c=callRe.exec(chain))){
    const fn = c[1], arg = c[2].trim();
    if(fn==='repeat'){ const n=parseInt(arg); if(n>0) repeatCount=n; }
    else if(fn==='tone'){ localToneStep = modToSemitone(arg); }
    else if(fn==='escape'){ escapeSeconds = (parseFloat(arg)||0) * (60/state.bpm); }
  }

  // toneSemitoneShift (vindo de um repeat() externo que já está
  // acumulando por iteração) tem prioridade sobre um .tone() local fixo,
  // exatamente como fizemos para #id.repeat(n).tone(^) nas revisões
  // anteriores do motor.
  const effectiveToneStep = (toneSemitoneShift!==undefined && toneSemitoneShift!==null)
    ? toneSemitoneShift
    : localToneStep;

  const baseFactor = Math.pow(2, (effectiveToneStep)/12) * Math.pow(2, groupOctaveShift||0);

  const out = [];
  for(let r=0;r<repeatCount;r++){
    varData.events.forEach(ev=>{
      if(ev.pause){ out.push({...ev}); return; }
      if(ev.type==='note'){
        out.push({...ev, freq: ev.freq*baseFactor});
      } else if(ev.type==='chord'){
        out.push({...ev, freqs: ev.freqs.map(f=>f*baseFactor)});
      }
    });
  }

  // escape() em variável de parte referenciada dentro de um play não
  // desloca o tempo diretamente aqui (isso é responsabilidade de
  // parser-play.js, que monta startOffsetSeconds por canal) — mas
  // devolvemos a informação junto para quem chamou decidir o que fazer.
  if(escapeSeconds) out._escapeSeconds = escapeSeconds;

  return out;
}

// ADIÇÃO: helper usado por parser-play.js para resolver um <var>.tone(^)
// dentro de um repeat(n) { } com transposição ACUMULADA por iteração
// (mesma regra confirmada: iteração 1 = tom original, iteração 2 = +1
// passo, iteração 3 = +2 passos, etc). Devolve o array de eventos já
// combinado para as n iterações.
function resolveVarInAccumulatingRepeat(stmtRaw, state, vars, groupOctaveShift, iterations){
  const stmt = (stmtRaw||'').trim();
  const m = stmt.match(/^<([A-Za-z_]\w*)>\.tone\(([^)]*)\)$/);
  if(!m){
    // Não é um <var>.tone(...) — resolve normalmente (repete o bloco
    // 'iterations' vezes sem transposição incremental).
    const events = [];
    for(let i=0;i<iterations;i++){
      const single = resolveVarToken(stmt, state, vars, groupOctaveShift, 0);
      if(single) events.push(...single);
    }
    return events;
  }

  const step = modToSemitone(m[2]);
  const events = [];
  for(let i=0;i<iterations;i++){
    const single = resolveVarToken('<'+m[1]+'>', state, vars, groupOctaveShift, step*i);
    if(single) events.push(...single);
  }
  return events;
}
