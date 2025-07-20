// Código.gs (para la Web App de Apps Script)

/**
 * @fileoverview Este script actúa como una Web App para recibir metadatos de archivos
 * desde una Cloud Function de GCP, actualizar una Google Sheet y enviar notificaciones.
 * @author [Tu Nombre]
 * @version 1.0
 */

// --- Configuración Global ---
const TOKEN = "12345"; // Debe coincidir con el de la Cloud Function
const ID_SHEET = "1y6CJ7rwiLO5qzlOSIVAx4zhM_yFA1zyWFQU_PJbj8uE"; // ID de tu nueva Google Sheet (ej. "Registro de Archivos Cloud Storage")
const NOMBRE_HOJA = "RegistroArchivos"; // Nombre de la hoja dentro de la Spreadsheet
const CORREO = "albertocastro05206@gmail.com"; // Correo electrónico para enviar notificaciones

/**
 * Función principal para manejar solicitudes HTTP POST a la Web App.
 * Esta función es el endpoint que la Cloud Function llamará.
 *
 * @param {GoogleAppsScript.Events.DoPost} e El objeto de evento que contiene
 * información sobre la solicitud POST.
 * @returns {GoogleAppsScript.Content.TextOutput} Una respuesta HTTP.
 */

function doPost(e) {
  Logger.log("--- Inicio de Solicitud POST ---");

  // Loguear el contenido RAW de la solicitud para depuración inicial
  if (e && e.postData && e.postData.contents) {
    Logger.log("Contenido RAW de datos POST: " + e.postData.contents);
  } else {
    Logger.log("Error: Objeto de evento o postData es nulo o indefinido.");
    return createErrorResponse("Bad Request: Missing request body or event object");
  }

  try {
    // --- 1. Seguridad: Validación del Token Secreto (desde query parameter) ---
    // El token se espera en e.parameter.token.
    // Usamos .toString() en el array para obtener la cadena completa.
    const receivedToken = e.parameter.token ? e.parameter.token.toString() : null; 
    
    if (!receivedToken) {
      Logger.log("Error de seguridad: Token secreto faltante en el parámetro de consulta.");
      return createErrorResponse("Unauthorized: Missing secret token in query parameter");
    }

    if (receivedToken !== TOKEN) {
      Logger.log(`Error de seguridad: Token secreto inválido. Recibido: "${receivedToken}"`);
      return createErrorResponse("Unauthorized: Invalid secret token");
    }
    Logger.log("Token secreto validado exitosamente.");

    // --- 2. Recepción y Validación de Datos ---
    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
      Logger.log("Carga útil JSON parseada: " + JSON.stringify(payload));
    } catch (error) {
      Logger.log("Error al parsear el cuerpo JSON: " + error.message + " Stack: " + error.stack);
      return createErrorResponse("Invalid JSON payload. Check Content-Type header in Cloud Function.");
    }

    // Validar que los campos esenciales estén presentes
    const fileName = payload.fileName;
    const bucketName = payload.bucketName;
    const fileSize = payload.fileSize; 
    const contentType = payload.contentType;
    const timeCreated = payload.timeCreated;
    const source = payload.source;

    if (!fileName || !bucketName || !fileSize || !contentType || !timeCreated || !source) {
      Logger.log("Error de validación: Faltan campos esenciales en la carga útil.");
      return createErrorResponse("Missing essential data fields");
    }

    // Convertir fileSize a número y validar
    const parsedFileSize = parseInt(fileSize, 10);
    if (isNaN(parsedFileSize)) {
      Logger.log(`Error de validación: Tamaño de archivo inválido: ${fileSize}`);
      return createErrorResponse("Invalid file size");
    }

    // --- 3. Actualización de Google Sheet ---
    try {
      const ss = SpreadsheetApp.openById(ID_SHEET);
      let sheet = ss.getSheetByName(NOMBRE_HOJA);

      if (!sheet) {
        Logger.log(`La hoja '${NOMBRE_HOJA}' no se encontró. Intentando crear una nueva hoja.`);
        sheet = ss.insertSheet(NOMBRE_HOJA);
        sheet.appendRow(["Nombre Archivo", "Bucket", "Tamaño (bytes)", "Tipo Contenido", "Fecha Creación", "Origen"]);
        Logger.log(`Hoja '${NOMBRE_HOJA}' creada y encabezados añadidos.`);
      }

      sheet.appendRow([
        fileName,
        bucketName,
        parsedFileSize,
        contentType,
        new Date(timeCreated).toLocaleString(),
        source
      ]);
      Logger.log(`Hoja de cálculo actualizada con los datos del archivo: ${fileName}`);

    } catch (error) {
      Logger.log("Error al actualizar Google Sheet: " + error.message + " Stack: " + error.stack);
      return createErrorResponse("Failed to update Google Sheet. Check Spreadsheet ID and permissions.");
    }

    // --- 4. Automatización de Notificaciones (Gmail) ---
    try {
      const subject = `Nuevo Archivo Subido a Cloud Storage: ${fileName}`;
      const body = `Hola,\n\nUn nuevo archivo ha sido subido a Cloud Storage:\n\n` +
                   `  Nombre: ${fileName}\n` +
                   `  Bucket: ${bucketName}\n` +
                   `  Tamaño: ${parsedFileSize} bytes\n` +
                   `  Tipo: ${contentType}\n` +
                   `  Fecha de Creación: ${new Date(timeCreated).toLocaleString()}\n\n` +
                   `Los detalles han sido registrados en la hoja de cálculo '${NOMBRE_HOJA}'.\n\nSaludos,\nSistema de Notificaciones`;

      GmailApp.sendEmail(CORREO, subject, body); 
      Logger.log(`Notificación por correo electrónico enviada a ${CORREO} para ${fileName}.`);
    } catch (error) {
      Logger.log("Error al enviar notificación por correo electrónico: " + error.message + " Stack: " + error.stack);
    }

    // --- Respuesta Exitosa ---
    Logger.log("--- Fin de Solicitud POST (Éxito) ---");
    return createSuccessResponse("File metadata processed and recorded");

  } catch (globalError) {
    // Captura cualquier error no manejado en los bloques try-catch internos
    Logger.log("Error GLOBAL no capturado en doPost: " + globalError.message + " Stack: " + globalError.stack);
    return createErrorResponse("An unexpected server error occurred: " + globalError.message); 
  }
}

