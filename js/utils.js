// =============================================================================
// UTILIDADES DE SEGURIDAD Y MANEJO DE ERRORES
// =============================================================================

// Importar sistemas de notificaciones y loading
import { notifications } from './notifications.js';
import { loading } from './loading.js';

/**
 * Sanitiza strings HTML para prevenir ataques XSS
 * Convierte caracteres especiales en entidades HTML seguras
 */
export function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Sanitiza URLs para prevenir javascript: y data: URLs maliciosas
 */
export function sanitizeURL(url) {
    if (!url) return '';
    const urlStr = String(url).trim();

    // Bloquear URLs potencialmente peligrosas
    if (urlStr.toLowerCase().startsWith('javascript:') ||
        urlStr.toLowerCase().startsWith('data:') ||
        urlStr.toLowerCase().startsWith('vbscript:')) {
        return '#';
    }

    return urlStr;
}

/**
 * Sanitiza atributos HTML (como onclick, data-*, etc)
 */
export function sanitizeAttribute(str) {
    if (!str) return '';
    // Remover comillas y caracteres especiales que pueden romper atributos
    return String(str)
        .replace(/['"<>]/g, '')
        .trim();
}

// =============================================================================
// MANEJO DE ERRORES
// =============================================================================

/**
 * Clase para errores personalizados con mensajes amigables
 */
export class UIError extends Error {
    constructor(userMessage, technicalMessage, code = 'UNKNOWN', originalError = null) {
        super(technicalMessage);
        this.name = 'UIError';
        this.userMessage = userMessage;
        this.code = code;
        this.originalError = originalError;
    }
}

/**
 * Convierte errores de Firebase en mensajes amigables
 */
export function handleFirebaseError(error) {
    let userMessage = 'Error desconocido. Intenta de nuevo.';
    let code = 'UNKNOWN';

    if (error.code === 'permission-denied') {
        userMessage = 'No tienes permisos para realizar esta acción';
        code = 'PERMISSION_DENIED';
    } else if (error.code === 'unavailable') {
        userMessage = 'Servicio no disponible. Intenta más tarde';
        code = 'UNAVAILABLE';
    } else if (error.code === 'unauthenticated') {
        userMessage = 'Debes iniciar sesión para continuar';
        code = 'UNAUTHENTICATED';
    } else if (error.code === 'not-found') {
        userMessage = 'El recurso solicitado no existe';
        code = 'NOT_FOUND';
    } else if (error.code === 'already-exists') {
        userMessage = 'Este elemento ya existe';
        code = 'ALREADY_EXISTS';
    } else if (error.code === 'failed-precondition') {
        userMessage = 'No se puede completar la operación en el estado actual';
        code = 'FAILED_PRECONDITION';
    } else if (error.message?.includes('offline') || error.message?.includes('network')) {
        userMessage = 'Sin conexión a internet';
        code = 'OFFLINE';
    } else if (error.code === 'auth/popup-closed-by-user') {
        userMessage = 'Has cerrado la ventana de inicio de sesión';
        code = 'AUTH_POPUP_CLOSED';
    } else if (error.code === 'auth/popup-blocked') {
        userMessage = 'El navegador bloqueó la ventana emergente';
        code = 'AUTH_POPUP_BLOCKED';
    } else if (error.code === 'auth/unauthorized-domain') {
        userMessage = 'Este dominio no está autorizado';
        code = 'AUTH_UNAUTHORIZED_DOMAIN';
    }

    return new UIError(userMessage, error.message, code, error);
}

/**
 * Wrapper para operaciones asíncronas con manejo de errores centralizado
 *
 * @param {Function} operation - Función asíncrona a ejecutar
 * @param {Object} options - Opciones de configuración
 * @param {string} options.successMsg - Mensaje de éxito
 * @param {string} options.loadingMsg - Mensaje durante carga
 * @param {HTMLElement} options.button - Botón a deshabilitar durante la operación
 * @param {Function} options.onSuccess - Callback en caso de éxito
 * @param {Function} options.onError - Callback en caso de error
 * @returns {Promise} Resultado de la operación o null si falla
 */
export async function handleAsyncOperation(operation, options = {}) {
    const {
        successMsg = null,
        loadingMsg = 'Procesando...',
        button = null,
        onSuccess = null,
        onError = null
    } = options;

    const originalButtonText = button?.textContent;

    try {
        // Mostrar loading en botón
        if (button) {
            loading.showButton(button, loadingMsg);
        }

        // Ejecutar operación
        const result = await operation();

        // Mostrar mensaje de éxito
        if (successMsg) {
            notifications.success(successMsg);
        }

        // Ejecutar callback de éxito
        if (onSuccess) {
            onSuccess(result);
        }

        return result;

    } catch (error) {
        // Convertir error a UIError
        const uiError = handleFirebaseError(error);

        // Log técnico para debugging
        console.error(`[${uiError.code}]`, uiError.userMessage, uiError.message, error);

        // Ejecutar callback de error o mostrar notificación de error
        if (onError) {
            onError(uiError);
        } else {
            notifications.error(uiError.userMessage);
        }

        return null;

    } finally {
        // Restaurar estado del botón
        if (button) {
            loading.hideButton(button);
        }
    }
}

// =============================================================================
// CACHE DE DATOS
// =============================================================================

/**
 * Sistema simple de caché para evitar recálculos
 */
export class DataCache {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Obtiene un valor del caché
     */
    get(key) {
        return this.cache.get(key);
    }

    /**
     * Verifica si existe una clave en el caché
     */
    has(key) {
        return this.cache.has(key);
    }

    /**
     * Guarda un valor en el caché
     */
    set(key, value) {
        this.cache.set(key, value);
        return value;
    }

    /**
     * Elimina una clave del caché
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Limpia todo el caché
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Obtiene o calcula un valor
     * Si existe en caché, lo retorna. Si no, ejecuta la función y guarda el resultado
     */
    getOrCompute(key, computeFn) {
        if (this.has(key)) {
            return this.get(key);
        }

        const value = computeFn();
        this.set(key, value);
        return value;
    }
}

// =============================================================================
// VALIDACIÓN DE DATOS
// =============================================================================

/**
 * Valida que un string no esté vacío
 */
export function isNotEmpty(str) {
    return str && String(str).trim().length > 0;
}

/**
 * Valida formato de fecha YYYY-MM-DD
 */
export function isValidDate(dateStr) {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

/**
 * Valida que un número esté en un rango
 */
export function isInRange(num, min, max) {
    const n = Number(num);
    return !isNaN(n) && n >= min && n <= max;
}
