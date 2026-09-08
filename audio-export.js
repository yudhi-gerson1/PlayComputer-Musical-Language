/* ================= PlayComputer v1.1 — audio-export.js =================
   Codificação WAV e renderização offline (para o botão "Baixar Áudio").

   CORREÇÃO NESTA REVISÃO: mesma correção do ui.js — ev.accent agora é
   repassado nas chamadas de scheduleNote dentro da renderização offline,
   para que o .wav baixado tenha a mesma ênfase de marcato que a
   reprodução ao vivo.
   Depende de: scheduler.js (schedule), synth-instruments.js, synth-drum.js,
   synth-effects.js.
   ========================================================================= */

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
  if(buffer.numberOfChannels>=2) samples = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  else samples = buffer.getChannelData(0);
  return encodeWAV(samples, buffer.sampleRate, buffer.numberOfChannels>=2?2:1, 16);
}

function renderChannelOffline(offlineCtx, channelId, channelEvents, part, masterGain){
  const chain = buildEffectChain(offlineCtx, part ? part.type : 'normal');
  const volGain = applyChannelVolume(offlineCtx, chain.output, masterGain, part ? part.volume : 1);
  if(part && (part.fadeIn || part.fadeOut) && channelEvents.length){
    applyChannelFade(offlineCtx, volGain, 0, channelEvents[0].totalChannelSpan, part.fadeIn, part.fadeOut, part.volume!==undefined?part.volume:1);
  }
  channelEvents.forEach(ev=>{
    // CORREÇÃO: ev.accent repassado também na renderização offline.
    if(ev.type==='note') scheduleNote(offlineCtx, chain.input, ev.freq, ev.time+0.05, ev.duration, ev.instrument, ev.accent);
    else if(ev.type==='chord') ev.freqs.forEach(f=>scheduleNote(offlineCtx, chain.input, f, ev.time+0.05, ev.duration, ev.instrument, ev.accent));
    else if(ev.type==='drum') scheduleDrum(offlineCtx, chain.input, ev.drumType, ev.time+0.05, ev.duration);
  });
}

async function renderAndDownload(schedule){
  const sampleRate = 44100;
  const length = Math.max(1, Math.ceil((schedule.totalDuration+2)*sampleRate));
  const offlineCtx = new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(2, length, sampleRate);
  const gain = offlineCtx.createGain();
  gain.gain.value = 0.8;
  gain.connect(offlineCtx.destination);

  const byChannel = {};
  schedule.events.forEach(ev=>{
    if(ev.channelId==='__metronome__') return;
    if(!byChannel[ev.channelId]) byChannel[ev.channelId]=[];
    byChannel[ev.channelId].push(ev);
  });

  const partsById = {};
  (schedule.parts||[]).forEach(p=> partsById[p.id]=p);

  Object.keys(byChannel).forEach(channelId=>{
    try{ renderChannelOffline(offlineCtx, channelId, byChannel[channelId], partsById[channelId], gain); }catch(e){}
  });

  schedule.events.filter(e=>e.type==='click').forEach(ev=>{
    try{ scheduleClick(offlineCtx, gain, ev.time+0.05, ev.accented); }catch(e){}
  });

  const buffer = await offlineCtx.startRendering();
  const blob = audioBufferToWav(buffer);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'playcomputer_output.wav';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
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
