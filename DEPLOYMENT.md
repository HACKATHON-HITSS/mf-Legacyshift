# Configuración de Despliegue - Legacyshift

## Variables de Entorno Requeridas

Para que Legacyshift funcione correctamente con Huawei MaaS en producción, necesitas configurar las siguientes variables de entorno en tu plataforma de despliegue:

### Variables Principales

```env
HUAWEI_MAAS_API_KEY=<tu-clave-api-de-huawei>
HUAWEI_MAAS_MODEL=glm-5.2
```

- **HUAWEI_MAAS_API_KEY**: Tu clave API de Huawei MaaS (obtener en https://www.huaweicloud.com/)
- **HUAWEI_MAAS_MODEL**: El modelo de IA habilitado en tu cuenta (ejemplo: `glm-5.2`, `glm-4v`, etc.)

## Plataformas de Despliegue

### Vercel (Recomendado)

1. Ve a tu proyecto en [Vercel](https://vercel.com)
2. Abre **Settings** → **Environment Variables**
3. Añade las dos variables:
   - `HUAWEI_MAAS_API_KEY` = `tu-clave-aqui`
   - `HUAWEI_MAAS_MODEL` = `glm-5.2`
4. Redeploy el proyecto

### Netlify

1. Ve a **Site Settings** → **Build & deploy** → **Environment**
2. Añade las variables de entorno
3. Trigger un redeploy

### Azure App Service

1. En Azure Portal, ve a tu App Service
2. **Settings** → **Configuration** → **Application settings**
3. Añade:
   - `HUAWEI_MAAS_API_KEY`
   - `HUAWEI_MAAS_MODEL`

### AWS

Para AWS Lambda o EC2:

```bash
export HUAWEI_MAAS_API_KEY=tu-clave-aqui
export HUAWEI_MAAS_MODEL=glm-5.2
npm run start:analysis-api
```

## Estructura de Despliegue

El proyecto tiene dos componentes:

1. **Frontend Angular** (aplicación web)
   - Se despliega estáticamente en Vercel/Netlify
   - No necesita variables de entorno

2. **Servidor de Análisis** (`npm run start:analysis-api`)
   - Actúa como intermediario con Huawei
   - **REQUIERE** las variables `HUAWEI_MAAS_API_KEY` y `HUAWEI_MAAS_MODEL`
   - Debe ejecutarse en el mismo origen que el frontend o detrás de un proxy

## Arquitectura de Seguridad

⚠️ **IMPORTANTE**: Las credenciales de Huawei se guardan en el servidor local y **nunca** se envían al navegador.

### Flujo de Seguridad

```
Frontend (Navegador)
    ↓ (sin credenciales)
Servidor Local (`npm run start:analysis-api`)
    ↓ (con credenciales en memoria)
API de Huawei MaaS
```

### Limitaciones de Seguridad Implementadas

- Solo acepta conexiones de `localhost` (127.0.0.1)
- Solo permite orígenes de `4201` y `4211` (desarrollo)
- Limita tamaño de cuerpo a 128 KB
- Limita a 10 consultas por minuto
- Omite credenciales en respuestas de error
- Almacena credenciales solo en memoria (no en disco)

## Despliegue Completo

### Opción 1: Despliegue Solo Frontend (Desarrollo)

Si solo despliegas el frontend:

1. Las credenciales se configuran localmente en tu máquina de desarrollo
2. El usuario final usa **"Conectar con IA"** en la interfaz
3. El servidor se inicia localmente con las variables

```bash
npm run start:analysis-api &   # Terminal 1
npm start                       # Terminal 2 - Frontend
```

### Opción 2: Despliegue Completo (Producción)

Para una solución de producción robusta:

1. **Backend autenticado**: Integra el servidor en tu backend con autenticación por usuario
2. **API Gateway**: Publica `/api/legacyshift/huawei` a través de tu gateway
3. **Variables de Servidor**: Las credenciales se inyectan en tiempo de despliegue

Ejemplo con Docker:

```dockerfile
FROM node:24-alpine

WORKDIR /app
COPY . .
RUN npm ci --omit=dev

ENV NODE_OPTIONS=--env-file=.env.production
ENV HUAWEI_MAAS_API_KEY=${HUAWEI_MAAS_API_KEY}
ENV HUAWEI_MAAS_MODEL=${HUAWEI_MAAS_MODEL}

EXPOSE 3000
CMD ["node", "server/huawei-server.mjs"]
```

## Consumo de Tokens

Cada consulta a Huawei consume tokens según la configuración de tu cuenta.

### Optimización de Tokens

1. **Contexto limitado**: El servidor envía máximo 128 KB de contexto
2. **Fragmentos pequeños**: Selecciona métodos específicos, no archivos completos
3. **Modo Mock**: Prueba con `npm run start:analysis-api:mock` (sin consumo)
4. **Monitoreo**: Configura alertas en Huawei para monitorear consumo

### Cálculo de Consumo

- **Por consulta**: ~500-1000 tokens (dependiendo del modelo y contexto)
- **Verificación de conexión**: ~32 tokens (única al conectar)
- **Modo mock**: 0 tokens (simulación local)

## Verificación de Despliegue

1. El servidor debe estar en línea:
   ```bash
   curl http://localhost:3000/api/legacyshift/huawei/connection
   # Respuesta: {"configured": false, "verified": false, "model": "", "url": "..."}
   ```

2. Después de configurar variables:
   ```bash
   npm run start:analysis-api
   # Debe mostrar: "Servicio local de análisis en http://127.0.0.1:4212"
   ```

3. En el navegador, abre **Conectar con IA** e introduce tu clave

## Solución de Problemas

### Error: "No se pudo contactar al servicio local de IA"

- ✅ Verifica que `npm run start:analysis-api` está ejecutándose
- ✅ Comprueba que puerto 4212 (desarrollo) o 3000 está disponible
- ✅ Verifica firewall y políticas de red

### Error: "Huawei rechazó la llave"

- ✅ Verifica que `HUAWEI_MAAS_API_KEY` es correcta
- ✅ Comprueba que la clave no tiene espacios ni caracteres ocultos
- ✅ Verifica que la clave tiene permisos para usar la API de MaaS

### Error: "La cuenta no tiene acceso al modelo"

- ✅ Verifica que `HUAWEI_MAAS_MODEL` está habilitado en tu cuenta
- ✅ El modelo debe coincidir exactamente (ej: `glm-5.2`, no `GLM-5.2`)

### Error: "Huawei alcanzó la cuota"

- ✅ Limpia el histórico de consultas en la consola de Huawei
- ✅ Verifica tu plan de créditos en Huawei Cloud
- ✅ Reduce el tamaño del contexto o espera a que se renueve la cuota

## Archivos de Configuración

- `.env.example` - Plantilla de variables (segura, versionada)
- `.env` - Archivo local con credenciales (gitignored, NO se sube)
- `vercel.json` - Configuración de Vercel
- `Dockerfile` - Contenedor para despliegue
- `nginx/` - Configuración de reverse proxy

Ver `README.md` para más detalles sobre funcionamiento local y modo mock.
