/* ================= PlayComputer v1.1 — audio-export.js =================
   Codificação WAV e renderização offline para download de áudio.
   Depende de: scheduler.js, synth-instruments.js, synth-drum.js, synth-effects.js.
   ========================================================================= */

// Converte amostras Float32 (-1.0 a +1.0) para buffer PCM 16-bit com proteção de clipping
function encodeWAV(samples, sampleRate, numChannels, bitDepth = 16){
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, str){ 
    for(let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); 
  }

  // Header RIFF / WAVE
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // Sub-chunk "fmt "
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);            // Tamanho do sub-chunk (16 para PCM)
  view.setUint16(20, 1, true);             // Formato de áudio (1 = PCM linear)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // Byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // Sub-chunk "data"
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Escreve os dados PCM 16-bit com trava rígida de Limiter/Clipping
  let offset = 44;
  for(let i = 0; i < samples.length; i++, offset += 2){
    // Clamping para garantir valores strictly entre -1.0 e 1.0
    const s = Math.max(-1, Math.min(1, samples[i]));
    const sampleInt = s < 0 ? Math.floor(s * 0x8000) : Math.floor(s * 0x7FFF);
    view.setInt16(offset, sampleInt, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

// Intercala os canais Esquerdo e Direito para o padrão Estéreo PCM
function interleave(leftChannel, rightChannel){
  const length = leftChannel.length + rightChannel.length;
  const result = new Float32Array(length);
  let idx = 0;
  for(let i = 0; i < leftChannel.length; i++){
    result[idx++] = leftChannel[i];
    result[idx++] = rightChannel[i];
  }
  return result;
}

function audioBufferToWav(buffer){
  let samples;
  const isStereo = buffer.numberOfChannels >= 2;
  if(isStereo){
    samples = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    samples = buffer.getChannelData(0);
  }
  return encodeWAV(samples, buffer.sampleRate, isStereo ? 2 : 1, 16);
}

// Constrói e agenda eventos no contexto Offline
function renderChannelOffline(offlineCtx, channelId, channelEvents, part, masterGain){
  const chain = buildEffectChain(offlineCtx, part ? part.type : 'normal');
  const volGain = applyChannelVolume(offlineCtx, chain.output, masterGain, part ? part.volume : 1);
  
  // Extrai o span do canal com fallback seguro
  const span = (channelEvents.length && channelEvents[0].totalChannelSpan) ? 
                channelEvents[0].totalChannelSpan : null;

  if(part && (part.fadeIn || part.fadeOut) && span){
    applyChannelFade(offlineCtx, volGain, 0, span, part.fadeIn, part.fadeOut, part.volume !== undefined ? part.volume : 1);
  }

  channelEvents.forEach(ev => {
    const eventTime = ev.time + 0.05; // Offset pequeno para estabilização do clock
    if(ev.type === 'note'){
      scheduleNote(offlineCtx, chain.input, ev.freq, eventTime, ev.duration, ev.instrument);
    } else if(ev.type === 'chord'){
      ev.freqs.forEach(f => scheduleNote(offlineCtx, chain.input, f, eventTime, ev.duration, ev.instrument));
    } else if(ev.type === 'drum'){
      scheduleDrum(offlineCtx, chain.input, ev.drumType, eventTime, ev.duration);
    }
  });
}

// Executa o processamento e aciona o download
async function renderAndDownload(schedule){
  const sampleRate = 44100;
  const totalSecs = (schedule.totalDuration || 0) + 2.0; // Margin de 2 segundos para Reverb/Delay tails
  const length = Math.max(1, Math.ceil(totalSecs * sampleRate));
  
  const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, length, sampleRate);
  
  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = 0.8; // Headroom para evitar distorção no somatório dos canais
  masterGain.connect(offlineCtx.destination);

  // Agrupa eventos por canal
  const byChannel = {};
  (schedule.events || []).forEach(ev => {
    if(ev.channelId === '__metronome__') return;
    if(!byChannel[ev.channelId]) byChannel[ev.channelId] = [];
    byChannel[ev.channelId].push(ev);
  });

  const partsById = {};
  (schedule.parts || []).forEach(p => partsById[p.id] = p);

  // Renderiza cada canal na sua cadeia isolada
  Object.keys(byChannel).forEach(channelId => {
    try {
      renderChannelOffline(offlineCtx, channelId, byChannel[channelId], partsById[channelId], masterGain);
    } catch(e){
      console.error(`Erro ao renderizar canal ${channelId}:`, e);
    }
  });

  // Renderiza metrônomo se houver eventos de clique
  (schedule.events || []).filter(e => e.type === 'click').forEach(ev => {
    try {
      scheduleClick(offlineCtx, masterGain, ev.time + 0.05, ev.accented);
    } catch(e){}
  });

  // Executa a renderização paralela acelerada via hardware
  const renderedBuffer = await offlineCtx.startRendering();
  const blob = audioBufferToWav(renderedBuffer);
  
  // Aciona download do arquivo WAV
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'playcomputer_output.wav';
  document.body.appendChild(a);
  a.click();
  a.remove();
  
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Gera o som do clique do metrônomo
function scheduleClick(ctx, dest, time, accented){
  try {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = accented ? 2000 : 1200;
    
    const g = ctx.createGain();
    g.gain.setValueAtTime(accented ? 0.3 : 0.16, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    
    osc.connect(g);
    g.connect(dest);
    
    osc.start(time);
    osc.stop(time + 0.05);
  } catch(e){}
}
