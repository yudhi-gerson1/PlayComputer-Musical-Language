/* ================= PlayComputer v1.1 — parser-play.js =================
   O "compile()" principal: junta tudo — globais, variáveis <parte>, blocos
   play (single e multi-instrumento), atributos novos (type/articul/fade/
   volume/speed/ids), escopos de oitava, repeat/tone/escape externos.
   Depende de: core-utils.js, theory.js, parser-statements.js, parser-vars.js
   ========================================================================= */

const INSTRUMENT_LIST = 'standard|piano|guitar|synthBass|guitarBass|synth|organ|accordeon|ukulele|drum|violin|saxophone|trumpet|vibraphone|choir|whistle';
const EFFECT_TYPES = ['delay','wah','8bit','distorted','reverb','normal'];
const ARTICULATIONS = ['staccato','legato','marcato','portato','tenuto','normal'];

const ARTICULATION_GATE = {
  staccato: 0.50, normal: 0.90, tenuto: 1.05,
  legato: 1.0, marcato: 0.95, portato: 0.75
};

function normalizeInstrument(name){
  const n=(name||'').toLowerCase();
  const map={
    standard:'piano', piano:'piano', guitar:'guitar', synthbass:'synthBass',
    guitarbass:'guitarBass', synth:'synth', organ:'organ', accordeon:'accordeon',
    ukulele:'ukulele', drum:'drum', violin:'violin', saxophone:'saxophone',
    trumpet:'trumpet', vibraphone:'vibraphone', choir:'choir', whistle:'whistle'
  };
  return map[n] || 'piano';
}

function parseGlobals(src, state){
  try{ const m=src.match(/\blang\s+([A-Za-z-]+)/); if(m){ const v=m[1].toLowerCase(); state.lang = v==='pt'?'pt-BR': v==='en'?'en-US': m[1]; } }catch(e){}
  try{
    const m=src.match(/\bcompass\s+(standard|(\d+)\/(\d+))/);
    if(m){
      if(m[1]==='standard'){ state.compass='4/4'; state.beatsPerMeasure=4; }
      else { state.compass=m[1]; state.beatsPerMeasure=parseInt(m[2],10)||4; }
    }
  }catch(e){}
  try{ const m=src.match(/\bbpm\s+(\d+)/); if(m) state.bpm = parseInt(m[1],10)||120; }catch(e){}
  try{
    const m=src.match(/\bscale\s+(standard|[A-G]#?)\s*(major|minor)?/);
    if(m){
      if(m[1]==='standard'){ state.root='C'; state.scaleType='major'; }
      else { state.root=m[1]; state.scaleType = m[2]||'major'; }
    }
  }catch(e){}
  try{
    if(/\bmetronome\s+active\b/.test(src)) state.metronome=true;
    if(/\bmetronome\s+unactive\b/.test(src)) state.metronome=false;
  }catch(e){}
  try{ parseStdOctave(src, state); }catch(e){}
}

function parseAttributeBlock(attrBody){
  const attrs = { id:null, ids:[], classes:[], type:'normal', articul:'normal',
                  fadeIn:null, fadeOut:null, volume:1, speedFactor:1 };

  const idMatch = attrBody.match(/\bid\s*=\s*"([^"]+)"/);
  if(idMatch) attrs.id = idMatch[1];

  const idsMatch = attrBody.match(/\bids\s*=\s*("(?:[^"]+)"(?:\s*,\s*"[^"]+")*)/);
  if(idsMatch){
    attrs.ids = idsMatch[1].match(/"([^"]+)"/g).map(s=>s.replace(/"/g,''));
  }

  const classMatch = attrBody.match(/\bclass\s*=\s*"([^"]+)"/);
  if(classMatch) attrs.classes = classMatch[1].split(/\s+/).filter(Boolean);

  const typeMatch = attrBody.match(/\btype\s*=\s*"?([A-Za-z0-9]+)"?/);
  if(typeMatch){
    const t = typeMatch[1].toLowerCase();
    attrs.type = EFFECT_TYPES.includes(t) ? t : 'normal';
  }

  const articulMatch = attrBody.match(/\barticul\s*=\s*"?([A-Za-z]+)"?/);
  if(articulMatch){
    const a = articulMatch[1].toLowerCase();
    attrs.articul = ARTICULATIONS.includes(a) ? a : 'normal';
  }

  const fadeMatch = attrBody.match(/\bfade\s*=\s*([^\n]+)/);
  if(fadeMatch){
    const raw = fadeMatch[1].trim();
    const inOutMatch = raw.match(/in:\s*(loud|quiet)\s*(\d+)?%?[,;]?\s*out:\s*(loud|quiet)\s*(\d+)?%?/i);
    if(inOutMatch){
      attrs.fadeIn  = { kind: inOutMatch[1].toLowerCase(), pct: parseInt(inOutMatch[2],10)||50 };
      attrs.fadeOut = { kind: inOutMatch[3].toLowerCase(), pct: parseInt(inOutMatch[4],10)||50 };
    } else {
      const single = raw.match(/(loud|quiet)\s*(\d+)?%?/i);
      if(single){
        const fadeObj = { kind: single[1].toLowerCase(), pct: parseInt(single[2],10)||50 };
        attrs.fadeIn = fadeObj; attrs.fadeOut = fadeObj;
      }
    }
  }

  const volMatch = attrBody.match(/\bvolume\s*=\s*(\d+)%/);
  if(volMatch) attrs.volume = Math.max(0, Math.min(2, parseInt(volMatch[1],10)/100));

  const speedPctMatch = attrBody.match(/\bspeed\s*=\s*(\d+)%/);
  const speedMulMatch = attrBody.match(/\bspeed\s*=\s*(\d+(?:\.\d+)?)\s*x/i);
  if(speedPctMatch) attrs.speedFactor = Math.max(0.05, parseInt(speedPctMatch[1],10)/100);
  else if(speedMulMatch) attrs.speedFactor = Math.max(0.05, parseFloat(speedMulMatch[1]));

  return attrs;
}

