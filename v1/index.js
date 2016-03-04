var mongo = require('mongo-factory');
var oid = require('mongodb').ObjectID;
var express = require('express');
var config = require('/etc/nodejs-config/cendraCM');
var url = 'mongodb://'+config.mongo.host+':'+config.mongo.port+'/'+config.mongo.db;

module.exports = function() {
  var version = express.Router();
  mongo.getConnection(url)
  .then(function(db) {
    var dc = db.collection('documents');
    var sc = db.collection('schemas');

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
