# Arquitetura

A aplicação segue o padrão **MVC** (Model-View-Controller) modular, com código
organizado em **ES modules** (`import`/`export`). O ponto de entrada é
`js/app.js`, responsável por montar e interligar todas as peças.

## Visão geral

```
                ┌─────────────────────┐
                │       USUÁRIO       │
                └──────────┬──────────┘
                           │
                     interação
                           ▼
                ┌─────────────────────┐
                │     CONTROLLER      │
                │  BoardController    │
                │  ToolController     │
                │  ObjectController   │
                │  MouseController    │
                └──────────┬──────────┘
                           │
                modifica / consulta
                           ▼
                ┌─────────────────────┐
                │        MODEL        │
                │  Board              │
                │  BoardObject        │
│  MathObject         │
│  TextObject         │
                │  ImageObject        │
                │  ShapeObject        │
                └──────────┬──────────┘

                           │
                      dados para
                           ▼
                ┌─────────────────────┐
                │        VIEW         │
                │  BoardView          │
                │  ToolbarView        │
                │  MathEditorView     │
                │  SelectionView      │
                └──────────┬──────────┘
                           │
                     renderização
                           ▼
                ┌─────────────────────┐
                │       LOUSA         │
                │  HTML + Canvas +    │
                │  SVG + KaTeX/MathJax│
                └─────────────────────┘
```

## Fluxo de dados

1. O **usuário** interage com a interface (toolbar, lousa, modais).
2. Os **Controllers** capturam eventos, decidem a ação e modificam o **Model**.
3. O **Model** armazena o estado (objetos, páginas, zoom, histórico, biblioteca)
   e notifica mudanças.
4. As **Views** lêem os dados e renderizam na lousa (DOM/Canvas/SVG/KaTeX).
5. O **Controller** também injeta **callbacks** nas views/controllers para
   desacoplar as camadas (ex.: `onCommit`, `onDeleteObject`).

## Camadas e responsabilidades

### Renderers (`js/renderers/`)
Camada de suporte usada pelos models/views:
- `MathRenderer` — renderiza LaTeX com KaTeX e cai para MathJax se necessário.
- `SVGRenderer` — cria formas vetoriais SVG.
- `TextRenderer` — aplica e mede textos.

### Models (`js/models/`)
- `BoardObject` — **classe abstrata** (posição, dimensões, rotação, seleção). É a base
  de `MathObject`, `TextObject`, `ImageObject` e `ShapeObject`.
- `Board` — contém `objects[]`, objeto selecionado, zoom, páginas, biblioteca e
  histórico; inclui o factory de objetos. A tinta **não** é objeto: ela é raster da
  página (`page.drawingData`), ver "Camadas da lousa".

### Views (`js/views/`)
- `BoardView` — gerencia o DOM da lousa (canvas de tinta + camada de objetos),
  dimensiona o backing store do canvas, pinta o fundo salvo e o anel do raio.
- `ToolbarView` — barra flutuante e barra de controles.
- `MathEditorView` — modal de inserção/edição de equação LaTeX.
- `SelectionView` — arrastar, redimensionar e selecionar objetos.

### Camadas da lousa

Duas camadas independentes, como duas janelas sobrepostas dentro do `#whiteboard`:

| Camada | z-index | Conteúdo | Recebe clique |
| --- | --- | --- | --- |
| `#elements-layer` | 1 | imagem, gráfico, equação, texto (`pointer-events: none`; cada `.board-element` reativa com `pointer-events: all`) | sim |
| `#drawing-canvas` | 2 | **toda a tinta**, em raster | não (`pointer-events: none`) |

Consequências diretas do desenho estar **acima** de tudo:

- A caneta (`D`) e a borracha (`X`) funcionam sobre a página vazia e sobre imagem,
  gráfico, equação e texto, sem nenhum caso especial: não há superfície proibida
  nem nada a "migrar" quando o traço atravessa a borda de um objeto.
