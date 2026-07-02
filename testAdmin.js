import { getAdminMetrics } from './src/controllers/admin.controller.js';

const req = {
  user: { role: 'admin' }
};

const res = {
  status: function(code) {
    this.statusCode = code;
    return this;
  },
  json: function(data) {
    console.log("Status:", this.statusCode);
    console.log("Data:", JSON.stringify(data, null, 2));
  }
};

const next = (err) => {
  console.error("Next called with error:", err);
};

console.log("Probando controlador admin...");
getAdminMetrics(req, res, next).then(() => console.log("Test finalizado"));
