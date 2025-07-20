import json
import os
import logging
import requests
import functions_framework
from google.cloud import storage

# Configuración básica del logger para la función.
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuración del webhook de Apps Script
APPS_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw3ktuue6_x_SzbGFb58CS5nbttsLvpi5Nzd9fdPaM6egVlywNsll2UaTbwuFsIX8Re/exec"

# IMPORTANTE: Este es el token secreto pre-compartido.
# En un entorno de producción, esto debería estar en GCP Secret Manager.
WEBHOOK_SECRET_TOKEN = os.environ.get('WEBHOOK_SECRET_TOKEN', '12345')

# Decorador para indicar que esta es una función CloudEvents
@functions_framework.cloud_event
def procesar_archivo_gcs(cloud_event):
    """
    Cloud Function que se activa al subir un archivo a Cloud Storage,
    utilizando el formato CloudEvents.
    Extrae metadatos del archivo y los registra en Cloud Logging.

    Args:
        cloud_event (functions_framework.cloud_events.CloudEvent):
            El objeto CloudEvent que contiene información sobre el evento.
            Para eventos de Cloud Storage, el 'data' contendrá los metadatos del objeto.
    """
    data = cloud_event.data

    event_id = cloud_event["id"]
    event_type = cloud_event["type"]
    timestamp = cloud_event["time"]

    if not data or not isinstance(data, dict):
        logger.error("Error: Los datos del evento recibidos no son válidos o están vacíos.")
        return

    bucket_name = data.get('bucket')
    file_name = data.get('name')
    file_size = data.get('size')
    content_type = data.get('contentType')
    metageneration = data.get('metageneration')

    if not all([bucket_name, file_name, file_size, content_type]):
        logger.error(f"Error: Faltan metadatos esenciales en el evento. Datos: {data}")
        return

    logger.info(f"[{event_id}] Activado por evento CloudEvent de Cloud Storage a las {timestamp}.")
    logger.info(f"[{event_id}] Tipo de Evento: {event_type}")
    logger.info(f"[{event_id}] Procesando archivo: '{file_name}' en el bucket: '{bucket_name}'.")
    logger.info(f"[{event_id}] Detalles del archivo:")
    logger.info(f"   - Tamaño: {file_size} bytes")
    logger.info(f"   - Tipo de Contenido: {content_type}")
    logger.info(f"   - Metageneración: {metageneration}")

    payload = {
        "fileName": file_name,
        "bucketName": bucket_name,
        "fileSize": file_size,
        "contentType": content_type,
        "timeCreated": timestamp,
        "source": "CloudStorage"
    }

    # Los headers ya no necesitan el Authorization, solo Content-Type para el JSON body
    headers = {
        "Content-Type": "application/json"
    }

    # El token se envía como un parámetro de consulta
    params = {
        "token": WEBHOOK_SECRET_TOKEN
    }

    try:
        actual_file_size = int(file_size)

        if not content_type.startswith('text/') and not content_type.startswith('application/'):
            logger.warning(f"[{event_id}] Archivo '{file_name}' con tipo de contenido '{content_type}' no es un tipo de texto o aplicación esperado. Saltando procesamiento específico.")

        if actual_file_size > 10 * 1024 * 1024: # 10 MB
            logger.warning(f"[{event_id}] Archivo '{file_name}' es muy grande ({actual_file_size} bytes). Considerar procesamiento asíncrono o división.")

        logger.info(f"[{event_id}] Metadatos de '{file_name}' extraídos y registrados exitosamente.")

        #------------------Proceso de mandar a Apps Script-------------------
        
        logger.info(f"[{event_id}] Enviando metadatos a Apps Script Web App: {APPS_SCRIPT_WEB_APP_URL}")
        logger.info(f"[{event_id}] Headers que se enviarán: {headers}")
        logger.info(f"[{event_id}] Parámetros de consulta que se enviarán: {params}") # Nuevo log para params

        # Pasa los parámetros de consulta usando el argumento 'params'
        response = requests.post(APPS_SCRIPT_WEB_APP_URL, headers=headers, params=params, data=json.dumps(payload))
        response.raise_for_status()

        logger.info(f"[{event_id}] Solicitud a Apps Script Web App exitosa. Estado: {response.status_code}, Respuesta: {response.text}")

    except requests.exceptions.RequestException as e:
        logger.error(f"[{event_id}] Error al enviar metadatos a Apps Script Web App: {e}", exc_info=True)
    except ValueError as ve:
        logger.error(f"[{event_id}] Error al convertir el tamaño del archivo '{file_name}': {ve}", exc_info=True)
    except Exception as e:
        logger.error(f"[{event_id}] Error inesperado al procesar el archivo '{file_name}': {e}", exc_info=True)
