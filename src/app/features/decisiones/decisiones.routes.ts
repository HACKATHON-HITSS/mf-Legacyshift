import { Routes } from '@angular/router';
import { DecisionesRootComponent } from './decisiones-root.component';

export const DECISIONES_ROUTES: Routes = [
  {
    path: '',
    component: DecisionesRootComponent,
    children: [
      { path: '', redirectTo: 'aprobar-reglas', pathMatch: 'full' },
      { 
        path: 'aprobar-reglas', 
        title: 'Legacyshift | Revisar y aprobar reglas',
        loadComponent: () => import('./aprobar-reglas/aprobar-reglas.component').then(m => m.AprobarReglasComponent) 
      },
      { 
        path: 'tecnologia', 
        title: 'Legacyshift | Tecnología de destino',
        loadComponent: () => import('./tecnologia/tecnologia.component').then(m => m.TecnologiaComponent) 
      },
      { 
        path: 'arquitectura', 
        title: 'Legacyshift | Arquitectura objetivo',
        loadComponent: () => import('./arquitectura/arquitectura.component').then(m => m.ArquitecturaComponent) 
      },
      { 
        path: 'chat', 
        title: 'Legacyshift | Chat sobre reglas y dudas',
        loadComponent: () => import('./chat/chat.component').then(m => m.ChatComponent) 
      },
      { 
        path: 'exportar', 
        title: 'Legacyshift | Exportar documentación y matrices',
        loadComponent: () => import('./exportar/exportar.component').then(m => m.ExportarComponent) 
      }
    ]
  }
];
