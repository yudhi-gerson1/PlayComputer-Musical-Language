/* ================= PlayComputer v1.1 — synth-instruments.js =================
   scheduleNote() e a síntese de cada um dos 15 instrumentos (9 originais +
   6 novos: violin, saxophone, trumpet, vibraphone, choir, whistle).
   dest passado aqui já é o INÍCIO da cadeia de efeitos do canal (ver
   synth-effects.js) — os instrumentos não sabem nada sobre delay/reverb/etc.
   Depende de: nada (funções puras de Web Audio).
   ========================================================================= */

function createNoiseBuffer(ctx, duration){
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate*duration));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<length;i++) data[i]=Math.random()*2-1;
  return buffer;
}

// Corda dedilhada com filtro de brilho em varredura (piano/guitar/
// guitarBass/ukulele) — mesma técnica estável das revisões anteriores.
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

  const masterFilter = ctx.createBiquadFilter();
  masterFilter.type='lowpass'; masterFilter.Q.value = filterQ;
  masterFilter.frequency.setValueAtTime(filterStart, time);
  masterFilter.frequency.exponentialRampToValueAtTime(filterEnd, time+baseDecay);
  masterFilter.connect(dest);

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

function scheduleSynth(ctx, dest, freq, time, dur){
  const osc = ctx.createOscillator(); osc.type='sawtooth';
  osc.frequency.setValueAtTime(freq, time);
  const filt = ctx.createBiquadFilter(); filt.type='lowpass'; filt.Q.value=6;
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

// ADIÇÃO v1.1 — violin: onda sustentada (não decai como corda dedilhada),
// com vibrato entrando gradualmente após o ataque (característico de
// cordas friccionadas) e leve ruído de arco no ataque.
function scheduleViolin(ctx, dest, freq, time, dur){
  const d = Math.max(dur, 0.25);
  const filt = ctx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value = freq*6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(0.3, time+0.06); // ataque de arco, não instantâneo
  g.gain.setValueAtTime(0.3, time+Math.max(d*0.75,0.08));
  g.gain.linearRampToValueAtTime(0.0001, time+d);
  filt.connect(g); g.connect(dest);

  const osc = ctx.createOscillator(); osc.type='sawtooth';
  osc.frequency.setValueAtTime(freq, time);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5.8;
  const lfoGain = ctx.createGain(); lfoGain.gain.setValueAtTime(0, time);
  lfoGain.gain.linearRampToValueAtTime(6, time+0.15); // vibrato entra depois do ataque
  lfo.connect(lfoGain); lfoGain.connect(osc.detune);
  osc.connect(filt);
  osc.start(time); osc.stop(time+d+0.05);
  lfo.start(time); lfo.stop(time+d+0.05);

  const bowBuf = createNoiseBuffer(ctx, 0.03);
  const bowSrc = ctx.createBufferSource(); bowSrc.buffer = bowBuf;
  const bowFilt = ctx.createBiquadFilter(); bowFilt.type='highpass'; bowFilt.frequency.value=3000;
  const bowGain = ctx.createGain();
  bowGain.gain.setValueAtTime(0.06, time);
  bowGain.gain.exponentialRampToValueAtTime(0.0006, time+0.03);
  bowSrc.connect(bowFilt); bowFilt.connect(bowGain); bowGain.connect(dest);
  bowSrc.start(time); bowSrc.stop(time+0.03);
}

// ADIÇÃO v1.1 — saxophone: onda quadrada rica em ímpares + filtro em
// formante fixo (simula a ressonância do corpo do sax) + leve breath noise.
function scheduleSaxophone(ctx, dest, freq, time, dur){
  const d = Math.max(dur, 0.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(0.28, time+0.03);
  g.gain.setValueAtTime(0.28, time+Math.max(d*0.8,0.05));
  g.gain.linearRampToValueAtTime(0.0001, time+d);

  const formant = ctx.createBiquadFilter();
  formant.type='bandpass'; formant.frequency.value = Math.min(freq*2.2, 1800); formant.Q.value = 3;
  formant.connect(g); g.connect(dest);

  const osc = ctx.createOscillator(); osc.type='square';
  osc.frequency.setValueAtTime(freq, time);
  osc.connect(formant);
  osc.start(time); osc.stop(time+d+0.05);

  const breathBuf = createNoiseBuffer(ctx, d);
  const breathSrc = ctx.createBufferSource(); breathSrc.buffer = breathBuf;
  const breathFilt = ctx.createBiquadFilter(); breathFilt.type='bandpass'; breathFilt.frequency.value=freq*3;
  const breathGain = ctx.createGain(); breathGain.gain.value = 0.03;
  breathSrc.connect(breathFilt); breathFilt.connect(breathGain); breathGain.connect(g);
  breathSrc.start(time); breathSrc.stop(time+d);
}

// ADIÇÃO v1.1 — trumpet: onda quadrada brilhante, ataque rápido e firme,
// leve "brassy buzz" (segundo oscilador dessintonizado no ataque).
function scheduleTrumpet(ctx, dest, freq, time, dur){
  const d = Math.max(dur, 0.15);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(0.3, time+0.012); // ataque bem rápido
  g.gain.setValueAtTime(0.3, time+Math.max(d*0.75,0.04));
  g.gain.linearRampToValueAtTime(0.0001, time+d);
  const filt = ctx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value = freq*8;
  filt.connect(g); g.connect(dest);

  const osc = ctx.createOscillator(); osc.type='square';
  osc.frequency.setValueAtTime(freq, time);
  osc.connect(filt); osc.start(time); osc.stop(time+d+0.05);

  const buzz = ctx.createOscillator(); buzz.type='sawtooth';
  buzz.frequency.setValueAtTime(freq, time); buzz.detune.setValueAtTime(9, time);
  const buzzGain = ctx.createGain();
  buzzGain.gain.setValueAtTime(0.12, time);
  buzzGain.gain.exponentialRampToValueAtTime(0.001, time+0.06);
  buzz.connect(filt); buzz.connect(buzzGain); buzzGain.connect(g);
  buzz.start(time); buzz.stop(time+0.06);
}

// ADIÇÃO v1.1 — vibraphone: harmônicos metálicos com decaimento longo +
// trêmulo (LFO em amplitude) característico do motor do vibrafone.
function scheduleVibraphone(ctx, dest, freq, time, dur){
  const d = Math.max(dur, 1.2);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, time);
  master.gain.exponentialRampToValueAtTime(0.3, time+0.005);
  master.gain.exponentialRampToValueAtTime(0.0006, time+d);
  master.connect(dest);

  const tremolo = ctx.createGain(); tremolo.gain.value = 1;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.3;
  lfo.connect(lfoGain); lfoGain.connect(tremolo.gain);
  tremolo.connect(master);
  lfo.start(time); lfo.stop(time+d+0.05);

  // Harmônicos ligeiramente inarmônicos (típico de barras metálicas).
  [1, 3.9, 9.2].forEach((mult, idx)=>{
    const osc = ctx.createOscillator(); osc.type='sine';
    osc.frequency.setValueAtTime(freq*mult, time);
    const og = ctx.createGain();
    const amp = [1,0.35,0.15][idx];
    const decay = [d, d*0.4, d*0.15][idx];
    og.gain.setValueAtTime(amp, time);
    og.gain.exponentialRampToValueAtTime(0.0006, time+decay);
    osc.connect(og); og.connect(tremolo);
    osc.start(time); osc.stop(time+decay+0.05);
  });
}

// ADIÇÃO v1.1 — choir: pilha de osciladores dessintonizados (vogal "ah"
// aproximada com dois formantes) simulando várias vozes cantando junto.
function scheduleChoir(ctx, dest, freq, time, dur){
  const d = Math.max(dur, 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(0.22, time+0.08);
  g.gain.setValueAtTime(0.22, time+Math.max(d*0.75,0.1));
  g.gain.linearRampToValueAtTime(0.0001, time+d);

  const formant1 = ctx.createBiquadFilter(); formant1.type='bandpass'; formant1.frequency.value=800; formant1.Q.value=4;
  const formant2 = ctx.createBiquadFilter(); formant2.type='bandpass'; formant2.frequency.value=1150; formant2.Q.value=5;
  formant1.connect(g); formant2.connect(g); g.connect(dest);

  [-9,-3,0,3,9].forEach(cents=>{
    const osc = ctx.createOscillator(); osc.type='sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    osc.detune.setValueAtTime(cents, time);
    const og = ctx.createGain(); og.gain.value = 0.14;
    osc.connect(og); og.connect(formant1); og.connect(formant2);
    osc.start(time); osc.stop(time+d+0.05);
  });
}

// ADIÇÃO v1.1 — whistle (assobio): senoidal pura com leve vibrato e
// pequeno "portamento" de entrada (o som sobe rapidamente até a nota).
function scheduleWhistle(ctx, dest, freq, time, dur){
  const d = Math.max(dur, 0.15);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(0.25, time+0.02);
  g.gain.exponentialRampToValueAtTime(0.0006, time+d);
  const osc = ctx.createOscillator(); osc.type='sine';
  osc.frequency.setValueAtTime(freq*0.85, time);
  osc.frequency.exponentialRampToValueAtTime(freq, time+0.04); // portamento de entrada

  const lfo = ctx.createOscillator(); lfo.frequency.value = 6.5;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 4;
  lfo.connect(lfoGain); lfoGain.connect(osc.frequency);

  osc.connect(g); g.connect(dest);
  osc.start(time); osc.stop(time+d+0.05);
  lfo.start(time); lfo.stop(time+d+0.05);
}

function scheduleNote(ctx, dest, freq, time, dur, instrument){
  try{
    if(!isFinite(freq) || freq<=0) return;
    switch(instrument){
      case 'piano':
        pluckedTone(ctx, dest, freq, time, dur, { harmonics:[1,2,3,4,5,6,8], ampWeights:[1,0.5,0.3,0.22,0.14,0.09,0.05], spread:1.3, decay:Math.max(dur,1.1), attack:0.006, gain:0.5, inharm:0.00018, filterStart:freq*9, filterEnd:freq*1.8, filterQ:0.5 });
        break;
      case 'guitar':
        pluckedTone(ctx, dest, freq, time, dur, { harmonics:[1,2,3,4,5,7], ampWeights:[1,0.65,0.42,0.26,0.16,0.09], spread:2.0, decay:Math.max(dur,0.55), attack:0.003, gain:0.45, inharm:0.00006, filterStart:freq*15, filterEnd:freq*3.5, filterQ:0.7 });
        break;
      case 'guitarBass':
        pluckedTone(ctx, dest, freq/2, time, dur, { harmonics:[1,2,3,4], ampWeights:[1,0.4,0.2,0.1], spread:0.9, decay:Math.max(dur,1.0), attack:0.01, gain:0.62, inharm:0, filterStart:(freq/2)*5, filterEnd:(freq/2)*1.3, filterQ:0.5 });
        break;
      case 'ukulele':
        pluckedTone(ctx, dest, freq*1.5, time, dur*0.7, { harmonics:[1,2,3,4,5], ampWeights:[1,0.45,0.24,0.14,0.07], spread:2.8, decay:Math.max(dur*0.55,0.28), attack:0.002, gain:0.4, inharm:0, filterStart:freq*20, filterEnd:freq*5, filterQ:0.6 });
        break;
      case 'synthBass': scheduleSynthBass(ctx, dest, freq, time, dur); break;
      case 'synth':     scheduleSynth(ctx, dest, freq, time, dur); break;
      case 'organ':     scheduleOrgan(ctx, dest, freq, time, dur); break;
      case 'accordeon': scheduleAccordeon(ctx, dest, freq, time, dur); break;
      case 'violin':    scheduleViolin(ctx, dest, freq, time, dur); break;
      case 'saxophone': scheduleSaxophone(ctx, dest, freq, time, dur); break;
      case 'trumpet':   scheduleTrumpet(ctx, dest, freq, time, dur); break;
      case 'vibraphone':scheduleVibraphone(ctx, dest, freq, time, dur); break;
      case 'choir':     scheduleChoir(ctx, dest, freq, time, dur); break;
      case 'whistle':   scheduleWhistle(ctx, dest, freq, time, dur); break;
      default: scheduleSynth(ctx, dest, freq, time, dur);
    }
  }catch(e){}
     }
