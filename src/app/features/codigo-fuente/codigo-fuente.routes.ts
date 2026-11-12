import { Routes } from '@angular/router';
import { CodigoFuenteRootComponent } from './codigo-fuente-root.component';

export const CODIGO_FUENTE_ROUTES: Routes = [
  {
    path: '',
    component: CodigoFuenteRootComponent,
    children: [
      { path: '', redirectTo: 'proyecto', pathMatch: 'full' },
      { 
        path: 'proyecto', 
        title: 'Legacyshift | Seleccionar proyecto',
        loadComponent: () => import('./proyecto/proyecto.component').then(m => m.ProyectoComponent) 
      }
    ]
  }
];
