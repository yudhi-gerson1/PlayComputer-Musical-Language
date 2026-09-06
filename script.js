/* ================= PlayComputer — Núcleo do Compilador =================
   CORREÇÕES DESTA REVISÃO:

   FIX #1 — Primeira parte do código mudo:
   A extração de blocos `repeat(n) { ... }` SOLTOS (fora de qualquer play,
   os que referenciam #id/.classe) rodava sobre o SRC INTEIRO antes dos
   blocos `play ... part { }` serem lidos. Como extractBraceBlocks só
   procura o padrão em qualquer lugar do texto, um repeat() escrito DENTRO
   de um play part (para transposição incremental) era capturado como se
   fosse um bloco de repetição solto e REMOVIDO DO TEXTO antes do play ser
   processado — o play ficava com corpo vazio e nunca tocava.
   Corrigido: agora os play blocks são extraídos PRIMEIRO, inteiros (com
   qualquer repeat() interno intacto), e só depois eu procuro repeat()
   soltos no texto que sobra FORA dos plays.

   FIX #2 — Instrumentos pouco diferenciados / pouco realistas:
   Reescrevi a síntese com um FILTRO DINÂMICO por nota (o brilho do som
   fecha ao longo do tempo, como um instrumento acústico real perde
   harmônicos agudos conforme a vibração morre) + parâmetros próprios de
   ataque/decaimento/registro/inarmonicidade para cada instrumento, para
   que soem claramente distintos uns dos outros.
   ========================================================================= */

const NOTE_INDEX = {C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11};
const MAJOR_OFFSETS = [0,2,4,5,7,9,11];
const MINOR_OFFSETS = [0,2,3,5,7,8,10];

const INSTRUMENT_LIST = 'standard|piano|guitar|synthBass|guitarBass|synth|organ|accordeon|ukulele|drum';

