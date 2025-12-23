# Seguridad en Firebase - Explicación

## ¿Por qué la API Key de Firebase es pública?

**Las API Keys de Firebase Web son públicas por diseño.** No son secretas y está bien que estén en el código fuente.

### Analogía
Piensa en la API Key como la **dirección de tu tienda** y en las Firestore Rules como **el guardia de seguridad**:
- La dirección (API Key) es pública - cualquiera la puede ver
- El guardia (Firestore Rules) decide quién puede entrar y qué puede hacer

## ¿Dónde está la seguridad real?

### ✅ 1. Firestore Rules (YA IMPLEMENTADAS)

Tu seguridad está en las reglas de Firestore que ya configuramos:

```javascript
// ❌ ANTES (inseguro)
match /{document=**} {
  allow read: if true;
}

// ✅ AHORA (seguro)
match /locations/{locationId} {
  allow read: if true;
  allow create, update, delete: if isAdmin();
}
```

**Resultado:**
- ✅ Cualquiera puede leer datos públicos (torneos, resultados)
- ✅ Solo admins autenticados pueden escribir
- ✅ Si alguien copia tu API Key, NO puede modificar tu base de datos

### ✅ 2. Dominios Autorizados (RECOMENDADO)

Evita que alguien use tu proyecto desde otro dominio:

**Cómo configurarlo:**
1. Firebase Console > Authentication > Settings > Authorized domains
2. Verifica que solo estén:
   - `localhost`
   - `gonzalotorrestz.github.io`
3. Elimina cualquier otro dominio

**Resultado:**
- ✅ Tu app solo funciona desde tus dominios
- ✅ Si alguien copia tu API Key a su sitio, Firebase rechazará las peticiones

### ⭐ 3. App Check (OPCIONAL - para apps grandes)

Protección avanzada contra bots y uso abusivo.

**Cuándo usarlo:**
- Tu app tiene mucho tráfico
- Quieres protección extra contra bots
- Notas uso sospechoso en Firebase Usage

**Cómo:** Ver `FIREBASE_APP_CHECK.md`

## Resumen de tu protección actual

| Capa de Seguridad | Estado | Importancia |
|-------------------|--------|-------------|
| **Firestore Rules** | ✅ Implementadas | **CRÍTICA** |
| **Sanitización XSS** | ✅ Implementada | **CRÍTICA** |
| **Dominios Autorizados** | ⚠️ Verificar | **ALTA** |
| **App Check** | ❌ No configurado | MEDIA (opcional) |

## ¿Qué hacer ahora?

### Acción requerida:
1. **Verifica dominios autorizados** (5 minutos)
   - Firebase Console > Authentication > Settings > Authorized domains
   - Solo deben estar: `localhost` y `gonzalotorrestz.github.io`

### Opcional (para más adelante):
2. **Considera App Check** si la app crece mucho
   - Ver instrucciones en `FIREBASE_APP_CHECK.md`

## Mitos sobre Firebase API Keys

❌ **MITO**: "Debo ocultar la API Key"
✅ **REALIDAD**: La API Key es pública, la seguridad está en las reglas

❌ **MITO**: "Si alguien ve mi API Key, puede hackear mi DB"
✅ **REALIDAD**: Solo puede hacer lo que las Firestore Rules permitan

❌ **MITO**: "Necesito variables de entorno para la API Key"
✅ **REALIDAD**: No es necesario para Firebase Web (sí para Firebase Admin SDK en backend)

## Referencias oficiales

- [Firebase Docs: API Keys](https://firebase.google.com/docs/projects/api-keys)
- [Firebase Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [App Check](https://firebase.google.com/docs/app-check)

## ¿Está mi proyecto seguro?

**SÍ**, tu proyecto está seguro porque:

1. ✅ Las Firestore Rules limitan quién puede escribir (solo admins)
2. ✅ La sanitización XSS protege contra inyección de código
3. ✅ Los dominios autorizados (si los configuras) limitan desde dónde funciona tu app
4. ✅ Firebase Authentication verifica identidad de admins

**Lo único que un atacante puede hacer con tu API Key es:**
- Leer datos que ya son públicos (torneos, resultados)
- Intentar escribir, pero será rechazado por las Firestore Rules

**NO puede:**
- Modificar tu base de datos (bloqueado por reglas)
- Eliminar datos (bloqueado por reglas)
- Hacerse pasar por admin (requiere autenticación real de Google)
