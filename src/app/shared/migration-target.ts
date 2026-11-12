export type MigrationTarget = { projectName: string; javaVersion: string; architecture: string; archetype: string };
export type MigrationPlan = { project: string; target: MigrationTarget; architectureLabel: string; archetypeLabel: string; createdAt: string; steps: string[] };
export const MIGRATION_ARCHITECTURES = [
  { id: 'microservices', label: 'Microservicios' },
  { id: 'services', label: 'Servicios backend' },
  { id: 'modular', label: 'Monolito modular' },
  { id: 'microfrontends', label: 'Microfrontends' }
];
export const MIGRATION_ARCHETYPES = [
  { id: 'microservice-hexagonal', architecture: 'microservices', label: 'Microservicio Java · Arquitectura hexagonal' },
  { id: 'microservice-layers', architecture: 'microservices', label: 'Microservicio Java · API REST por capas' },
  { id: 'service-rest', architecture: 'services', label: 'Servicio Java · API REST' },
  { id: 'service-soap', architecture: 'services', label: 'Servicio Java · Adaptador SOAP' },
  { id: 'modular-java', architecture: 'modular', label: 'Aplicación Java · Módulos de negocio' },
  { id: 'microfront-angular', architecture: 'microfrontends', label: 'Microfrontend Angular · Native Federation' },
  { id: 'microfront-react', architecture: 'microfrontends', label: 'Microfrontend React · Module Federation' }
];
