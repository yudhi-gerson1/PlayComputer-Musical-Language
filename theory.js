/* ================= PlayComputer v1.1 — theory.js =================
   Teoria musical: notas, escalas, graus -> frequência, modificadores de
   tom, oitava padrão (stdOctave) e ponto de aumento no ritmo.
   Depende de: core-utils.js (nenhuma função específica é chamada aqui,
   mas os módulos seguintes vão usar ambos juntos).
   ========================================================================= */

const NOTE_INDEX = {C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11};
const MAJOR_OFFSETS = [0,2,4,5,7,9,11];
const MINOR_OFFSETS = [0,2,3,5,7,8,10];

// Confirmado pelo usuário: ^ e v = 1 semitom (documentação corrigida).
const TOM_EM_SEMITONS = 1;
function modToSemitone(mod){
  mod=(mod||'').trim();
  if(mod==='^') return TOM_EM_SEMITONS;
  if(mod==='^^') return TOM_EM_SEMITONS*2;
  if(mod==='v') return -TOM_EM_SEMITONS;
  if(mod==='vv') return -TOM_EM_SEMITONS*2;
  return 0;
}

// ADIÇÃO v1.1: parse do modificador de oitava, agora suportando também
// [8+n] / [8-n] (n oitavas, número livre) além dos fixos [8+]/[8++]/etc.
// Retorna um inteiro: quantas oitavas deslocar (+ ou -).
function parseOctaveModifier(octStr){
  if(!octStr) return 0;
  const s = octStr.trim();
  if(s==='+') return 1;
  if(s==='++') return 2;
  if(s==='-') return -1;
  if(s==='--') return -2;
  const plusN = s.match(/^\+(\d+)$/);
  if(plusN) return parseInt(plusN[1]);
  const minusN = s.match(/^-(\d+)$/);
  if(minusN) return -parseInt(minusN[1]);
  return 0;
}

// ADIÇÃO v1.1: stdOctave — a oitava padrão (base) das notas quando nenhum
// modificador de oitava é usado. Documentação original usava sempre 4;
// agora isso é configurável pelo comando global "stdOctave n" / "stdOctave standard".
function parseStdOctave(src, state){
  try{
    const m = src.match(/\bstdOctave\s+(standard|\d+)/);
    if(m){
      state.stdOctave = (m[1]==='standard') ? 4 : parseInt(m[1]);
    }
  }catch(e){}
}

// Converte um grau da escala (com modificador de tom e de oitava opcionais)
// em frequência (Hz). Agora usa state.stdOctave como base em vez de 4 fixo.
// argStr esperado: "1", "1^", "1^^[8+]", "1n[8+3]", etc.
function degreeToFreq(argStr, state){
  try{
    argStr = argStr.trim();
    const m = argStr.match(/^(\d+)\s*(\^\^|\^|vv|v|n)?\s*(?:\[8(\+\+|\+\d*|--|-\d*)\])?$/);
    if(!m) return null;
    const degree = parseInt(m[1]);
    const mod = m[2]||''; const oct = m[3]||'';
    const offsets = state.scaleType==='minor'?MINOR_OFFSETS:MAJOR_OFFSETS;
    const idx = ((degree-1)%7+7)%7;
    const rootOffset = NOTE_INDEX[state.root] !== undefined ? NOTE_INDEX[state.root] : 0;
    const modSemi = modToSemitone(mod);
    const octShift = parseOctaveModifier(oct);
    const total = rootOffset + offsets[idx] + modSemi;
    const carry = Math.floor(total/12);
    const semitone = ((total%12)+12)%12;
    const baseOctave = (state.stdOctave!==undefined? state.stdOctave : 4);
    const octave = baseOctave+octShift+carry;
    const midi = 12*(octave+1)+semitone;
    return 440*Math.pow(2,(midi-69)/12);
  }catch(e){ return null; }
}

// Ritmo -> segundos. ADIÇÃO v1.1: suporte ao ponto de aumento (rhythm(4.))
// que multiplica a duração por 1.5x. Também aceita "pause" já existente.
function parseRhythmArg(argStr, state){
  argStr = (argStr||'4').trim();
  let pause=false;
  let dotted=false;

  const pauseMatch = argStr.match(/^pause\s+(.+)$/);
  if(pauseMatch){ pause=true; argStr=pauseMatch[1].trim(); }

  // ADIÇÃO v1.1: ponto de aumento — "4." vira duração ×1.5
  const dotMatch = argStr.match(/^(\d+(?:\.\d+)?)\.$/);
  if(dotMatch){ dotted=true; argStr = dotMatch[1]; }

  let n = parseFloat(argStr); if(!n||n<=0) n=4;
  if(n>64) n=4; // regra: não é permitido ritmo acima de 64

  const beats = 4/n;
  let seconds = beats*(60/(state.bpm||120));
  if(dotted) seconds *= 1.5;
  return {pause, seconds};
}

// ADIÇÃO v1.1: expande listas de graus/ritmos com sufixo xN em tokens
// individuais (reaproveita expandRepeatTokens de core-utils.js), e então
// aplica Zip-Cycle Alignment entre a lista de notas e a lista de ritmos.
// Retorna um array de pares {noteToken, rhythmToken} prontos para virar
// eventos individuais.
function alignNotesAndRhythms(noteTokensRaw, rhythmTokensRaw){
  const notes = expandRepeatTokens(noteTokensRaw);
  const rhythms = expandRepeatTokens(rhythmTokensRaw.length? rhythmTokensRaw : ['4']);
  return zipCycleAlign(notes, rhythms).map(p => ({ noteToken: p.a, rhythmToken: p.b }));
}
