/* ============================================
   UI/UX DESIGNER - DesignCodeRenderer
   ============================================
   Traduz um frame do design em HTML, CSS e
   JavaScript -- o mesmo desenho, em vez de SVG.

   Isso e um gerador, nao um estado: recebe o design
   e devolve texto. Nao guarda nada, nao desenha
   nada, e nao depende do DOM. Por isso o mesmo
   arquivo serve para o preview (que monta o texto
   num `<iframe>`) e para o botao de baixar.

   ---- O que pertence a tela de um frame ----

   O modelo nao tem pai e filho: `UIDesign.nodes` e
   uma lista plana, e o proprio `UIFrame` avisa que a
   pertinencia a um frame ainda nao faz parte do
   MVP. A regra aqui e GEOMETRICA: um no pertence ao
   frame que o contem por inteiro, e quando ha frame
   dentro de frame, vale o mais interno.

   O preco dessa escolha, que vale mais que ela: e um
   palpite espacial, nao uma hierarquia. Mover um no
   para fora do frame muda o codigo gerado sem ninguem
   pedir. Em troca, nada do que ja funciona precisa
   mudar -- criacao, selecao, ordem das camadas e
   arquivo seguem intactos.

   ---- Por que os elementos sao irmãos ----

   Todos os nos sao posicionados com as coordenadas do
   DESIGN, nao do pai. Um no dentro de um frame dentro
   de outro tem coordenada do canvas, e nao do frame
   que o contem. Entao o codigo gerado e chato: todo
   elemento e filho direto da tela, com `left`/`top`
   absolutos, exatamente como o SVG os desenha. Aninhar
   de verdade exigiria subtrair a origem do pai a cada
   medida -- e um erro de um pixel que so apareceria
   com frame dentro de frame.
   ============================================ */

/** Escapa texto que vai para dentro de um atributo ou entre tags. */
function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `12.5` vira `12.5px`; arredonda para o codigo nao ficar cheio de ruido. */
function px(value) {
  const n = Math.round(Number(value) * 100) / 100;
  return n + 'px';
}

export class DesignCodeRenderer {
  /** Todos os frames do design, na ordem em que estao na lista (o z). */
  static frames(design) {
    return design.nodes.filter((node) => node.type === 'frame');
  }

  /** O no esta inteiro dentro do frame? */
  static contains(outer, inner) {
    return inner.x >= outer.x
      && inner.y >= outer.y
      && inner.x + inner.width <= outer.x + outer.width
      && inner.y + inner.height <= outer.y + outer.height;
  }

  /**
   * O frame mais interno que contem o no inteiro, ou `null` se ele nao
   * esta dentro de nenhum. "Mais interno" e o de menor area entre os que
   * contem -- area, e nao ordem na lista, porque a lista e o z.
   */
  static innermostFrame(design, node) {
    let best = null;
    for (const frame of DesignCodeRenderer.frames(design)) {
      if (frame === node || !DesignCodeRenderer.contains(frame, node)) continue;
      if (!best || frame.width * frame.height < best.width * best.height) best = frame;
    }
    return best;
  }

  /** Os nos da tela deste frame, na ordem em que aparecem no design. */
  static contentsOf(design, frame) {
    return design.nodes.filter(
      (node) => node !== frame && DesignCodeRenderer.innermostFrame(design, node) === frame
    );
  }

  /* ---- CSS ---- */

