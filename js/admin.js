import { firebaseConfig } from './firebase-config.js';
import { sanitizeHTML, sanitizeURL, sanitizeAttribute, handleAsyncOperation } from './utils.js';
import { notifications } from './notifications.js';
import { loading } from './loading.js';

// Importar Firebase desde CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, where, writeBatch, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Estado de la aplicación
let locations = [];
let leagues = [];
let players = [];
let rounds = [];
let roundResults = [];
let parsedResults = [];
let selectedLeagueId = null;
let nextRoundNumber = 1;
let originalLeagueData = null; // Para detectar cambios sin guardar

// Determinar qué página estamos viendo
const isLoginPage = window.location.pathname.includes('login.html');
const isDashboardPage = window.location.pathname.includes('dashboard.html');

// Verificar si el usuario es administrador
async function checkIfUserIsAdmin(email) {
    try {
        const adminsQuery = query(collection(db, 'admins'), where('email', '==', email));
        const adminsSnapshot = await getDocs(adminsQuery);
        return !adminsSnapshot.empty;
    } catch (error) {
        console.error('Error al verificar permisos de administrador:', error);
        return false;
    }
}

// Inicializar aplicación
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const isAdmin = await checkIfUserIsAdmin(user.email);
            if (!isAdmin) {
                if (isDashboardPage) {
                    notifications.error('No tienes permisos para acceder al panel de administración.');
                    await signOut(auth);
                    window.location.href = 'login.html';
                } else if (isLoginPage) {
                    notifications.error('Tu cuenta de Google no tiene permisos de administrador.');
                    await signOut(auth);
                    initLogin();
                }
                return;
            }

            if (isLoginPage) {
                window.location.href = 'dashboard.html';
            } else if (isDashboardPage) {
                initDashboard(user);
            }
        } else {
            if (isDashboardPage) {
                window.location.href = 'login.html';
            } else if (isLoginPage) {
                initLogin();
            }
        }
    });
});

// ========== LOGIN ==========

