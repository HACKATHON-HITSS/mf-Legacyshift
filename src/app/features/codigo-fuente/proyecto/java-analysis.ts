import { parse, type CstNode } from 'java-parser';

export type Resolution = 'OBSERVED' | 'INFERRED' | 'UNRESOLVED';
export type JavaEvidence = { path: string; startLine: number; endLine: number; snippet: string; method: 'CST' };
export type JavaComponent = { id: string; name: string; packageName: string; kind: string; path: string; startLine: number; endLine: number; annotations: string[]; extends: string; implements: string[]; fields: { name: string; type: string }[]; evidence: JavaEvidence };
export type JavaCondition = { id: string; kind: string; expression: string; evidence: JavaEvidence };
export type JavaMethod = { id: string; classId: string; className: string; name: string; parameters: string[]; returnType: string; visibility: string; entryPoint: boolean; annotations: string[]; path: string; startLine: number; endLine: number; evidence: JavaEvidence; conditions: JavaCondition[]; calls: JavaCall[] };
export type JavaCall = { id: string; source: string; target: string | null; name: string; receiver: string; arity: number; resolution: Resolution; evidence: JavaEvidence; reason: string };
export type JavaAnalysis = { components: JavaComponent[]; methods: JavaMethod[]; calls: JavaCall[]; errors: { path: string; detail: string }[]; limitations: string[] };

const empty = (): JavaAnalysis => ({ components: [], methods: [], calls: [], errors: [], limitations: ['Análisis estático: las llamadas virtuales, reflexión, configuración externa y dependencias ausentes pueden alterar la ejecución.', 'Las conexiones resueltas por tipo declarado son posibles destinos, no una ejecución confirmada.'] });
export function emptyJavaAnalysis(): JavaAnalysis { return empty(); }
function children(node: CstNode): CstNode[] {
  return (Object.values(node.children).flat() as unknown[]).filter((value): value is CstNode => typeof value === 'object' && value !== null && 'name' in value && 'children' in value);
}
function descendants(node: CstNode, name: string): CstNode[] {
  const result: CstNode[] = [];
  const visit = (current: CstNode) => { if (current.name === name) result.push(current); for (const child of children(current)) visit(child); };
  visit(node); return result;
}
function direct(node: CstNode, name: string): CstNode | undefined { return children(node).find(child => child.name === name); }
function text(node: CstNode | undefined, source: string): string { return node ? source.slice(node.location.startOffset, node.location.endOffset + 1) : ''; }
function evidence(node: CstNode, path: string, source: string): JavaEvidence {
  return { path, startLine: node.location.startLine, endLine: node.location.endLine, snippet: text(node, source).slice(0, 2000), method: 'CST' };
}
function annotations(node: CstNode, source: string): string[] {
  return children(node).filter(child => /Modifier$/.test(child.name)).flatMap(child => descendants(child, 'annotation')).map(child => text(direct(child, 'typeName'), source));
}
function componentKind(name: string, annotationNames: string[], parent: string): string {
  if (/Servlet$/.test(name) || /Servlet$/.test(parent)) return 'Servlet';
  if (annotationNames.some(value => /Controller$/.test(value)) || /Controller$/.test(name)) return 'Controller';
  if (annotationNames.some(value => /Service$/.test(value)) || /Service(?:Impl)?$/.test(name)) return 'Service';
  if (annotationNames.some(value => /Repository$/.test(value)) || /(?:DAO|Dao|Repository)(?:Impl)?$/.test(name)) return 'Persistencia';
  if (annotationNames.some(value => /Entity$/.test(value))) return 'Entidad';
  return 'Clase';
}

