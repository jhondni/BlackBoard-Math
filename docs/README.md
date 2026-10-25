# Lousa Virtual

Quadro branco digital para escrever equações **LaTeX**, desenhar livremente,
criar **gráficos** e exportar o conteúdo. Aplicação web pura (HTML/CSS/JS,
sem build), também empacotada como app desktop com **Electron**.

<p align="center">
  <img alt="Versão" src="https://img.shields.io/badge/versão-1.0.0-blue">
</p>

## Índice

- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [UML de Classes](#uml-de-classes)
- [Stack e Tecnologias](#stack-e-tecnologias)
- [Atalhos de teclado](#atalhos-de-teclado)
- [Como executar](#como-executar)

## Funcionalidades

### Desenho e edição
- **Desenho livre** — traço no canvas com cor e espessura ajustáveis (`D`);
  o traço nasce exatamente sob a cruz (âncora no centro) e um anel
  translúcido indica o raio efetivo da caneta/borracha.
- **Borracha** (`X`) — remove o alfa do canvas (`destination-out`), apagando
  o desenho sem tocar em imagem, gráfico, equação ou papel.
- **Blur** (`B`) — desfoque por região do canvas; elementos também têm
  toggle de blur.
- **Texto livre** (`T`) — clique na lousa cria um campo editável.

### Desenho sobre qualquer objeto
A lousa funciona como **duas janelas sobrepostas**: atrás, o conteúdo
(imagem, gráfico, equação, texto); à frente, a tinta. Desenhar com `D`
nasce na camada da frente, por cima de qualquer objeto — sem caso especial,
sem superfície proibida. Mover, redimensionar, girar ou apagar um objeto
não altera a tinta, e a seleção continua funcionando porque o canvas de
tinta tem `pointer-events: none`.

### Equações LaTeX
- **Editor de equações** (`E`) — modal com preview em tempo real (KaTeX) e
  templates: fração, raiz, potência, integral, soma, limite, matriz,
  gregas, lógica, vetores.
- **Equações redimensionáveis e editáveis** — mover, redimensionar (handles)
  e reeditar pelo botão na seleção.
- **Biblioteca de equações** — salvar, reutilizar, buscar e remover.

### Gráficos
- **Criar gráfico** (`G`) — função `f(x)`, domínio (xmin/xmax/ymin/ymax),
  cor e largura, com preview em canvas; o gráfico é rasterizado na densidade
  exigida pelo zoom atual.

### Imagens
- **Inserir imagem** (`I`) — upload por arquivo ou **drag & drop**; entra
  com tamanho natural limitado a 1600 px no maior lado.

### Lousa e organização
- **Múltiplas páginas** — barra lateral com adicionar, alternar, remover e
  miniaturas; recolhível para devolver ~240 px à lousa.
- **Zoom** — botões +/-, `Ctrl+Scroll` e teclas `+`/`-` (25% a 300%).
- **Arrastar / redimensionar / selecionar** objetos com handles e menu de ações.
- **Orientação** retrato ⇄ paisagem e **modo escuro**.

### Persistência, histórico e exportação
- **Undo/Redo** — `Ctrl+Z` / `Ctrl+Y` (até 50 passos).
- **Salvar automaticamente** no `localStorage` (chave `lousa-state`), com
  aviso de cota quando o armazenamento estoura.
- **Exportar** — **PDF** (uma folha por página, na orientação de cada uma,
  A4 real), **PNG** (`.zip` com um PNG por página, 2× a resolução do papel)
  e **Projeto JSON**; **importar** projeto JSON (arquivo ou drag & drop).
  A tinta entra no PDF/PNG acima dos objetos, porque a camada de tinta é a
  da frente do whiteboard.

> **Limite honesto:** a tinta é raster de página — trocar a orientação
> reescala o desenho, e o undo/redo opera sobre os objetos (não desfaz um
> traço).

## Arquitetura

Padrão **MVC** modular em **ES modules** (`import`/`export`). O ponto de
entrada é `js/app.js`, que monta e interliga todas as peças.

```
                 ┌─────────────────────┐
                 │       USUÁRIO       │
                 └──────────┬──────────┘
                            │ interação
                            ▼
                 ┌─────────────────────┐
                 │     CONTROLLER      │
                 │  BoardController    │
                 │  ToolController     │
                 │  ObjectController   │
                 │  MouseController    │
                 └──────────┬──────────┘
                            │ modifica / consulta
                            ▼
                 ┌─────────────────────┐
                 │        MODEL        │
                 │  Board / BoardObject│
                 │  Math / Text /      │
                 │  Image / Shape      │
                 └──────────┬──────────┘
                            │ dados para
                            ▼
                 ┌─────────────────────┐
                 │        VIEW         │
                 │  BoardView          │
                 │  ToolbarView        │
                 │  MathEditorView     │
                 │  SelectionView      │
                 └──────────┬──────────┘
                            │ renderização
                            ▼
                 ┌─────────────────────┐
                 │       LOUSA         │
                 │  HTML + Canvas +    │
                 │  SVG + KaTeX        │
                 └─────────────────────┘
```

**Fluxo de dados:** o usuário interage com a interface → os Controllers
capturam eventos, decidem a ação e modificam o Model → o Model armazena o
estado (objetos, páginas, zoom, histórico, biblioteca) e notifica mudanças →
as Views leem os dados e renderizam na lousa (DOM/Canvas/SVG/KaTeX). As
camadas são desacopladas por **callbacks injetados** na inicialização
(`onCommit`, `onDeleteObject`, …).

### Camadas da lousa

Duas camadas independentes dentro do `#whiteboard`:

| Camada | z-index | Conteúdo | Recebe clique |
| --- | --- | --- | --- |
| `#elements-layer` | 1 | imagem, gráfico, equação, texto | sim (cada `.board-element` reativa `pointer-events`) |
| `#drawing-canvas` | 2 | toda a tinta, em raster | não (`pointer-events: none`) |

Consequências: caneta e borracha funcionam sobre qualquer superfície; a
borracha remove alfa (não pinta branco); mover/redimensionar/girar objetos
não altera a tinta; o clique atravessa o canvas e chega no objeto de baixo;
o PDF/PNG (`html2canvas` sobre o `#whiteboard`) leva a tinta acima dos
objetos.

### Estrutura de pastas (lousa virtual)

```
lousa-virtual/
├── index.html            # ponto de entrada do app web
├── package.json          # Electron + electron-builder
├── electron/             # main.js (servidor estático interno) + preload.js
├── vendor/               # KaTeX, html2canvas, jsPDF e fontes (offline)
├── assets/svg/
└── js/
    ├── app.js            # ponto de entrada (ES module)
    ├── models/           # Board.js, BoardObject.js, MathObject.js,
    │                     # TextObject.js, ImageObject.js, ShapeObject.js
    ├── views/            # BoardView.js, ToolbarView.js, MathEditorView.js,
    │                     # SelectionView.js
    ├── controllers/      # BoardController.js, ToolController.js,
    │                     # ObjectController.js, MouseController.js
    └── renderers/        # MathRenderer.js, SVGRenderer.js, TextRenderer.js,
                          # ZipStore.js
```

### Inicialização (`js/app.js`)

1. Monta o objeto `ui` com todas as referências DOM.
2. Instancia o `Board` (modelo) e os renderers.
3. Instancia as views e injeta dependências.
4. Instancia os controllers e injeta callbacks.
5. Chama `init()` de cada um para ligar os eventos.
6. Expõe `window.__lousa = { board, boardController }` para debug.

## UML de Classes

### Classes do modelo

| Classe | Estereótipo | Atributos | Métodos | Relacionamentos |
| --- | --- | --- | --- | --- |
| `BoardObject` | `<<abstract>>` | `- id: String` · `- x/y: Number` · `- width/height: Number` · `- rotation: Number` · `- selected: Boolean` | `+ move()` · `+ resize()` · `+ rotate()` · `+ select()` · `+ deselect()` · `+ applyBlur()` · `+ sync()` · `+ render()` · `+ toJSON()` | **superclasse** |
| `MathObject` | — | `- latex: String` · `- fontSize: Number` | `+ setLatex()` · `+ reRender()` | herda `BoardObject` |
| `TextObject` | — | `- text: String` · `- fontSize: Number` | `+ setText()` · `+ toDOMContent()` | herda `BoardObject` |
| `ImageObject` | — | `- src: String` · `- originalSrc: String` · `- isGraph: Boolean` · `- graphSpec: Object` · `- naturalWidth/Height` · `- renderedScale` | `+ resize()` · `+ setSrc()` · `+ toDOMContent()` · `+ requiredScale()` · `+ needsRerender()` · `+ rerender()` | herda `BoardObject` |
| `ShapeObject` | — | `- shapeType: String` · `- fill: String` · `- stroke: String` | `+ toDOMContent()` | herda `BoardObject` |
| `Board` | — | `- objects: BoardObject[]` · `- selectedObject` · `- zoom: Number` · `- offsetX/offsetY` · `- pages: Object[]` · `- library: Object[]` · `- history: Object[]` | `+ addObject()` · `+ removeObject()` · `+ getObject()` · `+ selectObject()` · `+ deselectObject()` · `+ clear()` · `+ createMath()/createText()/createImage()/createShape()` · `+ pushHistory()` | **compõe** `1..*` `BoardObject` |

### Renderizadores

| Classe | Métodos | Relacionamentos |
| --- | --- | --- |
| `MathRenderer` | `+ render(latex, el, opts)` · `+ toSVG(latex)` | usado **por** `MathObject`; delega a **KaTeX**/**MathJax** (fallback) |
| `TextRenderer` | `+ applyText()` · `+ measureText()` · `+ wrapText()` | usado **por** `TextObject` |
| `SVGRenderer` | `+ svgContainer()` · `+ createShape()` · `+ renderShape()` · `+ serialize()` (estáticos) | usado **por** `ShapeObject` |

### Resumo dos relacionamentos

| Relação | Origem → Destino | Cardinalidade |
| --- | --- | --- |
| Herança | `BoardObject` → `MathObject`, `TextObject`, `ImageObject`, `ShapeObject` | 1 → 4 subclasses |
| Composição | `Board` o— `BoardObject` | `1..*` objetos |
| Dependência | `MathObject` ⇢ `MathRenderer` · `TextObject` ⇢ `TextRenderer` · `ShapeObject` ⇢ `SVGRenderer` | 1 → 1 |
| Delegação | `MathRenderer` ⇢ `KaTeX` / `MathJax` | 1 → 2 (fallback) |

> Views e controllers **não herdam** do modelo; eles o consomem:
> `User → ToolbarView → ToolController → Board` · `User → Canvas → MouseController → Board` ·
> `User → Modais → MathEditorView → ObjectController → Board` · `User → Lousa → BoardView + SelectionView → Board.objects`.

## Stack e Tecnologias

| Tecnologia | Versão | Função | Onde é usada |
| --- | --- | --- | --- |
| **HTML5** | — | Estrutura da interface e da lousa | `index.html` |
| **CSS3** | — | Layout, estilos, ferramentas, responsividade, modo escuro | `js/views/style.css` |
| **JavaScript** | — | Lógica da aplicação, objetos, eventos (ES modules) | `js/` |
| **KaTeX** | `0.19` | Renderização rápida de fórmulas LaTeX | `MathRenderer`, modais, biblioteca |
| **MathJax** | — | Fallback para expressões complexas | `MathRenderer` |
| **SVG** | — | Formas e elementos vetoriais | `SVGRenderer`, `ShapeObject` |
| **Canvas API** | — | Desenho livre, borracha, blur, plot de gráficos e bitmaps de alta resolução | `MouseController`, `ObjectController`, `BoardView`, `ImageObject` |
| **html2canvas** | `1.4.1` | Captura da lousa para exportação | `BoardController` |
| **jsPDF** | `4.2.1` | Geração de PDF (A4, comprimido) | `BoardController` |
| **ZIP store** (código próprio) | — | Agrupa as páginas PNG num `.zip` (sem JSZip) | `js/renderers/ZipStore.js` |
| **localStorage** | — | Persistência local do projeto (`lousa-state`) | `BoardController` |
| **Supabase** | `2` | Autenticação e persistência opcional dos projetos na nuvem | `AuthController`, `login.html`, `index.html` |

### Decisões técnicas

- **Sem build/bundler** — ES modules com extensão `.js` explícita nos
  imports; por isso **exige servidor HTTP** (não funciona via `file://`).
  No Electron, `electron/main.js` levanta um **servidor HTTP estático
  interno** em `127.0.0.1` com porta livre — o app roda sem internet.
- **Libs e fontes offline** — KaTeX, html2canvas, jsPDF, Inter e
  JetBrains Mono embarcados em `vendor/`.
- **Referências DOM centralizadas** no objeto `ui` (`js/app.js`).
- **Controllers desacoplados por callbacks** — views não conhecem
  controllers e vice-versa; o `BoardController` conecta ambos.
- **Gráficos** são plotados num `<canvas>` temporário e convertidos para
  `dataURL`, tratados como `ImageObject` de tipo `graph`.
- **Nitidez no zoom** — o zoom é `transform: scale()`, que só interpola
  pixels; a nitidez depende do bitmap: cada `ImageObject` guarda
  `originalSrc` (teto) e `src` (cache) e regenera sob demanda
  (`needsRerender`, debounce de 80 ms, teto de área 4096² px); o canvas
  de tinta reserva backing store maior (`MAX_DRAWING_SCALE = 5`, ~12 M
  pixels), e o `localStorage` guarda o raster em 2×.
- **ZIP do export de PNG escrito à mão** — PNG não tem páginas, então as N
  folhas vão num `.zip` *store* (sem compressão: o conteúdo já é PNG);
  são três cabeçalhos e um CRC32, o que não justifica o JSZip.
- **PDF comprimido** — `compress: true` é obrigatório (Flate, sem perda);
  sem ele o RGB cru custaria ~10,7 MB por página A4.

## Atalhos de teclado

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

## Como executar

### Web (navegador)

ES modules não carregam via `file://`; sirva com um servidor local:

```bash
python -m http.server     # ou npx serve
# abrir http://localhost:8000
```

