/* ================= PlayComputer v1.1 — theory.js =================
   Teoria musical: notas, escalas, graus -> frequência, modificadores de
   tom, oitava padrão (stdOctave) e ponto de aumento no ritmo.
   Depende de: core-utils.js
   ========================================================================= */

const NOTE_INDEX = { C:0, 'C#':1, D:2, 'D#':3, E:4, F:5, 'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11 };
const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_OFFSETS = [0, 2, 3, 5, 7, 8, 10];

const TOM_EM_SEMITONS = 1;

function modToSemitone(mod){
  mod = (mod || '').trim();
  if(mod === '^') return TOM_EM_SEMITONS;
  if(mod === '^^') return TOM_EM_SEMITONS * 2;
  if(mod === 'v') return -TOM_EM_SEMITONS;
  if(mod === 'vv') return -TOM_EM_SEMITONS * 2;
  return 0;
}

// ADIÇÃO v1.1: Suporte a [8+n], [8-n], [8+], [8++] e variações
function parseOctaveModifier(octStr){
  if(!octStr) return 0;
  let s = octStr.trim();
  
  // Remove o prefixo "8" se tiver sido capturado junto (ex: "8+2" -> "+2")
  if(s.startsWith('8')) s = s.slice(1);

  if(s === '+' || s === '8+') return 1;
  if(s === '++' || s === '8++') return 2;
  if(s === '-' || s === '8-') return -1;
  if(s === '--' || s === '8--') return -2;

  const plusN = s.match(/^\+(\d+)$/);
  if(plusN) return parseInt(plusN[1], 10);

  const minusN = s.match(/^-(\d+)$/);
  if(minusN) return -parseInt(minusN[1], 10);

  return 0;
}

function parseStdOctave(src, state){
  try{
    const m = src.match(/\bstdOctave\s+(standard|\d+)/);
    if(m){
      state.stdOctave = (m[1] === 'standard') ? 4 : parseInt(m[1], 10);
    }
  }catch(e){}
}

// Converte grau da escala para Frequência (Hz) com correção de oitava para graus > 7
function degreeToFreq(argStr, state){
  try{
    argStr = argStr.trim();
    // Regex flexibilizada para capturar sintaxes de oitava completas
    const m = argStr.match(/^(\d+)\s*(\^\^|\^|vv|v|n)?\s*(?:\[?(?:8)?(\+\+|\+\d*|--|-\d*)\]?)?$/);
    if(!m) return null;

    const rawDegree = parseInt(m[1], 10);
    const mod = m[2] || '';
    const oct = m[3] || '';

    const offsets = state.scaleType === 'minor' ? MINOR_OFFSETS : MAJOR_OFFSETS;
    
    // CORREÇÃO: Trata graus maiores que 7 (ex: grau 8 vira grau 1 na oitava +1)
    const degreeOctaveShift = Math.floor((rawDegree - 1) / 7);
    const idx = ((rawDegree - 1) % 7 + 7) % 7;

    const rootOffset = NOTE_INDEX[state.root] !== undefined ? NOTE_INDEX[state.root] : 0;
    const modSemi = modToSemitone(mod);
    const octShift = parseOctaveModifier(oct);

    const totalSemitonesFromC = rootOffset + offsets[idx] + modSemi;
    
    // CORREÇÃO: Cálculo de transbordo de oitava (carry) seguro para semitons negativos
    const carry = Math.floor(totalSemitonesFromC / 12);
    const semitone = ((totalSemitonesFromC % 12) + 12) % 12;

    const baseOctave = (state.stdOctave !== undefined ? state.stdOctave : 4);
    const finalOctave = baseOctave + octShift + degreeOctaveShift + carry;

    // Fórmula do tom MIDI -> Hz
    const midi = 12 * (finalOctave + 1) + semitone;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }catch(e){ return null; }
}

// Ritmo -> Segundos
function parseRhythmArg(argStr, state){
  argStr = (argStr || '4').trim();
  let pause = false;
  let dotted = false;

  const pauseMatch = argStr.match(/^pause\s+(.+)$/);
  if(pauseMatch){ 
    pause = true; 
    argStr = pauseMatch[1].trim(); 
  }

  // Ponto de aumento: "4." -> marca pontuado e remove o ponto final
  if(argStr.endsWith('.')){
    dotted = true;
    argStr = argStr.slice(0, -1).trim();
  }

  let n = parseFloat(argStr); 
  if(!n || n <= 0) n = 4;
  if(n > 64) n = 4; // Limite de fusa (1/64)

  const beats = 4 / n;
  let seconds = beats * (60 / (state.bpm || 120));
  
  // Ponto de aumento multiplica o tempo de duração por 1.5x
  if(dotted) seconds *= 1.5;
  
  return { pause, seconds };
}

function alignNotesAndRhythms(noteTokensRaw, rhythmTokensRaw){
  const notes = expandRepeatTokens(noteTokensRaw);
  const rhythms = expandRepeatTokens(rhythmTokensRaw.length ? rhythmTokensRaw : ['4']);
  return zipCycleAlign(notes, rhythms).map(p => ({ noteToken: p.a, rhythmToken: p.b }));
}
