/* ================= PlayComputer v1.1 — parser-statements.js =================
   Converte um "statement" de texto (note(), chord(), repeatEach, blocos de
   escopo de oitava [8+]{ }, referência a variável de token simples) em
   evento(s) de nota/acorde já resolvidos em frequência e duração.
   Depende de: core-utils.js, theory.js.
   ========================================================================= */

function shiftFreqByOctaves(freq, octaves){
  if(!octaves) return freq;
  return freq * Math.pow(2, octaves);
}

function extractRhythmTokens(rhythmArgStr){
  if(rhythmArgStr===undefined || rhythmArgStr===null || rhythmArgStr.trim()==='') return ['4'];
  return splitTopLevel(rhythmArgStr, ',').map(s=>s.trim());
}

function extractNoteTokens(noteArgStr){
  return splitTopLevel(noteArgStr, ',').map(s=>s.trim());
}

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
      if(freq===null) freq = 220; // fallback tolerante a erro
      freq = shiftFreqByOctaves(freq, groupOctaveShift);
      events.push({type:'note', freq, seconds:rInfo.seconds, pause:false});
    });
  } else if(kind==='chord'){
    const chordToken = [argStr];
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
      if(freqs.length===0) return;
      events.push({type:'chord', freqs, seconds:rInfo.seconds, pause:false});
    });
  }

  return events;
}

function parseRepeatEachBlock(stmtRaw, state, vars, groupOctaveShift){
  const stmt = (stmtRaw||'').trim();
  const m = stmt.match(/^repeatEach\(\s*([\d\s,]+)\s*\)\s*\{([\s\S]*)\}$/);
  if(!m) return null;

  const counts = m[1].split(',').map(s=>parseInt(s.trim(), 10)).filter(n=>!isNaN(n) && n > 0);
  if(counts.length===0) return null;

  const innerStmts = splitTopLevel(m[2].replace(/\n/g,' '), ',');
  const events = [];

  innerStmts.forEach((s, idx)=>{
    const times = counts[idx % counts.length];
    const singleEvents = parseGenericStatement(s, state, vars, groupOctaveShift);
    if(!singleEvents) return;
    for(let i=0; i<times; i++){
      events.push(...singleEvents);
    }
  });

  return events;
}

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

function extractGroupOctaveSuffix(stmt){
  const m = stmt.match(/^([\s\S]*?)\s*\[8(\+\+|\+\d*|--|-\d*)\]$/);
  if(!m) return {baseStmt: stmt, shift: 0};
  return {baseStmt: m[1], shift: parseOctaveModifier(m[2])};
}

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

  // 3) Referência a variável de parte <nome>
  if(stmt.startsWith('<') && typeof resolveVarToken === 'function'){
    const varEvents = resolveVarToken(stmt, state, vars, groupOctaveShift);
    if(varEvents) return varEvents;
  }

  // 4) rhythm(pause N) sozinho
  const pauseOnly = stmt.match(/^rhythm\(\s*pause\s+(.+)\)$/);
  if(pauseOnly){
    const rInfo = parseRhythmArg('pause '+pauseOnly[1], state);
    return [{type:'note', freq:0, seconds:rInfo.seconds, pause:true}];
  }

  // 5) Extração limpa do modificador de oitava e bloco de ritmo
  const {baseStmt: stmtClean, shift} = extractGroupOctaveSuffix(stmt);
  const rhythmMatch = stmtClean.match(/rhythm\(([\s\S]*)\)\s*$/);
  const rhythmArgStr = rhythmMatch ? rhythmMatch[1] : undefined;
  const baseStmt = stmtClean.replace(/\s*rhythm\([\s\S]*\)\s*$/,'');

  const noteMatch = baseStmt.match(/^note\(([\s\S]*)\)$/);
  if(noteMatch){
    return resolveNoteOrChord('note', noteMatch[1], rhythmArgStr, state, groupOctaveShift + shift);
  }

  const chordMatch = baseStmt.match(/^chord\(([\s\S]*)\)$/);
  if(chordMatch){
    return resolveNoteOrChord('chord', chordMatch[1], rhythmArgStr, state, groupOctaveShift + shift);
  }

  // 6) Fallback tolerante
  return null;
}

