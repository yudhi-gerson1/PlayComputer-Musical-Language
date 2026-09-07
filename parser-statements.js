/* ================= PlayComputer v1.1 — parser-statements.js =================
   Converte um "statement" de texto (note(), chord(), repeatEach, blocos de
   escopo de oitava [8+]{ }, referência a variável de token simples) em
   evento(s) de nota/acorde já resolvidos em frequência e duração.
   Depende de: core-utils.js, theory.js.
   ========================================================================= */

// Aplica um deslocamento de N oitavas (inteiro) a uma frequência já
// calculada. Usado pelos escopos [8+]{ } e pelos modificadores de grupo
// note(...)[8+n] / chord(...)[8+n].
function shiftFreqByOctaves(freq, octaves){
  if(!octaves) return freq;
  return freq * Math.pow(2, octaves);
}

// Parseia um único statement de rhythm (pode ter vários ritmos separados
// por vírgula dentro do rhythm(), com suporte a xN — ex.: rhythm(8, 4)).
// Retorna a lista de tokens crus (strings), sem resolver ainda em segundos
// — isso é feito depois, pareado com os tokens de nota, via alignNotesAndRhythms.
function extractRhythmTokens(rhythmArgStr){
  if(rhythmArgStr===undefined || rhythmArgStr===null || rhythmArgStr.trim()==='') return ['4'];
  return splitTopLevel(rhythmArgStr, ',').map(s=>s.trim());
}

// Parseia os tokens de nota dentro de note(...) ou chord(...), já
// suportando xN em cada token individual — a expansão de grupo [ ]xN e o
// zip-cycle com os ritmos acontecem em alignNotesAndRhythms (theory.js).
function extractNoteTokens(noteArgStr){
  return splitTopLevel(noteArgStr, ',').map(s=>s.trim());
}

// Resolve um único statement "note(...)" ou "chord(...)" (já sem o
// rhythm() correspondente) em uma lista de eventos {type, freq/freqs,
// seconds, pause}. Um statement pode virar VÁRIOS eventos por causa do
// zip-cycle entre notas e ritmos (ex.: note(1,2,3,4) rhythm(4,8,16)).
//
// groupOctaveShift: deslocamento de oitava vindo de um modificador de
// grupo note(...)[8+n] OU de um escopo [8+]{ } ao redor — os dois se
// somam (comportamento de pilha de contexto confirmado pelo usuário).
function resolveNoteOrChord(kind, argStr, rhythmArgStr, state, groupOctaveShift){
  const rhythmTokens = extractRhythmTokens(rhythmArgStr);
  const events = [];

  if(kind==='note'){
    const noteTokens = extractNoteTokens(argStr);
    const aligned = alignNotesAndRhythms(noteTokens, rhythmTokens);
    aligned.forEach(({noteToken, rhythmToken})=>{
      const rInfo = parseRhythmArg(rhythmToken, state);
      if(rInfo.pause){
        events.push({type:'note', freq:0, seconds:rInfo.seconds, pause:true});
        return;
      }
      let freq = degreeToFreq(noteToken, state);
      if(freq===null) freq = 220; // fallback tolerante a erro de sintaxe
      freq = shiftFreqByOctaves(freq, groupOctaveShift);
      events.push({type:'note', freq, seconds:rInfo.seconds, pause:false});
    });
  } else if(kind==='chord'){
    // Para chord(), cada "nota" do acorde toca junto — não faz zip-cycle
    // nota-a-nota, mas o conjunto do acorde ainda pode ter vários ritmos
    // em sequência (ex.: chord(1,3,5) rhythm(4,8) tocaria o acorde duas
    // vezes, uma em cada ritmo) — aplicamos zip-cycle no NÍVEL do acorde.
    const chordToken = [argStr]; // o acorde inteiro é "1 item" pro zip-cycle de ritmo
    const aligned = zipCycleAlign(chordToken, rhythmTokens);
    aligned.forEach(({a, b})=>{
      const rInfo = parseRhythmArg(b, state);
      if(rInfo.pause){
        events.push({type:'chord', freqs:[], seconds:rInfo.seconds, pause:true});
        return;
      }
      const noteTokens = extractNoteTokens(a);
      const freqs = noteTokens
        .map(t=>degreeToFreq(t, state))
        .filter(f=>f!==null)
        .map(f=>shiftFreqByOctaves(f, groupOctaveShift));
      if(freqs.length===0) return; // tolerante a erro: ignora acorde vazio
      events.push({type:'chord', freqs, seconds:rInfo.seconds, pause:false});
    });
  }

  return events;
}

// ADIÇÃO v1.1: repeatEach(n1, n2, ...) { statements } — cada statement
// dentro do bloco (na ordem em que aparece) é repetido de acordo com o
// parâmetro correspondente, usando módulo quando há mais notas que
// parâmetros (comportamento confirmado: índice da nota MOD tamanho da
// lista de parâmetros).
function parseRepeatEachBlock(stmtRaw, state, vars, groupOctaveShift){
  const stmt = (stmtRaw||'').trim();
  const m = stmt.match(/^repeatEach\(\s*([\d\s,]+)\s*\)\s*\{([\s\S]*)\}$/);
  if(!m) return null;

  const counts = m[1].split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n));
  if(counts.length===0) return null;

  const innerStmts = splitTopLevel(m[2].replace(/\n/g,' '), ',');
  const events = [];

  innerStmts.forEach((s, idx)=>{
    const times = counts[idx % counts.length];
    const singleEvents = parseGenericStatement(s, state, vars, groupOctaveShift);
    if(!singleEvents) return;
    for(let i=0;i<times;i++){
      events.push(...singleEvents);
    }
  });

  return events;
}

