class SVGRenderer extends Renderer {
    constructor() {
        super();
    }

    render(imageObject, boardElement) {
        const el = this.createElement('div', 'board__object board__object--image');
        imageObject.setElement(el);
        el.style.width = imageObject.width + 'px';
        el.style.height = imageObject.height + 'px';

        if (imageObject.src) {
            if (imageObject.src.trim().startsWith('<svg')) {
                el.innerHTML = imageObject.src;
                const svg = el.querySelector('svg');
                if (svg) {
                    svg.setAttribute('width', '100%');
                    svg.setAttribute('height', '100%');
                }
            } else {
                const img = document.createElement('img');
                img.src = imageObject.src;
                img.alt = 'Imagem';
                img.draggable = false;
                el.appendChild(img);
            }
        }

        this.appendToBoard(el, boardElement);
        requestAnimationFrame(() => {
            imageObject.updateDimensions();
        });

        return el;
    }

    renderShape(shapeType, x, y, boardElement) {
        const id = `shape-${Date.now()}`;
        const shapeObj = {
            id: id,
            type: 'shape',
            shape: shapeType,
            x: x,
            y: y,
            width: 0,
            height: 0,
            element: null,
            containsPoint: function(px, py) {
                return px >= this.x && px <= this.x + this.width &&
                       py >= this.y && py <= this.y + this.height;
            },
            select: function() {
                this.selected = true;
                if (this.element) this.element.classList.add('board__object--selected');
            },
            deselect: function() {
                this.selected = false;
                if (this.element) this.element.classList.remove('board__object--selected');
            },
            destroy: function() {
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
            },
            toJSON: function() {
                return {
                    id: this.id,
                    type: this.type,
                    shape: this.shape,
                    x: this.x,
                    y: this.y,
                    width: this.width,
                    height: this.height
                };
            },
            selected: false
        };

        const size = 120;
        shapeObj.width = size;
        shapeObj.height = size;

        const el = this.createElement('div', 'board__object board__object--shape');
        el.dataset.objectId = id;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.width = size + 'px';
        el.style.height = size + 'px';
        shapeObj.element = el;

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

        let shapeEl;
        const strokeColor = '#4a9eff';
        const fillColor = 'rgba(74, 158, 255, 0.08)';

        switch (shapeType) {
            case 'triangle':
                shapeEl = document.createElementNS(svgNS, 'polygon');
                shapeEl.setAttribute('points', `${size/2},8 ${size-8},${size-8} 8,${size-8}`);
                break;
            case 'circle':
                shapeEl = document.createElementNS(svgNS, 'circle');
                shapeEl.setAttribute('cx', size/2);
                shapeEl.setAttribute('cy', size/2);
                shapeEl.setAttribute('r', size/2 - 8);
                break;
            case 'rectangle':
                shapeEl = document.createElementNS(svgNS, 'rect');
                shapeEl.setAttribute('x', 8);
                shapeEl.setAttribute('y', 8);
                shapeEl.setAttribute('width', size - 16);
                shapeEl.setAttribute('height', size - 16);
                shapeEl.setAttribute('rx', 4);
                break;
        }

        if (shapeEl) {
            shapeEl.setAttribute('stroke', strokeColor);
            shapeEl.setAttribute('stroke-width', '2');
            shapeEl.setAttribute('fill', fillColor);
            svg.appendChild(shapeEl);
        }

        el.appendChild(svg);
        this.appendToBoard(el, boardElement);

        return shapeObj;
    }

    update(imageObject) {
        if (imageObject.element) {
            imageObject.element.style.width = imageObject.width + 'px';
            imageObject.element.style.height = imageObject.height + 'px';
        }
    }
}
