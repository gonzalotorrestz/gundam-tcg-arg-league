import { firebaseConfig } from './firebase-config.js';
import { sanitizeHTML, sanitizeURL, sanitizeAttribute, handleAsyncOperation, DataCache } from './utils.js';

// Importar Firebase desde CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, getDocs, query, orderBy, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Estado de la aplicación
let locations = [];
let leagues = [];
let players = [];
let rounds = [];
let roundResults = [];

// Caché para estadísticas (mejora de performance)
const statsCache = new DataCache();

// Estado actual de navegación
let currentView = 'leagues';
let currentLeagueId = null;

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', async () => {
    setupTabs();
    setupSubtabs();
    setupBackButton();
    await loadData();
    renderLeaguesByStatus();
    populateGlobalPlayerSearch();
});

// Configurar tabs
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');

            // Remover clases active
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => {
                content.classList.remove('active');
                // IMPORTANTE: Resetear style.display para evitar conflictos
                // con showLeagueDetail() que usa style.display directamente
                content.style.display = '';
            });

            // Activar tab seleccionado
            button.classList.add('active');
            document.getElementById(targetTab).classList.add('active');

            // Ocultar league-detail si está visible
            document.getElementById('league-detail').style.display = 'none';

            currentView = targetTab;
        });
    });
}

// Configurar subtabs
function setupSubtabs() {
    const subtabButtons = document.querySelectorAll('.tab-button[data-subtab]');
    const subtabContents = document.querySelectorAll('.subtab-content');

    subtabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetSubtab = button.getAttribute('data-subtab');

            subtabButtons.forEach(btn => btn.classList.remove('active'));
            subtabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            document.getElementById(targetSubtab).classList.add('active');
        });
    });
}

// Configurar botón de volver
function setupBackButton() {
    const backButton = document.getElementById('back-to-leagues');
    if (backButton) {
        backButton.addEventListener('click', () => {
            // Ocultar league-detail
            document.getElementById('league-detail').style.display = 'none';

            // Resetear todos los tabs y mostrar solo leagues
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => {
                content.classList.remove('active');
                content.style.display = '';
            });

            document.getElementById('leagues').classList.add('active');
            currentLeagueId = null;

            // Reactivar el tab de ligas
            const tabButtons = document.querySelectorAll('.tab-button[data-tab]');
            tabButtons.forEach(btn => btn.classList.remove('active'));
            document.querySelector('.tab-button[data-tab="leagues"]').classList.add('active');

            currentView = 'leagues';
        });
    }
}