function parsePlayBody(body, state, vars){
  const stmts = splitTopLevel(body.replace(/\n/g,' '), ',');
  const events = [];
  stmts.forEach(s=>{
    try{
      const repInline = parseInlinePlayRepeat(s, state, vars);
      if(repInline){ events.push(...repInline); return; }
      const ev = parseGenericStatement(s, state, vars, 0);
      if(ev) events.push(...ev);
    }catch(e){}
  });
  return events;
}

function parseInlinePlayRepeat(stmtRaw, state, vars){
  const stmt = (stmtRaw||'').trim();
  const m = stmt.match(/^repeat\(\s*(\d+)\s*\)\s*\{([\s\S]*)\}$/);
  if(!m) return null;
  const count = parseInt(m[1],10)||1;
  const innerStmts = splitTopLevel(m[2].replace(/\n/g,' '), ',');

  let toneStep = 0;
  const events = [];

  // Descobre tom global do bloco primeiro
  innerStmts.forEach(s => {
    const t = s.trim();
    const globalTone = t.match(/^tone\(([^)]*)\)$/);
    if(globalTone) toneStep = modToSemitone(globalTone[1]);
  });

  // Executa mantendo a ordem exata das declarações
  for(let i = 0; i < count; i++){
    const factor = Math.pow(2, (toneStep * i) / 12);
    innerStmts.forEach(s => {
      const t = s.trim();
      if(t.match(/^tone\(([^)]*)\)$/)) return;

      if(t.startsWith('<')){
        const resolved = resolveVarInAccumulatingRepeat(t, state, vars, 0, 1);
        if(resolved){
          resolved.forEach(ev => {
            if(ev.pause) events.push({...ev});
            else if(ev.type === 'note') events.push({...ev, freq: ev.freq * factor});
            else if(ev.type === 'chord') events.push({...ev, freqs: ev.freqs.map(f => f * factor)});
          });
        }
      } else {
        const single = parseGenericStatement(t, state, vars, 0);
        if(!single) return;
        single.forEach(ev => {
          if(ev.pause){ events.push({...ev}); return; }
          if(ev.type==='note') events.push({...ev, freq: ev.freq * factor});
          else if(ev.type==='chord') events.push({...ev, freqs: ev.freqs.map(f => f * factor)});
        });
      }
    });
  }

  return events;
}

function naturalDuration(part){
  return part.events.reduce((s,e)=>s+(e.seconds||0), 0);
}