function stripComments(src){
  src = src.replace(/\/\*[\s\S]*?\*\//g,'');
  src = src.replace(/\/\/.*$/gm,'');
  return src;
}

function splitTopLevel(str, sep){
  const parts=[]; let depth=0; let cur='';
  for(const ch of str){
    if(ch==='('||ch==='{') depth++;
    if(ch===')'||ch==='}') depth--;
    if(ch===sep && depth<=0){ parts.push(cur); cur=''; }
    else cur+=ch;
  }
  if(cur.trim()!=='') parts.push(cur);
  return parts;
}

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

function removeBlocks(src, blocks){
  let result = src;
  const sorted = [...blocks].sort((a,b)=>b.start-a.start);
  for(const b of sorted){ result = result.slice(0,b.start) + result.slice(b.end); }
  return result;
}

function parseGlobals(src, state){
  try{ const m=src.match(/\blang\s+([A-Za-z-]+)/); if(m){ const v=m[1].toLowerCase(); state.lang = v==='pt'?'pt-BR': v==='en'?'en-US': m[1]; } }catch(e){}
  try{
    const m=src.match(/\bcompass\s+(standard|(\d+)\/(\d+))/);
    if(m){
      if(m[1]==='standard'){ state.compass='4/4'; state.beatsPerMeasure=4; }
      else { state.compass=m[1]; state.beatsPerMeasure=parseInt(m[2])||4; }
    }
  }catch(e){}
  try{ const m=src.match(/\bbpm\s+(\d+)/); if(m) state.bpm = parseInt(m[1])||120; }catch(e){}
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
}

const TOM_EM_SEMITONS = 1;
function modToSemitone(mod){
  mod=(mod||'').trim();
  if(mod==='^') return TOM_EM_SEMITONS;
  if(mod==='^^') return TOM_EM_SEMITONS*2;
  if(mod==='v') return -TOM_EM_SEMITONS;
  if(mod==='vv') return -TOM_EM_SEMITONS*2;
  return 0;
}

function degreeToFreq(argStr, state){
  try{
    argStr = argStr.trim();
    const m = argStr.match(/^(\d+)\s*(\^\^|\^|vv|v|n)?\s*(?:\[8(\+\+|\+|--|-)\])?$/);
    if(!m) return null;
    const degree = parseInt(m[1]);
    const mod = m[2]||''; const oct = m[3]||'';
    const offsets = state.scaleType==='minor'?MINOR_OFFSETS:MAJOR_OFFSETS;
    const idx = ((degree-1)%7+7)%7;
    const rootOffset = NOTE_INDEX[state.root] !== undefined ? NOTE_INDEX[state.root] : 0;
    const modSemi = modToSemitone(mod);
    let octShift=0;
    if(oct==='+') octShift=1; else if(oct==='++') octShift=2;
    else if(oct==='-') octShift=-1; else if(oct==='--') octShift=-2;
    const total = rootOffset + offsets[idx] + modSemi;
    const carry = Math.floor(total/12);
    const semitone = ((total%12)+12)%12;
    const octave = 4+octShift+carry;
    const midi = 12*(octave+1)+semitone;
    return 440*Math.pow(2,(midi-69)/12);
  }catch(e){ return null; }
}

function parseRhythmArg(argStr, state){
  argStr = (argStr||'4').trim();
  let pause=false;
  const m = argStr.match(/^pause\s+(\d+(\.\d+)?)$/);
  if(m){ pause=true; argStr=m[1]; }
  let n = parseFloat(argStr); if(!n||n<=0) n=4;
  if(n>64) n=4;
  const beats = 4/n;
  const seconds = beats*(60/(state.bpm||120));
  return {pause, seconds};
}

function parseStatement(stmtRaw, state, vars){
  const stmt = (stmtRaw||'').trim();
  if(!stmt) return null;
  const pauseOnly = stmt.match(/^rhythm\(\s*pause\s+(\d+(\.\d+)?)\s*\)$/);
  if(pauseOnly){
    let n=parseFloat(pauseOnly[1]); if(n>64) n=4;
    const seconds = (4/n)*(60/(state.bpm||120));
    return {type:'note', freq:0, degree:0, seconds, pause:true};
  }
  const m = stmt.match(/^(note\(([\s\S]*?)\)|chord\(([\s\S]*?)\)|([A-Za-z_]\w*))\s*(?:rhythm\(([\s\S]*?)\))?$/);
  if(!m) return null;

  const rInfo = parseRhythmArg(m[5], state);
  if(m[2]!==undefined){
    const argStr = m[2].trim();
    const freq = degreeToFreq(argStr, state);
    const degMatch = argStr.match(/^(\d+)/);
    const degree = degMatch? parseInt(degMatch[1]) : 4;
    return {type:'note', freq: (freq!==null? freq:220), degree, seconds:rInfo.seconds, pause:rInfo.pause};
  } else if(m[3]!==undefined){
    const freqs = splitTopLevel(m[3],',').map(s=>degreeToFreq(s,state)).filter(f=>f!==null);
    if(freqs.length===0) return null;
    return {type:'chord', freqs, seconds:rInfo.seconds, pause:rInfo.pause};
  } else if(m[4]!==undefined){
    const v = vars[m[4]];
    if(!v) return null;
    if(v.type==='note') return {type:'note', freq:v.freq, degree:4, seconds:rInfo.seconds, pause:rInfo.pause};
    if(v.type==='chord') return {type:'chord', freqs:v.freqs, seconds:rInfo.seconds, pause:rInfo.pause};
  }
  return null;
}

// Interpreta um repeat(n) { ... } ESCRITO DENTRO de um play part.
// Uma linha "tone(mod)" dentro do bloco não é tocada — define o PASSO de
// transposição acumulado a cada iteração (como um incremento de for).
function parseInlineRepeatStatement(stmtRaw, state, vars){
  const stmt = (stmtRaw||'').trim();
  const m = stmt.match(/^repeat\(\s*(\d+)\s*\)\s*\{([\s\S]*)\}$/);
  if(!m) return null;
  const count = parseInt(m[1])||1;
  const innerStmts = splitTopLevel(m[2].replace(/\n/g,' '), ',');
  let toneStep = 0;
  const playable = [];
  innerStmts.forEach(s=>{
    const ts = s.trim().match(/^tone\(([^)]*)\)$/);
    if(ts){ toneStep = modToSemitone(ts[1]); }
    else playable.push(s);
  });
  const events = [];
  for(let i=0;i<count;i++){
    const factor = Math.pow(2, (toneStep*i)/12);
    playable.forEach(s=>{
      try{
        const ev = parseInlineRepeatStatement(s, state, vars) ? null : parseStatement(s, state, vars);
        if(!ev) return;
        if(ev.type==='note') events.push({...ev, freq: ev.freq*factor});
        else if(ev.type==='chord') events.push({...ev, freqs: ev.freqs.map(f=>f*factor)});
        else events.push(ev);
      }catch(e){}
    });
  }
  return events;
}

function normalizeInstrument(name){
  const n=(name||'').toLowerCase();
  const map={standard:'piano',piano:'piano',guitar:'guitar',synthbass:'synthBass',guitarbass:'guitarBass',synth:'synth',organ:'organ',accordeon:'accordeon',ukulele:'ukulele',drum:'drum'};
  return map[n] || 'piano';
}

function naturalDuration(part){
  return part.events.reduce((s,e)=>s+e.seconds,0);
}

