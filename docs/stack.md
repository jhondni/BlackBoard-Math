# Stack e Tecnologias

Todas as bibliotecas são carregadas por **CDN** no `index.html` (requer internet).

| Tecnologia | Função | Onde é usada |
| --- | --- | --- |
| **HTML5** | Estrutura da interface e da lousa | `index.html` |
| **CSS3** | Layout, estilos, ferramentas, responsividade, modo escuro | `style.css` |
| **JavaScript** | Lógica da aplicação, objetos, eventos, interação | `js/` (ES modules) |
| **KaTeX** `0.16.9` | Renderização rápida de fórmulas LaTeX | `MathRenderer`, modais, biblioteca |
| **MathJax** | Suporte a expressões complexas (fallback do KaTeX) | `MathRenderer` (caminho alternativo) |
| **SVG** | Representação de formas e elementos vetoriais | `SVGRenderer`, `ShapeObject` |
| **Canvas API** | Desenho livre, borracha, blur, plot de gráficos | `MouseController`, `ObjectController` |
| **html2canvas** `1.4.1` | Captura da lousa para exportação | `BoardController` (export PDF/PNG) |
| **jsPDF** `2.5.1` | Geração de PDF | `BoardController` (export PDF) |
| **localStorage** | Persistência local do projeto | `BoardController` (`lousa-state`) |

## Bibliotecas do navegador / API

- `katex.render(latex, el, opts)` — renderizar LaTeX em um elemento DOM
- `html2canvas(elemento, opts)` — gerar imagem/PDF da lousa
- `window.jspdf.jsPDF` — construir PDF
- `CanvasRenderingContext2D` — desenho, blur (pixel a pixel), grade e plot

## Decisões técnicas

- **ES modules** com extensão `.js` explícita nos imports → exige **servidor HTTP**
  (não funciona via `file://`).
- **Referências DOM centralizadas** no objeto `ui` (em `js/app.js`) para evitar
  chamadas `document.getElementById` espalhadas pelo código.
- **Controllers desacoplados por callbacks**: as views não conhecem os
  controllers e vice-versa; o `BoardController` conecta ambos na inicialização.
- **Gráficos** são plotados num `<canvas>` temporário e convertidos para
  `dataURL`, tratados como `ImageObject` de tipo `graph`.

## Carregamento no index.html

```html
<link rel="stylesheet" href=".../katex.min.css">
<script src=".../katex.min.js"></script>
<script src=".../contrib/auto-render.min.js"></script>
<script src=".../html2canvas.min.js"></script>
<script src=".../jspdf.umd.min.js"></script>
<link rel="stylesheet" href="style.css">
<script type="module" src="js/app.js"></script>
```