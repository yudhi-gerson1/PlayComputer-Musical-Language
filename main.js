/* ================= PlayComputer v1.1 — main.js =================
   Ponto de entrada do sistema.
   Verifica o estado das dependências globais no escopo 'window'.
   ========================================================================= */

(function checkModulesLoaded(){
  // Lista de símbolos e funções essenciais que devem existir no escopo global
  const required = [
    'stripComments', 'splitTopLevel', 'extractBraceBlocks',        // core-utils.js
    'degreeToFreq', 'modToSemitone', 'parseRhythmArg',              // theory.js
    'parseGenericStatement',                                        // parser-statements.js
    'extractPartVariables', 'resolveVarToken',                      // parser-vars.js
    'compile',                                                      // parser-play.js
    'buildSchedule',                                                // scheduler.js
    'scheduleNote',                                                 // synth-instruments.js
    'scheduleDrum',                                                 // synth-drum.js
    'buildEffectChain',                                             // synth-effects.js
    'renderAndDownload',                                            // audio-export.js
    'playSchedule', 'setStatus'                                     // ui.js
  ];

  // Filtra as funções que não foram carregadas corretamente
  const missing = required.filter(name => typeof window[name] !== 'function');

  if(missing.length){
    console.error(
      `%c[PlayComputer v1.1] Erro de Initalização:\n%cOs seguintes módulos não foram carregados ou estão fora de ordem:\n- ${missing.join('\n- ')}`,
      'color: #ff4d4d; font-weight: bold; font-size: 14px;',
      'color: #ffffff;'
    );
  } else {
    console.log(
      '%c[PlayComputer v1.1] Módulos de áudio, sintetizadores e parser carregados com sucesso!',
      'color: #00ffcc; font-weight: bold;'
    );
  }
})(); // <--- O "()" final executa a IIFE imediatamente ao carregar o script