function compile(rawSource){
  const state = {bpm:120, root:'C', scaleType:'major', compass:'4/4', beatsPerMeasure:4, metronome:false, lang:'pt-BR'};
  let src = '';
  try{ src = stripComments(rawSource||''); }catch(e){ src = rawSource||''; }
  try{ parseGlobals(src, state); }catch(e){}

  let parts = [];
  const vars = {};

  // FIX #1 — passo 1: extrai os blocos "play ... part { }" DIRETO do
  // texto original, ANTES de qualquer remoção de repeat() solto. Assim,
  // um repeat(n){...} escrito dentro do corpo do play chega intacto até
  // parseInlineRepeatStatement (chamado logo abaixo), em vez de já ter
  // sido arrancado do texto por engano.
  let playBlocks=[];
  try{ playBlocks = extractBraceBlocks(src, '\\bplay\\s+(?:(' + INSTRUMENT_LIST + ')\\s+)?part\\s*\\{'); }catch(e){}

  playBlocks.forEach((b,idx)=>{
    try{
      const instrument = normalizeInstrument(b.groups[1]);
      let body = b.body;
      let id = 'part'+(idx+1);
      let classes = [];
      const attrMatch = body.match(/atribute\s*\{([\s\S]*?)\}/);
      if(attrMatch){
        const idMatch = attrMatch[1].match(/id\s*=\s*"([^"]+)"/);
        if(idMatch) id = idMatch[1];
        const classMatch = attrMatch[1].match(/class\s*=\s*"([^"]+)"/);
        if(classMatch) classes = classMatch[1].split(/\s+/).filter(Boolean);
        body = body.replace(attrMatch[0],'');
      }
      const stmts = splitTopLevel(body.replace(/\n/g,' '), ',');
      const events=[];
      stmts.forEach(s=>{
        try{
          const repEvents = parseInlineRepeatStatement(s, state, vars);
          if(repEvents){ events.push(...repEvents); return; }
          const ev = parseStatement(s, state, vars);
          if(ev) events.push(ev);
        }catch(e){}
      });
      parts.push({id, classes, instrument, events, startOffsetSeconds:0, repeatCount:1, toneStep:0, autoplay:true});
    }catch(e){}
  });

  // FIX #1 — passo 2: remove os play blocks (inteiros) do texto original.
  // SÓ AGORA procuramos repeat(n) { ... } soltos — e como o texto dos
  // plays já saiu, um repeat() interno a um play jamais será confundido
  // com um repeat() de nível superior que referencia #id/.classe.
  let srcAfterPlay = src;
  try{ srcAfterPlay = removeBlocks(src, playBlocks); }catch(e){}

  let repeatBlocks=[];
  try{ repeatBlocks = extractBraceBlocks(srcAfterPlay, 'repeat\\(\\s*(\\d+)\\s*\\)\\s*\\{'); }catch(e){}
  let srcRemaining = srcAfterPlay;
  try{ srcRemaining = removeBlocks(srcAfterPlay, repeatBlocks); }catch(e){}

  try{
    srcRemaining = srcRemaining.replace(/^[ \t]*([A-Za-z_]\w*)\s*=\s*(note\([^)]*\)|chord\([^)]*\))[ \t]*$/gm, (full,name,expr)=>{
      try{
        if(expr.indexOf('note(')===0){
          const arg = expr.slice(5,-1);
          const freq = degreeToFreq(arg,state);
          if(freq!==null) vars[name]={type:'note', freq};
        } else if(expr.indexOf('chord(')===0){
          const arg = expr.slice(6,-1);
          const freqs = splitTopLevel(arg,',').map(a=>degreeToFreq(a,state)).filter(f=>f!==null);
          vars[name]={type:'chord', freqs};
        }
      }catch(e){}
      return '';
    });
  }catch(e){}

  try{
    const inlineRe = new RegExp('\\bplay\\s+(?:(' + INSTRUMENT_LIST + ')\\s+)?([^\\n]+)','gi');
    let m2, counter=0;
    while((m2=inlineRe.exec(srcRemaining))){
      try{
        counter++;
        const instrument = normalizeInstrument(m2[1]);
        const line = m2[2].trim();
        const stmts = splitTopLevel(line, ',');
        const events=[];
        stmts.forEach(s=>{ try{ const ev=parseStatement(s,state,vars); if(ev) events.push(ev); }catch(e){} });
        if(events.length) parts.push({id:'inline'+counter, classes:[], instrument, events, startOffsetSeconds:0, repeatCount:1, toneStep:0, autoplay:true});
      }catch(e){}
    }
  }catch(e){}

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
            if(fn==='repeat'){ const n=parseInt(arg); if(n>0) part.repeatCount=n; }
            else if(fn==='tone'){ part.toneStep = modToSemitone(arg); }
            else if(fn==='escape'){ const n=parseFloat(arg)||0; part.startOffsetSeconds = n*(60/state.bpm); }
          }catch(e){}
        });
      });
    }
  }catch(e){}

  const groupInstances=[];
  repeatBlocks.forEach(rb=>{
    try{
      const count = parseInt(rb.groups[1])||1;
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
      refs.forEach(r=>{
        r.part.autoplay=false;
        const dur=naturalDuration(r.part); if(dur>cycleLength) cycleLength=dur;
      });
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

function buildSchedule(compiled){
  const {state, parts, groupInstances} = compiled;
  const events=[];

  function emitPartEvents(part, baseStart, toneFactor){
    toneFactor = toneFactor || 1;
    let t=baseStart;
    part.events.forEach(ev=>{
      try{
        if(!ev.pause){
          if(part.instrument==='drum'){
            events.push({type:'drum', drumType:ev.degree||1, time:t, duration:ev.seconds, channelId:part.id});
          } else if(ev.type==='note'){
            events.push({type:'note', freq:ev.freq*toneFactor, time:t, duration:ev.seconds, channelId:part.id, instrument:part.instrument});
          } else if(ev.type==='chord'){
            events.push({type:'chord', freqs:ev.freqs.map(f=>f*toneFactor), time:t, duration:ev.seconds, channelId:part.id, instrument:part.instrument});
          }
        }
      }catch(e){}
      t += ev.seconds;
    });
  }

  parts.forEach(part=>{
    if(part.autoplay){
      const dur = naturalDuration(part) || 0.001;
      for(let r=0;r<(part.repeatCount||1);r++){
        const factor = Math.pow(2, ((part.toneStep||0)*r)/12);
        emitPartEvents(part, part.startOffsetSeconds + r*dur, factor);
      }
    }
  });
  groupInstances.forEach(gi=> emitPartEvents(gi.part, gi.startOffsetSeconds, gi.toneFactor));

  let totalDuration = events.reduce((m,e)=>Math.max(m,e.time+e.duration),0);
  if(totalDuration<=0) totalDuration=1;

  if(state.metronome){
    const beatSec = 60/(state.bpm||120);
    const beatsPerMeasure = state.beatsPerMeasure||4;
    let beatCount=0;
    for(let t=0;t<totalDuration;t+=beatSec){
      const accented = (beatCount % beatsPerMeasure)===0;
      events.push({type:'click', time:t, duration:0.05, channelId:'__metronome__', accented});
      beatCount++;
    }
  }

  return {events, totalDuration, parts, state};
}

/* ================= Síntese de Áudio — FIX #2: instrumentos diferenciados =================
   Cada instrumento agora tem, além de harmônicos e envelope próprios, um
   FILTRO PASSA-BAIXA COM VARREDURA (a frequência de corte cai ao longo da
   duração da nota). Isso simula o comportamento real de instrumentos
   acústicos: o som começa brilhante (ataque) e vai perdendo agudos
   conforme a vibração morre — é essa varredura de brilho, mais do que só
   a mistura de harmônicos, que faz o ouvido reconhecer "isso é uma corda
   de verdade" em vez de "isso é uma soma de senos". */

function createNoiseBuffer(ctx, duration){
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate*duration));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<length;i++) data[i]=Math.random()*2-1;
  return buffer;
}