function initLogin() {
    const googleLoginBtn = document.getElementById('google-login-btn');
    const errorMessage = document.getElementById('error-message');

    googleLoginBtn.addEventListener('click', async () => {
        errorMessage.textContent = '';
        googleLoginBtn.disabled = true;
        googleLoginBtn.textContent = 'Iniciando sesión...';

        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error('Error al iniciar sesión con Google:', error);

            if (error.code === 'auth/popup-closed-by-user') {
                errorMessage.textContent = 'Has cerrado la ventana de inicio de sesión';
            } else if (error.code === 'auth/popup-blocked') {
                errorMessage.textContent = 'El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio.';
            } else if (error.code === 'auth/unauthorized-domain') {
                errorMessage.textContent = 'Este dominio no está autorizado. Configura el dominio en Firebase Console.';
            } else {
                errorMessage.textContent = 'Error al iniciar sesión. Verifica tu conexión e intenta nuevamente.';
            }

            googleLoginBtn.disabled = false;
            googleLoginBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                    <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853"/>
                    <path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
                </svg>
                Continuar con Google
            `;
        }
    });
}

// ========== DASHBOARD ==========

function initDashboard(user) {
    document.getElementById('user-email').textContent = user.email;
    setupTabs();
    setupLogout();
    loadData();
    setupForms();
}

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', async () => {
            // Verificar si el formulario de edición de liga está visible
            const editLeagueDiv = document.getElementById('edit-league');
            if (editLeagueDiv && editLeagueDiv.style.display !== 'none') {
                // Verificar si hay cambios sin guardar
                if (hasUnsavedLeagueChanges()) {
                    const confirmMessage = '¿Hay cambios sin guardar. ¿Deseas guardarlos antes de continuar?';
                    const confirmed = await notifications.confirm(confirmMessage);
                    if (confirmed) {
                        // Intentar guardar
                        try {
                            await updateLeague();
                            // Después de guardar, volver a gestionar ligas y cambiar de tab
                            closeLeagueEditView();
                            changeTab(button, tabButtons, tabContents);
                        } catch (error) {
                            // Si hay error al guardar, no cambiar de tab
                            return;
                        }
                        return;
                    } else {
                        // Descartar cambios
                        closeLeagueEditView();
                    }
                } else {
                    // No hay cambios, solo cerrar
                    closeLeagueEditView();
                }
            }

            changeTab(button, tabButtons, tabContents);
        });
    });
}

function changeTab(button, tabButtons, tabContents) {
    const targetTab = button.getAttribute('data-tab');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(targetTab).classList.add('active');
}

function closeLeagueEditView() {
    originalLeagueData = null; // Limpiar estado original
    document.getElementById('edit-league').style.display = 'none';

    // Usar clases CSS en lugar de style.display inline
    document.getElementById('edit-league').classList.remove('active');
    document.getElementById('manage-leagues').classList.add('active');
}

function setupLogout() {
    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            notifications.error('Error al cerrar sesión');
        }
    });

    // Botón de recargar datos
    const reloadBtn = document.getElementById('reload-data-btn');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', async () => {
            reloadBtn.disabled = true;
            reloadBtn.textContent = '🔄 Recargando...';
            try {
                await loadData();
                notifications.success('Datos recargados exitosamente');
            } catch (error) {
                console.error('Error al recargar datos:', error);
                notifications.error('Error al recargar datos');
            } finally {
                reloadBtn.disabled = false;
                reloadBtn.textContent = '🔄 Recargar';
            }
        });
    }
}

async function loadData() {
    const loadingId = loading.show('Cargando datos...');
    try {
        // Cargar ubicaciones
        const locationsSnapshot = await getDocs(collection(db, 'locations'));
        locations = locationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Cargar ligas
        const leaguesSnapshot = await getDocs(collection(db, 'leagues'));
        leagues = leaguesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Cargar jugadores
        const playersSnapshot = await getDocs(collection(db, 'players'));
        players = playersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Cargar fechas
        const roundsSnapshot = await getDocs(collection(db, 'rounds'));
        rounds = roundsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Cargar resultados
        const resultsSnapshot = await getDocs(collection(db, 'round_results'));
        roundResults = resultsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        populateLeagueSelectors();
        populateLocationSelectors();
        populateFilterLocationSelector();
        renderLocationsList();
        renderLeaguesList();
    } catch (error) {
        console.error('Error al cargar datos:', error);
        notifications.error('Error al cargar los datos');
    } finally {
        loading.hide(loadingId);
    }
}

function setupForms() {
    // Selector de liga
    const leagueSelect = document.getElementById('league-select');
    if (leagueSelect) {
        leagueSelect.addEventListener('change', () => {
            selectedLeagueId = leagueSelect.value;
            if (selectedLeagueId) {
                calculateNextRoundNumber();
            } else {
                document.getElementById('round-info').style.display = 'none';
            }
        });
    }

    // Botón de vista previa
    document.getElementById('preview-import-btn').addEventListener('click', () => {
        previewImport();
    });

    // Botón de importar
    document.getElementById('import-results-btn').addEventListener('click', async () => {
        await importResults();
    });

    // Botón de cancelar preview
    document.getElementById('cancel-preview-btn').addEventListener('click', () => {
        document.getElementById('preview-section').style.display = 'none';
        parsedResults = [];
    });

    // Formulario de ubicación
    const locationForm = document.getElementById('location-form');
    if (locationForm) {
        locationForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addLocation();
        });
    }

    // Formulario de liga
    const leagueForm = document.getElementById('league-form');
    if (leagueForm) {
        leagueForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addLeague();
        });
    }

    // Formulario de edición de liga
    const editLeagueForm = document.getElementById('edit-league-form');
    if (editLeagueForm) {
        editLeagueForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await updateLeague();
        });
    }

    // Botón volver de edición de liga
    const backToLeaguesBtn = document.getElementById('back-to-leagues-btn');
    if (backToLeaguesBtn) {
        backToLeaguesBtn.addEventListener('click', async () => {
            // Verificar si hay cambios sin guardar
            if (hasUnsavedLeagueChanges()) {
                const confirmMessage = '¿Hay cambios sin guardar. ¿Deseas guardarlos antes de volver?';
                const confirmed = await notifications.confirm(confirmMessage);
                if (confirmed) {
                    // Intentar guardar
                    try {
                        await updateLeague();
                    } catch (error) {
                        // Si hay error al guardar, no volver
                        return;
                    }
                    return;
                } else {
                    // Descartar cambios
                    originalLeagueData = null;
                }
            }
            // Usar clases CSS en lugar de style.display inline
            document.getElementById('edit-league').style.display = 'none';
            document.getElementById('edit-league').classList.remove('active');
            document.getElementById('manage-leagues').classList.add('active');
        });
    }

    // Setup filtros de fechas
    const applyFiltersBtn = document.getElementById('apply-filters-btn');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => {
            const filters = getCurrentFilters();

            // Validar que al menos un filtro esté seleccionado
            if (!filters.locationId && !filters.dateFrom && !filters.dateTo) {
                notifications.warning('Por favor selecciona al menos un filtro');
                return;
            }

            renderAllRoundsList(filters);
        });
    }

    const clearFiltersBtn = document.getElementById('clear-filters-btn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            document.getElementById('filter-location').value = '';
            document.getElementById('filter-date-from').value = '';
            document.getElementById('filter-date-to').value = '';

            // Mostrar mensaje inicial
            const listDiv = document.getElementById('rounds-list');
            if (listDiv) {
                listDiv.innerHTML = '<p class="placeholder">Selecciona al menos un filtro y haz clic en "Aplicar Filtros" para ver las fechas</p>';
            }
        });
    }
}

function populateLocationSelectors() {
    // Selector en formulario de crear liga
    const leagueLocationSelect = document.getElementById('league-location');
    if (leagueLocationSelect) {
        leagueLocationSelect.innerHTML = '<option value="">-- Selecciona la ubicación --</option>';
        locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location.id;
            option.textContent = location.name;
            leagueLocationSelect.appendChild(option);
        });
    }
}

function populateFilterLocationSelector() {
    const filterLocationSelect = document.getElementById('filter-location');
    if (filterLocationSelect) {
        filterLocationSelect.innerHTML = '<option value="">Todas las ubicaciones</option>';

        // Ordenar ubicaciones alfabéticamente
        const sortedLocations = [...locations].sort((a, b) => a.name.localeCompare(b.name));

        sortedLocations.forEach(location => {
            const option = document.createElement('option');
            option.value = location.id;
            option.textContent = location.name;
            filterLocationSelect.appendChild(option);
        });
    }
}

function populateLeagueSelectors() {
    // Selector en formulario de importar resultados
    const leagueSelect = document.getElementById('league-select');
    if (leagueSelect) {
        leagueSelect.innerHTML = '<option value="">-- Selecciona la liga --</option>';

        // Mostrar solo ligas activas y en curso
        const activeLeagues = leagues.filter(l => l.status === 'en_curso' || l.status === 'programada');

        activeLeagues.forEach(league => {
            const option = document.createElement('option');
            option.value = league.id;
            const statusLabel = league.status === 'en_curso' ? '🟢' : '🟡';
            option.textContent = `${statusLabel} ${league.name} - ${league.locationName}`;
            leagueSelect.appendChild(option);
        });
    }
}

function calculateNextRoundNumber() {
    // El número de fecha se calculará dinámicamente basado en el orden cronológico
    // Aquí solo informamos al usuario
    const league = leagues.find(l => l.id === selectedLeagueId);
    if (!league) return;

    const leagueRounds = rounds.filter(r => r.leagueId === selectedLeagueId);

    document.getElementById('next-round-display').textContent =
        `Se creará una nueva fecha en ${league.name} (${league.locationName}) - El número se asignará automáticamente según orden cronológico`;
    document.getElementById('round-info').style.display = 'block';

    // nextRoundNumber ya no se usa, el número se calcula dinámicamente
    nextRoundNumber = null;
}

// ========== LIGAS ==========

async function addLeague() {
    const nameInput = document.getElementById('league-name');
    const locationSelect = document.getElementById('league-location');
    const startDateInput = document.getElementById('league-start-date');
    const statusSelect = document.getElementById('league-status');

    const name = nameInput.value.trim();
    const locationId = locationSelect.value;
    const startDate = startDateInput.value;
    const status = statusSelect.value;

    if (!name || !locationId || !startDate || !status) {
        notifications.warning('Por favor completa todos los campos');
        return;
    }

    const location = locations.find(l => l.id === locationId);
    if (!location) {
        notifications.error('Ubicación no encontrada');
        return;
    }

    try {
        const leagueData = {
            name,
            locationId,
            locationName: location.name,
            startDate,
            status
        };

        const docRef = await addDoc(collection(db, 'leagues'), leagueData);
        leagues.push({ id: docRef.id, ...leagueData });

        nameInput.value = '';
        locationSelect.value = '';
        startDateInput.value = '';
        statusSelect.value = 'programada';

        populateLeagueSelectors();
        renderLeaguesList();
        notifications.success('Liga creada exitosamente');
    } catch (error) {
        console.error('Error al crear liga:', error);
        notifications.error('Error al crear la liga');
    }
}

async function changeLeagueStatus(leagueId, newStatus) {
    try {
        await updateDoc(doc(db, 'leagues', leagueId), { status: newStatus });
        const league = leagues.find(l => l.id === leagueId);
        if (league) {
            league.status = newStatus;
        }
        populateLeagueSelectors();
        renderLeaguesList();
        notifications.success('Estado actualizado exitosamente');
    } catch (error) {
        console.error('Error al actualizar estado:', error);
        notifications.error('Error al actualizar el estado');
    }
}

function renderLeaguesList() {
    const listDiv = document.getElementById('leagues-list');
    if (!listDiv) return;

    if (leagues.length === 0) {
        listDiv.innerHTML = '<p class="placeholder">No hay ligas registradas</p>';
        return;
    }

    const sortedLeagues = [...leagues].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

    listDiv.innerHTML = sortedLeagues.map(league => {
        const hasRounds = rounds.some(r => r.leagueId === league.id);
        const roundCount = rounds.filter(r => r.leagueId === league.id).length;

        const statusLabels = {
            programada: '🟡 Programada',
            en_curso: '🟢 En Curso',
            pausada: '⏸️ Pausada',
            finalizada: '🔴 Finalizada'
        };

        const statusOptions = `
            <select onchange="window.changeLeagueStatus('${sanitizeAttribute(league.id)}', this.value)" class="btn-small" style="padding: 4px 8px; font-size: 0.85rem;">
                <option value="programada" ${league.status === 'programada' ? 'selected' : ''}>🟡 Programada</option>
                <option value="en_curso" ${league.status === 'en_curso' ? 'selected' : ''}>🟢 En Curso</option>
                <option value="pausada" ${league.status === 'pausada' ? 'selected' : ''}>⏸️ Pausada</option>
                <option value="finalizada" ${league.status === 'finalizada' ? 'selected' : ''}>🔴 Finalizada</option>
            </select>
        `;

        return `
            <div class="list-item">
                <div>
                    <strong>${sanitizeHTML(league.name)}</strong> - ${sanitizeHTML(league.locationName)}
                    <br><span class="info-text">📅 Inicio: ${formatDate(league.startDate)}</span>
                    <br><span class="info-text">Estado: ${statusLabels[league.status]}</span>
                    ${hasRounds ? `<br><span class="info-text">${roundCount} fecha(s) registrada(s)</span>` : ''}
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    ${statusOptions}
                    <button onclick="window.editLeague('${sanitizeAttribute(league.id)}')" class="btn btn-secondary btn-small">✏️ Editar</button>
                    <button onclick="window.deleteLeague('${sanitizeAttribute(league.id)}')" class="btn btn-danger btn-small">🗑️ Eliminar</button>
                </div>
            </div>
        `;
    }).join('');
}

// ========== UBICACIONES ==========

async function addLocation() {
    const nameInput = document.getElementById('location-name');
    const addressInput = document.getElementById('location-address');
    const urlInput = document.getElementById('location-url');

    const name = nameInput.value.trim();
    const address = addressInput.value.trim();
    const url = urlInput.value.trim();

    if (!name) {
        notifications.warning('Por favor ingresa un nombre');
        return;
    }

    if (locations.some(l => l.name.toLowerCase() === name.toLowerCase())) {
        notifications.warning('Esta ubicación ya existe');
        return;
    }

    try {
        const locationData = { name };
        if (address) locationData.address = address;
        if (url) locationData.url = url;

        console.log('Intentando crear ubicación:', locationData);
        const docRef = await addDoc(collection(db, 'locations'), locationData);
        console.log('Ubicación creada con ID:', docRef.id);

        locations.push({ id: docRef.id, ...locationData });

        nameInput.value = '';
        addressInput.value = '';
        urlInput.value = '';

        populateLocationSelectors();
        renderLocationsList();
        notifications.success('Ubicación agregada exitosamente');
    } catch (error) {
        console.error('Error detallado al agregar ubicación:', error);
        console.error('Código de error:', error.code);
        console.error('Mensaje:', error.message);
        notifications.error('Error al agregar la ubicación: ' + error.message);
    }
}

async function deleteLocation(locationId) {
    const hasRounds = rounds.some(r => r.locationId === locationId);

    if (hasRounds) {
        notifications.warning('No puedes eliminar una ubicación que tiene fechas registradas');
        return;
    }

    const confirmed = await notifications.confirm('¿Estás seguro de eliminar esta ubicación?');
    if (!confirmed) {
        return;
    }

    try {
        await deleteDoc(doc(db, 'locations', locationId));
        locations = locations.filter(l => l.id !== locationId);
        populateLocationSelectors();
        renderLocationsList();
        notifications.success('Ubicación eliminada exitosamente');
    } catch (error) {
        console.error('Error al eliminar ubicación:', error);
        notifications.error('Error al eliminar la ubicación');
    }
}

function renderLocationsList() {
    const listDiv = document.getElementById('locations-list');
    if (!listDiv) return;

    if (locations.length === 0) {
        listDiv.innerHTML = '<p class="placeholder">No hay ubicaciones registradas</p>';
        return;
    }

    const sortedLocations = [...locations].sort((a, b) => a.name.localeCompare(b.name));

    listDiv.innerHTML = sortedLocations.map(location => {
        const hasRounds = rounds.some(r => r.locationId === location.id);
        const roundCount = rounds.filter(r => r.locationId === location.id).length;

        let locationInfo = `<strong>${sanitizeHTML(location.name)}</strong>`;
        if (location.address) {
            locationInfo += `<br><span class="info-text">📍 ${sanitizeHTML(location.address)}</span>`;
        }
        if (location.url) {
            const safeUrl = sanitizeURL(location.url);
            locationInfo += `<br><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="admin-link">🔗 ${sanitizeHTML(location.url)}</a>`;
        }
        if (hasRounds) {
            locationInfo += `<br><span class="info-text">${roundCount} fecha(s) registrada(s)</span>`;
        }

        return `
            <div class="list-item">
                <div>${locationInfo}</div>
                ${!hasRounds ? `<button class="btn btn-danger btn-small" onclick="window.deleteLocation('${sanitizeAttribute(location.id)}')">Eliminar</button>` : '<span class="info-text">(Con fechas)</span>'}
            </div>
        `;
    }).join('');
}

// ========== PARSER DE TABLA ==========

function parseTableText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const results = [];
    let i = 0;

    // Saltar headers
    while (i < lines.length && (
        lines[i].toLowerCase().includes('ranking') ||
        lines[i].toLowerCase().includes('user name') ||
        lines[i].toLowerCase().includes('win points') ||
        lines[i].toLowerCase().includes('omw%') ||
        lines[i].toLowerCase().includes('oomw%')
    )) {
        i++;
    }

    // Parsear cada entrada (6 líneas por jugador)
    while (i < lines.length) {
        const rankingLine = lines[i];
        if (!rankingLine || isNaN(parseInt(rankingLine))) {
            i++;
            continue;
        }

        const ranking = parseInt(rankingLine);

        i++;
        if (i >= lines.length) break;
        const playerName = lines[i];

        i++;
        if (i >= lines.length) break;
        const memberNumberLine = lines[i];
        // Extraer el número del formato "Member Number 0000565634"
        let memberNumber = null;
        if (memberNumberLine.toLowerCase().includes('member number')) {
            const match = memberNumberLine.match(/\d+/);
            if (match) {
                memberNumber = match[0];
            }
        }

        i++;
        if (i >= lines.length) break;
        const pointsStr = lines[i];
        const points = parseInt(pointsStr);

        i++;
        if (i >= lines.length) break;
        const omwStr = lines[i].replace('%', '').trim();
        const omw = parseFloat(omwStr);

        i++;
        if (i >= lines.length) break;
        const oomwStr = lines[i].replace('%', '').trim();
        const oomw = parseFloat(oomwStr);

        if (playerName && !isNaN(points) && !isNaN(omw) && !isNaN(oomw)) {
            results.push({
                ranking,
                playerName: playerName.trim(),
                memberNumber,
                points,
                omw,
                oomw
            });
        }

        i++;
    }

    return results;
}

function previewImport() {
    const textarea = document.getElementById('results-textarea');
    const roundDate = document.getElementById('round-date').value;
    const text = textarea.value;

    if (!selectedLeagueId) {
        notifications.warning('Por favor selecciona una liga primero');
        return;
    }

    if (!roundDate) {
        notifications.warning('Por favor selecciona la fecha del torneo');
        return;
    }

    if (!text.trim()) {
        notifications.warning('Por favor pega la tabla de resultados primero');
        return;
    }

    try {
        parsedResults = parseTableText(text);

        if (parsedResults.length === 0) {
            notifications.error('No se pudieron parsear los resultados. Verifica el formato de la tabla.');
            return;
        }

        const league = leagues.find(l => l.id === selectedLeagueId);
        const previewSection = document.getElementById('preview-section');
        const previewContent = document.getElementById('preview-content');

        // Calcular el número de fecha basado en orden cronológico
        const leagueRounds = rounds.filter(r => r.leagueId === selectedLeagueId);
        const sortedRounds = [...leagueRounds, { date: roundDate }].sort((a, b) =>
            new Date(a.date) - new Date(b.date)
        );
        const calculatedNumber = sortedRounds.findIndex(r => r.date === roundDate) + 1;

        let html = `
            <div class="success-message">
                <strong>Liga:</strong> ${sanitizeHTML(league.name)}<br>
                <strong>Ubicación:</strong> ${sanitizeHTML(league.locationName)}<br>
                <strong>Fecha del torneo:</strong> ${formatDate(roundDate)}<br>
                <strong>Número de fecha (cronológico):</strong> Fecha ${calculatedNumber}<br>
                <strong>Jugadores encontrados:</strong> ${parsedResults.length}
            </div>
            <table class="preview-table">
                <thead>
                    <tr>
                        <th>Pos</th>
                        <th>Jugador</th>
                        <th>Puntos</th>
                        <th>OMW%</th>
                        <th>OOMW%</th>
                    </tr>
                </thead>
                <tbody>
        `;

        parsedResults.forEach(result => {
            html += `
                <tr>
                    <td>${result.ranking}</td>
                    <td>${sanitizeHTML(result.playerName)}${result.memberNumber ? '<br><small style="color: #64748b;">MN: ' + sanitizeHTML(result.memberNumber) + '</small>' : ''}</td>
                    <td>${result.points}</td>
                    <td>${result.omw}%</td>
                    <td>${result.oomw}%</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        previewContent.innerHTML = html;
        previewSection.style.display = 'block';

    } catch (error) {
        console.error('Error al parsear tabla:', error);
        notifications.error('Error al parsear la tabla: ' + error.message);
    }
}

async function importResults() {
    if (parsedResults.length === 0) {
        notifications.warning('No hay resultados para importar. Primero haz la vista previa.');
        return;
    }

    const roundDate = document.getElementById('round-date').value;

    if (!selectedLeagueId || !roundDate) {
        notifications.error('Falta información de liga o fecha');
        return;
    }

    const league = leagues.find(l => l.id === selectedLeagueId);

    // Calcular el número de fecha basado en orden cronológico
    const leagueRounds = rounds.filter(r => r.leagueId === selectedLeagueId);
    const sortedRounds = [...leagueRounds, { date: roundDate }].sort((a, b) =>
        new Date(a.date) - new Date(b.date)
    );
    const calculatedNumber = sortedRounds.findIndex(r => r.date === roundDate) + 1;

    // Pedir puntos de participación
    const participationPointsStr = await notifications.prompt(
        '¿Puntos por participación?',
        {
            placeholder: 'Ej: 1, 2, 3...',
            subtitle: 'Estos puntos se sumarán a todos los participantes de esta fecha',
            inputType: 'number'
        }
    );

    if (participationPointsStr === null) {
        return; // Usuario canceló
    }

    const participationPoints = parseInt(participationPointsStr);

    // Validar puntos de participación
    if (participationPointsStr === '' || isNaN(participationPoints) || participationPoints < 0) {
        notifications.error('Debes ingresar un valor válido para los puntos de participación (0 o mayor)');
        return;
    }

    const confirmed = await notifications.confirm(
        `¿Confirmar importación de ${parsedResults.length} resultados para ${league.name}?`,
        { subtitle: `Fecha: ${formatDate(roundDate)} | Número: Fecha ${calculatedNumber} (cronológico) | Puntos participación: +${participationPoints}` }
    );
    if (!confirmed) {
        return;
    }

    const loadingId = loading.show('Importando resultados...');
    try {
        const batch = writeBatch(db);

        // Crear la fecha (sin número fijo, se calculará dinámicamente)
        const roundRef = doc(collection(db, 'rounds'));
        batch.set(roundRef, {
            date: roundDate,
            leagueId: selectedLeagueId,
            locationId: league.locationId,
            locationName: league.locationName
        });
        const roundId = roundRef.id;

        // Crear jugadores si no existen y guardar resultados
        for (const result of parsedResults) {
            let player = null;
            let playerId;

            // Buscar jugador por member number si está disponible
            if (result.memberNumber) {
                player = players.find(p => p.memberNumber === result.memberNumber);
            }

            // Si no se encontró por member number, buscar por nombre (compatibilidad)
            if (!player) {
                player = players.find(p => p.name.toLowerCase() === result.playerName.toLowerCase());
            }

            if (!player) {
                // Crear nuevo jugador
                const playerRef = doc(collection(db, 'players'));
                const playerData = {
                    name: result.playerName
                };
                if (result.memberNumber) {
                    playerData.memberNumber = result.memberNumber;
                }
                batch.set(playerRef, playerData);
                playerId = playerRef.id;
                players.push({ id: playerId, ...playerData });
            } else {
                playerId = player.id;

                // Actualizar member number si el jugador existe pero no lo tenía
                if (result.memberNumber && !player.memberNumber) {
                    const playerRef = doc(db, 'players', playerId);
                    batch.update(playerRef, { memberNumber: result.memberNumber });
                    player.memberNumber = result.memberNumber;
                }

                // Actualizar nombre si cambió (basado en member number)
                if (result.memberNumber && player.memberNumber === result.memberNumber && player.name !== result.playerName) {
                    const playerRef = doc(db, 'players', playerId);
                    batch.update(playerRef, { name: result.playerName });
                    player.name = result.playerName;
                }
            }

            // Guardar resultado (sumando puntos de participación)
            const resultRef = doc(collection(db, 'round_results'));
            batch.set(resultRef, {
                roundId,
                playerId,
                playerName: result.playerName,
                ranking: result.ranking,
                points: result.points + participationPoints,
                omw: result.omw,
                oomw: result.oomw,
                leagueId: selectedLeagueId,
                locationId: league.locationId,
                locationName: league.locationName
            });
        }

        await batch.commit();

        notifications.success('Resultados importados exitosamente!');

        // Limpiar
        document.getElementById('results-textarea').value = '';
        document.getElementById('preview-section').style.display = 'none';
        parsedResults = [];

        await loadData();
        calculateNextRoundNumber();

    } catch (error) {
        console.error('Error al importar resultados:', error);
        notifications.error('Error al importar resultados: ' + error.message);
    } finally {
        loading.hide(loadingId);
    }
}

// ========== FECHAS ==========

async function deleteRound(roundId) {
    const hasResults = roundResults.some(r => r.roundId === roundId);

    let confirmed;
    if (hasResults) {
        confirmed = await notifications.confirm(
            'Esta fecha tiene resultados registrados. ¿Estás seguro de eliminarla?',
            { subtitle: 'Se eliminarán todos los resultados asociados' }
        );
        if (!confirmed) {
            return;
        }

        const roundResultsToDelete = roundResults.filter(r => r.roundId === roundId);
        for (const result of roundResultsToDelete) {
            await deleteDoc(doc(db, 'round_results', result.id));
        }
        roundResults = roundResults.filter(r => r.roundId !== roundId);
    } else {
        confirmed = await notifications.confirm('¿Estás seguro de eliminar esta fecha?');
        if (!confirmed) {
            return;
        }
    }

    try {
        await deleteDoc(doc(db, 'rounds', roundId));
        rounds = rounds.filter(r => r.id !== roundId);
        notifications.success('Fecha eliminada exitosamente');
    } catch (error) {
        console.error('Error al eliminar fecha:', error);
        notifications.error('Error al eliminar la fecha');
    }
}

// Función deshabilitada - las fechas ahora se gestionan desde la edición de ligas
// function renderRoundsList() {
//     const listDiv = document.getElementById('rounds-list');
//     if (!listDiv) return;
//
//     if (rounds.length === 0) {
//         listDiv.innerHTML = '<p class="placeholder">No hay fechas registradas</p>';
//         return;
//     }
//
//     // Agrupar por ubicación
//     const byLocation = {};
//     rounds.forEach(round => {
//         if (!byLocation[round.locationId]) {
//             byLocation[round.locationId] = [];
//         }
//         byLocation[round.locationId].push(round);
//     });
//
//     let html = '';
//     Object.entries(byLocation).forEach(([locationId, locationRounds]) => {
//         const location = locations.find(l => l.id === locationId) || { name: 'Ubicación desconocida' };
//         html += `<h4>${location.name}</h4>`;
//
//         // Ordenar por fecha cronológicamente y asignar números
//         const sortedRounds = locationRounds.sort((a, b) => new Date(a.date) - new Date(b.date));
//
//         sortedRounds.forEach((round, index) => {
//             const roundNumber = index + 1;
//             const results = roundResults.filter(r => r.roundId === round.id);
//             html += `
//                 <div class="list-item">
//                     <div>
//                         <strong>Fecha ${roundNumber}</strong> - ${formatDate(round.date)}
//                         <br>
//                         <span class="info-text">${results.length} resultado(s)</span>
//                     </div>
//                     <button class="btn btn-danger btn-small" onclick="window.deleteRound('${round.id}')">Eliminar</button>
//                 </div>
//             `;
//         });
//     });
//
//     listDiv.innerHTML = html;
// }

// ========== EDICIÓN DE LIGAS ==========

function editLeague(leagueId) {
    const league = leagues.find(l => l.id === leagueId);
    if (!league) {
        notifications.error('Liga no encontrada');
        return;
    }

    // Ocultar vista principal de ligas y mostrar edición usando clases CSS
    document.getElementById('manage-leagues').classList.remove('active');
    document.getElementById('edit-league').style.display = 'block';
    document.getElementById('edit-league').classList.add('active');

    // Poblar selector de ubicaciones en formulario de edición
    const editLocationSelect = document.getElementById('edit-league-location');
    editLocationSelect.innerHTML = '<option value="">-- Selecciona la ubicación --</option>';
    locations.forEach(location => {
        const option = document.createElement('option');
        option.value = location.id;
        option.textContent = location.name;
        if (location.id === league.locationId) {
            option.selected = true;
        }
        editLocationSelect.appendChild(option);
    });

    // Llenar formulario con datos de la liga
    document.getElementById('edit-league-id').value = league.id;
    document.getElementById('edit-league-name').value = league.name;
    document.getElementById('edit-league-location').value = league.locationId;
    document.getElementById('edit-league-start-date').value = league.startDate;
    document.getElementById('edit-league-status').value = league.status;

    // Guardar estado original para detectar cambios
    originalLeagueData = {
        id: league.id,
        name: league.name,
        locationId: league.locationId,
        startDate: league.startDate,
        status: league.status
    };

    // Renderizar fechas de esta liga
    renderLeagueRoundsList(leagueId);
}

function hasUnsavedLeagueChanges() {
    if (!originalLeagueData) return false;

    const currentName = document.getElementById('edit-league-name').value.trim();
    const currentLocationId = document.getElementById('edit-league-location').value;
    const currentStartDate = document.getElementById('edit-league-start-date').value;
    const currentStatus = document.getElementById('edit-league-status').value;

    return (
        currentName !== originalLeagueData.name ||
        currentLocationId !== originalLeagueData.locationId ||
        currentStartDate !== originalLeagueData.startDate ||
        currentStatus !== originalLeagueData.status
    );
}

async function updateLeague() {
    const leagueId = document.getElementById('edit-league-id').value;
    const name = document.getElementById('edit-league-name').value.trim();
    const locationId = document.getElementById('edit-league-location').value;
    const startDate = document.getElementById('edit-league-start-date').value;
    const status = document.getElementById('edit-league-status').value;

    if (!name || !locationId || !startDate || !status) {
        notifications.warning('Por favor completa todos los campos');
        return;
    }

    const location = locations.find(l => l.id === locationId);
    if (!location) {
        notifications.error('Ubicación no encontrada');
        return;
    }

    try {
        const leagueData = {
            name,
            locationId,
            locationName: location.name,
            startDate,
            status
        };

        await updateDoc(doc(db, 'leagues', leagueId), leagueData);

        // Actualizar en array local
        const league = leagues.find(l => l.id === leagueId);
        if (league) {
            Object.assign(league, leagueData);
        }

        populateLeagueSelectors();
        renderLeaguesList();

        // Limpiar estado original
        originalLeagueData = null;

        // Volver a la vista principal usando clases CSS
        document.getElementById('edit-league').style.display = 'none';
        document.getElementById('edit-league').classList.remove('active');
        document.getElementById('manage-leagues').classList.add('active');

        notifications.success('Liga actualizada exitosamente');
    } catch (error) {
        console.error('Error al actualizar liga:', error);
        notifications.error('Error al actualizar la liga');
        throw error; // Propagar el error para que setupTabs lo maneje
    }
}

async function deleteLeague(leagueId) {
    const league = leagues.find(l => l.id === leagueId);
    if (!league) {
        notifications.error('Liga no encontrada');
        return;
    }

    const leagueRounds = rounds.filter(r => r.leagueId === leagueId);
    const roundCount = leagueRounds.length;

    const confirmMessage = roundCount > 0
        ? `¿Estás seguro de eliminar la liga "${league.name}"?`
        : `¿Estás seguro de eliminar la liga "${league.name}"?`;

    const subtitle = roundCount > 0
        ? `Esto eliminará también ${roundCount} fecha(s) y todos sus resultados asociados`
        : null;

    const confirmed = await notifications.confirm(confirmMessage, { subtitle });
    if (!confirmed) return;

    const loadingId = loading.show('Eliminando liga...');
    try {
        const batch = writeBatch(db);

        // Eliminar todas las fechas de la liga
        for (const round of leagueRounds) {
            // Eliminar resultados de la fecha
            const results = roundResults.filter(r => r.roundId === round.id);
            for (const result of results) {
                batch.delete(doc(db, 'round_results', result.id));
            }
            // Eliminar la fecha
            batch.delete(doc(db, 'rounds', round.id));
        }

        // Eliminar la liga
        batch.delete(doc(db, 'leagues', leagueId));

        await batch.commit();

        // Actualizar arrays locales
        leagues.splice(leagues.findIndex(l => l.id === leagueId), 1);
        rounds = rounds.filter(r => r.leagueId !== leagueId);
        const deletedRoundIds = leagueRounds.map(r => r.id);
        roundResults = roundResults.filter(r => !deletedRoundIds.includes(r.roundId));

        populateLeagueSelectors();
        renderLeaguesList();

        notifications.success('Liga eliminada exitosamente');
    } catch (error) {
        console.error('Error al eliminar liga:', error);
        notifications.error('Error al eliminar la liga');
    } finally {
        loading.hide(loadingId);
    }
}

function renderLeagueRoundsList(leagueId) {
    const listDiv = document.getElementById('league-rounds-list');
    if (!listDiv) return;

    const leagueRounds = rounds.filter(r => r.leagueId === leagueId);

    if (leagueRounds.length === 0) {
        listDiv.innerHTML = '<p class="placeholder">No hay fechas registradas para esta liga</p>';
        return;
    }

    // Ordenar por fecha cronológicamente y asignar números
    const sortedRounds = leagueRounds.sort((a, b) => new Date(a.date) - new Date(b.date));

    let html = '';
    sortedRounds.forEach((round, index) => {
        const roundNumber = index + 1;
        const results = roundResults.filter(r => r.roundId === round.id);
        html += `
            <div class="list-item">
                <div>
                    <strong>Fecha ${roundNumber}</strong> - ${formatDate(round.date)}
                    <br>
                    <span class="info-text">${results.length} resultado(s)</span>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-secondary btn-small" onclick="window.editRoundDate('${sanitizeAttribute(round.id)}')">✏️ Editar Fecha</button>
                    <button class="btn btn-danger btn-small" onclick="window.deleteRoundFromLeague('${sanitizeAttribute(round.id)}', '${sanitizeAttribute(leagueId)}')">🗑️ Eliminar</button>
                </div>
            </div>
        `;
    });

    listDiv.innerHTML = html;
}

async function editRoundDate(roundId) {
    const round = rounds.find(r => r.id === roundId);
    if (!round) {
        notifications.error('Fecha no encontrada');
        return;
    }

    const newDate = await notifications.prompt('Nueva fecha', {
        defaultValue: round.date,
        placeholder: 'YYYY-MM-DD'
    });
    if (!newDate) return;

    // Validar formato de fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        notifications.error('Formato de fecha inválido. Use YYYY-MM-DD');
        return;
    }

    try {
        await updateDoc(doc(db, 'rounds', roundId), { date: newDate });

        // Actualizar en array local
        round.date = newDate;

        // Refrescar lista de fechas de la liga
        const leagueId = round.leagueId;
        if (leagueId) {
            renderLeagueRoundsList(leagueId);
        }

        notifications.success('Fecha actualizada exitosamente');
    } catch (error) {
        console.error('Error al actualizar fecha:', error);
        notifications.error('Error al actualizar la fecha');
    }
}

