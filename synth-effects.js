/* ================= PlayComputer v1.1 — synth-effects.js =================
   Cadeia de efeitos por canal (type = delay/wah/8bit/distorted/reverb/
   normal) + fade in/out proporcional ao intervalo do canal.

   CORREÇÃO NESTA REVISÃO — bug do fade invertido:
   No cálculo antigo de applyChannelFade, 'loud' e 'quiet' produziam o
   MESMO resultado matemático na prática (baseVolume*pct em ambos os
   ramos, só que com pct calculado de formas que se cancelavam), então
   fade in/out não mudava o volume perceptível de forma consistente.
   Agora: 'quiet' começa/termina ABAIXO do volume base (baseVolume*(1-pct))
   e 'loud' começa/termina AGORA DE FATO ACIMA do volume base
   (baseVolume*(1+pct), limitado a não estourar o headroom do canal).
   Depende de: nada além da Web Audio API nativa.
   ========================================================================= */

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

function buildEffectChain(ctx, type){
  switch(type){
    case 'delay': {
      const input = ctx.createGain();
      const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.28;
      const feedback = ctx.createGain(); feedback.gain.value = 0.35;
      const wetGain = ctx.createGain(); wetGain.gain.value = 0.5;
      const output = ctx.createGain();
      input.connect(output);
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
      const output = ctx.createGain(); output.gain.value = 0.7;
      tone.connect(output);
      return {input, output};
    }
    case 'reverb': {
      const input = ctx.createGain();
      const convolver = ctx.createConvolver();
      convolver.buffer = makeReverbImpulse(ctx, 2.2, 2.5);
      const wetGain = ctx.createGain(); wetGain.gain.value = 0.4;
      const output = ctx.createGain();
      input.connect(output);
      input.connect(convolver); convolver.connect(wetGain); wetGain.connect(output);
      return {input, output};
    }
    default: {
      const node = ctx.createGain();
      return {input: node, output: node};
    }
  }
}

// Aplica volume fixo do canal (attrs.volume) entre a cadeia de efeitos e
// o masterGain final. volume=1 significa "o volume do celular", como
// definido: masterGain já representa o volume atual do aparelho, e este
// valor multiplica em cima dele (ex.: 0.9 para volume=90%).
function applyChannelVolume(ctx, chainOutput, masterGain, volume){
  const volGain = ctx.createGain();
  volGain.gain.value = (volume!==undefined? volume : 1);
  chainOutput.connect(volGain);
  volGain.connect(masterGain);
  return volGain;
}

// CORREÇÃO: 'quiet' agora reduz de fato o volume no início/fim do trecho,
// e 'loud' AUMENTA de fato acima do volume base — antes os dois produziam
// resultado equivalente por causa de um erro de sinal no cálculo.
function applyChannelFade(ctx, volGainNode, startAt, channelSpan, fadeIn, fadeOut, baseVolume){
  if(!channelSpan) return;
  const spanStart = startAt + channelSpan.start;
  const spanEnd = startAt + channelSpan.end;
  const totalSpan = Math.max(spanEnd - spanStart, 0.05);

  volGainNode.gain.cancelScheduledValues(spanStart);
  volGainNode.gain.setValueAtTime(baseVolume, spanStart);

  if(fadeIn){
    const pct = Math.max(0, Math.min(1, fadeIn.pct/100));
    const fadeInDur = Math.min(totalSpan*0.4, totalSpan*pct + 0.05);
    const startVol = fadeIn.kind==='quiet'
      ? baseVolume*(1-pct)                      // quiet: começa mais baixo
      : Math.min(baseVolume*(1+pct), baseVolume*2); // loud: começa mais alto
    volGainNode.gain.setValueAtTime(Math.max(startVol, 0.0001), spanStart);
    volGainNode.gain.linearRampToValueAtTime(baseVolume, spanStart+fadeInDur);
  }
  if(fadeOut){
    const pct = Math.max(0, Math.min(1, fadeOut.pct/100));
    const fadeOutDur = Math.min(totalSpan*0.4, totalSpan*pct + 0.05);
    const endVol = fadeOut.kind==='quiet'
      ? baseVolume*(1-pct)                      // quiet: termina mais baixo
      : Math.min(baseVolume*(1+pct), baseVolume*2); // loud: termina mais alto
    volGainNode.gain.setValueAtTime(baseVolume, spanEnd-fadeOutDur);
    volGainNode.gain.linearRampToValueAtTime(Math.max(endVol, 0.0001), spanEnd);
  }
}
