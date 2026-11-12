import { CodeFinding } from '../features/codigo-fuente/proyecto/project-findings';
import { ProcedureAnalysis } from '../features/codigo-fuente/proyecto/stored-procedures';

export function presentTechnicalDebt(finding: CodeFinding, procedures: readonly ProcedureAnalysis[] = []) {
  let kind = 'other', label = 'Revisión técnica', title = finding.title;
  let reason = 'El análisis encontró un punto que necesita revisión manual.';
  let nextStep = finding.action;
  if (finding.title.startsWith('Procedimiento configurado')) {
    kind = 'procedure'; label = 'Uso por confirmar'; title = 'Confirmar si esta operación de base de datos se utiliza';
    reason = finding.title.endsWith('sin uso')
      ? 'Está declarada en la configuración, pero no se encontraron referencias en los archivos analizados.'
      : 'Se encontró su configuración, pero no se pudo seguir su uso hasta una llamada a la base de datos.';
    nextStep = 'Pide al responsable confirmar dónde se utiliza. Si sigue activa, inclúyela en la migración; si ya no se usa, evalúa retirarla.';
  } else if (finding.title.includes('Pendiente declarado')) {
    kind = 'comment'; label = 'Pendiente en comentario'; title = 'Confirmar si este pendiente sigue vigente';
    reason = 'El código contiene una marca TODO, FIXME o HACK. Puede señalar trabajo pendiente, aunque también puede formar parte de un comentario informativo.';
    nextStep = 'Lee el comentario y confirma con el equipo si falta un cambio. Si ya se resolvió, actualiza o retira la nota.';
  } else if (finding.title === 'Excepción ignorada') {
    kind = 'error'; label = 'Manejo de errores'; title = 'Revisar qué pasa cuando ocurre un error';
    reason = 'Se encontró un bloque que recibe un error y no contiene instrucciones para tratarlo.';
    nextStep = 'Confirma si ignorar ese error es intencional. Si no lo es, define cómo registrarlo o comunicarlo antes de migrar.';
  } else if (finding.title.includes('Recursión')) {
    kind = 'recursion'; label = 'Repetición de llamadas'; title = 'Comprobar cómo termina esta repetición';
    reason = 'Se detectaron llamadas que vuelven al mismo método, sin una condición de salida reconocida por el análisis.';
    nextStep = 'Revisa con desarrollo qué detiene las llamadas. Si no existe una salida, corrígela y comprueba el comportamiento.';
  }
  const procedure = kind === 'procedure' ? procedures.find(item => item.path === finding.path && item.line === finding.line && finding.condition === `${item.key} = ${item.procedure}`) : undefined;
  const references = procedure ? [...new Map(procedure.usages.map(usage => [`${usage.path}:${usage.line}`, {
    path: usage.path, fileName: usage.path.split(/[\\/]/).pop() ?? usage.path, line: usage.line
  }])).values()] : [];
  const explanations: Record<string, { confirmed: string; missing: string; conclusion: string; decisions: { when: string; action: string }[] }> = {
    procedure: {
      confirmed: 'La operación está declarada en un archivo de configuración.' + (references.length ? ` También se ${references.length === 1 ? 'encontró 1 referencia' : `encontraron ${references.length} referencias`} en otros puntos del código; una referencia no confirma que se ejecute.` : ''),
      missing: 'Comprobar si alguna función del sistema llega a ejecutar esta operación. El análisis no pudo confirmarlo con los archivos disponibles.',
      conclusion: 'Uso pendiente de confirmar. Con esta evidencia no se puede concluir que deba eliminarse.',
      decisions: [{ when: 'Si el equipo confirma que se utiliza', action: 'Conservarla e incluirla en las pruebas de migración.' }, { when: 'Si el equipo confirma que ya no se necesita', action: 'Evaluar su retiro y comprobar que ninguna función dependa de ella.' }, { when: 'Si todavía no se puede confirmar', action: 'Mantenerla y registrar la revisión pendiente.' }]
    },
    comment: {
      confirmed: 'Hay una marca TODO, FIXME o HACK en el código o sus comentarios.',
      missing: 'Confirmar si describe una tarea pendiente, una nota informativa o un cambio ya resuelto.',
      conclusion: 'La marca por sí sola no demuestra un error ni una tarea pendiente vigente.',
      decisions: [{ when: 'Si el trabajo sigue pendiente', action: 'Definir el cambio y acordar cuándo resolverlo.' }, { when: 'Si ya se resolvió o solo es una nota', action: 'Actualizar el comentario para evitar confusiones.' }]
    },
    error: {
      confirmed: 'Se detectó un bloque de manejo de errores sin instrucciones.',
      missing: 'Confirmar si ignorar ese error es intencional y qué necesita saber el usuario cuando ocurre.',
      conclusion: 'Hace falta validar el comportamiento esperado antes de cambiar el manejo del error.',
      decisions: [{ when: 'Si ignorarlo está justificado', action: 'Documentar el motivo.' }, { when: 'Si el error debe tratarse', action: 'Definir y probar cómo registrarlo o comunicarlo.' }]
    },
    recursion: {
      confirmed: 'El análisis encontró un ciclo de llamadas sin una salida reconocida.',
      missing: 'Verificar si la ejecución se detiene por una condición o comportamiento que el análisis no pudo reconocer.',
      conclusion: 'Revisar con desarrollo cómo terminan estas llamadas antes de migrarlas.',
      decisions: [{ when: 'Si existe una salida válida', action: 'Documentarla y probar el caso que termina la repetición.' }, { when: 'Si no existe una salida', action: 'Corregir y probar el ciclo de llamadas.' }]
    }
  };
  const explanation = explanations[kind] ?? { confirmed: reason, missing: 'Validar el contexto con el responsable del código.', conclusion: 'Requiere revisión manual.', decisions: [{ when: 'Siguiente paso', action: nextStep }] };
  return { ...finding, ...explanation, references, kind, label, reviewTitle: title, reason, nextStep, fileName: finding.path.split(/[\\/]/).pop() ?? finding.path };
}