export function parseJavaFile(source: string, path: string): JavaAnalysis {
  const result = empty();
  let tree: CstNode;
  try { tree = parse(source) as CstNode; }
  catch (error) { result.errors.push({ path, detail: `No se pudo interpretar Java: ${error instanceof Error ? error.message.slice(0, 500) : 'error sintáctico'}` }); return result; }
  const pkg = descendants(tree, 'packageDeclaration')[0];
  const packageName = text(pkg, source).replace(/^\s*package\s+/, '').replace(/\s*;\s*$/, '').trim();
  const nodes = descendants(tree, 'normalClassDeclaration');
  for (const node of nodes) {
    const name = text(direct(node, 'typeIdentifier'), source);
    if (!name) continue;
    const parentNode = descendants(tree, 'classDeclaration').find(candidate => direct(candidate, 'normalClassDeclaration') === node);
    const annotationNames = parentNode ? annotations(parentNode, source) : [];
    const parent = text(direct(node, 'classExtends'), source).replace(/^extends\s+/, '').trim();
    const implemented = text(direct(node, 'classImplements'), source).replace(/^implements\s+/, '').split(',').map(value => value.trim()).filter(Boolean);
    const component: JavaComponent = { id: `class:${path}:${node.location.startLine}:${name}`, name, packageName, kind: componentKind(name, annotationNames, parent), path, startLine: node.location.startLine, endLine: node.location.endLine, annotations: annotationNames, extends: parent, implements: implemented, fields: [], evidence: evidence(node, path, source) };
    result.components.push(component);
  }
  for (const component of result.components) {
    const owner = nodes.find(node => node.location.startLine === component.startLine && text(direct(node, 'typeIdentifier'), source) === component.name)!;
    const owned = (node: CstNode) => !nodes.some(other => other !== owner && other.location.startOffset > owner.location.startOffset && other.location.endOffset < owner.location.endOffset && node.location.startOffset >= other.location.startOffset && node.location.endOffset <= other.location.endOffset);
    for (const field of descendants(owner, 'fieldDeclaration').filter(owned)) {
      const fieldType = text(direct(field, 'unannType'), source).trim();
      for (const variable of descendants(field, 'variableDeclaratorId')) {
        const name = text(variable, source).replace(/\[\s*\]/g, '').trim();
        if (name && fieldType) component.fields.push({ name, type: fieldType });
      }
    }
    for (const node of descendants(owner, 'methodDeclaration').filter(owned)) {
      const header = direct(node, 'methodHeader');
      const declarator = header && direct(header, 'methodDeclarator');
      const token = declarator?.children['Identifier']?.[0];
      const name = token && 'image' in token ? token.image : '';
      if (!name || !header || !declarator) continue;
      const parameters = descendants(declarator, 'formalParameter').map(param => text(param, source));
      const annotationNames = annotations(node, source);
      const signature = `${name}(${parameters.join(',')})`;
      const method: JavaMethod = { id: `method:${component.id}:${signature}:${node.location.startLine}`, classId: component.id, className: component.name, name, parameters, returnType: text(direct(header, 'result'), source), visibility: /\b(public|private|protected)\b/.exec(text(node, source).slice(0, 120))?.[1] ?? 'package', annotations: annotationNames,
        entryPoint: (component.kind === 'Servlet' && /^(?:service|doGet|doPost|doPut|doDelete|doPatch)$/.test(name)) || annotationNames.some(value => /^(?:RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|GET|POST|PUT|DELETE|Path)$/.test(value)),
        path, startLine: node.location.startLine, endLine: node.location.endLine, evidence: evidence(node, path, source), conditions: [], calls: [] };
      const body = direct(node, 'methodBody');
      if (body) {
        for (const kind of ['ifStatement', 'switchStatement', 'basicForStatement', 'enhancedForStatement', 'whileStatement', 'doStatement', 'tryStatement', 'catchClause', 'returnStatement', 'throwStatement', 'conditionalExpression']) {
          for (const part of descendants(body, kind)) {
            // Every expression is wrapped in conditionalExpression; only ternaries carry a QuestionMark.
            if (kind === 'conditionalExpression' && !part.children['QuestionMark']) continue;
            const expression = direct(part, 'expression');
            method.conditions.push({ id: `control:${method.id}:${kind}:${part.location.startOffset}`, kind, expression: (expression ? text(expression, source) : text(part, source)).slice(0, 500), evidence: evidence(part, path, source) });
          }
        }
        for (const primary of descendants(body, 'primary')) {
          const suffix = children(primary).find(child => child.name === 'primarySuffix' && direct(child, 'methodInvocationSuffix'));
          if (!suffix) continue;
          const prefix = direct(primary, 'primaryPrefix');
          // `this.name(...)` keeps `name` in a primarySuffix, so include the suffixes before the invocation.
          const raw = prefix ? source.slice(prefix.location.startOffset, suffix.location.startOffset).replace(/\s+/g, '') : '';
          if (!/^(?:this\.)?[\w$]+(?:\.[\w$]+)*$/.test(raw)) continue;
          const parts = raw.split('.');
          const callName = parts.pop()!;
          const args = direct(direct(suffix, 'methodInvocationSuffix')!, 'argumentList');
          const arity = args ? children(args).filter(child => child.name === 'expression').length : 0;
          method.calls.push({ id: `call:${method.id}:${primary.location.startOffset}`, source: method.id, target: null, name: callName, receiver: parts.join('.'), arity, resolution: 'UNRESOLVED', evidence: evidence(primary, path, source), reason: 'Destino no resuelto con los archivos disponibles.' });
        }
      }
      result.methods.push(method);
    }
  }
  result.calls = result.methods.flatMap(method => method.calls);
  return result;
}