// Corda dedilhada: transiente de ruído (o "toque") + pilha de harmônicos,
// tudo passando por um filtro cuja frequência de corte VARRE de brilhante
// para escuro ao longo da duração — e não só um lowpass fixo.
// opts.inharm dá um leve "esticamento" da afinação dos harmônicos altos
// (h*h*inharm), efeito real de cordas rígidas de piano/violão.
function pluckedTone(ctx, dest, freq, time, dur, opts){
  opts = opts||{};
  const harmonics  = opts.harmonics  || [1,2,3,4,5,6];
  const ampWeights = opts.ampWeights || [1,0.55,0.32,0.2,0.12,0.07];
  const spread     = opts.spread     !== undefined ? opts.spread : 1.6;
  const baseDecay  = Math.max(opts.decay || dur || 0.4, 0.1);
  const attack     = opts.attack     || 0.004;
  const gainAmt    = opts.gain       || 0.4;
  const inharm     = opts.inharm     || 0;
  const filterStart= opts.filterStart|| freq*10;
  const filterEnd  = Math.max(opts.filterEnd || freq*2, 120);
  const filterQ    = opts.filterQ    !== undefined ? opts.filterQ : 0.6;

  // Filtro mestre com varredura de brilho — todo o som passa por aqui.
  const masterFilter = ctx.createBiquadFilter();
  masterFilter.type='lowpass';
  masterFilter.Q.value = filterQ;
  masterFilter.frequency.setValueAtTime(filterStart, time);
  masterFilter.frequency.exponentialRampToValueAtTime(filterEnd, time + baseDecay);
  masterFilter.connect(dest);

  // Transiente do toque/palheta.
  const buf = createNoiseBuffer(ctx, 0.008);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type='bandpass'; bp.frequency.value = Math.min(freq*2.5, 6000); bp.Q.value = 0.7;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(gainAmt*0.4, time);
  ng.gain.exponentialRampToValueAtTime(0.0008, time+0.02);
  src.connect(bp); bp.connect(ng); ng.connect(masterFilter);
  src.start(time); src.stop(time+0.02);

  harmonics.forEach((h,idx)=>{
    try{
      const stretchedFreq = freq*h*(1+inharm*h*h);
      const osc = ctx.createOscillator(); osc.type='sine';
      osc.frequency.setValueAtTime(stretchedFreq, time);
      const g = ctx.createGain();
      const decayTime = Math.max(baseDecay / (1 + (h-1)*spread), 0.06);
      const amp = Math.max((ampWeights[idx]!==undefined? ampWeights[idx] : 0.05) * gainAmt, 0.0009);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(amp, time+attack);
      g.gain.exponentialRampToValueAtTime(0.0006, time+attack+decayTime);
      osc.connect(g); g.connect(masterFilter);
      osc.start(time); osc.stop(time+attack+decayTime+0.05);
    }catch(e){}
  });
}

