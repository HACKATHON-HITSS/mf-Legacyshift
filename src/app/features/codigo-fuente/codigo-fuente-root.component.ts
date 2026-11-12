import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AiConnectionComponent } from '../../shared/ai-connection.component';

@Component({
  selector: 'app-mf-codigo-fuente-root',
  imports: [RouterOutlet, AiConnectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<router-outlet /><app-mf-ai-connection />'
})
export class CodigoFuenteRootComponent {}
