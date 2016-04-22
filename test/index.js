var test = require('tape');
var request = require('supertest');
var app = require('../index').app;

test('/test', function(t) {
  request(app)
    .get('/api/v1')
    .expect(200)
    .end(function(err, res) {
      if(err) return t.end(err);
      t.equal(res.body.toLowerCase(), 'ok', 'La respuesta debe ser igual a "ok"');
      t.end();
    });
});