// ADIÇÃO v1.1: bloco de escopo de oitava "[8+] { statements }" (ou
// [8++], [8-2], etc). Aplica o deslocamento a TODOS os statements filhos,
// e aceita aninhamento (o shift do escopo pai se soma ao do escopo filho,
// pois passamos groupOctaveShift acumulado recursivamente).
function parseOctaveScopeStatement(stmtRaw, state, vars, groupOctaveShift){
  const stmt = (stmtRaw||'').trim();
  const m = stmt.match(/^\[8(\+\+|\+\d*|--|-\d*)\]\s*\{([\s\S]*)\}$/);
  if(!m) return null;

  const localShift = parseOctaveModifier(m[1]);
  const totalShift = (groupOctaveShift||0) + localShift;

  const innerStmts = splitTopLevel(m[2].replace(/\n/g,' '), ',');
  const events = [];
  innerStmts.forEach(s=>{
    const singleEvents = parseGenericStatement(s, state, vars, totalShift);
    if(singleEvents) events.push(...singleEvents);
  });
  return events;
}

// Extrai o modificador de oitava de GRUPO colado depois de note(...) ou
// chord(...) — ex.: "note(1,2,3)[8+]" ou "chord(1,3,5)[8-2]". Retorna
// {baseStmt, shift} onde baseStmt é o statement sem o sufixo de oitava.
function extractGroupOctaveSuffix(stmt){
  const m = stmt.match(/^([\s\S]*?\))\s*\[8(\+\+|\+\d*|--|-\d*)\]$/);
  if(!m) return {baseStmt: stmt, shift: 0};
  return {baseStmt: m[1], shift: parseOctaveModifier(m[2])};
}

// Ponto de entrada genérico: recebe UM statement (string) e devolve uma
// lista de eventos (pode ser vazia). Tenta, em ordem: bloco de escopo de
// oitava, repeatEach, note()/chord() com possível sufixo de oitava de
// grupo, ou referência a variável simples <nome> — a resolução de
// variáveis de parte fica em parser-vars.js e é encaixada externamente
// (esta função chama window.resolveVarToken se ela existir, para não criar
// dependência circular de carregamento entre os dois arquivos).
function parseGenericStatement(stmtRaw, state, vars, groupOctaveShift){
  const stmt = (stmtRaw||'').trim();
  if(!stmt) return null;
  groupOctaveShift = groupOctaveShift || 0;

  // 1) Escopo de oitava [8+] { ... }
  const scopeEvents = parseOctaveScopeStatement(stmt, state, vars, groupOctaveShift);
  if(scopeEvents) return scopeEvents;

  // 2) repeatEach(...) { ... }
  const repeatEachEvents = parseRepeatEachBlock(stmt, state, vars, groupOctaveShift);
  if(repeatEachEvents) return repeatEachEvents;

  // 3) Referência a variável de parte <nome> (com ou sem .repeat()/.tone()/
  //    .escape() encadeados) — delega para parser-vars.js se disponível.
  if(stmt.startsWith('<') && typeof resolveVarToken === 'function'){
    const varEvents = resolveVarToken(stmt, state, vars, groupOctaveShift);
    if(varEvents) return varEvents;
  }

  // 4) rhythm(pause N) sozinho (statement de pausa "solta")
  const pauseOnly = stmt.match(/^rhythm\(\s*pause\s+(.+)\)$/);
  if(pauseOnly){
    const rInfo = parseRhythmArg('pause '+pauseOnly[1], state);
    return [{type:'note', freq:0, seconds:rInfo.seconds, pause:true}];
  }

  // 5) note(...) ou chord(...) — com possível [8+n] de grupo colado, e
  //    rhythm(...) opcional em seguida.
  const {baseStmt, shift} = extractGroupOctaveSuffix(stmt.replace(/\s*rhythm\([\s\S]*\)$/,''));
  const rhythmMatch = stmt.match(/rhythm\(([\s\S]*)\)\s*$/);
  const rhythmArgStr = rhythmMatch ? rhythmMatch[1] : undefined;

  const noteMatch = baseStmt.match(/^note\(([\s\S]*)\)$/);
  if(noteMatch){
    return resolveNoteOrChord('note', noteMatch[1], rhythmArgStr, state, groupOctaveShift+shift);
  }
  const chordMatch = baseStmt.match(/^chord\(([\s\S]*)\)$/);
  if(chordMatch){
    return resolveNoteOrChord('chord', chordMatch[1], rhythmArgStr, state, groupOctaveShift+shift);
  }

  // 6) Fallback tolerante a erro: statement não reconhecido é ignorado
  //    silenciosamente (regra do manual: "sem um piu").
  return null;
}
