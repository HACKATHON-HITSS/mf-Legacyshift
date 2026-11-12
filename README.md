# Legacyshift

Microfrontend Angular standalone para analizar codigo legado con las tres etapas existentes: codigo fuente, analisis y decisiones. Las nueve rutas anteriores de compatibilidad conservan sus paginas vacias.

Los resultados proceden del proyecto seleccionado; no hay datos de demostracion. Incluye analisis local y consultas opcionales a Huawei mediante un servidor separado. No consume Bitbucket ni SonarQube.

## Adjuntar un archivo o carpeta

En `/codigo-fuente/proyecto` se puede seleccionar, arrastrar, reemplazar o quitar un documento o archivo de codigo legado. La seleccion individual rechaza archivos vacios o multiples archivos.

El boton **Seleccionar carpeta** usa el selector de directorios del navegador (`webkitdirectory`) e incluye todos los archivos de sus subcarpetas, conservando sus rutas relativas. Muestra el nombre de la carpeta, cantidad de archivos, tamano total y un listado desplegable de rutas. Las carpetas vacias no se incluyen. Para carpetas se debe usar el boton, no el arrastre. Cada nueva seleccion reemplaza la anterior.

El boton **Analizar archivo/carpeta** lee el contenido localmente, sin ejecutar codigo ni enviar archivos a servidores o IA. El informe se comparte en memoria entre las rutas de analisis y decisiones; los objetos File permanecen en la pantalla de carga. Recargar elimina la sesion. Seleccionar otro proyecto elimina el informe y las decisiones anteriores. Un analisis anterior que termine tarde no reemplaza una seleccion nueva.

## Flujo de resultados

### Matriz MVP de reglas

La matriz también permite seleccionar un método Java y añadir un glosario opcional para solicitar a Huawei un resumen, reglas de negocio estructuradas y pendientes. Se transmite el fragmento disponible de un método (hasta 2.000 caracteres), no todo el proyecto. El resultado indica la cobertura; analizar otro método requiere otra consulta. Las reglas generadas se muestran solo si la respuesta cumple el esquema y cada fragmento de hasta diez líneas se encuentra una única vez en el código enviado. La ubicación se calcula a partir del código local. El significado, las dependencias y la confianza propuestas por IA requieren revisión humana; no se validan automáticamente. Al volver a consultar un método se reemplazan el resultado y las revisiones previas de ese método. La descarga JSON incluye las tres secciones y puede contener código. Huawei requiere configurar el servidor y un modelo habilitado; el analisis local funciona sin esa conexion.

La matriz identifica candidatos mediante arbol sintactico Java y patrones en PL/SQL (`.sql`, `.pks`, `.pkb`, `.prc`, `.fnc`), XQuery, XSLT y XML de recursos OSB (`.proxy`, `.pipeline`, `.biz`, `.bix`). Los archivos se leen sin ejecutar ni modificar. La matriz muestra el inventario completo, incluidas omisiones y errores de lectura. Un archivo leido no implica que todas sus construcciones hayan sido interpretadas.

Cada candidato incluye tipo, componente estimado, evidencia local (linea o ruta de nodo XML), dependencias textualmente identificadas, limitaciones y estado de revision. El estado inicial es UNDER_INVESTIGATION; el especialista puede cambiarlo y registrar observaciones tanto en la matriz como en la pantalla de aprobacion. El hash SHA-256 del archivo se calcula cuando Web Crypto esta disponible; la version del conjunto solo se informa si todos los archivos se pudieron leer y hashear. La extraccion usa patrones y un parser XML, no un parser completo de PL/SQL, XQuery ni OSB: puede omitir reglas, no resuelve dependencias transitivas ni garantiza cobertura de SOAP/REST. Las reglas son hallazgos tecnicos hasta su validacion por negocio. El CSV de la matriz exporta sus campos, ubicacion, hashes, observaciones y estados.

Al seleccionar una regla se muestra su fragmento y las referencias explicitamente observadas; no se infieren cadenas de impacto. La consulta opcional a Huawei puede generar una descripcion funcional e incluye el fragmento seleccionado; requiere configuracion del servicio y puede generar costos. La descripcion es una propuesta y no sustituye la revision. Como el informe guarda estos fragmentos en memoria, la descarga de JSON completo puede incluir codigo fuente; compartirla requiere la misma precaucion que compartir el proyecto. Las decisiones y descripciones duran solo la sesion del navegador.

