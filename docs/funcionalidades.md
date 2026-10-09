# Funcionalidades

## Implementadas

### Desenho e edição
- **Desenho livre** — traço no canvas com cor e espessura ajustáveis (ferramenta `D`).
- **Ancoragem no centro da cruz** — o `mousedown` já pinta um disco com o
  raio de metade da espessura, então o traço nasce exatamente sob a cruz e
  não no primeiro pixel do `mousemove`. Como o navegador coalesce eventos de
  mouse, esse primeiro evento pode chegar depois de um salto do ponteiro.
- **Guia do raio da caneta e da borracha** — um anel translúcido sob o cursor
  marca a área exata que o traço cobre (`penSize`) ou que a borracha apaga
  (`penSize × 4`), acompanhando o zoom para o contorno continuar fino. A
  borracha pinta branco puro sobre uma página que também é branca, então sem
  o anel não dava para ver por onde ela passou. O anel é **efêmero**: não vai
  para o `drawingData`, nem para o histórico, nem para o export.
- **Borracha** — apaga trechos do desenho (`X`); um clique sem arrastar apaga
  um ponto, como a caneta.

### Desenho sobre imagem, gráfico, equação e texto
A lousa funciona como **duas janelas sobrepostas**: a de trás é o conteúdo
(imagem, gráfico, equação, texto) e a da frente é a tinta. Todo desenho feito
com `D` nasce na camada da frente, então aparece **por cima** de qualquer
objeto, sem caso especial.

- **Por que a imagem não bloqueia mais a caneta** — antes, `#drawing-canvas`
  ficava em `z-index: 1`, atrás da camada de objetos, então o clique nascia no
  elemento e o traço aparecia escondido atrás do bitmap. Agora o canvas de
  tinta é a camada **da frente** (`z-index: 2`) e vale para toda a página.
- **O traço atravessa qualquer coisa** — um gesto que nasce na margem e passa
  por cima da imagem, do gráfico, da equação ou do texto é um traço só e
  contínuo: não há superfície proibida nem "migração" de gesto quando o cursor
  entra ou sai de um objeto. Atravessar a borda de um elemento também não
  interrompe a curva, o que antes deixava a linha congelar na borda e saltar
  em linha reta na saída.
- **Mover, redimensionar, girar ou apagar o objeto não mexe no desenho** — as
  camadas são independentes: a tinta não é filha de nenhum elemento, e o
  traço permanece exatamente onde foi traçado.
- **A borracha apaga o desenho, nunca a imagem** — `X` remove o alfa do canvas
  (`destination-out`) em vez de pintar branco. Por isso o que estiver embaixo
  — a imagem, o gráfico, a equação ou o papel — aparece por baixo, e apagar
  sobre uma imagem não deixa borrão nenhum.
- **A seleção continua funcionando** — o canvas de tinta tem
  `pointer-events: none`, então o clique atravessa e chega no objeto de baixo:
  `V` arrasta e redimensiona normalmente, e o traço nunca bloqueia a seleção.
- **Fora do escopo: apagar um objeto** — `Delete` remove o elemento; como a
  tinta é outra camada, o desenho que estava sobre ele permanece.
- **Limite honesto** — a tinta é raster de página: trocar a orientação
  reescala o desenho, e o undo/redo continua operando sobre os objetos, sem
  desfazer um traço.
- **Blur nas equações / desenho** — ferramenta borrar (`B`) desfoca por região do canvas; elementos também têm toggle de blur.
- **Texto livre** — clicar na lousa com a ferramenta texto (`T`) cria um campo editável.

### Equações LaTeX
- **Editor de equações** (`E`) — modal com `textarea`, **preview em tempo real** (KaTeX) e **templates** (fração, raiz, potência, integral, soma, limite, matriz, gregas, lógica, vetores).
- **Equações redimensionáveis e editáveis** — o objeto de equação pode ser movido, redimensionado (handles) e reeditado pelo botão na seleção.
- **Biblioteca de equações** — salvar equações (`Salvar equação`), reutilizá-las clicando no item, busca e remoção.
- **Salvamento é por botão, não automático** — inserir uma equação (`E`) só a coloca na
  lousa; nada vai para a biblioteca sem pedido explícito. Quem guarda é o botão
  **salvar na biblioteca** da barra de ações do elemento (`class="element-actions"`),
  emitido só para equações. Inserir uma equação repetida não incha a biblioteca com
  cópias: o LaTeX é a identidade do item e o aviso distingue "salva" de "já estava".

### Gráficos
- **Criar gráfico** (`G`) — modal com função `f(x)`, domínio (xmin/xmax/ymin/ymax), cor e largura; preview em canvas e inserção na lousa.
- **Repintado sob demanda** — o gráfico é rasterizado na densidade de pixels que o zoom atual exige (até o teto de área do cache), a partir da `graphSpec` salva com o objeto.

