export const ANALYSIS_SECTIONS = [
  { key: 'reglas', title: 'Matriz de reglas de negocio', description: 'Condiciones y acciones candidatas, trazables al código. Valida su significado antes de aprobarlas.' },
  { key: 'logica', title: 'Lógica y flujos de negocio', description: 'Métodos, iteraciones, retornos y excepciones observados. No representa un grafo completo de ejecución.' },
  { key: 'condiciones', title: 'Condiciones funcionales y técnicas', description: 'Decisiones de control detectadas. La clasificación funcional o técnica requiere revisar su contexto.' },
  { key: 'entradas-salidas', title: 'Entradas y salidas', description: 'Contratos WSDL, entradas HTTP y operaciones de persistencia detectadas.' },
  { key: 'datos-hardcodeados', title: 'Datos y valores hardcodeados', description: 'Asignaciones y configuraciones candidatas a externalizar. Los valores literales se omiten.' },
  { key: 'deuda-tecnica', title: 'Deuda técnica y código innecesario', description: 'Qué conviene revisar antes de migrar o mantener el sistema, por qué y cuál es el siguiente paso.' },
  { key: 'vulnerabilidades', title: 'Vulnerabilidades y riesgos', description: 'Señales de seguridad contrastadas con el código: qué se comprobó, qué falta confirmar y cómo revisarlo.' },
  { key: 'dependencias', title: 'Dependencias', description: 'Bibliotecas declaradas, imports externos y procedimientos almacenados configurados en properties con su uso en el código. Su compatibilidad y necesidad de migración quedan pendientes de evaluación.' },
  { key: 'arquitectura', title: 'Arquitectura actual y diagramas', description: 'Inventario agrupado por función estimada a partir de las rutas. No infiere relaciones de ejecución sin evidencia.' }
] as const;

export const DECISION_SECTIONS = [
  { key: 'aprobar-reglas', title: 'Revisar y aprobar reglas', description: 'Aprueba o descarta cada candidata y registra el motivo de tu decisión.' },
  { key: 'tecnologia', title: 'Tecnología de destino', description: 'Registra la tecnología elegida y su justificación para este proyecto.' },
  { key: 'arquitectura-objetivo', title: 'Arquitectura objetivo', description: 'Borrador de organización basado en las reglas aprobadas y la tecnología seleccionada.' },
  { key: 'chat', title: 'Chat sobre reglas y dudas', description: 'Consulta el informe y los componentes detectados mediante Huawei, con evidencia y selección opcional de flujo.' },
  { key: 'exportar', title: 'Exportar documentación y matrices', description: 'Descarga el informe, las matrices y las decisiones de esta sesión.' }
] as const;

export type SectionKey = typeof ANALYSIS_SECTIONS[number]['key'] | typeof DECISION_SECTIONS[number]['key'];
