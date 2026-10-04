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
- **Importar** projeto JSON (arquivo ou drag & drop).
- **Tinta no projeto JSON** — a tinta viaja em `page.drawingData` (PNG com alfa) e
  não no objeto, então nunca há traço órfão; a miniatura da página mostra só esse
  raster, sobre o branco do papel.

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