Al terminar, **Ver matriz de reglas y resultados** abre la matriz del proyecto. Los nueve modulos muestran datos del mismo informe, filtros, paginacion de 25 filas, cobertura y descarga CSV completa. Los estados sin proyecto y sin hallazgos se muestran explicitamente.

- **Reglas y condiciones:** candidatos a partir de `if`, `case` y condiciones compatibles, con condicion, accion observada, archivo y linea. No son reglas de negocio confirmadas. La lectura multilinea de condiciones tiene un limite de 12 lineas.
- **Logica:** diagrama de bloques PL/SQL simples con instrucciones de una linea y hasta una condicion IF/ELSE sin anidacion, con referencias de linea y ramas sustentadas por el codigo. No reconstruye bucles, excepciones, retornos tempranos, llamadas entre archivos ni flujos de otros lenguajes. Los bloques no compatibles no se dibujan.
- **Entradas/salidas:** WSDL 1.1, anotaciones/rutas HTTP compatibles y operaciones SQL observadas; no resuelve todos los esquemas.
- **Datos hardcodeados:** candidatos del analizador local, sin mostrar valores.
- **Deuda tecnica:** marcadores TODO/FIXME/HACK, catch vacios compatibles y recursion Java (directa o mutua) sin condicion de salida, detectada en ciclos de llamadas resueltas cuyos metodos no tienen ramas, bucles, ternarios ni `&&`/`||`. No prueba codigo muerto ni calcula complejidad global.
- **Riesgos:** operaciones sensibles, hashes debiles y configuracion sensible literal. No confirma explotabilidad ni ausencia de vulnerabilidades.
- **Dependencias:** declaraciones e imports; no decide automaticamente cuales migrar ni comprueba compatibilidad.
- **Procedimientos almacenados en properties:** las entradas de `.properties` cuyo valor parece un SP (`PAQUETE.USP_X`, o claves `sp.*` con nombre calificado) se buscan en Java, XML y SQL: clave literal (`getProperty("sp.x")`), constantes que guardan la clave y sus usos, placeholders `${sp.x}` y el nombre literal del SP, sin contar comentarios. Cada SP queda como **invocado** (el metodo que usa la clave hace `prepareCall`, `CallableStatement`, `StoredProcedure` o similar), **referenciado sin llamada directa** o **sin uso**. Aparece en Dependencias; las invocaciones van a Entradas/salidas y los no invocados a Deuda tecnica. No se comprueba que el valor leido sea el que llega a la llamada ni se siguen claves construidas dinamicamente.
- **Arquitectura actual:** mapa de grupos por funcion estimada e inventario de archivos. No inventa relaciones entre componentes.

En decisiones se pueden aprobar/descartar reglas y registrar observaciones, elegir tecnologia y justificarla. La arquitectura objetivo muestra un borrador de capas cuando hay tecnologia y al menos una regla aprobada. Se exportan informe JSON, matriz CSV y documentacion Markdown con el estado de revision. El borrador no sustituye un diseno validado.

## Consultas a Huawei MaaS

