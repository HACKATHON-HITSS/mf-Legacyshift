import { Routes } from '@angular/router';
import { AnalisisRootComponent } from './analisis-root.component';

export const ANALISIS_ROUTES: Routes = [
  {
    path: '',
    component: AnalisisRootComponent,
    children: [
      { path: '', redirectTo: 'reglas', pathMatch: 'full' },
      { 
        path: 'reglas', 
        title: 'Legacyshift | Matriz de reglas de negocio',
        loadComponent: () => import('./reglas/reglas.component').then(m => m.ReglasComponent) 
      },
      { 
        path: 'logica', 
        title: 'Legacyshift | Lógica y flujos de negocio',
        loadComponent: () => import('./logica/logica.component').then(m => m.LogicaComponent) 
      },
      { 
        path: 'condiciones', 
        title: 'Legacyshift | Condiciones funcionales y técnicas',
        loadComponent: () => import('./condiciones/condiciones.component').then(m => m.CondicionesComponent) 
      },
      { 
        path: 'entradas-salidas', 
        title: 'Legacyshift | Entradas y salidas',
        loadComponent: () => import('./entradas-salidas/entradas-salidas.component').then(m => m.EntradasSalidasComponent) 
      },
      { 
        path: 'datos-hardcodeados', 
        title: 'Legacyshift | Datos y valores hardcodeados',
        loadComponent: () => import('./datos-hardcodeados/datos-hardcodeados.component').then(m => m.DatosHardcodeadosComponent) 
      },
      { 
        path: 'deuda-tecnica', 
        title: 'Legacyshift | Deuda técnica y código innecesario',
        loadComponent: () => import('./deuda-tecnica/deuda-tecnica.component').then(m => m.DeudaTecnicaComponent) 
      },
      { 
        path: 'vulnerabilidades', 
        title: 'Legacyshift | Vulnerabilidades y riesgos',
        loadComponent: () => import('./vulnerabilidades/vulnerabilidades.component').then(m => m.VulnerabilidadesComponent) 
      },
      { 
        path: 'dependencias', 
        title: 'Legacyshift | Dependencias',
        loadComponent: () => import('./dependencias/dependencias.component').then(m => m.DependenciasComponent) 
      },
      { 
        path: 'arquitectura', 
        title: 'Legacyshift | Arquitectura actual y diagramas',
        loadComponent: () => import('./arquitectura/arquitectura.component').then(m => m.ArquitecturaComponent) 
      }
    ]
  }
];
