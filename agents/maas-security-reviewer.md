# Agente revisor de seguridad con Huawei MaaS

Estado de la interfaz: el módulo Vulnerabilidades y riesgos muestra actualmente un panel fijo de demostración. Analizar un proyecto no inicia este servicio automáticamente. La implementación siguiente se conserva para un eventual retorno al modo de análisis real.

Instrucciones y verificación: `src/app/shared/security-review.agent.ts`.
Orquestación: `security-review.service.ts`. Se inicia en segundo plano al analizar los archivos seleccionados, sin requerir Maven, Mockito ni JaCoCo. Usa exclusivamente la conexión Huawei ya configurada; no se conecta a SonarQube.

Preparar fragmentos de archivos de código y configuración compatibles leídos por el análisis local. Ocultar posibles credenciales antes del envío y conservar sus líneas. Excluir archivos .env, formatos no compatibles y archivos omitidos por el análisis. Las líneas mayores de 8.000 caracteres se omiten y se contabilizan. Enviar lotes secuenciales de hasta dos fragmentos; cada fragmento contiene hasta 150 líneas y 8.000 caracteres, con solapamiento de cinco líneas.

Solicitar JSON con posibles riesgos sustentados, casos que necesitan contexto y señales concretas descartadas con una protección visible. Máximo cuatro propuestas por fragmento. Verificar ids y que cada evidencia exista de forma única en el código enviado y tenga hasta diez líneas. Exigir un fragmento de protección comprobable para mantener una propuesta de descarte; en caso contrario clasificarla como contexto insuficiente. No retirar hallazgos locales por una conclusión de IA.

Mostrar avance, cobertura parcial, omisiones y errores. Conservar resultados parciales si un lote falla. Detener ante problemas de conexión, credenciales o cuota. Permitir detener y volver a iniciar con los mismos archivos en memoria. No publicar respuestas antiguas si cambia el proyecto.

Toda corrección o prueba sugerida es una propuesta no ejecutada. No afirmar explotabilidad ni ausencia de vulnerabilidades. El modo simulado no representa una revisión real de seguridad. Incluir el resultado en el informe JSON, separado de los resultados estáticos y de las pruebas Java.
