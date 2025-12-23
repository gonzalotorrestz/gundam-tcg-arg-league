# Configurar Firebase App Check (Opcional)

App Check protege tu backend de Firebase contra tráfico abusivo.

## Pasos para habilitar

### 1. En Firebase Console

1. Ve a https://console.firebase.google.com/
2. Selecciona: `gundam-tcg-league`
3. **App Check** (en el menú lateral)
4. Click en **Get started**
5. Selecciona tu app web
6. Elige **reCAPTCHA v3** como proveedor
7. Registra un site key en https://www.google.com/recaptcha/admin
   - Tipo: reCAPTCHA v3
   - Dominios:
     - `gonzalotorrestz.github.io`
     - `localhost` (para desarrollo)
8. Copia el **Site Key**
9. Pega el Site Key en Firebase App Check
10. Click en **Save**

### 2. Agregar código al proyecto

En `js/public.js` y `js/admin.js`, después de `initializeApp`:

```javascript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js';

const app = initializeApp(firebaseConfig);

// Activar App Check
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('TU_RECAPTCHA_SITE_KEY'),
  isTokenAutoRefreshEnabled: true
});
```

### 3. Enforcement (Opcional)

En Firebase Console > App Check:
- Click en **Enforcement**
- Habilita enforcement para:
  - Firestore
  - Authentication (si usas)

**IMPORTANTE**: Solo habilita enforcement DESPUÉS de probar que funciona correctamente.

## Alternativa más simple: reCAPTCHA Enterprise

Si no quieres usar reCAPTCHA v3, puedes usar la opción "Debug tokens" para desarrollo.

## ¿Es necesario?

**NO es crítico** si:
- Tu app es pequeña/mediana
- Las Firestore Rules están bien configuradas (✅ ya lo hicimos)
- No esperas tráfico abusivo

**SÍ es recomendado** si:
- Tu app crece mucho
- Notas uso sospechoso en Firebase Usage
- Quieres máxima seguridad

## Costo

- reCAPTCHA v3: Gratis hasta 10,000 evaluaciones/mes
- Después: $1 por 1,000 evaluaciones adicionales
