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
- `BoardObject` — **classe abstrata** (posição, dimensões, rotação, seleção).
- `MathObject`, `TextObject`, `ImageObject`, `ShapeObject` — herdam de `BoardObject`.
- `Board` — contém `objects[]`, objeto selecionado, zoom, páginas, biblioteca e
  histórico; inclui factory de objetos.

### Views (`js/views/`)
- `BoardView` — gerencia o DOM da lousa (canvas + camada de elementos).
- `ToolbarView` — barra flutuante e barra de controles.
- `MathEditorView` — modal de inserção/edição de equação LaTeX.
- `SelectionView` — arrastar, redimensionar e selecionar objetos.

### Controllers (`js/controllers/`)
- `BoardController` — orquestra páginas, zoom, undo/redo, persistência,
  export/import, tema e orientação; conecta tudo.
- `ToolController` — ferramentas da barra e atalhos de teclado.
- `ObjectController` — criar/editar/remover equações, textos, imagens, gráficos
  e a biblioteca.
- `MouseController` — desenho livre, borracha e blur no canvas.

## Estrutura de pastas

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
    │             ImageObject.js, ShapeObject.js
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