### Imagens
- **Inserir imagem** (`I`) — upload por arquivo ou **drag & drop** de imagens na área de trabalho.
- **Tamanho natural** — a imagem entra com as dimensões originais, limitadas a **1600 px no maior lado** para não estourar memória e o `localStorage`.
- **Bitmap sob demanda** — o bitmap em cache é ampliado a partir do original quando o zoom pede mais pixels que ele tem, e **nunca** para além da resolução nativa (acima disso só haveria interpolação). O `originalSrc` não é sobrescrito em nenhum momento.

### Nitidez no zoom
- **Por que o zoom borrava** — o zoom é um `transform: scale()`, que não cria pixels: o navegador apenas interpola o bitmap existente.
- **Imagens e gráficos** — mantêm dois bitmaps: `originalSrc` (teto) e `src` (cache). Cada objeto decide sozinho se precisa regenerar (`needsRerender`), e o trabalho é adiado por um debounce de 80 ms para que um `Ctrl+Scroll` contínuo não dispare dezenas de repaints.
- **Desenho livre** — o canvas de tinta é reservado em alta resolução (limites de 5× a escala e ~12 M pixels) em vez de acompanhar o tamanho exibido; coordenadas, espessura de traço e borrão são convertidas para esse buffer.
- **Persistência da tinta** — o raster salvo no `localStorage` é limitado a 2× a resolução da página, e não ao buffer gigante da tela.
- **Teto de qualidade** — nenhuma técnica recupera detalhe que não existe na origem: imagens não nativas continuam indefinidas acima da resolução original, e a troca de orientação reescala o raster do desenho.

### Lousa / organização
- **Múltiplas páginas** — barra lateral com adicionar, alternar e remover páginas; miniaturas.
  O rótulo é derivado da posição na lista, então apagar uma página renumera as outras
  em vez de deixar um "Pagina 3" solto como primeira.
- **Recolher a barra de páginas** — o botão no cabeçalho a retira da tela e devolve os
  ~240px para a lousa; uma aba na borda esquerda reabre. Estado de UI efêmero (volta
  aberta ao recarregar).
- **Zoom** — botões +/-, `Ctrl+Scroll` e teclas `+`/`-` (25% a 300%).
- **Arrastar / redimensionar / selecionar** objetos com handles e menu de ações.
- **Orientação** — retrato ⇄ paisagem.
- **Modo escuro** — alternância global de tema.

### Persistência, histórico e exportação
- **Undo/Redo** — `Ctrl+Z` / `Ctrl+Y` (até 50 passos).
- **Salvar automaticamente** no `localStorage` (`lousa-state`).
- **Aviso de cota** — quando o `localStorage` estoura (`QuotaExceededError`), a lousa avisa uma única vez em vez de falhar em silêncio.
- **Exportar** — **PDF**, **PNG** e **Projeto JSON** (modal de exportação). A tinta
  entra no PDF/PNG **acima** dos objetos, porque o canvas de tinta fica na camada
  da frente do whiteboard.
- **O export sai com todas as páginas, cada uma na sua folha** — o `#whiteboard`
  só tem a página visível, então o `BoardController` percorre `board.pages` com
  `_switchPage`, captura cada uma e devolve a página original num `finally`
  (o zoom, a orientação e a transição do CSS voltam junto). O **PDF** sai com uma
  folha por página, cada uma na orientação da sua página de origem — um projeto
  pode misturar retrato e paisagem no mesmo arquivo. Como PNG não tem páginas, o
  botão PNG baixa um **`.zip` com um PNG por página** (`pagina-1.png`,
  `pagina-2.png`, …), cada um com a proporção e a orientação da sua página; um
  projeto de página única baixa o PNG solto, sem envelope. O ZIP é *store*, sem
  compressão: o conteúdo já é PNG, que é deflate, e recomprimir não ganharia nada.
  A selagem é feita à mão (três cabeçalhos e um CRC32) em vez de trazer JSZip, para
  não somar mais um script CDN a um projeto sem build. Falha em qualquer uma das
  capturas avisa "Não foi possível exportar" e fecha o modal, em vez de deixá-lo
  aberto para sempre.
- **A transição da folha é desligada durante o export** — 0,4 s de transição de
  largura/altura no CSS fariam a captura pegar a folha no meio da troca de
  orientação; desligada, 8 páginas alternando orientação caem de 7,4 s para 4,6 s.
- **A tinta entra no export, e isso exige esperar o repinte** — o `html2canvas`
  espera o carregamento das `<img>` da camada, mas **não** espera um canvas que já
  foi desenhado: ele lê os pixels no instante em que clona o DOM, e o
  `BoardView.drawBackground` só pinta depois do `img.onload`. Numa página que só
  tinha rabisco, medido: **0 px** sem espera, **161.364 px** com um
  `requestAnimationFrame`, **242.398 px** com 50 ms — o ponto de virada cai
  *dentro* da janela de um frame, então esperar um frame é meio cara de moeda e as
  primeiras folhas saíam em branco conforme o agendamento da máquina. Por isso
  `drawBackground` devolve uma Promise (resolve no `onload`, e também no `onerror`,
  para um `drawingData` corrompido não pendurar o export) e `_switchPage` a
  repassa; o export faz `await` em vez de um timeout. Equações, gráficos e imagens
  não têm essa corrida e não esperam nada.
