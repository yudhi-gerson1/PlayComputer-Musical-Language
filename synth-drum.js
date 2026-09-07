/* ================= PlayComputer v1.1 — synth-drum.js =================
   scheduleDrum() — as 9 percussões irregulares. Sem mudanças de conteúdo
   em relação à revisão anterior (já estava soando bem); só isolado em
   módulo próprio. Depende de: createNoiseBuffer (synth-instruments.js).
   ========================================================================= */

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
