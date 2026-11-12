import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-mf-pr-guardian-ai-workspace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './workspace-page.component.html',
  styleUrl: './workspace-page.component.css'
})
export class WorkspacePageComponent {
  readonly title = input.required<string>();
}
