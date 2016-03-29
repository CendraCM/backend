var mongo = require('mongo-factory');
var oid = require('mongodb').ObjectID;
var express = require('express');
var extend = require('extend');
var config = require('/etc/nodejs-config/cendraCM').backend;
var url = 'mongodb://'+config.mongo.host+':'+config.mongo.port+'/'+config.mongo.db;
var Promise = require('promise');

module.exports = function() {
  var version = express.Router();
  mongo.getConnection(url)
  .then(function(db) {
    var dc = db.collection('documents');
    var sc = db.collection('schemas');

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
            !memo.objInsterface && (memo.objInsterface=[]);
            memo.objInsterface.push(item._id);
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
      sc.insertOne(req.body)
      .then(function(inserted) {
        res.send(inserted.insertedId);
      })
      .catch(function(err) {
        res.status(500).send(err);
      });
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
      dc.insertOne(req.body)
      .then(function(inserted) {
        res.send(inserted.insertedId);
      })
      .catch(function(err) {
        res.status(500).send(err);
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
      dc.updateOne({"_id": new oid(req.params.id)}, {$set: req.body}).then(function(updated) {
        res.send(updated.upsertedId);
      })
      .catch(function(err) {
        res.status(500).send(err);
      });
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
      dc.updateOne({"_id": new oid(req.params.id)}, req.body).then(function(updated) {
        res.send(updated.upsertedId);
      })
      .catch(function(err) {
        res.status(500).send(err);
      });
    });
  })
  .catch(function(err) {
    console.log('Could not connect to Mongo '+url+' '+err);
    process.exit();
  })

  return version;
};
