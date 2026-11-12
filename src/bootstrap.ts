import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from '@mf-PR-Guardian-AI/app/app.config';
import { AppComponent } from '@mf-PR-Guardian-AI/app/app.component';

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
