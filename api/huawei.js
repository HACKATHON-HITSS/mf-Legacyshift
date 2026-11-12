import { createHuaweiServer } from '../server/huawei-server.mjs';

let server = null;

export default (req, res) => {
  if (!server) {
    server = createHuaweiServer();
  }
  
  // Delegar la solicitud al servidor de Huawei
  server.emit('request', req, res);
};
