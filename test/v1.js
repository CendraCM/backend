var test = require('tape');
var request = require('supertest');
var index = require('../index');
var async = require('async');
var schemas = [
  {
    objName: 'test1Class',
    type: 'object',
    objSecurity: {
      acl: {
        "group:public": {
          write: false,
          properties: {
            "properties:all": false
          }
        }
      }
    },
    properties: {
      test1: {type: 'string', required: true}
    }
  },
  {
    objName: 'test2Class',
    type: 'object',
    objSecurity: {
      acl: {
        "group:public": {
          write: false,
          properties: {
            "properties:all": false
          }
        }
      }
    },
    properties: {
      test2: {type: 'string'}
    }
  },
  {
    objName: 'test3Class',
    type: 'object',
    objSecurity: {
      acl: {
        "group:public": {
          write: false,
          properties: {
            "properties:all": false
          }
        }
      }
    },
    properties: {
      test1: {type: 'array', items: {type: 'string'}}
    }
  },
];
index.onLoaded(function(app, db) {
      test('Get Schemas', function(t) {
        request(app)
          .get('/api/v1/schema')
          .expect(200)
          .end(function(err, res) {
            if(err) return t.end(err);
            t.ok(res.body instanceof Array, 'Response should be Array');
            t.ok(res.body.length > 0, 'Response should have at least 1 item');
            t.end();
          });
      });
      test('Post Invalid Schema', function(t) {
        request(app)
          .post('/api/v1/schema')
          .send({name: 'invalidSchema'})
          .expect(400)
          .end(function(err, res) {
            if(err) return t.end(err);
            t.ok(res.status == 400, 'Response status should be 400');
            t.end();
          });
      });
      var postSchemas = {ids: []};
      test('Post Schemas', function(t) {
        async.each(schemas, function(schema, cb) {
          request(app)
            .post('/api/v1/schema')
            .send(schema)
            .expect(200)
            .end(function(err, res) {
              if(err) return cb(err);
              t.ok(res.body.match(/^\w+$/), 'Response should be a string with id');
              postSchemas[schema.objName] = res.body;
              postSchemas.ids.push(res.body);
              cb();
            });
        }, function(err) {
          t.end(err);
        });
      });
      test('Reduce Schemas', function(t) {
        request(app)
          .get('/api/v1/schema/reduce')
          .query({schemas: [postSchemas.ids[0], postSchemas.ids[1]]})
          .expect(200)
          .end(function(err, res) {
            if(err) return t.end(err);
            t.ok(res.body instanceof Object, 'Response should be a schema object');
            t.ok(res.body.hasOwnProperty('properties'), 'Response should have "properties" property');
            t.ok(res.body.properties.hasOwnProperty('test1') && res.body.properties.hasOwnProperty('test2'), 'Response should have "properties.test1" and "properties.test2" properties');
            t.end();
          });
      });
      test('Reduce Incompatible Schemas', function(t) {
        request(app)
          .get('/api/v1/schema/reduce')
          .query({schemas: [postSchemas.ids[0], postSchemas.ids[2]]})
          .expect(500)
          .end(function(err, res) {
            if(err) return t.end(err);
            t.equal(res.status, 500,  'Response status should be 500');
            t.end();
          });
      });
      test('Get Schemas', function(t) {
        request(app)
          .get('/api/v1/schema/'+postSchemas.test1Class)
          .expect(200)
          .end(function(err, res) {
            if(err) return t.end(err);
            t.ok(res.body instanceof Object, 'Response should be a schema object');
            t.ok(res.body.hasOwnProperty('properties'), 'Response should have "properties" property');
            t.ok(res.body.properties.hasOwnProperty('test1'), 'Response should have "properties.test1" property');
            t.end();
          });
      });
      test('Create Invalid Document', function(t) {
        request(app)
          .post('/api/v1/')
          .send({name: 'Invalid Document', test: 'algo'})
          .expect(400)
          .end(function(err, res) {
            if(err) return t.end(err);
            t.ok(res.status == 400, 'Response status should be 400');
            t.end();
          });
      });
      test('Create Invalid Test1 Document', function(t) {
        request(app)
          .post('/api/v1/')
          .send({
            objName: 'Invalid Document',
            objInterface: [postSchemas.test1Class],
            test: 'algo',
            objSecurity: {
              inmutable: false
            }
          })
          .expect(400)
          .end(function(err, res) {
            if(err) return t.end(err);
            t.ok(res.status == 400, 'Response status should be 400');
            t.end();
          });
      });
      test('Create Valid Document', function(t) {
        request(app)
          .post('/api/v1/')
          .send({
            objName: 'Valid Document',
            test: 'algo',
            objSecurity: {
              inmutable: false
            }
          })
          .expect(200)
          .end(function(err, res) {
            if(err) return t.end(err);
            t.ok(res.body.match(/^\w+$/), 'Response should be a string with id');
            docToDelete = res.body;
            t.end();
          });
      });
      var insertedDocument;
      test('Create Valid Test1 Document', function(t) {
        request(app)
          .post('/api/v1/')
          .send({
            objName: 'Valid Document',
            objInterface: [postSchemas.test1Class],
            test1: 'algo',
            objSecurity: {
              inmutable: false
            }
          })
          .expect(200)
          .end(function(err, res) {
            if(err) return t.end(err);
            t.ok(res.body.match(/^\w+$/), 'Response should be a string with id');
            insertedDocument = res.body;
            t.end();
          });
      });
      test('Update Document', function(t) {
        request(app)
          .put('/api/v1/'+insertedDocument)
          .send({
            objName: 'Updated Document',
            objInterface: [postSchemas.test1Class],
            test1: 'algo2',
            someAtt: 'something',
            objSecurity: {
              inmutable: false
            }
          })
          .expect(200)
          .end(function(err, res) {
            if(err) return t.end(err);
            t.equal(res.status, 200, 'Response status should be 200');
            t.end();
          });
      });
      test('Get Updated Document', function(t) {
        request(app)
          .get('/api/v1/'+insertedDocument)
          .expect(200)
          .end(function(err, res) {
            if(err) return t.end(err);
            t.equal(res.body.someAtt, 'something', 'Response should have attribute "someAtt"=="something"');
            t.end();
          });
      });
      test('Delete Document', function(t) {
        request(app)
          .delete('/api/v1/'+insertedDocument)
          .expect(204)
          .end(function(err, res) {
            if(err) return t.end(err);
            t.equal(res.status, 204, 'Response status should be 204');
            t.end();
            db.close();
          });
      });
});