  /**
   * Uma regra por no, em vez de estilo embutido no elemento: o CSS e uma
   * das tres coisas que a pessoa vai ler e editar, e um arquivo so com
   * `<div style="...">` nao serve para isso. A classe do no (`n1`, `n2`)
   * e o vinculo com o HTML; o nome semantico (`type-text`, `shape-rect`)
   * e o que da para estilizar de novo.
   */
  static cssFor(node, index) {
    const sel = '.n' + index;
    const box = [
      'position: absolute',
      'left: ' + px(node.x),
      'top: ' + px(node.y),
      'width: ' + px(node.width),
      'height: ' + px(node.height)
    ];

    // O SVG gira o grupo em torno do centro do no, e o CSS faz o mesmo
    // sem dizer de onde: o centro e o padrao.
    if (node.rotation) box.push('transform: rotate(' + px(node.rotation) + ')');

    if (node.type === 'frame') {
      box.push('background: ' + node.background);
      box.push('box-sizing: border-box');
    }

    if (node.type === 'shape') {
      if (node.shapeType === 'ellipse') {
        // `50%` em vez do raio em px: assim o no continua sendo uma
        // elipse quando a caixa e redimensionada.
        box.push('border-radius: 50%');
      } else if (node.shapeType === 'line') {
        // O desenho e um `<i>` dentro da caixa; a caixa em si fica vazia
        // para o giro e a medida baterem com o resto.
        box.push('pointer-events: none');
      } else {
        // Os quatro cantos sao a mesma ordem do CSS, o que faz o
        // `radii` do modelo virar uma regra e nao quatro.
        box.push('border-radius: ' + DesignCodeRenderer.radiusOf(node));
        box.push('background: ' + node.fill);
      }

      if (node.shapeType !== 'line' && node.stroke !== 'none') {
        box.push('border: ' + px(node.strokeWidth) + ' solid ' + node.stroke);
        box.push('box-sizing: border-box');
      }
    }

    if (node.type === 'text') {
      box.push('font-family: ' + node.fontFamily);
      box.push('font-size: ' + px(node.fontSize));
      box.push('font-weight: ' + node.fontWeight);
      box.push('color: ' + node.color);
      box.push('text-align: ' + node.align);
      box.push('line-height: ' + node.lineHeight);
      box.push('overflow-wrap: break-word');
      box.push('box-sizing: border-box');
    }

    if (node.type === 'image') {
      box.push('object-fit: ' + DesignCodeRenderer.objectFitOf(node));
      box.push('display: block');
    }

    // No invisivel: o elemento continua no codigo, com `display: none`.
    // E o que permite o botao de visibilidade do preview mostra-lo de
    // novo -- um no que sumisse do HTML nao teria como voltar.
    if (node.visible === false) box.push('display: none');

    return sel + ' {\n  ' + box.join(';\n  ') + ';\n}';
  }

  static radiusOf(node) {
    const radii = Array.isArray(node.radii) ? node.radii : [0, 0, 0, 0];
    // A ordem do CSS e a mesma do SVG: superior esquerdo, superior
    // direito, inferior direito, inferior esquerdo.
    return radii.map(px).join(' ');
  }

  /** O `fit` da imagem e o `object-fit` do CSS, com os mesmos nomes. */
  static objectFitOf(node) {
    if (node.fit === 'slice') return 'cover';
    if (node.fit === 'none') return 'fill';
    return 'contain';
  }

  /** O tracado da linha: caixa vazia do tamanho do no + um `<i>` na diagonal. */
  static lineCss(node, index) {
    const length = Math.hypot(node.width, node.height);
    const angle = Math.atan2(node.height, node.width) * 180 / Math.PI;
    const stroke = node.stroke === 'none' ? node.fill : node.stroke;
    const w = Math.max(1, node.strokeWidth);
    return [
      '.n' + index + ' > i {',
      '  position: absolute;',
      '  left: 50%;',
      '  top: 50%;',
      '  width: ' + px(length) + ';',
      '  height: ' + px(w) + ';',
      '  margin-top: ' + px(-w / 2) + ';',
      // `translate(-50%)` em X recentra o comprimento pela metade; o
      // `rotate` gira em torno do centro, como o `<line>` do SVG.
      '  transform: translateX(-50%) rotate(' + (Math.round(angle * 100) / 100) + 'deg);',
      '  background: ' + stroke + ';',
      '  border-radius: ' + px(w / 2) + ';',
      '}'
    ].join('\n');
  }

  static baseCss(frame) {
    return [
      'body {',
      '  margin: 0;',
      '  padding: 24px;',
      '  background: #ececf1;',
      '  font-family: system-ui, sans-serif;',
      '}',
      '.screen {',
      '  position: relative;',
      '  width: ' + px(frame.width) + ';',
      '  height: ' + px(frame.height) + ';',
      '  margin: 0 auto;',
      '  overflow: hidden;',
      '  box-shadow: 0 2px 12px rgba(0, 0, 0, .18);',
      '}',
      '.toggles {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 6px;',
      '  max-width: ' + px(frame.width) + ';',
      '  margin: 0 auto 12px;',
      '  padding: 0;',
      '  list-style: none;',
      '}',
      '.toggles button {',
      '  font: inherit;',
      '  font-size: 12px;',
      '  padding: 3px 9px;',
      '  border: 1px solid #c9c9d4;',
      '  border-radius: 999px;',
      '  background: #fff;',
      '  color: #4a4a55;',
      '  cursor: pointer;',
      '}',
      '.toggles button[aria-pressed="false"] {',
      '  background: #d9d9e2;',
      '  color: #8a8a96;',
      '  text-decoration: line-through;',
      '}'
    ].join('\n');
  }

  /* ---- HTML ---- */

