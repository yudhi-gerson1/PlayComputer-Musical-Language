/* ================= PlayComputer v1.1 — synth-effects.js =================
   Cadeia de efeitos por canal (delay, wah, 8bit, distorted, reverb, normal)
   e automação de volume/fade.
   Depende de: Web Audio API nativa.
   ========================================================================= */

// Curva de distorção (waveshaping) — saturação suave por sigmoide
function makeDistortionCurve(amount){
  const k = amount || 50;
  const n = 44100;
  const curve = new Float32Array(n);
  for(let i = 0; i < n; i++){
    const x = i * 2 / n - 1;
    curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

// Impulso sintético para reverb otimizado (duração ajustada para performance)
function makeReverbImpulse(ctx, duration, decay){
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * Math.min(duration, 1.5)); // Limitado a 1.5s para evitar CPU overload
  const impulse = ctx.createBuffer(2, length, rate);
  for(let ch = 0; ch < 2; ch++){
    const data = impulse.getChannelData(ch);
    for(let i = 0; i < length; i++){
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

// Constrói a cadeia de efeitos para um canal, retornando {input, output, cleanup}
function buildEffectChain(ctx, type){
  switch(type){
    case 'delay': {
      const input = ctx.createGain();
      const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.28;
      const feedback = ctx.createGain(); feedback.gain.value = 0.35;
      const wetGain = ctx.createGain(); wetGain.gain.value = 0.5;
      const output = ctx.createGain();

      input.connect(output); // Sinal seco (Dry)
      input.connect(delay); 
      delay.connect(feedback); 
      feedback.connect(delay);
      delay.connect(wetGain); 
      wetGain.connect(output);

      return { input, output };
    }
    case 'wah': {
      const input = ctx.createGain();
      const filt = ctx.createBiquadFilter(); 
      filt.type = 'lowpass'; 
      filt.Q.value = 8; 
      filt.frequency.value = 500;

      const lfo = ctx.createOscillator(); 
      lfo.frequency.value = 1.4;
      
      const lfoGain = ctx.createGain(); 
      lfoGain.gain.value = 350;

      lfo.connect(lfoGain); 
      lfoGain.connect(filt.frequency);
      lfo.start();

      input.connect(filt);
      const output = ctx.createGain();
      filt.connect(output);

      // cleanup para encerrar o LFO quando a cadeia for descartada
      return { 
        input, 
        output, 
        cleanup: (time) => {
          try { lfo.stop(time || ctx.currentTime); } catch(e){}
        } 
      };
    }
    case '8bit': {
      const input = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      shaper.oversample = '2x'; // Anti-aliasing de alta frequência
      
      const steps = 8;
      const n = 4096;
      const curve = new Float32Array(n);
      for(let i = 0; i < n; i++){
        const x = (i / n) * 2 - 1;
        curve[i] = Math.round(x * steps) / steps;
      }
      shaper.curve = curve;

      const lowpass = ctx.createBiquadFilter(); 
      lowpass.type = 'lowpass'; 
      lowpass.frequency.value = 3500;

      input.connect(shaper); 
      shaper.connect(lowpass);
      const output = ctx.createGain();
      lowpass.connect(output);

      return { input, output };
    }
    case 'distorted': {
      const input = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(65);
      shaper.oversample = '4x';

      const tone = ctx.createBiquadFilter(); 
      tone.type = 'lowpass'; 
      tone.frequency.value = 4200;

      input.connect(shaper); 
      shaper.connect(tone);
      const output = ctx.createGain(); 
      output.gain.value = 0.7; // Compensação de ganho
      tone.connect(output);

      return { input, output };
    }
    case 'reverb': {
      const input = ctx.createGain();
      const convolver = ctx.createConvolver();
      convolver.buffer = makeReverbImpulse(ctx, 1.5, 2.5);

      const wetGain = ctx.createGain(); 
      wetGain.gain.value = 0.4;
      const output = ctx.createGain();

      input.connect(output); // Sinal seco
      input.connect(convolver); 
      convolver.connect(wetGain); 
      wetGain.connect(output);

      return { input, output };
    }
    default: { // normal
      const node = ctx.createGain();
      return { input: node, output: node };
    }
  }
}

// Aplica volume fixo do canal
function applyChannelVolume(ctx, chainOutput, masterGain, volume){
  const volGain = ctx.createGain();
  volGain.gain.value = (volume !== undefined ? volume : 1);
  chainOutput.connect(volGain);
  volGain.connect(masterGain);
  return volGain;
}

// Aplica Fade In/Out sem colisão de tempos no agendador
function applyChannelFade(ctx, volGainNode, startAt, channelSpan, fadeIn, fadeOut, baseVolume){
  if(!channelSpan) return;
  const spanStart = startAt + channelSpan.start;
  const spanEnd = startAt + channelSpan.end;
  const totalSpan = Math.max(spanEnd - spanStart, 0.05);

  volGainNode.gain.cancelScheduledValues(spanStart);
  volGainNode.gain.setValueAtTime(baseVolume, spanStart);

  let fadeInEnd = spanStart;

  if(fadeIn){
    const pct = Math.max(0, Math.min(1, fadeIn.pct / 100));
    const fadeInDur = Math.min(totalSpan * 0.4, totalSpan * pct + 0.05);
    const startVol = fadeIn.kind === 'quiet' ? baseVolume * (1 - pct) : baseVolume * pct;
    
    volGainNode.gain.setValueAtTime(startVol, spanStart);
    volGainNode.gain.linearRampToValueAtTime(baseVolume, spanStart + fadeInDur);
    fadeInEnd = spanStart + fadeInDur;
  }

  if(fadeOut){
    const pct = Math.max(0, Math.min(1, fadeOut.pct / 100));
    const fadeOutDur = Math.min(totalSpan * 0.4, totalSpan * pct + 0.05);
    const fadeOutStart = Math.max(fadeInEnd, spanEnd - fadeOutDur); // Evita sobreposição com o Fade In
    const endVol = fadeOut.kind === 'quiet' ? baseVolume * (1 - pct) : baseVolume * pct;

    volGainNode.gain.setValueAtTime(baseVolume, fadeOutStart);
    volGainNode.gain.linearRampToValueAtTime(endVol, spanEnd);
  }
}