// Cargar datos desde Firebase (optimizado)
async function loadData() {
    try {
        // Cargar ubicaciones y ligas (siempre necesarios)
        const [locationsSnapshot, leaguesSnapshot] = await Promise.all([
            getDocs(collection(db, 'locations')),
            getDocs(collection(db, 'leagues'))
        ]);

        locations = locationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        leagues = leaguesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Obtener IDs de ligas activas y recientes (en curso, finalizadas hace menos de 6 meses)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const cutoffDate = sixMonthsAgo.toISOString().split('T')[0];

        const activeLeagues = leagues.filter(l =>
            l.status === 'en_curso' ||
            l.status === 'programada' ||
            (l.status === 'finalizada' && l.startDate >= cutoffDate)
        );

        // Si no hay ligas activas, cargar todas
        const leagueIds = activeLeagues.length > 0
            ? activeLeagues.map(l => l.id)
            : leagues.map(l => l.id);

        // Cargar solo rounds y results de ligas relevantes
        // Firebase limita a 10 items en 'in', así que si hay más, cargamos todo
        if (leagueIds.length > 0 && leagueIds.length <= 10) {
            const [roundsSnapshot, resultsSnapshot] = await Promise.all([
                getDocs(query(collection(db, 'rounds'), where('leagueId', 'in', leagueIds))),
                getDocs(query(collection(db, 'round_results'), where('leagueId', 'in', leagueIds)))
            ]);

            rounds = roundsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            roundResults = resultsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
            // Fallback: cargar todo si hay muchas ligas o ninguna
            const [roundsSnapshot, resultsSnapshot] = await Promise.all([
                getDocs(collection(db, 'rounds')),
                getDocs(collection(db, 'round_results'))
            ]);

            rounds = roundsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            roundResults = resultsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        // Cargar solo jugadores que tienen resultados (bajo demanda)
        // Extraer IDs únicos de jugadores de los resultados
        const playerIds = [...new Set(roundResults.map(r => r.playerId))];
        players = []; // Los cargaremos bajo demanda si es necesario

        console.log('Datos cargados:', {
            locations: locations.length,
            leagues: leagues.length,
            rounds: rounds.length,
            roundResults: roundResults.length
        });
    } catch (error) {
        console.error('Error al cargar datos:', error);
        alert('Error al cargar los datos. Por favor recarga la página.');
    }
}

// Calcular estadísticas acumuladas de jugadores por liga (con caché)
function calculatePlayerStats(leagueId) {
    // Verificar caché primero
    return statsCache.getOrCompute(`league_${leagueId}`, () => {
        const stats = {};

        // Filtrar resultados por liga
        const leagueResults = roundResults.filter(r => r.leagueId === leagueId);

        // Inicializar stats
        leagueResults.forEach(result => {
            if (!stats[result.playerId]) {
                stats[result.playerId] = {
                    name: result.playerName,
                    totalPoints: 0,
                    roundsPlayed: 0,
                    omwSum: 0,
                    oomwSum: 0,
                    avgOmw: 0,
                    avgOomw: 0
                };
            }
        });

        // Acumular datos
        leagueResults.forEach(result => {
            const playerStats = stats[result.playerId];
            playerStats.totalPoints += result.points;
            playerStats.roundsPlayed++;
            playerStats.omwSum += result.omw;
            playerStats.oomwSum += result.oomw;
        });

        // Calcular promedios
        Object.values(stats).forEach(playerStats => {
            if (playerStats.roundsPlayed > 0) {
                playerStats.avgOmw = playerStats.omwSum / playerStats.roundsPlayed;
                playerStats.avgOomw = playerStats.oomwSum / playerStats.roundsPlayed;
            }
        });

        return stats;
    });
}

// Renderizar ligas por estado
function renderLeaguesByStatus() {
    const inProgressList = document.getElementById('in-progress-list');
    const finishedList = document.getElementById('finished-list');
    const upcomingList = document.getElementById('upcoming-list');

    const inProgress = leagues.filter(l => l.status === 'en_curso');
    const finished = leagues.filter(l => l.status === 'finalizada');
    const upcoming = leagues.filter(l => l.status === 'programada');

    inProgressList.innerHTML = renderLeagueCards(inProgress);
    finishedList.innerHTML = renderLeagueCards(finished);
    upcomingList.innerHTML = renderLeagueCards(upcoming);
}

// Renderizar tarjetas de ligas
function renderLeagueCards(leaguesList) {
    if (leaguesList.length === 0) {
        return '<p class="placeholder">No hay ligas en esta categoría</p>';
    }

    return leaguesList.map(league => {
        const leagueRounds = rounds.filter(r => r.leagueId === league.id);
        const leagueResultsCount = roundResults.filter(r => r.leagueId === league.id).length;
        const totalPlayers = new Set(roundResults.filter(r => r.leagueId === league.id).map(r => r.playerId)).size;
        const totalRounds = leagueRounds.length;

        // Sanitizar datos para prevenir XSS
        const safeName = sanitizeHTML(league.name);
        const safeLocationName = sanitizeHTML(league.locationName);
        const safeLeagueId = sanitizeAttribute(league.id);

        return `
            <div class="league-card" onclick="window.showLeagueDetail('${safeLeagueId}')">
                <div class="league-card-title">${safeName}</div>
                <div class="league-card-info">📍 ${safeLocationName}</div>
                <div class="league-card-info">📅 Inicio: ${formatDate(league.startDate)}</div>

                <div class="league-card-stats">
                    <div class="league-card-stat">
                        <span class="league-card-stat-value">${totalPlayers}</span>
                        <span class="league-card-stat-label">Jugadores</span>
                    </div>
                    <div class="league-card-stat">
                        <span class="league-card-stat-value">${totalRounds}</span>
                        <span class="league-card-stat-label">Fechas</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Mostrar detalle de una liga
function showLeagueDetail(leagueId) {
    currentLeagueId = leagueId;
    const league = leagues.find(l => l.id === leagueId);

    if (!league) return;

    // Ocultar vista de ligas, mostrar vista de detalle
    document.getElementById('leagues').style.display = 'none';
    document.getElementById('global-stats').style.display = 'none';
    document.getElementById('league-detail').style.display = 'block';

    // Renderizar header
    const location = locations.find(l => l.id === league.locationId);
    const statusEmojis = {
        programada: '🟡',
        en_curso: '🟢',
        finalizada: '🔴'
    };
    const statusLabels = {
        programada: 'Programada',
        en_curso: 'En Curso',
        finalizada: 'Finalizada'
    };

    // Sanitizar datos
    const safeName = sanitizeHTML(league.locationName);
    let locationTitle = safeName;

    if (location && location.url) {
        const safeUrl = sanitizeURL(location.url);
        locationTitle = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color);">${safeName}</a>`;
    }

    document.getElementById('league-detail-header').innerHTML = `
        <div class="location-section" style="margin-bottom: 0;">
            <h2 class="location-title">Liga ${locationTitle} ${statusEmojis[league.status]}</h2>
            <p class="league-subtitle">${sanitizeHTML(league.name)} - Inicio: ${formatDate(league.startDate)} - ${statusLabels[league.status]}</p>
        </div>
    `;

    // Renderizar contenido de las subtabs
    renderLeagueStandings(leagueId);
    renderLeagueResults(leagueId);
    renderLeaguePlayers(leagueId);
}

// Renderizar tabla de posiciones de la liga
function renderLeagueStandings(leagueId) {
    const stats = calculatePlayerStats(leagueId);
    const standingsArray = Object.entries(stats)
        .map(([playerId, playerStats]) => ({ playerId, ...playerStats }))
        .sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
            if (b.avgOmw !== a.avgOmw) return b.avgOmw - a.avgOmw;
            return b.avgOomw - a.avgOomw;
        });

    const leagueRounds = rounds.filter(r => r.leagueId === leagueId);
    const totalPlayers = standingsArray.length;
    const totalRounds = leagueRounds.length;

    document.getElementById('league-standings-content').innerHTML = `
        <div class="stats-summary">
            <div class="stat-card">
                <span class="stat-label">Total Jugadores</span>
                <span class="stat-value">${totalPlayers}</span>
            </div>
            <div class="stat-card">
                <span class="stat-label">Fechas Jugadas</span>
                <span class="stat-value">${totalRounds}</span>
            </div>
        </div>

        <table class="standings-table">
            <thead>
                <tr>
                    <th>Pos</th>
                    <th>Jugador</th>
                    <th>Puntos</th>
                    <th>Fechas</th>
                    <th>OMW%</th>
                </tr>
            </thead>
            <tbody>
                ${standingsArray.length > 0 ? standingsArray.map((player, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${sanitizeHTML(player.name)}</td>
                        <td><strong>${player.totalPoints}</strong></td>
                        <td>${player.roundsPlayed}</td>
                        <td>${player.avgOmw.toFixed(1)}%</td>
                    </tr>
                `).join('') : '<tr><td colspan="5" class="placeholder">No hay datos</td></tr>'}
            </tbody>
        </table>
    `;
}

// Renderizar resultados por fecha de la liga
function renderLeagueResults(leagueId) {
    const leagueRounds = rounds.filter(r => r.leagueId === leagueId);

    if (leagueRounds.length === 0) {
        document.getElementById('league-results-content').innerHTML = '<p class="placeholder">No hay fechas registradas</p>';
        return;
    }

    const sortedRounds = leagueRounds.sort((a, b) => new Date(a.date) - new Date(b.date));

    let html = '<div class="rounds-grid">';

    sortedRounds.forEach((round, index) => {
        const roundNumber = index + 1;
        html += `
            <button class="round-button" onclick="window.showRoundResults('${sanitizeAttribute(round.id)}')">
                Fecha ${roundNumber}<br>
                <span class="round-date">${formatDate(round.date)}</span>
            </button>
        `;
    });

    html += '</div><div id="round-results-display"></div>';
    document.getElementById('league-results-content').innerHTML = html;
}

// Renderizar jugadores de la liga
function renderLeaguePlayers(leagueId) {
    const leagueResults = roundResults.filter(r => r.leagueId === leagueId);
    const allStats = {};

    leagueResults.forEach(result => {
        if (!allStats[result.playerId]) {
            allStats[result.playerId] = {
                name: result.playerName
            };
        }
    });

    const playersWithStats = Object.entries(allStats)
        .sort((a, b) => a[1].name.localeCompare(b[1].name));

    if (playersWithStats.length === 0) {
        document.getElementById('league-players-content').innerHTML = '<p class="placeholder">No hay jugadores con estadísticas</p>';
        return;
    }

    let html = `
        <div class="player-search-section">
            <h2>Buscar Jugador en esta Liga</h2>
            <p class="info-text">Estadísticas de jugadores en esta liga</p>
            <input type="text" id="league-player-search" class="player-search-input" placeholder="Busca por nombre de jugador..." />
        </div>
        <div class="players-grid" id="league-players-grid">
    `;

    playersWithStats.forEach(([playerId, playerInfo]) => {
        html += `
            <button class="player-button" data-player-name="${sanitizeAttribute(playerInfo.name.toLowerCase())}" onclick="window.showPlayerStatsInLeague('${sanitizeAttribute(playerId)}', '${sanitizeAttribute(leagueId)}')">
                ${sanitizeHTML(playerInfo.name)}
            </button>
        `;
    });

    html += '</div><div id="league-player-stats-display"></div>';
    document.getElementById('league-players-content').innerHTML = html;

    // Configurar búsqueda
    setTimeout(() => {
        const searchInput = document.getElementById('league-player-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const playerButtons = document.querySelectorAll('#league-players-grid .player-button');

                playerButtons.forEach(button => {
                    const playerName = button.getAttribute('data-player-name');
                    if (playerName.includes(searchTerm)) {
                        button.style.display = 'block';
                    } else {
                        button.style.display = 'none';
                    }
                });
            });
        }
    }, 100);
}

// Mostrar estadísticas de jugador en liga específica
function showPlayerStatsInLeague(playerId, leagueId) {
    const playerResults = roundResults.filter(r => r.playerId === playerId && r.leagueId === leagueId);

    if (playerResults.length === 0) return;

    const playerName = playerResults[0].playerName;
    const league = leagues.find(l => l.id === leagueId);

    const totalPoints = playerResults.reduce((sum, r) => sum + r.points, 0);
    const roundsPlayed = playerResults.length;
    const avgOmw = playerResults.reduce((sum, r) => sum + r.omw, 0) / roundsPlayed;
    const avgOomw = playerResults.reduce((sum, r) => sum + r.oomw, 0) / roundsPlayed;

    let html = `
        <div class="player-stats-card">
            <h3>${sanitizeHTML(playerName)}</h3>
            <h4>${sanitizeHTML(league.name)} - ${sanitizeHTML(league.locationName)}</h4>
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-item-label">Puntos Totales</span>
                    <span class="stat-item-value">${totalPoints}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Fechas Jugadas</span>
                    <span class="stat-item-value">${roundsPlayed}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Promedio Puntos/Fecha</span>
                    <span class="stat-item-value">${(totalPoints / roundsPlayed).toFixed(1)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">OMW% Promedio</span>
                    <span class="stat-item-value">${avgOmw.toFixed(1)}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">OOMW% Promedio</span>
                    <span class="stat-item-value">${avgOomw.toFixed(1)}%</span>
                </div>
            </div>

            <h5>Historial</h5>
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Pos</th>
                        <th>Puntos</th>
                        <th>OMW%</th>
                        <th>OOMW%</th>
                    </tr>
                </thead>
                <tbody>
                    ${playerResults.sort((a, b) => {
                        const roundA = rounds.find(r => r.id === a.roundId);
                        const roundB = rounds.find(r => r.id === b.roundId);
                        return new Date(roundA?.date || 0) - new Date(roundB?.date || 0);
                    }).map(result => {
                        const round = rounds.find(r => r.id === result.roundId);
                        const leagueRounds = rounds.filter(r => r.leagueId === result.leagueId);
                        const sortedRounds = leagueRounds.sort((a, b) => new Date(a.date) - new Date(b.date));
                        const roundNumber = sortedRounds.findIndex(r => r.id === result.roundId) + 1;

                        return `
                            <tr>
                                <td>Fecha ${roundNumber}</td>
                                <td>${result.ranking}</td>
                                <td><strong>${result.points}</strong></td>
                                <td>${result.omw.toFixed(1)}%</td>
                                <td>${result.oomw.toFixed(1)}%</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    const displayDiv = document.getElementById('league-player-stats-display');
    displayDiv.innerHTML = html;
    displayDiv.scrollIntoView({ behavior: 'smooth' });
}

// Poblar búsqueda de jugadores global
function populateGlobalPlayerSearch() {
    const playersDiv = document.getElementById('player-stats');

    // Obtener todos los jugadores con stats globales
    const allStats = {};
    roundResults.forEach(result => {
        if (!allStats[result.playerId]) {
            allStats[result.playerId] = {
                name: result.playerName,
                leagues: new Set()
            };
        }
        allStats[result.playerId].leagues.add(result.leagueId);
    });

    const playersWithStats = Object.entries(allStats)
        .sort((a, b) => a[1].name.localeCompare(b[1].name));

    if (playersWithStats.length === 0) {
        return;
    }

    // Insertar la lista de jugadores (solo inicialmente, luego está en el HTML)
    const searchInput = document.getElementById('player-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();

            if (!searchTerm) {
                playersDiv.innerHTML = '<p class="placeholder">Busca un jugador para ver sus estadísticas globales</p>';
                return;
            }

            // Filtrar jugadores por nombre
            const filteredPlayers = playersWithStats.filter(([playerId, playerInfo]) =>
                playerInfo.name.toLowerCase().includes(searchTerm)
            );

            if (filteredPlayers.length === 0) {
                playersDiv.innerHTML = '<p class="placeholder">No se encontraron jugadores</p>';
                return;
            }

            // Mostrar resultados de búsqueda como lista de botones
            let html = '<div class="players-grid">';
            filteredPlayers.forEach(([playerId, playerInfo]) => {
                html += `
                    <button class="player-button" onclick="window.showGlobalPlayerStats('${sanitizeAttribute(playerId)}')">
                        ${sanitizeHTML(playerInfo.name)}
                    </button>
                `;
            });
            html += '</div>';
            playersDiv.innerHTML = html;
        });
    }
}

// Mostrar estadísticas globales de un jugador
function showGlobalPlayerStats(playerId) {
    const playerResults = roundResults.filter(r => r.playerId === playerId);

    if (playerResults.length === 0) return;

    const playerName = playerResults[0].playerName;

    // Calcular estadísticas globales
    const totalPoints = playerResults.reduce((sum, r) => sum + r.points, 0);
    const totalRounds = playerResults.length;
    const avgOmw = playerResults.reduce((sum, r) => sum + r.omw, 0) / totalRounds;
    const avgOomw = playerResults.reduce((sum, r) => sum + r.oomw, 0) / totalRounds;

    // Agrupar por liga
    const byLeague = {};
    playerResults.forEach(result => {
        if (result.leagueId && !byLeague[result.leagueId]) {
            byLeague[result.leagueId] = [];
        }
        if (result.leagueId) {
            byLeague[result.leagueId].push(result);
        }
    });

    let html = `
        <div class="player-stats-card">
            <h3>${sanitizeHTML(playerName)}</h3>
            <h4>Estadísticas Globales</h4>
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-item-label">Puntos Totales</span>
                    <span class="stat-item-value">${totalPoints}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Fechas Jugadas</span>
                    <span class="stat-item-value">${totalRounds}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Promedio Puntos/Fecha</span>
                    <span class="stat-item-value">${(totalPoints / totalRounds).toFixed(1)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">OMW% Promedio</span>
                    <span class="stat-item-value">${avgOmw.toFixed(1)}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">OOMW% Promedio</span>
                    <span class="stat-item-value">${avgOomw.toFixed(1)}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Ligas Jugadas</span>
                    <span class="stat-item-value">${Object.keys(byLeague).length}</span>
                </div>
            </div>
        </div>
    `;

    // Desglose por liga
    Object.entries(byLeague).forEach(([leagueId, leagueResults]) => {
        const league = leagues.find(l => l.id === leagueId) || { name: 'Liga Desconocida', locationName: 'Desconocido' };

        const leaguePoints = leagueResults.reduce((sum, r) => sum + r.points, 0);
        const leagueRoundsPlayed = leagueResults.length;
        const leagueAvgOmw = leagueResults.reduce((sum, r) => sum + r.omw, 0) / leagueRoundsPlayed;
        const leagueAvgOomw = leagueResults.reduce((sum, r) => sum + r.oomw, 0) / leagueRoundsPlayed;

        html += `
            <div class="player-stats-card">
                <h4>${sanitizeHTML(league.name)} - ${sanitizeHTML(league.locationName)}</h4>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-item-label">Puntos Totales</span>
                        <span class="stat-item-value">${leaguePoints}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Fechas Jugadas</span>
                        <span class="stat-item-value">${leagueRoundsPlayed}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Promedio Puntos/Fecha</span>
                        <span class="stat-item-value">${(leaguePoints / leagueRoundsPlayed).toFixed(1)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">OMW% Promedio</span>
                        <span class="stat-item-value">${leagueAvgOmw.toFixed(1)}%</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">OOMW% Promedio</span>
                        <span class="stat-item-value">${leagueAvgOomw.toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        `;
    });

    const playersDiv = document.getElementById('player-stats');
    playersDiv.innerHTML = html;
    playersDiv.scrollIntoView({ behavior: 'smooth' });
}

// Mostrar resultados de una fecha
function showRoundResults(roundId) {
    const round = rounds.find(r => r.id === roundId);
    const results = roundResults.filter(r => r.roundId === roundId);

    if (!round) return;

    // Calcular el número de fecha cronológicamente
    const leagueRounds = rounds.filter(r => r.leagueId === round.leagueId);
    const sortedRounds = leagueRounds.sort((a, b) => new Date(a.date) - new Date(b.date));
    const roundNumber = sortedRounds.findIndex(r => r.id === roundId) + 1;

    const league = leagues.find(l => l.id === round.leagueId) || { name: 'Liga Desconocida', locationName: round.locationName };

    const sortedResults = [...results].sort((a, b) => a.ranking - b.ranking);

    const displayDiv = document.getElementById('round-results-display');
    displayDiv.innerHTML = `
        <h3>${sanitizeHTML(league.name)} - ${sanitizeHTML(league.locationName)} - Fecha ${roundNumber}</h3>
        <p class="round-subtitle">${formatDate(round.date)}</p>
        <table class="standings-table">
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
                ${sortedResults.map(result => `
                    <tr>
                        <td>${result.ranking}</td>
                        <td>${sanitizeHTML(result.playerName)}</td>
                        <td><strong>${result.points}</strong></td>
                        <td>${result.omw.toFixed(1)}%</td>
                        <td>${result.oomw.toFixed(1)}%</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    displayDiv.scrollIntoView({ behavior: 'smooth' });
}

// Formatear fecha
function formatDate(dateString) {
    if (!dateString) return 'Sin fecha';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Exponer funciones globalmente
window.showLeagueDetail = showLeagueDetail;
window.showRoundResults = showRoundResults;
window.showPlayerStatsInLeague = showPlayerStatsInLeague;
window.showGlobalPlayerStats = showGlobalPlayerStats;
