import { initFederation } from '@angular-architects/native-federation';

initFederation()
    .catch((err) => console.error(err))
    .then(() => import('@mf-PR-Guardian-AI/bootstrap'))
    .catch((err) => console.error(err));
