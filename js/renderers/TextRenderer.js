class TextRenderer extends Renderer {
    constructor() {
        super();
    }

    render(textObject, boardElement) {
        const el = this.createElement('div', 'board__object board__object--text');
        textObject.setElement(el);

        const content = this.createElement('div', 'board__text-content');
        content.textContent = textObject.text || '(clique para editar)';
        if (!textObject.text) {
            content.style.color = '#8899aa';
            content.style.fontStyle = 'italic';
        }
        content.contentEditable = 'false';
        el.appendChild(content);

        this.appendToBoard(el, boardElement);

        requestAnimationFrame(() => {
            textObject.updateDimensions();
        });

        return el;
    }

    update(textObject) {
        if (textObject.element) {
            const content = textObject.element.querySelector('.board__text-content');
            if (content) {
                content.textContent = textObject.text || '(clique para editar)';
                if (!textObject.text) {
                    content.style.color = '#8899aa';
                    content.style.fontStyle = 'italic';
                } else {
                    content.style.color = '';
                    content.style.fontStyle = '';
                }
            }
            requestAnimationFrame(() => {
                textObject.updateDimensions();
            });
        }
    }
}
