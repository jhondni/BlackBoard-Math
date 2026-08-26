class BoardController {
    constructor(board, mouseController, keyboardController) {
        this.board = board;
        this.mouse = mouseController;
        this.keyboard = keyboardController;

        this.mathRenderer = new MathRenderer();
        this.textRenderer = new TextRenderer();
        this.svgRenderer = new SVGRenderer();

        this.currentTool = 'select';
        this.modalOverlay = document.getElementById('modal-overlay');
        this.modalInput = document.getElementById('modal-input');
        this.modalPreview = document.getElementById('modal-preview');
        this.modalTitle = document.getElementById('modal-title');
        this.modalLabel = document.getElementById('modal-label');
        this.modalConfirm = document.getElementById('modal-confirm');
        this.modalCancel = document.getElementById('modal-cancel');
        this.modalClose = document.getElementById('modal-close');
        this.contextMenu = document.getElementById('context-menu');

        this._modalResolve = null;
        this._editingObject = null;
    }

    init() {
        this.mouse.init();
        this.keyboard.init();

        this.mouse.on('boardClick', (data) => this._onBoardClick(data));
        this.mouse.on('objectDoubleClick', (obj) => this._onObjectDoubleClick(obj));
        this.mouse.on('contextMenu', (data) => this._onContextMenu(data));

        this.keyboard.on('deleteSelected', () => this._deleteSelected());
        this.keyboard.on('escape', () => this._onEscape());
        this.keyboard.on('toolChange', (tool) => this.setTool(tool));

        this.modalConfirm.addEventListener('click', () => this._modalConfirm());
        this.modalCancel.addEventListener('click', () => this._modalCancel());
        this.modalClose.addEventListener('click', () => this._modalCancel());
        this.modalInput.addEventListener('input', () => this._onInputPreview());

        this.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.modalOverlay) this._modalCancel();
        });

        document.addEventListener('click', () => this._hideContextMenu());
        document.querySelectorAll('.context-menu__item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this._handleContextAction(action);
            });
        });

        this._initToolbar();
    }

    _initToolbar() {
        const buttons = document.querySelectorAll('.toolbar__btn[data-tool]');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setTool(btn.dataset.tool);
            });
        });
    }

    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.toolbar__btn[data-tool]').forEach(btn => {
            btn.classList.toggle('toolbar__btn--active', btn.dataset.tool === tool);
        });

        const board = this.board.element;
        board.className = 'board';
        board.classList.add('board--tool-' + tool);
    }

    _onBoardClick(data) {
        const tool = this.currentTool;

        switch (tool) {
            case 'select':
                this.board.deselectAll();
                break;
            case 'math':
                this._createMathObject(data.x, data.y);
                break;
            case 'text':
                this._createTextObject(data.x, data.y);
                break;
            case 'image':
                this._promptImageURL(data.x, data.y);
                break;
            case 'triangle':
            case 'circle':
            case 'rectangle':
                this._createShapeObject(tool, data.x, data.y);
                break;
        }
    }

    _onObjectDoubleClick(obj) {
        if (obj.type === 'math') {
            this._editMathObject(obj);
        } else if (obj.type === 'text') {
            this._editTextObject(obj);
        }
    }

    _createMathObject(x, y) {
        this._openModal('Nova Equação LaTeX', 'Expressão LaTeX:', '').then((value) => {
            if (value !== null && value.trim()) {
                const obj = new MathObject(null, x, y, value);
                this.board.addObject(obj);
                this.mathRenderer.render(obj, this.board.element);
                obj.updateDimensions();
                this.board.selectObject(obj);
            }
        });
    }

    _editMathObject(obj) {
        this._editingObject = obj;
        this._openModal('Editar Equação LaTeX', 'Expressão LaTeX:', obj.latex).then((value) => {
            if (value !== null) {
                obj.setLatex(value);
                this.mathRenderer.update(obj);
                this.board.selectObject(obj);
            }
            this._editingObject = null;
        });
    }

    _createTextObject(x, y) {
        const obj = new TextObject(null, x, y, '');
        this.board.addObject(obj);
        this.textRenderer.render(obj, this.board.element);
        obj.updateDimensions();
        this.board.selectObject(obj);

        setTimeout(() => {
            this._startInlineEdit(obj);
        }, 50);
    }

    _editTextObject(obj) {
        this._startInlineEdit(obj);
    }

    _startInlineEdit(textObject) {
        if (!textObject.element) return;
        const content = textObject.element.querySelector('.board__text-content');
        if (!content) return;

        content.contentEditable = 'true';
        content.focus();

        if (textObject.text === '') {
            content.textContent = '';
            content.style.color = '';
            content.style.fontStyle = '';
        }

        const finishEdit = () => {
            content.contentEditable = 'false';
            textObject.setText(content.textContent);
            textObject.updateDimensions();
            content.removeEventListener('blur', finishEdit);
            content.removeEventListener('keydown', onKey);
        };

        const onKey = (e) => {
            if (e.key === 'Escape') {
                finishEdit();
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                finishEdit();
            }
        };

        content.addEventListener('blur', finishEdit);
        content.addEventListener('keydown', onKey);
    }

    _promptImageURL(x, y) {
        this._openModal('Inserir Imagem', 'URL da imagem (SVG ou outra):', '').then((value) => {
            if (value !== null && value.trim()) {
                const obj = new ImageObject(null, x, y, value);
                this.board.addObject(obj);
                this.svgRenderer.render(obj, this.board.element);
                this.board.selectObject(obj);
            }
        });
    }

    _createShapeObject(shapeType, x, y) {
        const shape = this.svgRenderer.renderShape(shapeType, x, y, this.board.element);
        this.board.addObject(shape);
        this.board.selectObject(shape);
    }

    _deleteSelected() {
        const selected = this.board.selectedObject;
        if (selected) {
            this.board.removeObject(selected.id);
        }
    }

    _onEscape() {
        this.board.deselectAll();
        this.setTool('select');
    }

    _onContextMenu(data) {
        const menu = this.contextMenu;
        menu.style.left = data.clientX + 'px';
        menu.style.top = data.clientY + 'px';
        menu.classList.add('context-menu--visible');
        this._contextTarget = data.object;
    }

    _hideContextMenu() {
        this.contextMenu.classList.remove('context-menu--visible');
    }

    _handleContextAction(action) {
        const obj = this._contextTarget;
        if (!obj) return;

        switch (action) {
            case 'edit':
                if (obj.type === 'math') this._editMathObject(obj);
                else if (obj.type === 'text') this._editTextObject(obj);
                break;
            case 'duplicate':
                this._duplicateObject(obj);
                break;
            case 'bring-front':
                this.board.bringToFront(obj);
                break;
            case 'send-back':
                this.board.sendToBack(obj);
                break;
            case 'delete':
                this.board.removeObject(obj.id);
                break;
        }

        this._hideContextMenu();
    }

    _duplicateObject(obj) {
        const data = obj.toJSON();
        data.id = null;
        data.x += 20;
        data.y += 20;

        let newObj;
        switch (obj.type) {
            case 'math':
                newObj = new MathObject(null, data.x, data.y, data.latex);
                this.board.addObject(newObj);
                this.mathRenderer.render(newObj, this.board.element);
                break;
            case 'text':
                newObj = new TextObject(null, data.x, data.y, data.text);
                this.board.addObject(newObj);
                this.textRenderer.render(newObj, this.board.element);
                break;
            case 'image':
                newObj = new ImageObject(null, data.x, data.y, data.src, data.width, data.height);
                this.board.addObject(newObj);
                this.svgRenderer.render(newObj, this.board.element);
                break;
            default:
                return;
        }

        requestAnimationFrame(() => {
            newObj.updateDimensions();
            this.board.selectObject(newObj);
        });
    }

    _openModal(title, label, defaultValue) {
        return new Promise((resolve) => {
            this._modalResolve = resolve;
            this.modalTitle.textContent = title;
            this.modalLabel.textContent = label;
            this.modalInput.value = defaultValue || '';
            this.modalOverlay.classList.add('modal-overlay--visible');

            if (this.modalInput.tagName === 'TEXTAREA') {
                this.modalInput.focus();
            }

            this._onInputPreview();
        });
    }

    _modalConfirm() {
        const value = this.modalInput.value;
        this.modalOverlay.classList.remove('modal-overlay--visible');
        if (this._modalResolve) {
            this._modalResolve(value);
            this._modalResolve = null;
        }
    }

    _modalCancel() {
        this.modalOverlay.classList.remove('modal-overlay--visible');
        if (this._modalResolve) {
            this._modalResolve(null);
            this._modalResolve = null;
        }
    }

    _onInputPreview() {
        const latex = this.modalInput.value;
        this.modalPreview.innerHTML = '';
        if (latex.trim()) {
            try {
                if (typeof katex !== 'undefined') {
                    katex.render(latex, this.modalPreview, {
                        throwOnError: false,
                        displayMode: true
                    });
                } else {
                    this.modalPreview.textContent = latex;
                }
            } catch (e) {
                this.modalPreview.textContent = latex;
                this.modalPreview.style.color = '#e94560';
            }
        } else {
            this.modalPreview.textContent = 'Pré-visualização...';
            this.modalPreview.style.color = '#8899aa';
        }
    }
}
