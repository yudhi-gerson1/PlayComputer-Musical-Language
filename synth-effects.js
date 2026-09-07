/* ================= PlayComputer v1.1 — synth-effects.js =================
   NOVO v1.1: cadeia de efeitos por canal (type = delay/wah/8bit/distorted/
   reverb/normal) + fade in/out proporcional ao intervalo do canal.
   A cadeia é construída UMA VEZ por canal (não por nota) e devolve o
   "input node" onde scheduleNote/scheduleDrum devem injetar o som — isso
   é o padrão correto de roteamento em Web Audio (evita recriar a cadeia
   a cada nota, o que seria caro e poderia causar cliques).
   Depende de: nada além da Web Audio API nativa.
   ========================================================================= */

// Curva de distorção (waveshaping) — quanto maior "amount", mais agressivo.
function makeDistortionCurve(amount){
  const k = amount || 50;
  const n = 44100;
  const curve = new Float32Array(n);
  for(let i=0;i<n;i++){
    const x = i*2/n - 1;
    curve[i] = (Math.PI+k)*x / (Math.PI + k*Math.abs(x));
  }
  return curve;
}

// Impulso sintético para reverb (ruído decaindo exponencialmente) — não
// depende de arquivo externo de impulso, gerado em runtime.
function makeReverbImpulse(ctx, duration, decay){
  const rate = ctx.sampleRate;
  const length = Math.floor(rate*duration);
  const impulse = ctx.createBuffer(2, length, rate);
  for(let ch=0; ch<2; ch++){
    const data = impulse.getChannelData(ch);
    for(let i=0;i<length;i++){
      data[i] = (Math.random()*2-1) * Math.pow(1-i/length, decay);
    }
  }
  return impulse;
}

// Constrói a cadeia de efeitos para um canal, retornando {input, output}.
// input: onde as notas devem se conectar. output: onde a cadeia entrega o
// som já processado (deve ser conectado ao masterGain do player).
function buildEffectChain(ctx, type){
  switch(type){
    case 'delay': {
      const input = ctx.createGain();
      const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.28;
      const feedback = ctx.createGain(); feedback.gain.value = 0.35;
      const wetGain = ctx.createGain(); wetGain.gain.value = 0.5;
      const output = ctx.createGain();
      input.connect(output); // seco
      input.connect(delay); delay.connect(feedback); feedback.connect(delay);
      delay.connect(wetGain); wetGain.connect(output);
      return {input, output};
    }
    case 'wah': {
      const input = ctx.createGain();
      const filt = ctx.createBiquadFilter(); filt.type='lowpass'; filt.Q.value=8; filt.frequency.value=500;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 1.4;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 350;
      lfo.connect(lfoGain); lfoGain.connect(filt.frequency);
      lfo.start();
      input.connect(filt);
      const output = ctx.createGain();
      filt.connect(output);
      return {input, output};
    }
    case '8bit': {
      // Bitcrush aproximado via WaveShaper com curva em degraus (quantização).
      const input = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      const steps = 8;
      const curve = new Float32Array(1024);
      for(let i=0;i<1024;i++){
        const x = i/1024*2-1;
        curve[i] = Math.round(x*steps)/steps;
      }
      shaper.curve = curve;
      const lowpass = ctx.createBiquadFilter(); lowpass.type='lowpass'; lowpass.frequency.value=3500;
      input.connect(shaper); shaper.connect(lowpass);
      const output = ctx.createGain();
      lowpass.connect(output);
      return {input, output};
    }
    case 'distorted': {
      const input = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(65);
      shaper.oversample = '4x';
      const tone = ctx.createBiquadFilter(); tone.type='lowpass'; tone.frequency.value=4200;
      input.connect(shaper); shaper.connect(tone);
      const output = ctx.createGain(); output.gain.value = 0.7; // compensa ganho da distorção
      tone.connect(output);
      return {input, output};
    }
    case 'reverb': {
      const input = ctx.createGain();
      const convolver = ctx.createConvolver();
      convolver.buffer = makeReverbImpulse(ctx, 2.2, 2.5);
      const wetGain = ctx.createGain(); wetGain.gain.value = 0.4;
      const output = ctx.createGain();
      input.connect(output); // seco
      input.connect(convolver); convolver.connect(wetGain); wetGain.connect(output);
      return {input, output};
    }
    default: { // normal
      const node = ctx.createGain();
      return {input: node, output: node};
    }
  }
}

// Aplica volume fixo do canal (attrs.volume) entre a cadeia de efeitos e
// o masterGain final.
function applyChannelVolume(ctx, chainOutput, masterGain, volume){
  const volGain = ctx.createGain();
  volGain.gain.value = (volume!==undefined? volume : 1);
  chainOutput.connect(volGain);
  volGain.connect(masterGain);
  return volGain;
}

// Aplica fade in/out no volume MESTRE DO CANAL (o volGain acima), ao
// longo do intervalo real de duração do canal (channelSpan), não da
// música inteira. kind: 'loud' sobe/desce a partir de um volume mais
// baixo; 'quiet' começa/termina reduzindo o volume normal.
function applyChannelFade(ctx, volGainNode, startAt, channelSpan, fadeIn, fadeOut, baseVolume){
  if(!channelSpan) return;
  const spanStart = startAt + channelSpan.start;
  const spanEnd = startAt + channelSpan.end;
  const totalSpan = Math.max(spanEnd - spanStart, 0.05);

  volGainNode.gain.cancelScheduledValues(spanStart);
  volGainNode.gain.setValueAtTime(baseVolume, spanStart);

  if(fadeIn){
    const pct = Math.max(0, Math.min(1, fadeIn.pct/100));
    const fadeInDur = Math.min(totalSpan*0.4, totalSpan* pct + 0.05);
    const startVol = fadeIn.kind==='quiet' ? baseVolume*(1-pct) : baseVolume*pct;
    volGainNode.gain.setValueAtTime(startVol, spanStart);
    volGainNode.gain.linearRampToValueAtTime(baseVolume, spanStart+fadeInDur);
  }
  if(fadeOut){
    const pct = Math.max(0, Math.min(1, fadeOut.pct/100));
    const fadeOutDur = Math.min(totalSpan*0.4, totalSpan*pct + 0.05);
    const endVol = fadeOut.kind==='quiet' ? baseVolume*(1-pct) : baseVolume*pct;
    volGainNode.gain.setValueAtTime(baseVolume, spanEnd-fadeOutDur);
    volGainNode.gain.linearRampToValueAtTime(endVol, spanEnd);
  }
}
