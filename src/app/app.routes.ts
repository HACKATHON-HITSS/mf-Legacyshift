import { Routes } from '@angular/router';
import { CODIGO_FUENTE_ROUTES } from './features/codigo-fuente/codigo-fuente.routes';
import { ANALISIS_ROUTES } from './features/analisis/analisis.routes';
import { DECISIONES_ROUTES } from './features/decisiones/decisiones.routes';

export const routes: Routes = [
    { path: '', redirectTo: 'codigo-fuente/proyecto', pathMatch: 'full' },
    { path: 'dashboard', title: 'Legacyshift | Dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) },
    { path: 'pull-requests', title: 'Legacyshift | Pull Requests', loadComponent: () => import('./features/pull-requests/pull-requests.component').then(m => m.PullRequestsComponent) },
    { path: 'hallazgos', title: 'Legacyshift | Hallazgos', loadComponent: () => import('./features/hallazgos/hallazgos.component').then(m => m.HallazgosComponent) },
    { path: 'cobertura', title: 'Legacyshift | Cobertura', loadComponent: () => import('./features/cobertura/cobertura.component').then(m => m.CoberturaComponent) },
    { path: 'asistente', title: 'Legacyshift | Asistente', loadComponent: () => import('./features/asistente/asistente.component').then(m => m.AsistenteComponent) },
    { path: 'historial', title: 'Legacyshift | Historial', loadComponent: () => import('./features/historial/historial.component').then(m => m.HistorialComponent) },
    { path: 'proyectos', title: 'Legacyshift | Proyectos', loadComponent: () => import('./features/proyectos/proyectos.component').then(m => m.ProyectosComponent) },
    { path: 'reportes', title: 'Legacyshift | Reportes', loadComponent: () => import('./features/reportes/reportes.component').then(m => m.ReportesComponent) },
    { path: 'configuracion', title: 'Legacyshift | Configuracion', loadComponent: () => import('./features/configuracion/configuracion.component').then(m => m.ConfiguracionComponent) },
    { path: 'codigo-fuente', children: CODIGO_FUENTE_ROUTES },
    { path: 'analisis', children: ANALISIS_ROUTES },
    { path: 'decisiones', children: DECISIONES_ROUTES },
    { path: 'bitbucket', redirectTo: 'configuracion', pathMatch: 'full' },
    { path: 'default', redirectTo: 'codigo-fuente/proyecto', pathMatch: 'full' },
    { path: 'template', redirectTo: 'pull-requests', pathMatch: 'full' },
    { path: '**', redirectTo: 'dashboard' }
];
