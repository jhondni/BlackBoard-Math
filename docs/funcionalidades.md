# Funcionalidades

## Implementadas

### Desenho e edição
- **Desenho livre** — traço no canvas com cor e espessura ajustáveis (ferramenta `D`).
- **Borracha** — apaga trechos do desenho (`X`).
- **Blur nas equações / desenho** — ferramenta borrar (`B`) desfoca por região do canvas; elementos também têm toggle de blur.
- **Texto livre** — clicar na lousa com a ferramenta texto (`T`) cria um campo editável.

### Equações LaTeX
- **Editor de equações** (`E`) — modal com `textarea`, **preview em tempo real** (KaTeX) e **templates** (fração, raiz, potência, integral, soma, limite, matriz, gregas, lógica, vetores).
- **Equações redimensionáveis e editáveis** — o objeto de equação pode ser movido, redimensionado (handles) e reeditado pelo botão na seleção.
- **Biblioteca de equações** — salvar equações (`Salvar equação`), reutilizá-las clicando no item, busca e remoção.

### Gráficos
- **Criar gráfico** (`G`) — modal com função `f(x)`, domínio (xmin/xmax/ymin/ymax), cor e largura; preview em canvas e inserção na lousa.

### Imagens
- **Inserir imagem** (`I`) — upload por arquivo ou **drag & drop** de imagens na área de trabalho.

### Lousa / organização
- **Múltiplas páginas** — barra lateral com adicionar, alternar e remover páginas; miniaturas.
- **Zoom** — botões +/-, `Ctrl+Scroll` e teclas `+`/`-` (25% a 300%).
- **Arrastar / redimensionar / selecionar** objetos com handles e menu de ações.
- **Orientação** — retrato ⇄ paisagem.
- **Modo escuro** — alternância global de tema.

### Persistência, histórico e exportação
- **Undo/Redo** — `Ctrl+Z` / `Ctrl+Y` (até 50 passos).
- **Salvar automaticamente** no `localStorage` (`lousa-state`).
- **Exportar** — **PDF**, **PNG** e **Projeto JSON** (modal de exportação).
- **Importar** projeto JSON (arquivo ou drag & drop).

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