async function deleteRoundFromLeague(roundId, leagueId) {
    await deleteRound(roundId);
    renderLeagueRoundsList(leagueId);
}

function renderAllRoundsList(filters = {}) {
    const listDiv = document.getElementById('rounds-list');
    if (!listDiv) return;

    let filteredRounds = [...rounds];

    // Aplicar filtro de ubicación
    if (filters.locationId) {
        filteredRounds = filteredRounds.filter(r => r.locationId === filters.locationId);
    }

    // Aplicar filtro de rango de fechas
    if (filters.dateFrom) {
        filteredRounds = filteredRounds.filter(r => r.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
        filteredRounds = filteredRounds.filter(r => r.date <= filters.dateTo);
    }

    // Ordenar por fecha descendente (más reciente primero)
    filteredRounds.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filteredRounds.length === 0) {
        listDiv.innerHTML = '<p class="placeholder">No hay fechas que coincidan con los filtros seleccionados</p>';
        return;
    }

    let html = '';
    filteredRounds.forEach(round => {
        const league = leagues.find(l => l.id === round.leagueId);
        const results = roundResults.filter(r => r.roundId === round.id);
        const roundNumber = getRoundNumberInLeague(round.id);

        // Determinar icono y texto de estado
        let statusIcon = '';
        let statusText = '';
        if (league) {
            switch (league.status) {
                case 'en_curso':
                    statusIcon = '🟢';
                    statusText = 'En Curso';
                    break;
                case 'finalizada':
                    statusIcon = '🔴';
                    statusText = 'Finalizada';
                    break;
                case 'pausada':
                    statusIcon = '⏸️';
                    statusText = 'Pausada';
                    break;
                case 'programada':
                    statusIcon = '🟡';
                    statusText = 'Programada';
                    break;
            }
        }

        html += `
            <div class="list-item">
                <div>
                    <strong>Fecha ${roundNumber} - ${sanitizeHTML(league ? league.name : 'Liga desconocida')}</strong>
                    <br>
                    <span class="info-text">📅 ${formatDate(round.date)} | 📍 ${sanitizeHTML(round.locationName)}</span>
                    <br>
                    <span class="info-text">${statusIcon} ${statusText} | ${results.length} resultado(s)</span>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-secondary btn-small" onclick="window.editRoundDateFromManage('${sanitizeAttribute(round.id)}')">✏️ Editar Fecha</button>
                    <button class="btn btn-danger btn-small" onclick="window.deleteRoundFromManage('${sanitizeAttribute(round.id)}')">🗑️ Eliminar</button>
                </div>
            </div>
        `;
    });

    listDiv.innerHTML = html;
}

