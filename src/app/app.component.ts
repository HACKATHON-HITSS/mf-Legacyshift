import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
@Component({ selector: 'app-mf-pr-guardian-ai-root', imports: [RouterOutlet], changeDetection: ChangeDetectionStrategy.OnPush, host: { class: 'block w-full' }, templateUrl: './app.component.html' })
export class AppComponent {
}
