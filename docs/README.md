# Lousa Virtual — Documentação

Quadro branco digital para escrever equações LaTeX, desenhar livremente, criar
gráficos e exportar o conteúdo. Este diretório reúne a documentação técnica do
projeto.

## Índice

- [Arquitetura](arquitetura.md) — camadas MVC e relação entre módulos
- [UML de Classes](uml-classes.md) — diagrama de classes em texto (Mermaid + ASCII)
- [Stack e Tecnologias](stack.md) — tecnologias e bibliotecas utilizadas
- [Funcionalidades](funcionalidades.md) — o que a aplicação faz hoje e o planejado

## Stack resumida

| Tecnologia | Função |
| --- | --- |
| HTML5 | Estrutura da interface e da lousa |
| CSS3 | Layout, estilos, ferramentas e responsividade |
| JavaScript | Lógica, objetos, eventos e interação (ES modules) |
| KaTeX | Renderização rápida de fórmulas em LaTeX |
| MathJax | Suporte a expressões matemáticas mais complexas (fallback) |
| SVG | Formas e elementos vetoriais |
| Canvas API | Desenho livre, borracha e blur |
