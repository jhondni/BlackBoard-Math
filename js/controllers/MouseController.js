class MouseController {
    constructor(board, boardElement) {
        this.board = board;
        this.boardElement = boardElement;
        this.isDragging = false;
        this.dragTarget = null;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.listeners = [];
    }

    init() {
        this.boardElement.addEventListener('mousedown', (e) => this._onMouseDown(e));
        document.addEventListener('mousemove', (e) => this._onMouseMove(e));
        document.addEventListener('mouseup', (e) => this._onMouseUp(e));
        this.boardElement.addEventListener('dblclick', (e) => this._onDoubleClick(e));
        this.boardElement.addEventListener('contextmenu', (e) => this._onContextMenu(e));
    }

    _getBoardCoords(e) {
        const rect = this.boardElement.getBoundingClientRect();
        const scroll = this.board.getScrollOffset();
        return {
            x: e.clientX - rect.left + scroll.x,
            y: e.clientY - rect.top + scroll.y
        };
    }

    _onMouseDown(e) {
        if (e.button !== 0) return;

        const coords = this._getBoardCoords(e);
        const target = e.target.closest('.board__object');

        if (target) {
            const obj = this.board.getObject(target.dataset.objectId);
            if (obj) {
                this.board.selectObject(obj);
                this.isDragging = true;
                this.dragTarget = obj;
                this.dragOffsetX = coords.x - obj.x;
                this.dragOffsetY = coords.y - obj.y;
                obj.element.classList.add('board__object--dragging');
                return;
            }
        }

        this._emit('boardClick', { x: coords.x, y: coords.y, event: e });
    }

    _onMouseMove(e) {
        if (!this.isDragging || !this.dragTarget) return;

        const coords = this._getBoardCoords(e);
        const newX = coords.x - this.dragOffsetX;
        const newY = coords.y - this.dragOffsetY;
        this.dragTarget.move(newX, newY);
    }

    _onMouseUp(e) {
        if (this.isDragging && this.dragTarget) {
            this.dragTarget.element.classList.remove('board__object--dragging');
            this.isDragging = false;
            this.dragTarget = null;
        }
    }

    _onDoubleClick(e) {
        const target = e.target.closest('.board__object');
        if (target) {
            const obj = this.board.getObject(target.dataset.objectId);
            if (obj) {
                this._emit('objectDoubleClick', obj);
            }
        }
    }

    _onContextMenu(e) {
        e.preventDefault();
        const target = e.target.closest('.board__object');
        if (target) {
            const obj = this.board.getObject(target.dataset.objectId);
            if (obj) {
                this.board.selectObject(obj);
                this._emit('contextMenu', { object: obj, clientX: e.clientX, clientY: e.clientY });
            }
        }
    }

    on(event, callback) {
        this.listeners.push({ event, callback });
    }

    _emit(event, data) {
        this.listeners
            .filter(l => l.event === event)
            .forEach(l => l.callback(data));
    }
}