- **`addPage` e `addImage` são intercalados** — o `addImage` do jsPDF escreve na
  folha **atual**, e só o `addPage` avança a folha. Criar as N folhas primeiro e
  só depois gravar as imagens empilha todas em `0,0` na última: a primeira página
  saía em branco e as demais mostravam a última por cima. O PDF agora grava a
  imagem de cada página logo depois de criar a folha dela.
- **O PDF é comprimido** — `compress: true` não é opcional: o jsPDF grava as
  imagens **sem compressão** por padrão, ou seja, o RGB cru (10,7 MB por página A4
  em 2×) mais uma cópia em escala de cinza do canal alfa, que o `toDataURL` sempre
  emite e que aqui é inteiramente opaco. Medido em 4 páginas: **54,4 MB sem,
  0,08 MB com** — e sem perda de qualidade, porque é Flate. Sem isso um projeto de
  30 páginas passaria de 500 MB e o navegador recusa a abrir.
- **O export sai com a proporção do papel, não da tela** — o `html2canvas` mede a
  captura por `getBoundingClientRect()`, que já inclui o `transform: scale(zoom)`
  do whiteboard e o scroll da `#workspace`. O arquivo saía com o tamanho da tela
  (794 px × zoom) e com o conteúdo escalado e deslocado dentro dele — em 200%, só
  1 de 9 pontos de referência de uma página aparecia no lugar. O `BoardController`
  zera o transform durante a captura (`try/finally`, o zoom volta mesmo se a captura
  falhar) e deriva as medidas do PDF da própria imagem. O PNG é sempre 2× a página
  (1588×2246 retrato, 2246×1588 paisagem), qualquer que seja o zoom na tela.
- **O PDF sai em A4 real** — o papel é a própria imagem convertida com 72/96, e não
  um formato escolhido à mão: retrato 595,5 × 842,25 pt (21,0 × 29,7 cm), paisagem
  842,25 × 595,5 pt. Com `unit: 'px'` o jsPDF multiplica por 96/72 em vez de 72/96 e
  a folha sai 1,78× maior, com o A4 virando 52,8 × 37,3 cm — a proporção continuava
  certa, o tamanho não.
- **Importar** projeto JSON (arquivo ou drag & drop).
- **Tinta no projeto JSON** — a tinta viaja em `page.drawingData` (PNG com alfa) e
  não no objeto, então nunca há traço órfão; a miniatura da página mostra só esse
  raster, sobre o branco do papel.

### Modo Design (UI/UX)
- **Linha com encaixe angular** — na ferramenta Linha (`L`) do modo Design,
  segurar **Shift** durante o arrasto trava o traço nos múltiplos de 45°
  (0°, 45°, 90°, 135°…), mantendo o comprimento do arrasto: a linha gira até
  a diagonal mais próxima do cursor em vez de encurtar. O encaixe é feito
  por tabela de direções (`UIDesignView.snapAngle45`), com os vetores
  exatos para as horizontais e verticais não caírem em `6e-17` de
  ponto flutuante — a "reta" nasce reta de verdade.
- **Preview e linha nascida são a mesma conta** — o que se vê arrastando e o
  nó criado no `pointerup` passam pela mesma função (`_createBounds`), então
  a linha nunca troca de direção no soltar do botão. Com Shift o rótulo do
  preview deixa de mostrar `largura x altura` e mostra o ângulo travado.
- **O Shift reage sem mover o mouse** — apertar ou soltar a tecla durante o
  arrasto já reencaixa ou solta a linha (`setShift`, chamado pelos
  `keydown`/`keyup` do `UIDesignController`), sem exigir um movimento do
  cursor; quem decide no fim é o `shiftKey` do próprio `pointerup`.
- **Sem Shift a linha continua livre** — como antes: ela nunca passou pelo
  encaixe da grade, e o Shift nas demais ferramentas segue desligando a
  grade, como já fazia.

### Atalhos de teclado
| Tecla | Ação |
| --- | --- |
| `V` | Selecionar |
| `D` | Desenhar |
| `T` | Texto |
| `E` | Equação LaTeX |
| `G` | Gráfico |
| `I` | Imagem |
| `X` | Borracha |
| `B` | Borrar |
| `Ctrl+Z` / `Ctrl+Y` | Desfazer / Refazer |
| `Ctrl+Scroll` | Zoom |
| `+` / `-` | Zoom |
| `Delete` / `Backspace` | Remover item selecionado |
| `Esc` | Fechar modal / deselecionar |

## Planejadas / pendentes

- [ ] **Teclado LaTeX** — paleta de símbolos matemáticos para digitação rápida.
- [ ] **Formas vetoriais na toolbar** — `ShapeObject` e `SVGRenderer` já existem como arquitetura, falta expor botões (retângulo, círculo, triângulo, linha).
- [ ] **Export vetorial (SVG)** — `MathRenderer.toSVG()` é placeholder.
- [ ] **Compartilhamento / backend** — persistência em servidor e colaboração em tempo real (fora do escopo atual do protótipo).