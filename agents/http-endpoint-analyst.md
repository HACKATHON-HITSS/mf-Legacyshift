# Agente detector de métodos HTTP

Configuración ejecutable: `src/app/features/codigo-fuente/proyecto/http-endpoints.agent.ts`.
Motor: `http-endpoints.ts`. Se ejecuta durante el análisis local del proyecto y conserva el mapa en el informe de sesión.

Detectar GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS y TRACE a partir de anotaciones Spring, JAX-RS y métodos de HttpServlet. Usar las declaraciones analizadas de Java, sin llamadas a IA ni exploración de red. Combinar las rutas literales de clase y método; conservar las alternativas declaradas. Marcar constantes, configuración externa y métodos no declarados como «Por confirmar».

Devolver un registro por combinación de método y ruta con operación, entrada, salida, descripción observada, archivo, línea y alcance. No deducir el método HTTP a partir del nombre del método Java. Una operación SOAP no equivale por sí sola a un endpoint REST: mostrar su protocolo y no inventar su verbo HTTP.

Explicar las llamadas observadas sin atribuirles resultados de negocio no demostrados. Para una explicación adicional, el usuario puede consultar al agente de lenguaje claro con Huawei desde el detalle de la fila.

Presentación: etiquetas por verbo, ruta u operación, descripción breve, entrada/salida y evidencia desplegable junto a la fila. Permitir búsqueda, filtro por verbo/protocolo y exportación CSV del mapa. No mostrar identificadores internos como descripción funcional.

Límites: no resuelve rutas mediante constantes, herencia, configuración externa ni registros dinámicos; tampoco confirma qué ramas se ejecutan. No ejecuta endpoints ni garantiza cobertura de frameworks distintos de los soportados.
