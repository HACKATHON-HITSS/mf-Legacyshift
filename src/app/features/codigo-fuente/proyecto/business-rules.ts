export type RuleType = 'VALIDATION' | 'CALCULATION' | 'AUTHORIZATION' | 'ROUTING' | 'TRANSFORMATION' | 'QUERY' | 'ERROR_HANDLING' | 'STATE_TRANSITION' | 'OTHER';
export type BusinessRule = {
  ruleId: string; ruleName: string; ruleType: RuleType; condition: string; component: string;
  dependencies: string[]; path: string; location: string; snippet: string; limitations: string;
  businessDescription: string; result: string; inputs: string[]; outputs: string[];
  componentId: string; componentType: string; discoveryMethod: string; createdAt: string;
  artifactHash: string | null; artifactVersion: string | null;
  evidenceId: string; artifactType: string; locationType: 'LINE' | 'XML_NODE'; startLine: number | null; endLine: number | null; xmlNodePath: string;
};

export function extractBusinessRules(text: string, path: string): BusinessRule[] {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  const rules: BusinessRule[] = [];
  const add = (type: RuleType, name: string, component: string, location: string, snippet: string, condition = '', dependencies: string[] = []) => {
    rules.push({ ruleId: `RN:${path}:${location}:${rules.length + 1}`, ruleName: name, ruleType: type, condition, component, dependencies, path, location, snippet,
      businessDescription: '', result: '', inputs: [], outputs: [], componentId: `${path}#${component}`,
      componentType: component, discoveryMethod: 'Análisis estático por patrones', createdAt: new Date().toISOString(), artifactHash: null, artifactVersion: null,
      evidenceId: `EV:${path}:${location}`, artifactType: extension.toUpperCase(), locationType: location.startsWith('/') ? 'XML_NODE' : 'LINE',
      startLine: location.startsWith('línea ') ? Number(location.slice(6)) : null, endLine: location.startsWith('línea ') ? Number(location.slice(6)) : null, xmlNodePath: location.startsWith('/') ? location : '',
      limitations: 'Hallazgo técnico por patrones; validar su significado y alcance con un especialista.' });
  };
  if (['sql', 'pks', 'pkb', 'prc', 'fnc'].includes(extension)) {
    const lines = text.split(/\r\n|\r|\n/);
    const masked = text.replace(/\/\*[\s\S]*?\*\//g, value => value.replace(/[^\r\n]/g, ' '))
      .replace(/'(?:''|[^'])*'/g, value => value.replace(/[^\r\n]/g, ' '));
    const code = masked.split(/\r\n|\r|\n/);
    let component = 'PL/SQL (componente no identificado)';
    for (const [index, value] of code.entries()) {
      const line = value.replace(/--.*$/, '');
      const declaration = /\b(package(?:\s+body)?|procedure|function)\s+([\w.$#]+)/i.exec(line);
      if (declaration) component = `${declaration[1].toUpperCase()} ${declaration[2]}`;
      const location = `línea ${index + 1}`;
      const snippet = lines[index].trim();
      if (/\b(?:IF|ELSIF)\b.*\bTHEN\b/i.test(line)) add('OTHER', 'Condición PL/SQL', component, location, snippet, snippet);
      if (/\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(line)) {
        const dep = /\b(?:FROM|JOIN|UPDATE)\s+([\w.$#]+)/i.exec(line) ?? /\bINSERT\s+INTO\s+([\w.$#]+)/i.exec(line);
        add('QUERY', 'Operación de datos', component, location, snippet, '', dep ? [dep[1]] : []);
      }
      if (/\b(?:WHEN\s+OTHERS\s+THEN|RAISE(?:_APPLICATION_ERROR)?\b)/i.test(line)) add('ERROR_HANDLING', 'Manejo de error PL/SQL', component, location, snippet);
    }
    return rules;
  }
  if (['xq', 'xqy', 'xquery'].includes(extension)) {
    text.split(/\r\n|\r|\n/).forEach((line, index) => {
      if (/^\s*\(:/.test(line)) return;
      if (/\b(?:declare\s+function|element\s+[\w:.-]+|<\w+[\s/>])/.test(line)) add('TRANSFORMATION', 'Transformación XQuery', 'XQuery', `línea ${index + 1}`, line.trim());
    });
    return rules;
  }
  if (!['xml', 'proxy', 'pipeline', 'bix', 'biz', 'xsl', 'xslt', 'wsdl'].includes(extension)) return rules;
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) return rules;
  const root = document.documentElement;
  const namespace = root.namespaceURI ?? '';
  const osb = /(?:^|\/)(?:servicebus|alsb|wli\/sb)(?:\/|$)/i.test(namespace) || ['proxy', 'pipeline', 'bix', 'biz'].includes(extension);
  const xslt = namespace === 'http://www.w3.org/1999/XSL/Transform';
  if (!osb && !xslt) return rules;
  const component = xslt ? 'XSLT' : extension === 'proxy' ? 'Proxy Service OSB' : extension === 'biz' ? 'Business Service OSB' : 'Pipeline / recurso OSB';
  const visit = (element: Element, parent: string) => {
    const siblings = element.parentElement ? Array.from(element.parentElement.children).filter(child => child.localName === element.localName && child.namespaceURI === element.namespaceURI) : [element];
    const location = `${parent}/${element.localName}[${siblings.indexOf(element) + 1}]`;
    const name = element.localName.toLowerCase();
    const type: RuleType | undefined = xslt && ['template', 'value-of', 'apply-templates'].includes(name) ? 'TRANSFORMATION'
      : osb && ['validate', 'validation'].includes(name) ? 'VALIDATION'
      : osb && ['route', 'routing', 'route-node', 'serviceref'].includes(name) ? 'ROUTING'
      : osb && ['replace', 'assign', 'insert', 'rename', 'transform'].includes(name) ? 'TRANSFORMATION'
      : osb && ['raise-error', 'raiseerror', 'error-handler', 'errorhandler'].includes(name) ? 'ERROR_HANDLING' : undefined;
    if (type) {
      const dependencies = Array.from(element.attributes).filter(attribute => /^(?:ref|refname|service|resource)$/i.test(attribute.localName)).map(attribute => attribute.value).filter(Boolean);
      const source = new XMLSerializer().serializeToString(element);
      add(type, `${type === 'ROUTING' ? 'Enrutamiento' : type === 'VALIDATION' ? 'Validación' : type === 'ERROR_HANDLING' ? 'Manejo de error' : 'Transformación'}: ${element.localName}`, component, location, source.slice(0, 4000), '', dependencies);
      if (source.length > 4000) rules[rules.length - 1].limitations += ' Fragmento XML truncado a 4000 caracteres.';
    }
    Array.from(element.children).forEach(child => visit(child, location));
  };
  visit(root, '');
  return rules;
}