// Órgão: harmônicos "drawbar" sustentados enquanto a nota dura, com DOIS
// osciladores por harmônico levemente dessintonizados (chorus de órgão de
// tubo real, que nunca tem dois tubos afinados 100% iguais).
function scheduleOrgan(ctx, dest, freq, time, dur){
  const d = Math.max(dur, 0.15);
  const partials = [1,2,3,4,6];
  const amps = [0.45,0.25,0.16,0.12,0.08];
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(0.28, time+0.035);
  g.gain.setValueAtTime(0.28, time+Math.max(d*0.8,0.05));
  g.gain.linearRampToValueAtTime(0.0001, time+d);
  g.connect(dest);
  partials.forEach((p,idx)=>{
    [-3,3].forEach(cents=>{
      const osc = ctx.createOscillator(); osc.type='sine';
      osc.frequency.setValueAtTime(freq*p, time);
      osc.detune.setValueAtTime(cents, time);
      const og = ctx.createGain(); og.gain.value = amps[idx]*0.5;
      osc.connect(og); og.connect(g);
      osc.start(time); osc.stop(time+d+0.05);
    });
  });
}

// Sanfona: duas palhetas dessintonizadas + vibrato + filtro "reedy" fixo
// (banda estreita realçando a região nasal típica do instrumento).
function scheduleAccordeon(ctx, dest, freq, time, dur){
  const d = Math.max(dur, 0.18);
  const reedFilter = ctx.createBiquadFilter();
  reedFilter.type='bandpass'; reedFilter.frequency.value = freq*3; reedFilter.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(0.32, time+0.05);
  g.gain.exponentialRampToValueAtTime(0.0008, time+d);
  reedFilter.connect(g); g.connect(dest);
  [-7,7].forEach(cents=>{
    const osc = ctx.createOscillator(); osc.type='sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    osc.detune.setValueAtTime(cents, time);
    const og = ctx.createGain(); og.gain.value = 0.45;

    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 5;
    lfo.connect(lfoGain); lfoGain.connect(osc.detune);

    osc.connect(og); og.connect(reedFilter);
    osc.start(time); osc.stop(time+d+0.05);
    lfo.start(time); lfo.stop(time+d+0.05);
  });
}

// Synth: dente-de-serra clássico com filtro RESSONANTE em varredura
// rápida (o "stab" analógico) — bem diferente do timbre orgânico acima.
function scheduleSynth(ctx, dest, freq, time, dur){
  const osc = ctx.createOscillator(); osc.type='sawtooth';
  osc.frequency.setValueAtTime(freq, time);
  const filt = ctx.createBiquadFilter();
  filt.type='lowpass'; filt.Q.value=6;
  const d = Math.max(dur,0.08);
  filt.frequency.setValueAtTime(freq*10, time);
  filt.frequency.exponentialRampToValueAtTime(Math.max(freq*1.2,200), time+d*0.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.32, time+0.008);
  g.gain.exponentialRampToValueAtTime(0.0008, time+d);
  osc.connect(filt); filt.connect(g); g.connect(dest);
  osc.start(time); osc.stop(time+d+0.05);
}

// SynthBass: fundamental grave (quadrada) + subharmônico uma oitava
// abaixo (senoidal) somados — dá corpo grave "eletrônico" nitidamente
// diferente do guitarBass acústico.
function scheduleSynthBass(ctx, dest, freq, time, dur){
  const f = freq/2;
  const d = Math.max(dur,0.1);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.4, time+0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, time+d);
  const filt = ctx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=Math.max(f*4,300);
  filt.connect(g); g.connect(dest);

  const osc1 = ctx.createOscillator(); osc1.type='square'; osc1.frequency.setValueAtTime(f, time);
  osc1.connect(filt); osc1.start(time); osc1.stop(time+d+0.05);

  const osc2 = ctx.createOscillator(); osc2.type='sine'; osc2.frequency.setValueAtTime(f/2, time);
  const og2 = ctx.createGain(); og2.gain.value = 0.6;
  osc2.connect(og2); og2.connect(filt); osc2.start(time); osc2.stop(time+d+0.05);
}

