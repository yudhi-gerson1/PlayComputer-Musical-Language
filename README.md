# PlayComputer-Musical-Language
Comandos e Palavras-chave em PlayComputer:

// comentário: O compilador ignora. Serve para desativar comandos ou guiar outros programadores.

/* comentário */: Um comentário multi-linha. Exemplo:
/* Estou fazendo
uma música! */

compass x/y: Define o compasso da música (no topo do código). Para o 4/4, usamos a palavra-chave standard. Ex:
compass standard // Compasso 4/4

scale Nota: Define a escala da música. O standard aqui é o C maior. As palavras-chave acompanhadas de Nota são: major e minor.
Como dependendo da escala as notas podem mudar, usamos a função note() e o número. Exemplo em escala C maior:
1 - Dó
2 - Ré
3 - Mi
4 - Fá
5 - Sol
6 - Lá
7 - Si

Modificadores de Tom:
Um tom maior: ^
Dois tons maior: ^^
Um tom menor: v
Dois tons menor: vv
Natural: n

O padrão da escala das notas é a escala 4. Aqui está como alterar a oitava:
Oitava maior: [8+]
Duas oitavas maior: [8++]
Oitava menor: [8-]
Duas oitavas menor: [8--]

Exemplo:
note(1^[8++]) // C#6

Obs: Se os instrumentos ainda não forem definidos, o compilador coloca automaticamente como piano.

bpm numero: Define as batidas por minuto da música. O padrão é 120 bpm.

play instrumento nota: Toca uma nota. Se o instrumento estiver vazio, ele será o piano. Ex:
play standard note(1)

chord(): Uma função utilizada para tocar as notas simultaneamente, formando um acorde. As notas são separadas por vírgula. Ex:
chord(1, 3, 5)

nome = valor: Uma variável simples. Pode conter um número, uma nota, um acorde ou um trecho da música! Ex:
nota = note(1)
play standard nota // Funciona perfeitamente

Instrumentos no PlayComputer: piano, guitar, synthBass, guitarBass, synth, organ, accordeon, ukulele, drum.
O drum é um instrumento irregular, ou seja, não utiliza as mesmas notas que o piano.

Ritmo: (rhythm())
1: Semibreve
2: Mínima
4: Semínima
8: Colcheia
16: Semicolcheia
32: Fusa
64: Semifusa

Também pode ter pausa, juntando a palavra-chave pause com os números acima. Também é permitido o uso de durações como 3, 5, etc.

Exemplo em play:
play standard note(1) rhythm(1), rhythm(pause 1), note(2) rhythm(1), note(3) rhythm(1)

Obs: Não é permitido ritmo acima do 64 para evitar degradação de desempenho no navegador.

Ao invés de separar por vírgula, você pode estruturar blocos com a seguinte sintaxe:
play standard part {
    note(1) rhythm(1),
    note(2) rhythm(1),
    note(3) rhythm(1),
}

Dica: Para evitar que múltiplos comandos play toquem ao mesmo tempo, usamos a função escape(n). O parâmetro 'n' define quantas semínimas o canal deve aguardar antes de iniciar. Utilize identificadores (IDs) e classes para aplicar o escape e outras transformações.

Id: use id="" no bloco atribute para definir o identificador único.
Classe: use class="" no bloco atribute para categorizar a parte.

Assim como em CSS/JS:
# é usado para ID
. (ponto) é usado para Classe.

Sempre declare atribuições de ID ou classe dentro do bloco atribute na parte correspondente. Exemplo:
play standard part {
    atribute {
        id = "parte1"
    }
    note(1) rhythm(1),
    note(2) rhythm(1),
    note(3) rhythm(1),
}
#parte1.escape(2)

Loops em PlayComputer:
A função 'repeat(n)' é utilizada para repetir trechos específicos da música um número 'n' de vezes. Ela pode ser aplicada diretamente a uma referência de ID ou estruturada em blocos complexos para encadear múltiplos instrumentos.

Exemplo 1: Repetição direta de uma única parte através de seu identificador (ID):
play standard part {
    atribute {
        id = "trecho"
    }
    note(1) rhythm(1),
    note(2) rhythm(1),
    note(3) rhythm(1),
}
#trecho.repeat(4)

Exemplo 2: Bloco estruturado de repetição composto por múltiplos canais.
O bloco executa o loop principal e gerencia a concorrência interna com 'escape()':
play standard part {
    atribute {
        id = "trecho"
    }
    note(1) rhythm(1),
    note(2) rhythm(1),
    note(3) rhythm(1),
}
play synthBass part {
    atribute {
        id = "baixo"
    }
    note(1) rhythm(1),
    note(2) rhythm(1),
    note(3) rhythm(1),
}
repeat(4) {
    #trecho
    #baixo.escape(4)
}

E também:
tone(): Modifica a afinação do trecho ao qual é aplicado. Aceita os modificadores v, vv, ^ e ^^. É utilizado para alterar a escala de uma seção inteira da música, funcionando de forma análoga a um incremento/decremento de tom. Exemplo:
play standard part {
    atribute {
        id = "trecho"
    }
    note(1) rhythm(1),
    note(2) rhythm(1),
    note(3) rhythm(1),
}
#trecho.tone(^)

metronome: Comando de controle do metrônomo, posicionado na seção global (abaixo de compass e scale). Aceita as palavras-chave active para ativar e unactive para desativar. Ex:
compass standard
scale standard
metronome active

O metrônomo gera a marcação rítmica: TIC tac tac tac.

Mapeamento da percussão no instrumento 'drum':
Como o drum é um instrumento de percussão irregular, as amostras/sons são mapeadas numericamente dentro da função note():
1 - Som de BOOM baixo (Bumbo)
2 - Som de BAM grave (Surdo)
3 - Som de BAM agudo (Tom-Tom)
4 - Som de TRRRRRAM (Caixa)
5 - Som de TIM curto (Abafo)
6 - Som de TSS curto (Contratempo Fechado)
7 - Som de TSSSSSSS com impacto (Prato de Ataque)
8 - Som de TRAM grave (Caixa da Esquerda)
9 - Som de TRAM agudo (Caixa da Direita)

Tratamento de erros no Compilador:
Quando ocorre um erro de sintaxe, a execução não é interrompida abruptamente; o parser recupera o fluxo tolerando falhas leves (modo tolerante a erros). A compilação gera o áudio imediatamente e disponibiliza o download no formato .wav.
