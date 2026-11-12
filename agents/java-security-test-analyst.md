# Agente de pruebas Java y cobertura

Estado de la interfaz: el módulo Vulnerabilidades y riesgos muestra actualmente un panel fijo de demostración. Analizar un proyecto no ejecuta estas pruebas automáticamente. El ejecutor local se conserva para un eventual retorno al modo real.

Ejecutor: `server/java-test-agent.mjs`. Preparación de copias: `server/java-project-upload.mjs`. Entrada local: `POST /api/legacyshift/java-tests` con `projectName` y `files` (ruta relativa y contenido base64). La interfaz normal no solicita rutas del equipo.

No conectar a SonarQube. Al pulsar Analizar en Seleccionar proyecto, usar los mismos archivos seleccionados o extraídos del ZIP. Ejecutar sobre una copia temporal del servidor local y mostrar resultados en Vulnerabilidades y riesgos. Requiere Java, Maven, pom.xml y pruebas existentes. Sin pom.xml, registrar explícitamente «No se ejecutaron pruebas», sin fingir cobertura. Ejecuta los tests con JaCoCo 0.8.15 y mantiene la configuración de Mockito que ya tenga el proyecto; no agrega mocks o tests ficticios para aparentar cobertura.

Validar las rutas recibidas, rechazar recorridos fuera de la copia, rutas Windows reservadas, duplicados y cargas excesivas. No copiar dependencias instaladas, resultados de compilación anteriores ni archivos .env. Limpiar la copia temporal al terminar, verificando antes que su ruta siga dentro del directorio temporal esperado. No modificar la carpeta original.

Antes de interpretar resultados, distinguir:

- Fallo de compilación: no se comprobó el comportamiento del proyecto.
- Sin pruebas o todas omitidas: no hay evidencia de comportamiento.
- Pruebas fallidas: identificar la expectativa y el comportamiento observado; no asumir que todo fallo es una vulnerabilidad.
- Pruebas aprobadas: solo respaldan los escenarios probados.
- Cobertura JaCoCo: informa líneas y ramas ejecutadas, no seguridad.

Para diseñar una prueba de seguridad sobre código real, usar JUnit y Mockito cuando corresponda para aislar servicios externos, manteniendo real la lógica que se quiere validar. Probar entradas inválidas, falta de permisos, construcción de SQL con parámetros, escape de salida y manejo de errores según el hallazgo. Documentar el resultado esperado y demostrar que la prueba falla ante la implementación vulnerable; un mock configurado para devolver el resultado esperado no valida esa implementación.

Si faltan fuentes, dependencias, build o tests, reportar el requisito concreto. No marcar el proyecto como seguro. Usar únicamente informes creados o modificados por la ejecución actual; no reutilizar informes viejos ni sumar coberturas agregadas a las de sus módulos. El modo actual ejecuta pruebas unitarias Maven, no Gradle ni tests de integración.

Las pruebas ejecutan código local. Sus dependencias Maven pueden descargarse. No se envía el código a Sonar ni a Huawei. El runner elimina tokens y secretos del entorno heredado y no devuelve logs de Maven que puedan contener datos sensibles. No ofrece aislamiento del sistema operativo.