function scheduleNote(ctx, dest, freq, time, dur, instrument){
  try{
    if(!isFinite(freq) || freq<=0) return;
    switch(instrument){
      // Piano: registro cheio, decaimento mais longo, brilho que fecha
      // devagar, leve inarmonicidade (cordas rígidas de piano de verdade).
      case 'piano':
        pluckedTone(ctx, dest, freq, time, dur, {
          harmonics:[1,2,3,4,5,6,8], ampWeights:[1,0.5,0.3,0.22,0.14,0.09,0.05],
          spread:1.3, decay:Math.max(dur,1.1), attack:0.006, gain:0.5,
          inharm:0.00018, filterStart:freq*9, filterEnd:freq*1.8, filterQ:0.5
        });
        break;
      // Guitarra (aço): decaimento mais curto que o piano, brilho fecha
      // mais rápido, harmônicos ímpares mais fortes (timbre metálico).
      case 'guitar':
        pluckedTone(ctx, dest, freq, time, dur, {
          harmonics:[1,2,3,4,5,7], ampWeights:[1,0.65,0.42,0.26,0.16,0.09],
          spread:2.0, decay:Math.max(dur,0.55), attack:0.003, gain:0.45,
          inharm:0.00006, filterStart:freq*15, filterEnd:freq*3.5, filterQ:0.7
        });
        break;
      // Baixo (corda): registro grave, decaimento longo, brilho fecha
      // rápido pra virar um "bump" grave sustentado.
      case 'guitarBass':
        pluckedTone(ctx, dest, freq/2, time, dur, {
          harmonics:[1,2,3,4], ampWeights:[1,0.4,0.2,0.1],
          spread:0.9, decay:Math.max(dur,1.0), attack:0.01, gain:0.62,
          inharm:0, filterStart:(freq/2)*5, filterEnd:(freq/2)*1.3, filterQ:0.5
        });
        break;
      // Ukulele (nylon): muito brilhante no ataque, decai rápido, registro
      // agudo — som curto e "seco".
      case 'ukulele':
        pluckedTone(ctx, dest, freq*1.5, time, dur*0.7, {
          harmonics:[1,2,3,4,5], ampWeights:[1,0.45,0.24,0.14,0.07],
          spread:2.8, decay:Math.max(dur*0.55,0.28), attack:0.002, gain:0.4,
          inharm:0, filterStart:freq*20, filterEnd:freq*5, filterQ:0.6
        });
        break;
      case 'synthBass':
        scheduleSynthBass(ctx, dest, freq, time, dur);
        break;
      case 'synth':
        scheduleSynth(ctx, dest, freq, time, dur);
        break;
      case 'organ':
        scheduleOrgan(ctx, dest, freq, time, dur);
        break;
      case 'accordeon':
        scheduleAccordeon(ctx, dest, freq, time, dur);
        break;
      default:
        scheduleSynth(ctx, dest, freq, time, dur);
    }
  }catch(e){}
}

