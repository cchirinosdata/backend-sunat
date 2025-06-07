// =================================================================
// 1. IMPORTACIONES
// =================================================================
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');

// =================================================================
// 2. INICIALIZACIÓN Y CONFIGURACIÓN
// =================================================================
dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// =================================================================
// 3. MIDDLEWARES
// =================================================================
app.use(cors());
app.use(express.json()); // ¡Muy importante para que el servidor reciba datos!

// =================================================================
// 4. Almacenamiento (caché) del Token
// =================================================================
let tokenCache = {
  accessToken: null,
  expiresAt: null,
};

// =================================================================
// 5. Lógica para comunicarse con SUNAT
// =================================================================

async function obtenerTokenSunat() {
  // Revisa si ya tenemos un token válido en memoria (caché)
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
    console.log('Usando token de caché, aún es válido.');
    return tokenCache.accessToken;
  }

  console.log('Token no válido o no existe. Obteniendo uno nuevo de SUNAT...');

  // PASO CORREGIDO: Leemos el client_id del archivo .env
  const clientId = process.env.CLIENT_ID_SUNAT;

  // Verificamos que el client_id exista para evitar errores
  if (!clientId) {
      throw new Error('El CLIENT_ID_SUNAT no está definido en el archivo .env');
  }

  // PASO CORREGIDO Y MÁS IMPORTANTE: Construimos la URL dinámica con el client_id
  const url = `https://api-seguridad.sunat.gob.pe/v1/clientesextranet/${clientId}/oauth2/token/`;

  try {
    // Preparamos los parámetros que se enviarán a SUNAT
    const payload = new URLSearchParams({
      'grant_type': 'client_credentials',
      'scope': 'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes',
      'client_id': clientId, // Usamos la variable con tu ID
      'client_secret': process.env.CLIENT_SECRET_SUNAT,
    });

    // Hacemos la llamada a SUNAT con la URL y los parámetros correctos
    const response = await axios.post(url, payload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    // Si todo sale bien, guardamos el token y su tiempo de expiración
    const { access_token, expires_in } = response.data;
    tokenCache.expiresAt = Date.now() + (expires_in * 1000) - 60000; // Guardamos con un margen de seguridad de 1 minuto
    tokenCache.accessToken = access_token;

    console.log('¡Nuevo token obtenido y guardado con éxito!');
    return access_token;

  } catch (error) {
    // Si algo todavía falla, este error nos dará el detalle
    console.error('Error detallado de SUNAT:', error.response?.data);
    throw new Error('No se pudo obtener el token de SUNAT. Revisa las credenciales, el scope o la URL.');
  }
}

// =================================================================
// 6. RUTAS (ENDPOINTS)
// =================================================================

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('¡Mi backend para SUNAT está funcionando correctamente!');
});

// Ruta para probar la obtención del token
app.get('/api/test-token', async (req, res) => {
  try {
    const token = await obtenerTokenSunat();
    res.status(200).json({ mensaje: '¡Éxito! Se intentó obtener un token.', tokenRecibido: token });
  } catch (error) {
    res.status(500).json({ mensaje: 'Falló el intento de obtener el token.', error: error.message });
  }
});


// =================================================================
// NUEVA RUTA FINAL: Para Validar Comprobantes
// =================================================================
// Usamos app.post porque el frontend nos va a ENVIAR datos.
app.post('/api/sunat/validar-comprobante', async (req, res) => {
  console.log('Solicitud recibida para validar comprobante:', req.body);

  try {
    // Paso 1: Obtener el token de acceso.
    const token = await obtenerTokenSunat();

    // Paso 2: Preparar la llamada a la API de validación de SUNAT.
    const numRuc = req.body.numRuc;
    const urlValidacion = `https://api.sunat.gob.pe/v1/contribuyente/contribuyentes/${numRuc}/validarcomprobante`;
    const payloadSunat = req.body; // Los datos que envía el frontend.
    const headersSunat = {
      'Authorization': `Bearer ${token}`, // Usamos el token para autorizarnos.
      'Content-Type': 'application/json'
    };

    // Paso 3: Realizar la consulta a SUNAT.
    console.log(`Consultando a SUNAT en: ${urlValidacion}`);
    const respuestaSunat = await axios.post(urlValidacion, payloadSunat, { headers: headersSunat });

    // Paso 4: Enviar la respuesta de SUNAT de vuelta al frontend.
    console.log('Respuesta de SUNAT:', respuestaSunat.data);
    res.status(200).json(respuestaSunat.data);

  } catch (error) {
    // Si algo falla (token inválido, error de SUNAT, etc.), lo manejamos aquí.
    console.error("Error en el proceso de validación:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al validar el comprobante.',
      error: error.response?.data || error.message
    });
  }
});


// =================================================================
// 7. INICIAR EL SERVIDOR
// =================================================================
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});