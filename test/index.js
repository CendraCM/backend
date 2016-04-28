var test = require('tape');
var request = require('supertest');
var index = require('../index');

test('Index Testing', function(t) {
  index.onLoaded(function(app, db) {
    request(app)
      .get('/test')
      .expect(200)
      .end(function(err, res) {
        if(err) {
          t.end(err);
        } else {
          t.equal(res.text.toLowerCase(), 'ok', 'La respuesta debe ser igual a "ok"');
          t.end();
        }
      });
  });
});
