class BoardObject {
    static _counter = 0;

    constructor(id, x, y, width, height) {
        this.id = id || `obj-${++BoardObject._counter}`;
        this.x = x || 0;
        this.y = y || 0;
        this.width = width || 0;
        this.height = height || 0;
        this.selected = false;
        this.element = null;
    }

    move(x, y) {
        this.x = x;
        this.y = y;
        if (this.element) {
            this.element.style.left = x + 'px';
            this.element.style.top = y + 'px';
        }
    }

    select() {
        this.selected = true;
        if (this.element) {
            this.element.classList.add('board__object--selected');
        }
    }

    deselect() {
        this.selected = false;
        if (this.element) {
            this.element.classList.remove('board__object--selected');
        }
    }

    setElement(el) {
        this.element = el;
        el.dataset.objectId = this.id;
        el.style.left = this.x + 'px';
        el.style.top = this.y + 'px';
    }

    containsPoint(px, py) {
        return (
            px >= this.x &&
            px <= this.x + this.width &&
            py >= this.y &&
            py <= this.y + this.height
        );
    }

    toJSON() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
    }
}