function scheduleDrum(ctx, dest, drumType, time, dur){
  try{
    function kickThump(fStart, fEnd, decay, clickAmt){
      const osc=ctx.createOscillator(); osc.type='sine';
      osc.frequency.setValueAtTime(fStart,time);
      osc.frequency.exponentialRampToValueAtTime(Math.max(fEnd,20), time+decay);
      const g=ctx.createGain();
      g.gain.setValueAtTime(0.95,time);
      g.gain.exponentialRampToValueAtTime(0.001,time+decay);
      osc.connect(g); g.connect(dest);
      osc.start(time); osc.stop(time+decay+0.03);
      if(clickAmt){
        const clickBuf=createNoiseBuffer(ctx,0.012);
        const clickSrc=ctx.createBufferSource(); clickSrc.buffer=clickBuf;
        const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=2500;
        const cg=ctx.createGain();
        cg.gain.setValueAtTime(clickAmt,time);
        cg.gain.exponentialRampToValueAtTime(0.001,time+0.015);
        clickSrc.connect(hp); hp.connect(cg); cg.connect(dest);
        clickSrc.start(time); clickSrc.stop(time+0.02);
      }
    }
    function noiseHit(filterFreq, filterType, decay, gainVal, pan){
      const buf = createNoiseBuffer(ctx, decay+0.05);
      const src = ctx.createBufferSource(); src.buffer=buf;
      const filt = ctx.createBiquadFilter(); filt.type=filterType; filt.frequency.value=filterFreq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gainVal,time);
      g.gain.exponentialRampToValueAtTime(0.001,time+decay);
      src.connect(filt);
      let node=filt;
      if(pan!==undefined && ctx.createStereoPanner){
        const panner=ctx.createStereoPanner(); panner.pan.value=pan;
        filt.connect(panner); node=panner;
      }
      node.connect(g); g.connect(dest);
      src.start(time); src.stop(time+decay+0.05);
    }
    function snareBody(decay, gainVal, pan){
      noiseHit(1800,'bandpass',decay,gainVal,pan);
      const osc=ctx.createOscillator(); osc.type='triangle';
      osc.frequency.setValueAtTime(190,time);
      osc.frequency.exponentialRampToValueAtTime(140,time+decay*0.6);
      const g=ctx.createGain();
      g.gain.setValueAtTime(gainVal*0.5,time);
      g.gain.exponentialRampToValueAtTime(0.001,time+decay*0.6);
      osc.connect(g); g.connect(dest);
      osc.start(time); osc.stop(time+decay*0.6+0.02);
    }
    function cymbal(decay, gainVal){
      [3200,4100,5300,6700].forEach(f=>{
        const osc=ctx.createOscillator(); osc.type='square'; osc.frequency.value=f;
        const g=ctx.createGain();
        g.gain.setValueAtTime(gainVal*0.12,time);
        g.gain.exponentialRampToValueAtTime(0.001,time+decay);
        osc.connect(g); g.connect(dest);
        osc.start(time); osc.stop(time+decay+0.05);
      });
      noiseHit(6000,'highpass',decay,gainVal*0.5);
    }
    const d = Math.max(dur,0.08);
    switch(drumType){
      case 1: kickThump(150,42,Math.min(d,0.4),0.5); break;
      case 2: kickThump(115,55,Math.min(d,0.32),0.25); break;
      case 3: kickThump(230,130,Math.min(d,0.22),0.15); break;
      case 4: snareBody(Math.min(d,0.2),0.85); break;
      case 5: noiseHit(3200,'highpass',Math.min(d,0.05),0.5); break;
      case 6: noiseHit(6500,'highpass',Math.min(d,0.045),0.4); break;
      case 7: cymbal(Math.min(d,0.9),0.55); break;
      case 8: snareBody(Math.min(d,0.18),0.75,-0.6); break;
      case 9: snareBody(Math.min(d,0.18),0.75, 0.6); break;
      default: noiseHit(2000,'bandpass',Math.min(d,0.15),0.6);
    }
  }catch(e){}
}

function scheduleClick(ctx, dest, time, accented){
  try{
    const osc=ctx.createOscillator(); osc.type='square';
    osc.frequency.value = accented? 2000 : 1200;
    const g=ctx.createGain();
    g.gain.setValueAtTime(accented? 0.3 : 0.16, time);
    g.gain.exponentialRampToValueAtTime(0.001, time+0.04);
    osc.connect(g); g.connect(dest);
    osc.start(time); osc.stop(time+0.05);
  }catch(e){}
}

/* ================= Player e Interface ================= */

let audioCtx=null, masterGain=null, activeTimers=[];

function setStatus(msg){ document.getElementById('log').textContent = msg; }

function renderChannels(parts){
  const container = document.getElementById('channels');
  container.innerHTML='';
  if(!parts || parts.length===0){
    container.innerHTML = '<p class="empty">Nenhum canal compilado.</p>';
    return;
  }
  parts.forEach(p=>{
    const div=document.createElement('div');
    div.className='channel';
    div.setAttribute('data-channel', p.id);
    const tagText = p.instrument + (p.classes && p.classes.length? ' · .'+p.classes.join(' .') : '');
    div.innerHTML = '<span class="dot"></span><span class="cname">#'+p.id+'</span><span class="ctags">'+tagText+'</span>';
    container.appendChild(div);
  });
}

function highlightChannel(id, durationMs){
  try{
    const els = document.querySelectorAll('.channel');
    els.forEach(el=>{
      if(el.getAttribute('data-channel')===id){
        el.classList.add('active');
        setTimeout(()=>el.classList.remove('active'), Math.max(80,durationMs||150));
      }
    });
  }catch(e){}
}

function stopAll(){
  activeTimers.forEach(t=>clearTimeout(t));
  activeTimers=[];
  if(audioCtx){ try{ audioCtx.close(); }catch(e){} audioCtx=null; masterGain=null; }
  document.querySelectorAll('.channel.active').forEach(el=>el.classList.remove('active'));
}