  static htmlFor(node, index) {
    const cls = 'n' + index + ' ' + DesignCodeRenderer.semanticClass(node);
    if (node.type === 'text') {
      return '<div class="' + cls + '">' + esc(node.text) + '</div>';
    }
    if (node.type === 'image') {
      // `alt` vazio e o correto: a imagem e decorativa aqui, e um `alt`
      // inventado seria lido em voz alta por um leitor de tela.
      return '<img class="' + cls + '" src="' + esc(node.src) + '" alt="">';
    }
    if (node.type === 'shape' && node.shapeType === 'line') {
      return '<div class="' + cls + '"><i></i></div>';
    }
    return '<div class="' + cls + '"></div>';
  }

  static semanticClass(node) {
    if (node.type === 'shape') return 'type-shape shape-' + node.shapeType;
    return 'type-' + node.type;
  }

  static html(frame, contents) {
    // Os botoes de visibilidade vem ANTES da tela: o CSS deles tem
    // `margin-bottom`, o que so faz sentido em cima. O `.screen` e
    // posicionado, entao a ordem no fluxo nao afeta o desenho.
    const parts = [];
    const toggles = DesignCodeRenderer.togglesHtml(contents);
    if (toggles) parts.push(toggles);

    parts.push('<div class="screen" id="screen">');
    contents.forEach((node, i) => parts.push('  ' + DesignCodeRenderer.htmlFor(node, i + 1)));
    parts.push('</div>');
    return parts.join('\n');
  }

  /** Um botao por no: o "olho" das camadas, virando controle do preview. */
  static togglesHtml(contents) {
    if (!contents.length) return '';
    const items = contents.map((node, i) => {
      const on = node.visible !== false;
      return '      <li><button type="button" data-target="n' + (i + 1) + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '">'
        + esc(node.name) + '</button></li>';
    }).join('\n');
    return '    <ul class="toggles">\n' + items + '\n    </ul>';
  }

  /* ---- JavaScript ---- */

  /**
   * O minimo que o modulo sabe fazer: mostrar e esconder. O olho das
   * camadas vira o botao, e o `display: none` que o no ja nasceu com no
   * Design e o estado inicial. Nenhuma interacao e inventada aqui -- o
   * que o design nao sabe fazer, o codigo gerado tambem nao.
   */
  static js() {
    return [
      'document.querySelectorAll(".toggles button").forEach(function (botao) {',
      '  botao.addEventListener("click", function () {',
      '    var alvo = document.getElementById(botao.dataset.target);',
      '    if (!alvo) return;',
      '    var visivel = alvo.style.display !== "none";',
      '    // `""` em vez de "block": devolve a decisao ao CSS do no, e o',
      '    // estado inicial do Design continua valendo.',
      '    alvo.style.display = visivel ? "none" : "";',
      '    botao.setAttribute("aria-pressed", String(!visivel));',
      '  });',
      '});'
    ].join('\n');
  }

  /* ---- A pagina inteira ---- */

  /**
   * @param {object} frame - o frame que virou tela
   * @param {Array} contents - os nos da tela (`contentsOf`)
   * @returns {{title: string, html: string, css: string, js: string}}
   */
  static screenFor(frame, contents) {
    const rules = contents.map((node, i) => {
      const index = i + 1;
      const base = DesignCodeRenderer.cssFor(node, index);
      return node.type === 'shape' && node.shapeType === 'line'
        ? base + '\n' + DesignCodeRenderer.lineCss(node, index)
        : base;
    });

    const parts = [DesignCodeRenderer.baseCss(frame)];
    if (rules.length) parts.push(rules.join('\n\n'));
    const css = parts.join('\n\n');

    return {
      title: frame.name,
      html: DesignCodeRenderer.html(frame, contents),
      css,
      js: contents.length ? DesignCodeRenderer.js() : ''
    };
  }

  /** O arquivo que o botao de baixar entrega: um so, com style e script dentro. */
  static document(screen) {
    return [
      '<!DOCTYPE html>',
      '<html lang="pt-BR">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + esc(screen.title) + '</title>',
      '<style>',
      screen.css,
      '</style>',
      '</head>',
      '<body>',
      screen.html,
      '<script>',
      screen.js,
      '</script>',
      '</body>',
      '</html>',
      ''
    ].join('\n');
  }

  /** Caminho curto: frame -> conteudo -> tela. */
  static forFrame(design, frame) {
    if (!frame || frame.type !== 'frame') return null;
    return DesignCodeRenderer.screenFor(frame, DesignCodeRenderer.contentsOf(design, frame));
  }
}
