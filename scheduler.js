/* ================= PlayComputer v1.1 — scheduler.js =================
   Converte o resultado do compile() em uma timeline plana de eventos com
   tempo absoluto, aplicando: repeat/tone acumulado por iteração, escape,
   articulação (gate time), speed por canal e fade in/out.
   Depende de: parser-play.js (estruturas de 'parts'/'groupInstances').
   ========================================================================= */

function buildSchedule(compiled){
  const {state, parts, groupInstances} = compiled;
  const events=[];

  function emitPartEvents(part, baseStart, toneFactor){
    toneFactor = toneFactor || 1;
    const gate = ARTICULATION_GATE[part.articul] !== undefined ? ARTICULATION_GATE[part.articul] : 0.9;
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
