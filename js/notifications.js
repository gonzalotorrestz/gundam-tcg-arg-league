// Sistema de Notificaciones Toast y Dialogs
// Reemplaza alert(), confirm() y prompt() con UI moderna

class NotificationManager {
    constructor() {
        this.toasts = [];
        this.maxToasts = 3;
        this.container = null;
        this.modalContainer = null;
        this.nextId = 1;
    }

    init() {
        // Crear contenedor para toasts si no existe
        if (!this.container) {
            this.container = document.getElementById('notification-container');
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = 'notification-container';
                document.body.appendChild(this.container);
            }
        }

        // Crear contenedor para modals si no existe
        if (!this.modalContainer) {
            this.modalContainer = document.getElementById('notification-modal-container');
            if (!this.modalContainer) {
                this.modalContainer = document.createElement('div');
                this.modalContainer.id = 'notification-modal-container';
                document.body.appendChild(this.modalContainer);
            }
        }
    }

    // Toast notifications
    showToast(message, type = 'info', duration = null) {
        this.init();

        // Determinar duración según tipo
        if (duration === null) {
            switch (type) {
                case 'success':
                    duration = 3000;
                    break;
                case 'error':
                    duration = 5000;
                    break;
                case 'warning':
                    duration = 4000;
                    break;
                case 'info':
                default:
                    duration = 3000;
                    break;
            }
        }

        const id = this.nextId++;
        const toast = this.createToastElement(id, message, type);

        // Si hay más del máximo, eliminar el más viejo
        if (this.toasts.length >= this.maxToasts) {
            const oldestToast = this.toasts.shift();
            this.removeToast(oldestToast.id);
        }

        this.toasts.push({ id, element: toast, timer: null });
        this.container.appendChild(toast);

        // Animar entrada
        setTimeout(() => toast.classList.add('show'), 10);

        // Auto-dismiss
        const timer = setTimeout(() => {
            this.removeToast(id);
        }, duration);

        // Guardar timer para cancelar si se cierra manualmente
        const toastData = this.toasts.find(t => t.id === id);
        if (toastData) {
            toastData.timer = timer;
        }

        return id;
    }

    createToastElement(id, message, type) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.dataset.id = id;

        // Icono según tipo
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-message">${this.escapeHtml(message)}</div>
            <button class="toast-close" aria-label="Cerrar">&times;</button>
        `;

        // Click en botón cerrar
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.removeToast(id);
        });

        // Click en cualquier parte del toast también cierra
        toast.addEventListener('click', (e) => {
            if (!e.target.classList.contains('toast-close')) {
                this.removeToast(id);
            }
        });

        return toast;
    }

    removeToast(id) {
        const index = this.toasts.findIndex(t => t.id === id);
        if (index === -1) return;

        const { element, timer } = this.toasts[index];

        // Cancelar timer de auto-dismiss
        if (timer) {
            clearTimeout(timer);
        }

        // Animar salida
        element.classList.add('hiding');

        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
            this.toasts.splice(index, 1);
        }, 300);
    }

    // Atajos para tipos específicos
    success(message, duration = null) {
        return this.showToast(message, 'success', duration);
    }

    error(message, duration = null) {
        return this.showToast(message, 'error', duration);
    }

    warning(message, duration = null) {
        return this.showToast(message, 'warning', duration);
    }

    info(message, duration = null) {
        return this.showToast(message, 'info', duration);
    }

    // Dialog de confirmación (reemplaza confirm())
    confirm(message, options = {}) {
        const {
            title = '¿Confirmar?',
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            subtitle = null
        } = options;

        return new Promise((resolve) => {
            this.init();

            const backdrop = document.createElement('div');
            backdrop.className = 'notification-backdrop';

            const dialog = document.createElement('div');
            dialog.className = 'notification-dialog';

            dialog.innerHTML = `
                <div class="dialog-header">
                    <h3>${this.escapeHtml(title)}</h3>
                </div>
                <div class="dialog-body">
                    <p class="dialog-message">${this.escapeHtml(message)}</p>
                    ${subtitle ? `<p class="dialog-subtitle">${this.escapeHtml(subtitle)}</p>` : ''}
                </div>
                <div class="dialog-footer">
                    <button class="btn btn-secondary dialog-cancel">${this.escapeHtml(cancelText)}</button>
                    <button class="btn btn-primary dialog-confirm">${this.escapeHtml(confirmText)}</button>
                </div>
            `;

            const close = (result) => {
                backdrop.classList.add('hiding');
                dialog.classList.add('hiding');

                setTimeout(() => {
                    if (backdrop.parentNode) {
                        backdrop.parentNode.removeChild(backdrop);
                    }
                    resolve(result);
                }, 200);
            };

            // Botones
            dialog.querySelector('.dialog-confirm').addEventListener('click', () => close(true));
            dialog.querySelector('.dialog-cancel').addEventListener('click', () => close(false));

            // ESC para cerrar
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', escHandler);
                    close(false);
                }
            };
            document.addEventListener('keydown', escHandler);

            // Click en backdrop para cerrar
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    close(false);
                }
            });

            backdrop.appendChild(dialog);
            this.modalContainer.appendChild(backdrop);

            // Animar entrada
            setTimeout(() => {
                backdrop.classList.add('show');
                dialog.classList.add('show');
            }, 10);

            // Focus en botón confirmar
            dialog.querySelector('.dialog-confirm').focus();
        });
    }

    // Dialog de prompt (reemplaza prompt())
    prompt(title, options = {}) {
        const {
            defaultValue = '',
            placeholder = '',
            confirmText = 'Aceptar',
            cancelText = 'Cancelar',
            inputType = 'text',
            subtitle = ''
        } = options;

        return new Promise((resolve) => {
            this.init();

            const backdrop = document.createElement('div');
            backdrop.className = 'notification-backdrop';

            const dialog = document.createElement('div');
            dialog.className = 'notification-dialog';

            const subtitleHtml = subtitle ? `<p class="dialog-subtitle">${this.escapeHtml(subtitle)}</p>` : '';

            dialog.innerHTML = `
                <div class="dialog-header">
                    <h3>${this.escapeHtml(title)}</h3>
                    ${subtitleHtml}
                </div>
                <div class="dialog-body">
                    <input
                        type="${this.escapeHtml(inputType)}"
                        class="dialog-input"
                        value="${this.escapeHtml(defaultValue)}"
                        placeholder="${this.escapeHtml(placeholder)}"
                    />
                </div>
                <div class="dialog-footer">
                    <button class="btn btn-secondary dialog-cancel">${this.escapeHtml(cancelText)}</button>
                    <button class="btn btn-primary dialog-confirm">${this.escapeHtml(confirmText)}</button>
                </div>
            `;

            const inputElement = dialog.querySelector('.dialog-input');

            const close = (result) => {
                backdrop.classList.add('hiding');
                dialog.classList.add('hiding');

                setTimeout(() => {
                    if (backdrop.parentNode) {
                        backdrop.parentNode.removeChild(backdrop);
                    }
                    resolve(result);
                }, 200);
            };

            const submit = () => {
                const value = inputElement.value.trim();
                close(value || null);
            };

            // Botones
            dialog.querySelector('.dialog-confirm').addEventListener('click', submit);
            dialog.querySelector('.dialog-cancel').addEventListener('click', () => close(null));

            // Enter para confirmar
            inputElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                }
            });

            // ESC para cerrar
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', escHandler);
                    close(null);
                }
            };
            document.addEventListener('keydown', escHandler);

            // Click en backdrop para cerrar
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    close(null);
                }
            });

            backdrop.appendChild(dialog);
            this.modalContainer.appendChild(backdrop);

            // Animar entrada
            setTimeout(() => {
                backdrop.classList.add('show');
                dialog.classList.add('show');
            }, 10);

            // Focus en input y seleccionar texto
            inputElement.focus();
            inputElement.select();
        });
    }

    // Utility para escapar HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Crear instancia global
const notifications = new NotificationManager();

// Exportar
export { notifications };
export default notifications;
