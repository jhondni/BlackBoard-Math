class MathRenderer extends Renderer {
    constructor() {
        super();
    }

    render(mathObject, boardElement) {
        const el = this.createElement('div', 'board__object board__object--math');
        mathObject.setElement(el);

        this._renderLatex(mathObject.latex, el);
        this.appendToBoard(el, boardElement);

        requestAnimationFrame(() => {
            mathObject.updateDimensions();
        });

        return el;
    }

    update(mathObject) {
        if (mathObject.element) {
            this._renderLatex(mathObject.latex, mathObject.element);
            requestAnimationFrame(() => {
                mathObject.updateDimensions();
            });
        }
    }

    _renderLatex(latex, container) {
        container.innerHTML = '';
        if (!latex.trim()) {
            container.textContent = '(clique para editar)';
            container.style.color = '#8899aa';
            container.style.fontStyle = 'italic';
            container.style.fontSize = '14px';
            return;
        }

        try {
            if (typeof katex !== 'undefined') {
                katex.render(latex, container, {
                    throwOnError: false,
                    displayMode: true
                });
            } else {
                container.textContent = latex;
            }
        } catch (e) {
            container.textContent = latex;
            container.style.color = '#e94560';
        }
    }
}
