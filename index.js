// =================================================================
// 1. IMPORTACIONES
// =================================================================
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const admin = require('firebase-admin'); // <-- NUEVA HERRAMIENTA: Firebase Admin

// =================================================================
// 2. INICIALIZACIÓN Y CONFIGURACIÓN
// =================================================================
dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// --- NUEVO: INICIALIZACIÓN DE FIREBASE ---
// Leemos la "llave maestra" que pegaste en Render
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Creamos una referencia a nuestra base de datos Firestore
const db = admin.firestore();
console.log('Conectado a Firestore correctamente.');
// --- FIN DE LA INICIALIZACIÓN DE FIREBASE ---


// =================================================================
// 3. MIDDLEWARES
// =================================================================
app.use(cors());
app.use(express.json());

// =================================================================
// 4. LÓGICA DE SUNAT (Sin cambios)
// =================================================================
let tokenCache = { accessToken: null, expiresAt: null };

async function obtenerTokenSunat() {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }
  const clientId = process.env.CLIENT_ID_SUNAT;
  if (!clientId) throw new Error('CLIENT_ID_SUNAT no definido.');
  const url = `https://api-seguridad.sunat.gob.pe/v1/clientesextranet/${clientId}/oauth2/token/`;
  try {
    const payload = new URLSearchParams({
      'grant_type': 'client_credentials',
      'scope': 'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes',
      'client_id': clientId,
      'client_secret': process.env.CLIENT_SECRET_SUNAT,
    });
    const response = await axios.post(url, payload.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const { access_token, expires_in } = response.data;
    tokenCache.expiresAt = Date.now() + (expires_in * 1000) - 60000;
    tokenCache.accessToken = access_token;
    return access_token;
  } catch (error) {
    console.error('Error detallado de SUNAT:', error.response?.data);
    throw new Error('No se pudo obtener el token de SUNAT.');
  }
}

// =================================================================
// 5. RUTAS (ENDPOINTS)
// =================================================================

// --- RUTA PRINCIPAL ---
app.get('/', (req, res) => {
  res.send('Backend de RendiScan funcionando. Conectado a Firestore.');
});

// --- RUTA DE VALIDACIÓN DE SUNAT (Sin cambios) ---
app.post('/api/sunat/validar-comprobante', async (req, res) => {
  try {
    const token = await obtenerTokenSunat();
    const numRuc = req.body.numRuc;
    const urlValidacion = `https://api.sunat.gob.pe/v1/contribuyente/contribuyentes/${numRuc}/validarcomprobante`;
    const headersSunat = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const respuestaSunat = await axios.post(urlValidacion, req.body, { headers: headersSunat });
    res.status(200).json(respuestaSunat.data);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error interno del servidor al validar el comprobante.', error: error.message });
  }
});

// --- NUEVA RUTA PARA GUARDAR EL FEEDBACK ---
app.post('/api/feedback', async (req, res) => {
  try {
    const { scanTimeEstimate, efficiencyRating } = req.body;
    if (!scanTimeEstimate || typeof efficiencyRating !== 'number' || efficiencyRating < 1 || efficiencyRating > 5) {
      return res.status(400).json({ message: 'Datos de feedback inválidos.' });
    }
    const newFeedback = {
      scanTimeEstimate,
      efficiencyRating,
      timestamp: new Date(), // Firestore maneja fechas nativas
    };
    // Guardamos el nuevo feedback en una colección llamada "feedbacks"
    const docRef = await db.collection('feedbacks').add(newFeedback);
    console.log('Feedback guardado con ID:', docRef.id);
    res.status(201).json({ message: 'Feedback guardado exitosamente.', id: docRef.id });
  } catch (error) {
    console.error('Error guardando feedback:', error);
    res.status(500).json({ message: 'Error interno del servidor al guardar el feedback.' });
  }
});


// =================================================================
// 6. INICIAR EL SERVIDOR
// =================================================================
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});