function compile(rawSource){
  const state = {bpm:120, root:'C', scaleType:'major', compass:'4/4', beatsPerMeasure:4,
                  metronome:false, lang:'pt-BR', stdOctave:4};
  let src = '';
  try{ src = stripComments(rawSource||''); }catch(e){ src = rawSource||''; }
  try{ parseGlobals(src, state); }catch(e){}

  let vars = {};
  let srcAfterVars = src;
  try{
    const r = extractPartVariables(src, state, vars);
    vars = r.vars;
    srcAfterVars = removePartVariableDeclarations(src, r.blocksFound);
  }catch(e){}

  let parts = [];

  const playHead = '\\bplay\\s+((?:' + INSTRUMENT_LIST + ')(?:\\s*,\\s*(?:' + INSTRUMENT_LIST + '))*)\\s+(?:part\\s*)?\\{';
  let playBlocks = [];
  try{ playBlocks = extractBraceBlocks(srcAfterVars, playHead); }catch(e){}

  playBlocks.forEach((b, blockIdx)=>{
    try{
      const instrumentNames = b.groups[1].split(',').map(s=>normalizeInstrument(s.trim()));
      let body = b.body;

      let attrs = { id:null, ids:[], classes:[], type:'normal', articul:'normal',
                    fadeIn:null, fadeOut:null, volume:1, speedFactor:1 };
      const attrMatch = body.match(/atribute\s*\{([\s\S]*?)\}/);
      if(attrMatch){
        attrs = parseAttributeBlock(attrMatch[1]);
        body = body.replace(attrMatch[0], '');
      }

      const rawEvents = parsePlayBody(body, state, vars);

      // Aplica articulação e velocidade (speedFactor) diretamente no tempo de cada evento
      const gateRatio = ARTICULATION_GATE[attrs.articul] || 0.90;
      const speed = attrs.speedFactor || 1;

      const processedEvents = rawEvents.map(e => {
        const adjustedSeconds = (e.seconds || 0) / speed;
        return {
          ...e,
          seconds: adjustedSeconds,
          durationSeconds: e.pause ? adjustedSeconds : adjustedSeconds * gateRatio
        };
      });

      instrumentNames.forEach((instrument, idx)=>{
        let id = attrs.ids[idx];
        if(!id){
          id = (instrumentNames.length>1)
            ? instrument + '_auto_' + (idx+1)
            : (attrs.id || ('part'+(blockIdx+1)));
        }
        parts.push({
          id, classes: attrs.classes, instrument,
          events: processedEvents.map(e=>({...e})),
          startOffsetSeconds:0, repeatCount:1, toneStep:0, autoplay:true,
          type: attrs.type, articul: attrs.articul,
          fadeIn: attrs.fadeIn, fadeOut: attrs.fadeOut,
          volume: attrs.volume, speedFactor: attrs.speedFactor
        });
      });
    }catch(e){}
  });

  let srcRemaining = srcAfterVars;
  try{ srcRemaining = removeBlocks(srcAfterVars, playBlocks); }catch(e){}

  // Modificadores externos (#id/.classe)
  try{
    const modRe = /([#.])([\w-]+)((?:\s*\.(?:repeat|tone|escape)\([^)]*\))+)/g;
    let m3;
    while((m3=modRe.exec(srcRemaining))){
      const kind=m3[1], name=m3[2], chain=m3[3];
      const targets = kind==='#'
        ? parts.filter(p=>p.id===name)
        : parts.filter(p=>p.classes && p.classes.includes(name));
      const callRe=/\.(repeat|tone|escape)\(([^)]*)\)/g;
      const calls=[]; let c;
      while((c=callRe.exec(chain))){ calls.push({fn:c[1], arg:c[2].trim()}); }
      targets.forEach(part=>{
        calls.forEach(({fn,arg})=>{
          try{
            if(fn==='repeat'){ const n=parseInt(arg,10); if(n>0) part.repeatCount=n; }
            else if(fn==='tone'){ part.toneStep = modToSemitone(arg); }
            else if(fn==='escape'){ const n=parseFloat(arg)||0; part.startOffsetSeconds = n*(60/state.bpm); }
          }catch(e){}
        });
      });
    }
  }catch(e){}

  // Blocos repeat(n) soltos
  let repeatBlocks = [];
  try{ repeatBlocks = extractBraceBlocks(srcRemaining, 'repeat\\(\\s*(\\d+)\\s*\\)\\s*\\{'); }catch(e){}

  const groupInstances = [];
  repeatBlocks.forEach(rb=>{
    try{
      const count = parseInt(rb.groups[1],10)||1;
      const lines = rb.body.split(/[\n,]/).map(l=>l.trim()).filter(Boolean);
      let groupToneStep = 0;
      const refs=[];
      lines.forEach(line=>{
        const toneOnly = line.match(/^tone\(([^)]*)\)$/);
        if(toneOnly){ groupToneStep = modToSemitone(toneOnly[1]); return; }
        const mm = line.match(/^([#.])([\w-]+)((?:\.(?:escape|tone)\([^)]*\))*)$/);
        if(mm){
          let escBeats=0, localTone=null;
          const callRe=/\.(escape|tone)\(([^)]*)\)/g; let c;
          while((c=callRe.exec(mm[3]))){
            if(c[1]==='escape') escBeats=parseFloat(c[2])||0;
            else if(c[1]==='tone') localTone=modToSemitone(c[2]);
          }
          const targetParts = mm[1]==='#'
            ? parts.filter(p=>p.id===mm[2])
            : parts.filter(p=>p.classes && p.classes.includes(mm[2]));
          targetParts.forEach(p=> refs.push({part:p, escapeSeconds: escBeats*(60/state.bpm), toneStep: localTone}));
        }
      });
      if(refs.length===0) return;
      let cycleLength=0;
      refs.forEach(r=>{ r.part.autoplay=false; const dur=naturalDuration(r.part); if(dur>cycleLength) cycleLength=dur; });
      if(cycleLength<=0) cycleLength=1;
      for(let i=0;i<count;i++){
        refs.forEach(r=>{
          const step = (r.toneStep!==null)? r.toneStep : groupToneStep;
          groupInstances.push({
            part:r.part,
            startOffsetSeconds: i*cycleLength + r.escapeSeconds,
            toneFactor: Math.pow(2,(step*i)/12)
          });
        });
      }
    }catch(e){}
  });

  return {state, parts, vars, groupInstances};
}