- Mover, redimensionar, girar ou apagar um objeto **não altera a tinta** — são
  camadas independentes, e o desenho fica onde foi traçado.
- A borracha remove o alfa do canvas (`globalCompositeOperation = 'destination-out'`),
  e não pinta branco: o que estiver embaixo — a imagem, o gráfico, a equação ou o
  papel — aparece por baixo. É o que faz "apagar o desenho, nunca a imagem".
- Como o canvas não participa do hit test, o clique chega no objeto de baixo e a
  `SelectionView` continua arrastando e redimensionando sem manobra de fase de
  captura.
- O `MouseController` por isso escuta `mousedown`/`mousemove` no **`#whiteboard`** (e
  `mouseup` no `document`, para o gesto terminado fora da página): o whiteboard é o
  único ancestral comum da página vazia e dos elementos. O `ToolbarView` define o
  cursor nele, e não no canvas, que nunca é alvo de evento.
- O PDF/PNG (`html2canvas` sobre o `#whiteboard`) leva a tinta **acima** dos objetos,
  porque a hierarquia já é essa; a miniatura da página mostra só a tinta, sobre o
  branco do papel.

Limite honesto do modelo: sendo raster de página, a tinta é reescalada quando a
página troca de orientação (ver `stack.md`), e o undo/redo continua operando sobre os
objetos — ele não desfaz um traço.

### Controllers (`js/controllers/`)
- `BoardController` — orquestra páginas, zoom, undo/redo, persistência,
  export/import, tema e orientação; conecta tudo.
- `ToolController` — ferramentas da barra e atalhos de teclado.
- `ObjectController` — criar/editar/remover equações, textos, imagens, gráficos
  e a biblioteca.
- `MouseController` — desenho livre, borracha e blur na camada de tinta, e criação
  de texto por clique/arrasto. Ele decide pelo contexto do clique: sobre
  um elemento só `D` e `X` agem; `select`, `text` e `blur` são respondidos pela
  `SelectionView`, que para a propagação no próprio elemento.

## Estrutura de pastas

```
lousa-online/
├── index.html
├── js/views/style.css
├── .gitignore
├── assets/
│   └── svg/
├── docs/                    # esta documentação
└── js/
    ├── app.js               # ponto de entrada (ES module)
    ├── models/   Board.js, BoardObject.js, MathObject.js, TextObject.js,
    │             ImageObject.js, ShapeObject.js
    ├── views/    BoardView.js, ToolbarView.js, MathEditorView.js, SelectionView.js
    ├── controllers/  BoardController.js, ToolController.js,
    │                 ObjectController.js, MouseController.js
    └── renderers/   MathRenderer.js, SVGRenderer.js, TextRenderer.js
```

lousa-online/
├── index.html
├── style.css
├── .gitignore
├── assets/
│   └── svg/
├── docs/                    # esta documentação
└── js/
    ├── app.js               # ponto de entrada (ES module)
    ├── models/   Board.js, BoardObject.js, MathObject.js, TextObject.js,
    │             ImageObject.js, ShapeObject.js, StrokeObject.js
    ├── views/    BoardView.js, ToolbarView.js, MathEditorView.js, SelectionView.js
    ├── controllers/  BoardController.js, ToolController.js,
    │                 ObjectController.js, MouseController.js
    └── renderers/   MathRenderer.js, SVGRenderer.js, TextRenderer.js
```

## Inicialização (`js/app.js`)

1. Monta o objeto `ui` com todas as referências DOM (chaves nomeadas).
2. Instancia o `Board` (modelo) e os renderers.
3. Instancia as views e injeta dependências (`mathRenderer`, `selectionView`).
4. Instancia os controllers e injeta callbacks (`onCommit`, `onDeleteObject`, etc.).
5. Chama `init()` de cada um para ligar os eventos.
6. Expõe `window.__lousa = { board, boardController }` para debug.

## Execução

> **Importante:** ES modules não carregam via `file://`. Sirva com um servidor local:

```bash
python -m http.server     # ou npx serve
# abrir http://localhost:8000
```