function playSchedule(schedule, state){
  audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.8;
  masterGain.connect(audioCtx.destination);
  const startAt = audioCtx.currentTime + 0.2;

  schedule.events.forEach(ev=>{
    try{
      if(ev.type==='note') scheduleNote(audioCtx, masterGain, ev.freq, startAt+ev.time, ev.duration, ev.instrument);
      else if(ev.type==='chord') ev.freqs.forEach(f=>scheduleNote(audioCtx, masterGain, f, startAt+ev.time, ev.duration, ev.instrument));
      else if(ev.type==='drum') scheduleDrum(audioCtx, masterGain, ev.drumType, startAt+ev.time, ev.duration);
      else if(ev.type==='click') scheduleClick(audioCtx, masterGain, startAt+ev.time, ev.accented);

      if(ev.channelId && ev.channelId!=='__metronome__'){
        const tid2=setTimeout(()=>highlightChannel(ev.channelId, ev.duration*1000), Math.max(0,ev.time)*1000);
        activeTimers.push(tid2);
      }
    }catch(e){}
  });

  const doneTid = setTimeout(()=>setStatus('Reprodução concluída.'), (schedule.totalDuration+0.4)*1000);
  activeTimers.push(doneTid);
}

/* ================= Exportação para WAV ================= */

function encodeWAV(samples, sampleRate, numChannels, bitDepth){
  const bytesPerSample = bitDepth/8;
  const blockAlign = numChannels*bytesPerSample;
  const buffer = new ArrayBuffer(44+samples.length*bytesPerSample);
  const view = new DataView(buffer);
  function writeString(offset,str){ for(let i=0;i<str.length;i++) view.setUint8(offset+i, str.charCodeAt(i)); }
  writeString(0,'RIFF'); view.setUint32(4, 36+samples.length*bytesPerSample, true); writeString(8,'WAVE');
  writeString(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,numChannels,true);
  view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*blockAlign,true);
  view.setUint16(32,blockAlign,true); view.setUint16(34,bitDepth,true);
  writeString(36,'data'); view.setUint32(40, samples.length*bytesPerSample, true);
  let offset=44;
  for(let i=0;i<samples.length;i++,offset+=2){
    const s=Math.max(-1,Math.min(1,samples[i]));
    view.setInt16(offset, s<0? s*0x8000 : s*0x7FFF, true);
  }
  return new Blob([view], {type:'audio/wav'});
}

function interleave(l,r){
  const length=l.length+r.length;
  const result=new Float32Array(length);
  let idx=0,i=0;
  while(idx<length){ result[idx++]=l[i]; result[idx++]=r[i]; i++; }
  return result;
}

function audioBufferToWav(buffer){
  let samples;
  if(buffer.numberOfChannels>=2){
    samples = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    samples = buffer.getChannelData(0);
  }
  return encodeWAV(samples, buffer.sampleRate, buffer.numberOfChannels>=2?2:1, 16);
}

async function renderAndDownload(schedule){
  const sampleRate = 44100;
  const length = Math.max(1, Math.ceil((schedule.totalDuration+1)*sampleRate));
  const offlineCtx = new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(2, length, sampleRate);
  const gain = offlineCtx.createGain();
  gain.gain.value = 0.8;
  gain.connect(offlineCtx.destination);

  schedule.events.forEach(ev=>{
    try{
      if(ev.type==='note') scheduleNote(offlineCtx, gain, ev.freq, ev.time+0.05, ev.duration, ev.instrument);
      else if(ev.type==='chord') ev.freqs.forEach(f=>scheduleNote(offlineCtx, gain, f, ev.time+0.05, ev.duration, ev.instrument));
      else if(ev.type==='drum') scheduleDrum(offlineCtx, gain, ev.drumType, ev.time+0.05, ev.duration);
      else if(ev.type==='click') scheduleClick(offlineCtx, gain, ev.time+0.05, ev.accented);
    }catch(e){}
  });

  const buffer = await offlineCtx.startRendering();
  const blob = audioBufferToWav(buffer);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'playcomputer_output.wav';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
}

/* ================= Eventos da Interface ================= */

document.getElementById('btnPlay').addEventListener('click', ()=>{
  try{
    stopAll();
    const code = document.getElementById('code').value;
    const compiled = compile(code);
    renderChannels(compiled.parts);
    const schedule = buildSchedule(compiled);
    playSchedule(schedule, compiled.state);
    setStatus('Reproduzindo — BPM '+compiled.state.bpm+' | Escala '+compiled.state.root+' '+compiled.state.scaleType+' | Compasso '+compiled.state.compass);
  }catch(e){
    setStatus('Aviso: houve um problema de sintaxe, mas a execução continua sem interromper.');
  }
});

document.getElementById('btnStop').addEventListener('click', ()=>{
  stopAll();
  setStatus('Parado.');
});

document.getElementById('btnDownload').addEventListener('click', async ()=>{
  try{
    const code = document.getElementById('code').value;
    const compiled = compile(code);
    renderChannels(compiled.parts);
    const schedule = buildSchedule(compiled);
    setStatus('Renderizando áudio para download...');
    await renderAndDownload(schedule);
    setStatus('Download iniciado (.wav).');
  }catch(e){
    setStatus('Não foi possível gerar o áudio para download.');
  }
});