export function resolveJavaAnalysis(parts: JavaAnalysis[]): JavaAnalysis {
  const result = empty();
  result.components = parts.flatMap(part => part.components);
  result.methods = parts.flatMap(part => part.methods);
  result.errors = parts.flatMap(part => part.errors);
  for (const method of result.methods) {
    const owner = result.components.find(component => component.id === method.classId)!;
    for (const call of method.calls) {
      const receiver = call.receiver.replace(/^this\./, '');
      const field = owner.fields.find(item => item.name === receiver);
      const targetName = !receiver || receiver === 'this' ? owner.name : field?.type.replace(/<.*$/, '').split('.').pop();
      const matchingClasses = targetName ? result.components.filter(component => component.name === targetName) : [];
      const candidates = result.methods.filter(target => matchingClasses.some(component => component.id === target.classId) && target.name === call.name && target.parameters.length === call.arity);
      if (matchingClasses.length === 1 && candidates.length === 1) {
        call.target = candidates[0].id;
        call.resolution = 'INFERRED';
        call.reason = 'Destino candidato por tipo declarado y número de argumentos; la ejecución dinámica no está confirmada.';
      } else if (candidates.length > 1 || matchingClasses.length > 1) call.reason = 'Destino ambiguo: existen varias clases o sobrecargas compatibles.';
    }
  }
  result.calls = result.methods.flatMap(method => method.calls);
  return result;
}

export type RecursionCycle = { methods: JavaMethod[]; calls: JavaCall[] };

const BRANCHING_KINDS = new Set(['ifStatement', 'switchStatement', 'basicForStatement', 'enhancedForStatement', 'whileStatement', 'doStatement', 'catchClause', 'conditionalExpression']);

function hasBranching(method: JavaMethod): boolean {
  // `&&` and `||` short-circuit and can stop a recursive call without an explicit statement.
  return method.conditions.some(condition => BRANCHING_KINDS.has(condition.kind)) || /&&|\|\|/.test(method.evidence.snippet);
}

/**
 * Cycles of resolved calls (direct or mutual recursion) in which no method has a branch that could stop
 * the recursion. Only INFERRED calls are followed, so unresolved or ambiguous calls never create a cycle.
 */
export function recursionWithoutExit(analysis: JavaAnalysis): RecursionCycle[] {
  const byId = new Map(analysis.methods.map(method => [method.id, method]));
  const targets = (method: JavaMethod) => method.calls.filter(call => call.target && byId.has(call.target)).map(call => call.target!);
  // Tarjan's strongly connected components.
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let counter = 0;
  const visit = (id: string) => {
    index.set(id, counter); low.set(id, counter); counter++;
    stack.push(id); onStack.add(id);
    for (const next of targets(byId.get(id)!)) {
      if (!index.has(next)) { visit(next); low.set(id, Math.min(low.get(id)!, low.get(next)!)); }
      else if (onStack.has(next)) low.set(id, Math.min(low.get(id)!, index.get(next)!));
    }
    if (low.get(id) === index.get(id)) {
      const component: string[] = [];
      let member: string;
      do { member = stack.pop()!; onStack.delete(member); component.push(member); } while (member !== id);
      components.push(component);
    }
  };
  for (const method of analysis.methods) if (!index.has(method.id)) visit(method.id);

  const cycles: RecursionCycle[] = [];
  for (const component of components) {
    const members = new Set(component);
    const methods = analysis.methods.filter(method => members.has(method.id));
    const calls = methods.flatMap(method => method.calls.filter(call => call.target !== null && members.has(call.target)));
    if (!calls.length || methods.some(hasBranching)) continue;
    cycles.push({ methods, calls });
  }
  return cycles;
}

export function reachableMethods(analysis: JavaAnalysis, entryId: string, maxDepth = 8): { method: JavaMethod; depth: number }[] {
  const visited = new Set<string>();
  const queue = [{ id: entryId, depth: 0 }];
  const result: { method: JavaMethod; depth: number }[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.id) || current.depth > maxDepth) continue;
    visited.add(current.id);
    const method = analysis.methods.find(item => item.id === current.id);
    if (!method) continue;
    result.push({ method, depth: current.depth });
    for (const call of method.calls) if (call.target && !visited.has(call.target)) queue.push({ id: call.target, depth: current.depth + 1 });
  }
  return result;
}
