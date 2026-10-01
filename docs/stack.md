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
| **Canvas API** | Desenho livre, borracha, blur, plot de gráficos e bitmaps de alta resolução | `MouseController`, `ObjectController`, `BoardView`, `ImageObject` |
| **html2canvas** `1.4.1` | Captura da lousa para exportação | `BoardController` (export PDF/PNG) |
| **jsPDF** `2.5.1` | Geração de PDF | `BoardController` (export PDF) |
| **localStorage** | Persistência local do projeto | `BoardController` (`lousa-state`) |

## Bibliotecas do navegador / API

- `katex.render(latex, el, opts)` — renderizar LaTeX em um elemento DOM
- `html2canvas(elemento, opts)` — gerar imagem/PDF da lousa
- `window.jspdf.jsPDF` — construir PDF
- `CanvasRenderingContext2D` — desenho, blur (pixel a pixel), grade, plot e
  reamostragem de bitmaps
- `HTMLCanvasElement.toDataURL()` — serialização dos bitmaps em `dataURL`
- `window.devicePixelRatio` — densidade exigida ao regenerar bitmaps

## Decisões técnicas

- **ES modules** com extensão `.js` explícita nos imports → exige **servidor HTTP**
  (não funciona via `file://`).
- **Referências DOM centralizadas** no objeto `ui` (em `js/app.js`) para evitar
  chamadas `document.getElementById` espalhadas pelo código.
- **Controllers desacoplados por callbacks**: as views não conhecem os
  controllers e vice-versa; o `BoardController` conecta ambos na inicialização.
- **Gráficos** são plotados num `<canvas>` temporário e convertidos para
  `dataURL`, tratados como `ImageObject` de tipo `graph`.

### Nitidez: por que `devicePixelRatio` não basta

O zoom é um `transform: scale()` no elemento, então ele só reposiciona pixels —
para o navegador o bitmap continua o mesmo e a ampliação é interpolação.
A nitidez depende, portanto, do bitmap em si, em duas frentes:

- **Bitmap por objeto** (`ImageObject`) — o objeto guarda `originalSrc`
  (teto de resolução, nunca sobrescrito) e `src` (cache do quadro atual).
  `needsRerender(zoom)` compara a densidade do cache com a exigida
  (`zoom × min(devicePixelRatio, 2)`) e devolve `false` quando ampliar só
  interpolaria, para não inflar o `dataURL` à toa. O `maxRenderArea`
  (4096² px) limita a área de qualquer cache.
- **Canvas de tinta** (`BoardView`) — o backing store é reservado maior que a
  página exibida, com teto de `MAX_DRAWING_SCALE = 5` e
  `MAX_DRAWING_PIXELS ≈ 12 M` (≈48 MB RGBA), em vez de acompanhar o retângulo
  CSS. `MouseController` converte coordenadas e espessuras para esse buffer.
  O que vai para o `localStorage` é reamostrado por `SAVE_DRAWING_SCALE = 2`.

  Consequência honesta: tinta continua sendo raster, então trocar a orientação
  reescala o desenho, e o teto de área limita o quão longe o zoom pode ir
  antes de o navegador voltar a interpolar. Acima da resolução original não há
  detalhe a recuperar em nenhum dos dois casos.

- `window.devicePixelRatio` — usado só para calcular a densidade exigida, com
  o valor limitado a 2 para não multiplicar o custo de memória em telas 3×/4×.

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