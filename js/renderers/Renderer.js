class Renderer {
    render(boardObject, boardElement) {
        throw new Error('Renderer.render() must be implemented by subclass');
    }

    createElement(tag, className) {
        const el = document.createElement(tag);
        if (className) {
            el.className = className;
        }
        return el;
    }

    appendToBoard(element, boardElement) {
        boardElement.appendChild(element);
    }
}