/**
 * Crea y devuelve una respuesta JSON de éxito.
 * @param {string} message El mensaje de éxito.
 * @returns {GoogleAppsScript.Content.TextOutput} La respuesta HTTP.
 */
function createSuccessResponse(message) {
  const responseOutput = ContentService.createTextOutput(JSON.stringify({ status: "success", message: message }));
  responseOutput.setMimeType(ContentService.MimeType.JSON);
  return responseOutput;
}

/**
 * Crea y devuelve una respuesta JSON de error.
 * @param {string} message El mensaje de error.
 * @returns {GoogleAppsScript.Content.TextOutput} La respuesta HTTP.
 */
function createErrorResponse(message) {
  const responseOutput = ContentService.createTextOutput(JSON.stringify({ status: "error", message: message }));
  responseOutput.setMimeType(ContentService.MimeType.JSON);
  return responseOutput;
}
/**
 * Función auxiliar para validar un formato de correo electrónico básico.
 * @param {string} email La cadena de correo electrónico a validar.
 * @returns {boolean} Verdadero si el correo parece válido, falso en caso contrario.
 */
function isValidEmail(email) {
  // Expresión regular simple para validar formato de correo electrónico
  return /\S+@\S+\.\S+/.test(email);
}

/**
 * Función para configurar los encabezados de la hoja de cálculo si es nueva.
 * Puedes ejecutarla manualmente una vez después de crear la hoja.
 */
function setupSheetHeaders() {
  try {
    const ss = SpreadsheetApp.openById(ID_SHEET);
    let sheet = ss.getSheetByName(NOMBRE_HOJA);

    if (!sheet) {
      sheet = ss.insertSheet(NOMBRE_HOJA);
      Logger.log(`Hoja '${NOMBRE_HOJA}' creada.`);
    }

    // Limpiar y añadir encabezados si la primera fila está vacía o no tiene los esperados
    const headerRange = sheet.getRange(1, 1, 1, 6); // Asumiendo 6 columnas
    const headers = headerRange.getValues()[0];

    if (headers.join('') === '' || headers[0] !== "Nombre Archivo") { // Simple check if headers are missing
      sheet.clearContents(); // Clear existing content if any
      sheet.appendRow(["Nombre Archivo", "Bucket", "Tamaño (bytes)", "Tipo Contenido", "Fecha Creación", "Origen"]);
      Logger.log("Encabezados de la hoja de cálculo configurados.");
    } else {
      Logger.log("Los encabezados de la hoja ya existen.");
    }
  } catch (error) {
    Logger.log("Error en setupSheetHeaders: " + error.message + " Stack: " + error.stack);
  }
}


// --- Notas importantes para el despliegue y uso ---
// 1. Crea una NUEVA Google Sheet (ej. "Registro de Archivos Cloud Storage").
//    Copia su ID de la URL (ej. https://docs.google.com/spreadsheets/d/YOUR_GOOGLE_SHEET_ID_HERE/edit).
//    Pega este ID en la constante SPREADSHEET_ID de este script.
// 2. Abre el editor de Apps Script (puedes ir a script.google.com/home y crear un nuevo proyecto,
//    o desde tu Google Sheet, Extensiones > Apps Script).
// 3. Copia y pega este código en el archivo 'Código.gs'.
// 4. Actualiza las constantes SECRET_TOKEN y NOTIFICATION_EMAIL.
// 5. Opcional: Ejecuta la función `setupSheetHeaders` una vez desde el editor de Apps Script
//    (selecciona la función en el menú desplegable y haz clic en "Ejecutar") para asegurarte
//    de que tu hoja tenga los encabezados correctos.
// 6. Despliega el script como una Web App:
//    - En el editor de Apps Script, ve a 'Desplegar' > 'Nueva implementación'.
//    - Selecciona 'Tipo': 'Aplicación web'.
//    - 'Ejecutar como': 'Yo'.
//    - 'Acceso': 'Cualquier persona'.
//    - Haz clic en 'Desplegar'.
//    - Copia la 'URL de la aplicación web' y pégala en la constante APPS_SCRIPT_WEB_APP_URL
//      en tu Cloud Function (main.py).
// 7. Autoriza el script cuando se te solicite (la primera vez que lo despliegues o ejecutes).