El frontend envia la llave introducida en el formulario al servicio local, que la conserva en memoria y llama a Huawei. El servidor usa `POST https://api-ap-southeast-1.modelarts-maas.com/openai/v1/chat/completions`, autenticacion Bearer y el modelo configurado, conforme a la [documentacion de Huawei](https://support.huaweicloud.com/intl/en-us/model-call-maas/model-call-021.html).

1. Ejecuta `npm run start:analysis-api` en una terminal y `npm start` en otra.
2. Abre **Conectar con IA** en cualquiera de las tres etapas. La URL oficial ya esta precargada; introduce una llave nueva y el identificador exacto del modelo habilitado en tu cuenta. `glm-5.2` es un ejemplo, no una comprobacion de acceso.
3. Pulsa **Conectar y verificar**. Se realiza una consulta real que puede consumir tokens. Si tiene exito, la conexion queda disponible para los modulos del servicio local.
4. Analiza un proyecto y usa **Consultar Huawei** en un modulo o en el chat de decisiones.

Como alternativa, copia `.env.example` a `.env` y configura `HUAWEI_MAAS_API_KEY` y `HUAWEI_MAAS_MODEL` en el servidor. Esa configuracion aparece como «IA configurada» hasta que se verifique. El formulario acepta solo la URL oficial especificada; no envia llaves a URLs arbitrarias.

### Modo mock (sin llave de Huawei)

`npm run start:analysis-api:mock` (o `HUAWEI_MAAS_MOCK=true`) levanta el mismo servicio en el puerto 4212 con la conexion ya verificada como `mock-legacyshift`, sin llamadas de red ni consumo de tokens. `server/huawei-mock.mjs` genera las respuestas a partir del contexto recibido:

- **Generar analisis de negocio:** resumen, reglas y pendientes con el esquema de la matriz, derivados por patrones del metodo enviado (`if`/`else`, ternarios, `switch`, `throw`, asignaciones de estado, SQL embebido y `{call ...}`). Cada `fragmento_codigo` se copia del metodo, por lo que supera la verificacion del frontend. Los codigos se resuelven con el glosario (`POS = Postpago; PRE = Prepago`) o quedan como «Por confirmar» y pasan a pendientes.
- **Consultar Huawei y chat:** texto con resumen, siguientes pasos y pendientes a partir de los hallazgos, la regla o el grafo enviados.

Todas las respuestas indican «Datos simulados (modo mock, sin IA)». Para probarlo, analiza la carpeta `samples/legacy-telco` y pega el contenido de `samples/legacy-telco/GLOSARIO.txt` en el glosario.

La consulta envia hasta 30 hallazgos del modulo (o del informe en el chat, priorizados por palabras de la pregunta), 15 dependencias y 10 reglas aprobadas. No envia los archivos completos. El contexto puede ser parcial y los literales de las evidencias estan omitidos. La respuesta se presenta como texto para revision y no modifica ni aprueba reglas automaticamente. El chat conserva las consultas durante la sesion; sus respuestas no forman parte de la matriz ni del export.

El servicio de desarrollo escucha solo en `127.0.0.1:4212`, permite los origenes locales 4201/4211 y limita cuerpo (128 KB), consultas (10/minuto), tiempo y respuesta. La conexion del formulario se guarda en memoria y es compartida por quienes usen ese mismo servicio; se pierde al reiniciarlo. Desconectar borra la configuracion activa hasta el siguiente reinicio. Los errores del proveedor se convierten en mensajes sin cuerpos sensibles. `.env` esta ignorado por Git; `.env.example` no contiene secretos. No se ha probado una llamada autenticada real a la cuenta.

En produccion el frontend usa `/api/legacyshift/huawei` en el mismo origen. Debe integrarse en el backend autenticado de la plataforma o publicarse mediante su gateway con autenticacion, limites por usuario y secretos de servidor. El servidor incluido es de desarrollo local; no es un endpoint publico de produccion. La shell externa no se modifica.

## Analisis local sin backend

- Inventario de archivos, lenguajes por extension, lineas de texto y roles estimados por ruta.
- Dependencias declaradas en `package.json` y `pom.xml`, JAR incluidos y referencias JAR de JDeveloper (`.jpr`/`.jws`). No resuelve versiones ni dependencias transitivas.
- Imports externos Java y candidatos a valores hardcodeados con archivo y linea, sin mostrar valores sensibles.
- Operaciones y mensajes de entrada/salida declarados en WSDL 1.1.
- Lectura de Java, SQL, archivos de texto y configuracion, incluidos `.properties`, `.xml`, `.jaxrpc`, `.jpr` y `.jws`, para proyectos antiguos como SimcardsApp.

Para proteger el navegador, se leen hasta 5 MB por archivo y se omiten `node_modules`, `.git`, `dist`, `build`, `target`, `.angular`, `coverage`, `bin` y `obj`. Se admiten ZIP individuales de hasta 25 MB, 1.000 entradas y 50 MB descomprimidos en memoria, con limites por archivo y rechazo de rutas inseguras, duplicados, enlaces, cifrado y ZIP64. Los ZIP anidados no se descomprimen. PDF, Word y JAR no se interpretan; los nombres de JAR se inventarian como bibliotecas incluidas. Se leen UTF-8 y, si no es valido, Windows-1252 con advertencia; UTF-16 no es compatible.

### Analisis Java

El parser `java-parser` construye un arbol sintactico local. Se inventarian clases normales, sus campos y metodos, ubicaciones, anotaciones, herencia, condiciones y llamadas sintacticas; se reconocen metodos Servlet y anotaciones de endpoints comunes. Las referencias a metodos se resuelven solo si el tipo declarado, nombre y numero de argumentos producen un unico candidato. El destino se marca INFERRED; los destinos ambiguos o ausentes quedan UNRESOLVED. Las llamadas no son evidencia de que una ruta se haya ejecutado ni representan un grafo completo; el recorrido esta limitado a ocho niveles y evita ciclos. Interfaces, herencia de metodos, sobrecargas por tipo, polimorfismo, SQL embebido y configuraciones de frameworks requieren mayor analisis. Se registran errores de parser por archivo. El modelo alimenta el diagrama de llamadas, la matriz de condiciones candidatas y arquitectura; se conserva el analisis de otras tecnologias.

El informe muestra cantidades analizadas, omitidas y errores. Las vistas muestran hasta 100 filas por seccion; el informe en memoria conserva todas las detectadas y se puede descargar completo como JSON, sin incluir codigo fuente. Los resultados son heuristicas para revision manual, no reglas de negocio, arquitectura o vulnerabilidades confirmadas.

La pantalla utiliza archivos HTML, CSS y TypeScript separados en `src/app/features/codigo-fuente/proyecto/`.

Codigo fuente conserva unicamente el modulo de proyecto. Se eliminaron los modulos y rutas de carga de codigo, exploracion de archivos y lenguajes/componentes.

## Desarrollo

- `npm start`: servidor de desarrollo en el puerto 4211. Ejecuta tambien la shell existente `../sh-template` en el puerto 4201 para usar su navegacion y autenticacion.
- `npm run build`: compila el remoto y genera el manifiesto de estilos.
- `npx vitest run`: verifica compatibilidad, extraccion con evidencia y flujo entre modulos, aprobaciones, reemplazo de proyectos y manejo de consultas a Huawei con mocks.
- `npm run test:analysis-api`: verifica validacion, origenes permitidos, limites de entrada y manejo de respuestas/errores del proveedor sin consumir tokens reales.
- `npm run lint`: la configuracion heredada `.eslintrc.json` requiere migracion a flat config antes de usar ESLint 10.

## Estructura

- `src/app/features/`: un componente vacio por seccion, preparado para su nueva implementacion.
- `src/app/shared/`: presentacion comun del estado vacio de Legacyshift.
- `src/app/app.routes.ts`: rutas publicas y alias de compatibilidad.
- `src/environments/`: configuracion de entorno y URL base de API conservadas.
- `proxy.conf.json`: proxies existentes conservados, sin consumo desde las paginas vacias.
- `federation.config.js`: exposiciones del remoto.
- `nginx/`, `Dockerfile` y `vercel.json`: infraestructura de despliegue conservada.

## Integracion con la shell

El nombre visible es **Legacyshift**. Se conserva el identificador tecnico `mf-PR-Guardian-AI` del paquete, proyecto Angular, alias TypeScript, selectores y remoto de Native Federation para no romper la shell externa.

Las exposiciones siguen siendo `./Routes` y `./Component`. El resultado de compilacion permanece en `dist/mf-PR-Guardian-AI/browser`, y el remoto local en `http://localhost:4211/remoteEntry.json`.

La shell puede seguir usando el alias `template`: `/` y `/default` abren `/codigo-fuente/proyecto` para adjuntar documentos o carpetas, `/template` redirige a Pull Requests y `/bitbucket` a Configuracion. Dashboard sigue disponible en `/dashboard` del remoto; las rutas desconocidas del remoto conservan su redireccion a Dashboard.

Se conserva la infraestructura de conexion. Las consultas a Huawei requieren iniciar y configurar el servicio descrito arriba; su disponibilidad depende de la cuenta y del modelo habilitado. El nombre y menu visibles de la shell se gestionan en su propio repositorio.
