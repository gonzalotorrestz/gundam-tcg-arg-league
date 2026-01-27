// Sistema de Loading States
// Proporciona overlay global y estados de loading para botones

class LoadingManager {
    constructor() {
        this.container = null;
        this.activeLoading = null;
        this.nextId = 1;
        this.buttonStates = new WeakMap();
    }

    init() {
        // Crear contenedor para loading overlay si no existe
        if (!this.container) {
            this.container = document.getElementById('loading-container');
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = 'loading-container';
                document.body.appendChild(this.container);
            }
        }
    }

    // Mostrar loading overlay global
    show(message = 'Cargando...') {
        this.init();

        // Si ya hay un loading activo, actualizarlo en lugar de crear uno nuevo
        if (this.activeLoading) {
            this.updateMessage(this.activeLoading.id, message);
            return this.activeLoading.id;
        }

        const id = this.nextId++;

        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.dataset.id = id;

        overlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-message">${this.escapeHtml(message)}</div>
            </div>
        `;

        this.container.appendChild(overlay);

        // Animar entrada
        setTimeout(() => overlay.classList.add('show'), 10);

        this.activeLoading = { id, element: overlay };

        return id;
    }

    // Actualizar mensaje del loading actual
    updateMessage(id, message) {
        if (!this.activeLoading || this.activeLoading.id !== id) {
            return;
        }

        const messageElement = this.activeLoading.element.querySelector('.loading-message');
        if (messageElement) {
            messageElement.textContent = message;
        }
    }

    // Ocultar loading overlay
    hide(id) {
        if (!this.activeLoading || this.activeLoading.id !== id) {
            return;
        }

        const { element } = this.activeLoading;

        // Animar salida
        element.classList.add('hiding');

        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
            this.activeLoading = null;
        }, 200);
    }

    // Mostrar loading en un botón específico
    showButton(button, message = 'Procesando...') {
        if (!button) return;

        // Guardar estado original del botón
        const originalState = {
            text: button.textContent,
            disabled: button.disabled,
            class: button.className
        };
        this.buttonStates.set(button, originalState);

        // Aplicar estado de loading
        button.disabled = true;
        button.classList.add('btn-loading');
        button.textContent = message;
    }

    // Ocultar loading de un botón
    hideButton(button) {
        if (!button) return;

        const originalState = this.buttonStates.get(button);
        if (!originalState) return;

        // Restaurar estado original
        button.disabled = originalState.disabled;
        button.className = originalState.class;
        button.textContent = originalState.text;

        this.buttonStates.delete(button);
    }

    // Utility para escapar HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Crear instancia global
const loading = new LoadingManager();

// Exportar
export { loading };
export default loading;
