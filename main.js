/* ================= PlayComputer v1.1 — main.js =================
   Ponto de entrada. Como todos os módulos usam funções globais simples
   (sem import/export, para funcionar direto com file:// sem servidor),
   este arquivo não precisa orquestrar nada manualmente — cada módulo já
   registra seus próprios listeners via DOMContentLoaded (ui.js e share.js).

   Ele existe para:
   1) Deixar explícito, num único lugar, a ORDEM DE DEPENDÊNCIA esperada
      entre os módulos (útil se algum dia migrarmos para ES Modules).
   2) Fazer uma verificação de sanidade no carregamento, avisando no
      console (não na interface) se algum módulo essencial não carregou —
      ajuda a debugar rapidamente um <script src> quebrado ou fora de ordem.
   ========================================================================= */

(function checkModulesLoaded(){
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
  const missing = required.filter(name => typeof window[name] !== 'function');
  if(missing.length){
    console.error('[PlayComputer] Módulos ausentes ou fora de ordem no <script>:', missing);
  }
});
