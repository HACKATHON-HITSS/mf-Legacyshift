import { JavaAnalysis, JavaMethod } from './java-analysis';

export type HttpEndpoint = {
  id: string; verb: string; route: string; operation: string; description: string;
  input: string; output: string; path: string; line: number; scope: string;
};
const verbs = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'];
const shortName = (annotation: string) => /^@(?:[\w$]+\.)*([\w$]+)/.exec(annotation)?.[1] ?? '';

function declaredVerbs(annotations: string[]): string[] {
  return [...new Set(annotations.flatMap(annotation => {
    const name = shortName(annotation);
    if (verbs.includes(name)) return [name];
    const mapping = /^(Get|Post|Put|Patch|Delete|Head|Options)Mapping$/.exec(name);
    if (mapping) return [mapping[1].toUpperCase()];
    if (name !== 'RequestMapping') return [];
    return [...annotation.matchAll(/\bRequestMethod\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\b/g)].map(match => match[1]);
  }))];
}

function declaredRoutes(annotations: string[]): string[] | null {
  const annotation = annotations.find(value => /^(?:RequestMapping|GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|HeadMapping|OptionsMapping|Path|WebServlet)$/.test(shortName(value)));
  if (!annotation) return [''];
  const args = annotation.slice(annotation.indexOf('(') + 1, annotation.lastIndexOf(')')).trim();
  if (!annotation.includes('(') || !args) return [''];
  const value = /\b(?:path|value|urlPatterns)\s*=\s*(\{(?:[^{}"]|"(?:\\.|[^"\\])*")*\}|"(?:\\.|[^"\\])*"(?:\s*\+[^,]*)?|[^,]+)/.exec(args)?.[1]
    ?? (!/^\w+\s*=/.test(args) ? args : '');
  if (!value) return /\b(?:path|value|urlPatterns)\s*=/.test(args) ? null : [''];
  // Constants and expressions require configuration/type resolution; never fabricate a URL.
  const literals = [...value.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(match => match[1]);
  const remainder = value.replace(/"(?:\\.|[^"\\])*"/g, '').replace(/[{},\s]/g, '');
  return literals.length && !remainder ? literals : null;
}

export function describeJavaOperation(method: JavaMethod): string {
  const calls = method.calls.filter(call => !/^(?:log|debug|info|warn|error|trace)$/.test(call.name)).slice(0, 2);
  if (calls.length) return `Llama a ${calls.map(call => call.name).join(' y ')} para procesar la solicitud. El efecto de esas llamadas requiere revisar su implementación.`;
  return `Recibe ${method.parameters.length} parámetro(s) y ${method.returnType === 'void' ? 'no declara un valor de retorno' : `declara una respuesta de tipo ${method.returnType}`}. El propósito funcional requiere revisión.`;
}

export function mapHttpEndpoints(java: JavaAnalysis): HttpEndpoint[] {
  return java.methods.flatMap(method => {
    const owner = java.components.find(component => component.id === method.classId);
    const annotations = method.annotationSources ?? [];
    const classAnnotations = owner?.annotationSources ?? [];
    const servletVerb = owner?.kind === 'Servlet' ? /^do(Get|Post|Put|Patch|Delete|Head|Options|Trace)$/.exec(method.name)?.[1]?.toUpperCase() : undefined;
    const servletService = owner?.kind === 'Servlet' && method.name === 'service';
    const hasMapping = annotations.some(value => /^(?:RequestMapping|GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|HeadMapping|OptionsMapping|GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Path)$/.test(shortName(value)));
    if (!servletVerb && !servletService && !hasMapping) return [];
    const ownVerbs = declaredVerbs(annotations);
    const classVerbs = declaredVerbs(classAnnotations);
    const effectiveVerbs = servletVerb ? [servletVerb] : ownVerbs.length ? ownVerbs : classVerbs;
    const bases = declaredRoutes(classAnnotations);
    const paths = declaredRoutes(annotations);
    const routes = bases && paths ? bases.flatMap(base => paths.map(path => {
      if ((servletVerb || servletService) && !base) return 'Por confirmar';
      return `/${[base, path].map(part => part.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;
    })) : ['Por confirmar'];
    return (effectiveVerbs.length ? effectiveVerbs : ['Por confirmar']).flatMap(verb => routes.map((route, index) => ({
      id: `http:${method.id}:${verb}:${index}`, verb, route, operation: `${method.className}.${method.name}`,
      description: describeJavaOperation(method), input: method.parameters.join(', ') || 'Sin parámetros declarados',
      output: method.returnType === 'void' ? 'Sin valor de retorno declarado' : method.returnType,
      path: method.path, line: method.startLine,
      scope: 'Declaración estática. La ruta no incluye el dominio ni el contexto de despliegue. No confirma el comportamiento en ejecución.'
    })));
  });
}
