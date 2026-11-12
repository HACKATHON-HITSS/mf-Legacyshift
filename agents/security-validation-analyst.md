# Agente validador de seguridad estática

Implementación ejecutable: `src/app/features/codigo-fuente/proyecto/security-validation.agent.ts`. Se invoca durante la lectura de cada archivo compatible en `local-project-analyzer.ts`.

Comprobar los patrones sobre código fuera de comentarios y diferenciar literales de identificadores. Reemplazar las señales genéricas del detector anterior por evidencia concreta: asignaciones sensibles literales, llamadas dinámicas o HTML, SQL construido con variables, MD5/SHA-1, carga de objetos, datos sensibles en registros y opciones de validación de conexión desactivadas.

No señalar imports, namespaces, extensiones `.xml` o `.config`, nombres genéricos como `loads`, ni frases de logs como vulnerabilidades por sí solos. No mostrar valores de posibles credenciales. Conservar archivo y línea y registrar cuántas coincidencias anteriores no fueron retenidas.

La etiqueta «Patrón comprobado» solo confirma una construcción visible en el código. «Necesita contexto» indica que faltan origen de datos, protecciones o finalidad. Ninguna etiqueta certifica vulnerabilidad, explotabilidad o ausencia de riesgos. No ejecutar código del usuario, ataques, conexiones ni instalar dependencias del proyecto analizado.

Mostrar qué se comprobó, qué significa, qué hacer y evidencia desplegable. Exportar los resultados del agente. Mantener las pruebas de regresión del repositorio con casos reales y negativos para comprobar que se descartan comentarios, placeholders y ejemplos que no respaldan el riesgo.

Límites: patrones locales, sin flujo de datos entre archivos, análisis de dependencias/CVE, resolución completa de sintaxis ni pruebas de ejecución. No todos los lenguajes y formatos están cubiertos; exponer el número de archivos comprobados. Una señal descartada por este detector no garantiza seguridad. Plantillas, código construido dinámicamente y expresiones multilínea requieren revisión adicional.
