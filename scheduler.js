/* ================= PlayComputer v1.1 — scheduler.js =================
   Converte o resultado do compile() em uma timeline plana de eventos com
   tempo absoluto, aplicando: repeat/tone acumulado por iteração, escape,
   articulação (gate time + ênfase), speed por canal e fade in/out.
   Depende de: parser-play.js (estruturas de 'parts'/'groupInstances').

   CORREÇÃO NESTA REVISÃO:
   - Os gate times estavam muito próximos entre si (0.90 a 1.05), então a
     diferença entre articulações praticamente não se notava — isso foi
     mascarado ainda mais pelos pisos de decaimento fixos que existiam em
     synth-instruments.js (corrigidos separadamente naquele arquivo).
   - marcato não tinha nenhuma característica própria (usava o mesmo gate
     do normal) — agora ele mantém a duração do normal, mas ganha ênfase
     de volume no ataque (ARTICULATION_ACCENT), que é como marcato
     realmente se diferencia na prática (acento forte, não duração).
   ========================================================================= */

// Gate time (proporção da duração do ritmo que efetivamente soa) por
// articulação. Valores mais afastados entre si do que antes, para que a
// diferença seja perceptível mesmo com os pisos de decaimento reduzidos.
const ARTICULATION_GATE = {
  staccato: 0.45,  // nota bem curta, pausa grande depois
  portato:  0.70,  // meio-termo: curto, mas não tanto quanto staccato
  normal:   0.88,
  marcato:  0.88,  // mesma duração do normal — a diferença é o ACENTO (abaixo)
  legato:   1.05,  // levemente mais longa que o ritmo pedido, cobre o gap
  tenuto:   1.12   // "segura até o limite", ainda mais que legato
};

// ADIÇÃO: fator de ganho aplicado só no início da nota, para articulações
// que precisam de ênfase em vez de (ou além de) mudança de duração.
const ARTICULATION_ACCENT = {
  marcato: 1.35
};

function buildSchedule(compiled){
  const {state, parts, groupInstances} = compiled;
  const events=[];

  function emitPartEvents(part, baseStart, toneFactor){
    toneFactor = toneFactor || 1;
    const gate = ARTICULATION_GATE[part.articul] !== undefined ? ARTICULATION_GATE[part.articul] : 0.88;
    const accent = ARTICULATION_ACCENT[part.articul] || 1;
    const speed = part.speedFactor || 1; // >1 = mais rápido (durações menores)
    let t = baseStart;
    part.events.forEach(ev=>{
      try{
        const advanceSeconds = ev.seconds / speed;
        if(!ev.pause){
          const soundSeconds = advanceSeconds * gate;
          const common = {
            time: t, duration: soundSeconds, channelId: part.id,
            instrument: part.instrument, effectType: part.type,
            volume: part.volume, fadeIn: part.fadeIn, fadeOut: part.fadeOut,
            accent, // NOVO — repassado até scheduleNote/scheduleDrum
            totalChannelSpan: null // preenchido depois, para o fade proporcional
          };
          if(part.instrument==='drum'){
            events.push({type:'drum', drumType:ev.degree||1, ...common});
          } else if(ev.type==='note'){
            events.push({type:'note', freq:ev.freq*toneFactor, ...common});
          } else if(ev.type==='chord'){
            events.push({type:'chord', freqs:ev.freqs.map(f=>f*toneFactor), ...common});
          }
        }
        t += advanceSeconds;
      }catch(e){}
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

  let totalDuration = events.reduce((m,e)=>Math.max(m, (e.time||0)+(e.duration||0)), 0);
  if(totalDuration<=0) totalDuration=1;

  // Marca, por canal, o intervalo total ocupado (primeiro->último evento)
  // para que o fade in/out seja proporcional à duração REAL da parte, não
  // à música inteira.
  const spanByChannel = {};
  events.forEach(e=>{
    if(!e.channelId) return;
    const start = e.time, end = e.time + e.duration;
    if(!spanByChannel[e.channelId]) spanByChannel[e.channelId] = {start, end};
    else {
      spanByChannel[e.channelId].start = Math.min(spanByChannel[e.channelId].start, start);
      spanByChannel[e.channelId].end = Math.max(spanByChannel[e.channelId].end, end);
    }
  });
  events.forEach(e=>{
    if(e.channelId && spanByChannel[e.channelId]) e.totalChannelSpan = spanByChannel[e.channelId];
  });

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