async function editRoundDateFromManage(roundId) {
    await editRoundDate(roundId);

    // Refrescar la lista de gestionar fechas
    const filters = getCurrentFilters();
    renderAllRoundsList(filters);
}

async function deleteRoundFromManage(roundId) {
    await deleteRound(roundId);

    // Refrescar la lista de gestionar fechas
    const filters = getCurrentFilters();
    renderAllRoundsList(filters);
}

function getCurrentFilters() {
    return {
        locationId: document.getElementById('filter-location')?.value || '',
        dateFrom: document.getElementById('filter-date-from')?.value || '',
        dateTo: document.getElementById('filter-date-to')?.value || ''
    };
}

// ========== HELPERS ==========

function formatDate(dateString) {
    if (!dateString) return 'Sin fecha';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function getRoundNumberInLeague(roundId) {
    const round = rounds.find(r => r.id === roundId);
    if (!round) return null;

    const leagueRounds = rounds.filter(r => r.leagueId === round.leagueId);
    const sortedRounds = leagueRounds.sort((a, b) => new Date(a.date) - new Date(b.date));

    return sortedRounds.findIndex(r => r.id === roundId) + 1;
}

// Exponer funciones globalmente
window.deleteLocation = deleteLocation;
window.deleteRound = deleteRound;
window.changeLeagueStatus = changeLeagueStatus;
window.editLeague = editLeague;
window.deleteLeague = deleteLeague;
window.editRoundDate = editRoundDate;
window.deleteRoundFromLeague = deleteRoundFromLeague;
window.editRoundDateFromManage = editRoundDateFromManage;
window.deleteRoundFromManage = deleteRoundFromManage;
