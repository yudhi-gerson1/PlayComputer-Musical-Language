/* ================= PlayComputer v1.1 — ui.js =================
   Renderização de canais, status, player ao vivo (playSchedule) e
   listeners dos botões Tocar/Parar/Baixar.
   Depende de: scheduler.js, synth-instruments.js, synth-drum.js,
   synth-effects.js.
   ========================================================================= */

let audioCtx=null, masterGain=null, activeTimers=[];

function setStatus(msg){ const el = document.getElementById('log'); if(el) el.textContent = msg; }

function renderChannels(parts){
  const container = document.getElementById('channels');
  if(!container) return;
  container.innerHTML='';
  if(!parts || parts.length===0){
    container.innerHTML = '<p class="empty">Nenhum canal compilado.</p>';
    return;
  }
  parts.forEach(p=>{
    const div=document.createElement('div');
    div.className='channel';
    div.setAttribute('data-channel', p.id);
    const extra = [];
    if(p.type && p.type!=='normal') extra.push(p.type);
    if(p.articul && p.articul!=='normal') extra.push(p.articul);
    const tagText = p.instrument + (extra.length? ' · '+extra.join(', ') : '')
      + (p.classes && p.classes.length? ' · .'+p.classes.join(' .') : '');
    div.innerHTML = '<span class="dot"></span><span class="cname">#'+p.id+'</span><span class="ctags">'+tagText+'</span>';
    container.appendChild(div);
  });
}

function highlightChannel(id, durationMs){
  try{
    document.querySelectorAll('.channel').forEach(el=>{
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

  const byChannel = {};
  schedule.events.forEach(ev=>{
    if(ev.channelId==='__metronome__') return;
    if(!byChannel[ev.channelId]) byChannel[ev.channelId]=[];
    byChannel[ev.channelId].push(ev);
  });
  const partsById = {};
  (schedule.parts||[]).forEach(p=> partsById[p.id]=p);

  Object.keys(byChannel).forEach(channelId=>{
    try{
      const part = partsById[channelId];
      const chain = buildEffectChain(audioCtx, part ? part.type : 'normal');
      const volGain = applyChannelVolume(audioCtx, chain.output, masterGain, part ? part.volume : 1);
      const evs = byChannel[channelId];
      if(part && (part.fadeIn || part.fadeOut) && evs.length){
        applyChannelFade(audioCtx, volGain, startAt, evs[0].totalChannelSpan, part.fadeIn, part.fadeOut, part.volume!==undefined?part.volume:1);
      }
      evs.forEach(ev=>{
        if(ev.type==='note') scheduleNote(audioCtx, chain.input, ev.freq, startAt+ev.time, ev.duration, ev.instrument);
        else if(ev.type==='chord') ev.freqs.forEach(f=>scheduleNote(audioCtx, chain.input, f, startAt+ev.time, ev.duration, ev.instrument));
        else if(ev.type==='drum') scheduleDrum(audioCtx, chain.input, ev.drumType, startAt+ev.time, ev.duration);

        const tid = setTimeout(()=>highlightChannel(channelId, ev.duration*1000), Math.max(0,ev.time)*1000);
        activeTimers.push(tid);
      });
    }catch(e){}
  });

  schedule.events.filter(e=>e.type==='click').forEach(ev=>{
    try{ scheduleClick(audioCtx, masterGain, startAt+ev.time, ev.accented); }catch(e){}
  });

  const doneTid = setTimeout(()=>setStatus('Reprodução concluída.'), (schedule.totalDuration+0.5)*1000);
  activeTimers.push(doneTid);
}

document.addEventListener('DOMContentLoaded', ()=>{
  const btnPlay = document.getElementById('btnPlay');
  const btnStop = document.getElementById('btnStop');
  const btnDownload = document.getElementById('btnDownload');

  if(btnPlay) btnPlay.addEventListener('click', ()=>{
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

  if(btnStop) btnStop.addEventListener('click', ()=>{
    stopAll();
    setStatus('Parado.');
  });

  if(btnDownload) btnDownload.addEventListener('click', async ()=>{
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
});
