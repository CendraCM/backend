var mongo = require('mongo-factory');
var oid = require('mongodb').ObjectID;
var express = require('express');
var extend = require('extend');
var config = require('/etc/nodejs-config/cendraCM').backend;
var url = 'mongodb://'+config.mongo.host+':'+config.mongo.port+'/'+config.mongo.db;
if(process.env.NODE_ENV == 'ci-testing') {
  url += '-ci-testing';
}
var JSV = require("JSV").JSV;
var jsv = JSV.createEnvironment();
var Promise = require('promise');

module.exports = function() {
  var version = express.Router();
  mongo.getConnection(url)
  .then(function(db) {
    var dc = db.collection('documents');
    var sc = db.collection('schemas');

    new Promise(function(resolve, reject) {
      sc.find({'objName': 'BaseDocumentClass'}).limit(1).next(function(err, sch) {
        if(!err && sch) {
          return resolve(sch._id);
        } else if(!err) {
          return sc.insertOne({
            type: 'object',
            objName: 'BaseDocumentClass',
            objSecurity: {
              inmutable: true,
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
              objName: {type: 'string'},
              objDescription: {
                type: ['string', 'object'],
                patternProperies: {
                  '^\w\w(-\w\w)?$': {type: 'string'}
                }
              },
              objInterface: {
                type: 'array',
                items: {
                  type: 'string'
                },
                minItems: 1
              },
              objSecurity: {
                type: 'object',
                properties: {
                  inmutable: {type: 'boolean'},
                  locked: {
                    type: 'object',
                    properties: {
                      date: {type: 'string', format: 'date-time'},
                      user: {type: 'string'}
                    },
                    required: ['date', 'user']
                  },
                  acl: {
                    type: 'object',
                    patternProperies: {
                      '^.+$': {
                        type: 'object',
                        properties: {
                          write: {type: 'boolean', default: false},
                          properties: {
                            type: 'object',
                            patternProperies: {
                              '^.+$': {type: 'boolean', default: false}
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            required: ['objName', 'objSecurity']
          })
          .then(function(inserted) {
            resolve(inserted.insertedId);
          })
          .catch(function(err) {
            reject(err);
          });
        }
        reject('No base document schema found');
      });
    }).then(function(baseDocumentID) {
      var isEmptyObject = function(obj) {
        for(var i in obj) {
          return false;
        }
        return true;
      }

      var compatibleSchema = function(sch1, sch2) {
        if(sch1 != sch2) {
          if(isEmptyObject(sch1)||isEmptyObject(sch2)) return true;
          if(sch1.type != sch2.type) return false;
          if(sch1.type == 'object') {
            for(var i in sch1.properties) {
              if(sch2.hasOwnProperty(i) && !compatibleSchema(sch1.properties[i], sch2.properties[i])) return false;
            }
          }
          if(sch1.type == 'array') {
            //Hay por lo menos un items no definido?
            if(!sch1.items||!sch2.items) return true;
            //Ambos items son array?
            if(Array.isArray(sch1.items) && Array.isArray(sch2.items)) {
              var min = sch1.items.length<sch2.items.length?sch1.items:sch2.items;
              var max = sch1.items.length<sch2.items.length?sch2.items:sch1.items;
              var arrayEquals = true;
              min.forEach(function(item, i) {
                if(arrayEquals) {
                  arrayEquals = compatibleSchema(item, max[i]);
                }
              });
              return arrayEquals;
            }
            //Hay un items que es array y otro object?
            if(Array.isArray(sch1.items) || Array.isArray(sch2.items)) {
              var arr = Array.isArray(sch1.items)?sch1.items:sch2.items;
              var obj = sch2.items==arr?sch1.items:sch2.items;
              var arrayEquals = true;
              arr.forEach(function(item, i) {
                if(arrayEquals) {
                  arrayEquals = compatibleSchema(item, obj);
                }
              });
              return arrayEquals;
            }
            //Ambos items son object
            return compatibleSchema(sch1.items, sch2.items);
          }
        }
        return true;
      }

      var reduceSchema = function(arr) {
        return new Promise(function(resolve, reject) {
          sc.find({'_id': {$in: arr}}).toArray(function(err, schs) {
            if(err) return reject(err);
            resolve(schs);
          });
        })
        .then(function(schs) {
          return schs.reduce(function(memo, item) {
            return new Promise(function(resolve, reject) {
              if(!compatibleSchema(memo, item)) return reject('Esquemas no compatibles');
              !memo.objInterface && (memo.objInterface=[]);
              memo.objInterface.push(item._id);
              resolve(extend(true, memo, item));
            });
          }, {});
        })

      }

      version.get('/schema', function(req, res, next) {
        sc.find(req.query).toArray(function(err, schs) {
          if(err) return res.status(500).send(err);
          res.json(schs);
        });
      });
      version.get('/schema/reduce', function(req, res, next) {
        reduceSchema(req.body)
        .then(function(sch) {
          res.json(sch);
        })
        .catch(function(err) {
          res.status(500).send(err);
        })
      });
      version.post('/schema', function(req, res, next) {
        var objInterface = req.body.objInterface || [];
        reduceSchema(objInterface.unshift(baseDocumentID))
        .then(function(base) {
          var report = jsv.validate(req.body, base);
          if(report.errors.length) {
            return res.status(400).send(report.errors);
          }
          sc.insertOne(req.body)
          .then(function(inserted) {
            res.send(inserted.insertedId);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        })
      });
      version.get('/schema/:id', function(req, res, next) {
        sc.find({"_id": new oid(req.params.id)}).limit(1).next(function(err, sch) {
          if(err) return res.status(500).send(err);
          res.json(sch);
        });
      });

      version.get('/', function(req, res, next) {
        dc.find(req.query).toArray(function(err, docs) {
          if(err) return res.status(500).send(err);
          res.json(docs);
        });
      });
      version.post('/', function(req, res, next) {
        var objInterface = req.body.objInterface || [];
        reduceSchema(objInterface.unshift(baseDocumentID))
        .then(function(base) {
          var report = jsv.validate(req.body, base);
          if(report.errors.length) {
            return res.status(400).send(report.errors);
          }
          dc.insertOne(req.body)
          .then(function(inserted) {
            res.send(inserted.insertedId);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        });
      });

      version.get('/:id', function(req, res, next) {
        dc.find({"_id": new oid(req.params.id)}).limit(1).next(function(err, doc) {
          if(err) return res.status(500).send(err);
          res.json(doc);
        });
      });
      version.put('/:id', function(req, res, next) {
        if(req.body._id) delete req.body._id;
        /**** primero habría que hacer un update en una transacción y al documento resultante ver si valida o no****/
        /*var objInterface = req.body.objInterface || [];
        reduceSchema(objInterface.unshift(baseDocumentID))
        .then(function(base) {
          var report = jsv.validate(req.body, base);
          if(report.errors.length) {
            return res.status(400).send(report.errors);
          }*/
          dc.updateOne({"_id": new oid(req.params.id)}, {$set: req.body}).then(function(updated) {
            res.send(updated.upsertedId);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        //});
      });
      version.delete('/:id', function(req, res, next) {
        dc.deleteOne({"_id": new oid(req.params.id)})
        .then(function(deleted) {
          res.status(204).send();
        })
        .catch(function(err) {
          res.status(500).send(err);
        });
      });

      version.put('/:id/replace', function(req, res, next) {
        if(req.body._id) delete req.body._id;
        var objInterface = req.body.objInterface || [];
        reduceSchema(objInterface.unshift(baseDocumentID))
        .then(function(base) {
          var report = jsv.validate(req.body, base);
          if(report.errors.length) {
            return res.status(400).send(report.errors);
          }
          dc.updateOne({"_id": new oid(req.params.id)}, req.body).then(function(updated) {
            res.send(updated.upsertedId);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        });
      });
    })
    .catch(function(err) {
      console.log(err);
    })
  })
  .catch(function(err) {
    console.log('Could not connect to Mongo '+url+' '+err);
    process.exit();
  })

  return version;
};
