var mongo = require('mongo-factory');
var oid = require('mongodb').ObjectID;
var express = require('express');
var extend = require('extend');
var config = require('/etc/service-config/service');
var mongoUrl = 'mongodb://'+config.mongo.host+':'+config.mongo.port+'/'+config.mongo.db;
var fs = require('fs-extra');
var path = require('path');
var url = require('url');
var crypto = require('crypto');
var util = require('util');

if(process.env.NODE_ENV == 'ci-testing') {
  mongoUrl += '-ci-testing';
}
var Promise = require('promise');

if(config.redis) {
  var req = new require('redis-event-queue')(config.redis);
  var wqueue = req.workqueue;
  var bqueue = req.broadcast;
} else {
  var EventEmitter = require('events');
  var MyQueue = function () {
    EventEmitter.call(this);
  };
  util.inherits(MyQueue, EventEmitter);
  var wqueue = new MyQueue();
  var bqueue = wqueue;
}


module.exports = function() {
  var version = express.Router();
  mongo.getConnection(mongoUrl)
  .then(function(db) {
    var dc = db.collection('documents');
    var sc = db.collection('schemas');
    dc.ensureIndex({objName: 'text'});
    sc.ensureIndex({objName: 'text'});
    var tc = db.collection('temp');
    var schu = null;
    var aclu = null;
    var evtu = null;

    new Promise(function(resolve, reject) {
      var ids = {};
      var interfaces = ['BaseObjectInterface', 'ContentInterface', 'FolderInterface', 'GroupInterface', 'StoreInterface', 'UserInterface', 'BinaryInterface'];
      var promises = interfaces.map(function(interfaceName) {
        return new Promise(function(resolve, reject) {
          sc.find({'objName': interfaceName}).limit(1).next(function(err, sch) {
            if(!err && sch) {
              return resolve(sch._id);
            } else if(!err) {
              return sc.insertOne(require('./interfaces/'+interfaceName), {checkKeys: false})
              .then(function(inserted) {
                resolve(inserted.insertedId);
              })
              .catch(function(err) {
                reject(err);
              });
            }
            reject('No base document schema found '+err);
          });
        }).then(function(intId) {
          ids[interfaceName] = intId;
        });
      });
      resolve(Promise.all(promises).then(function(){ return ids; }));
    }).then(function(ids) {
      schu = require('./util/schema')(ids, dc, sc);
      aclu = require('./util/acl')(ids, dc, sc);
      evtu = require('./util/event')(bqueue, aclu);
      require('./triggers')(db, wqueue, evtu);
      return ids;
    }).then(function(ids) {

      version.use(function(req, res, next) {
        aclu.groups(req)
        .then(next);
      });

      version.get('/schema', aclu.readFilter, schu.idToOID('query'), function(req, res, next) {
        sc.find(extend(req.query, req.filter)).toArray(function(err, schs) {
          if(err) return res.status(500).send(err);
          aclu.propertiesFilter(req, schs)
          .then(function(schs) {
            res.json(schs);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        });
      });

      version.get('/schema/implementable', aclu.readFilter, schu.idToOID('query'), function(req, res, next) {
        sc.find(extend(req.query, req.filter)).toArray(function(err, schs) {
          if(err) return res.status(500).send(err);
          aclu.propertiesFilter(req, schs)
          .then(function(schs) {
            return Promise.all(schs.map(function(sch) {
              return new Promise(function(resolve, reject) {
                aclu.schemaImplementable(req, [sch])
                .then(function(){
                  resolve(sch);
                })
                .catch(function() {
                  resolve();
                });
              });
            }));
          })
          .then(function(schs) {
            var filtered = schs.filter(function(sch) {
              return !!sch;
            });
            return filtered;
          })
          .then(function(schs) {
            res.json(schs);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        });
      });

      version.post('/schema', function(req, res, next) {
        aclu.groups(req)
        .then(function() {
          if(!req.body.objSecurity) req.body.objSecurity = {inmutable: false, implementable: ['owner']};
          req.body.objSecurity.owner = req.pgid||[];
          return schu.validate(req.body);
        })
        .then(function() {
          sc.insertOne(req.body)
          .then(function(inserted) {
            var doc = inserted.ops[0];
            wqueue.emit('insert:schema', doc);
            evtu.emitGroupEvent('insert:schema', doc);
            res.send(doc);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        })
        .catch(function(err) {
          res.status(400).send(err);
        });
      });

      version.put('/schema/:id', aclu.access(['params', 'id'], 'update', ['body']), function(req, res, next) {
        if(req.body._id) delete req.body._id;
        var old = null;
        aclu.groups(req)
        .then(function() {
          return new Promise(function(resolve, reject) {
            sc.find({"_id": new oid(req.params.id)}).limit(1).next(function(err, sch) {
              if(err) return reject(err);
              resolve(sch);
            });
          });
        })
        .then(function(old) {
          sc.findOneAndUpdate({"_id": new oid(req.params.id)}, {$set: req.body}, {returnOriginal: false})
          .then(function(updated) {
            wqueue.emit("update:schema", updated.value, old);
            evtu.emitGroupEvent('update:schema', updated.value, old);
            res.send(updated.value);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        })
        .catch(function(err) {
          res.status(400).send(err);
        });
      });

      version.delete('/schema/:id', aclu.access(['params', 'id'], 'delete'), function(req, res, next) {
        dc.find({"objInterface": req.params.id}).limit(1).next(function(err, sch) {
          if(err) return res.status(500).send(err);
          if(sch) return res.status(400).send("Interface used by other document");
          sc.findOneAndDelete({"_id": new oid(req.params.id)})
          .then(function(deleted) {
            wqueue.emit("delete:schema", null, deleted.value);
            evtu.emitGroupEvent('delete:schema', null, deleted.value);
            res.status(204).send();
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        });
      });

      version.get('/schema/:id', aclu.readFilter, function(req, res, next) {
        sc.find(extend({"_id": new oid(req.params.id)}, req.filter)).limit(1).next(function(err, sch) {
          if(err) return res.status(500).send(err);
          aclu.propertiesFilter(req, sch)
          .then(function(sch) {
            res.json(sch);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        });
      });

      version.get('/', aclu.readFilter, schu.idToOID('query'), function(req, res, next) {
        dc.find(extend(req.query, req.filter)).toArray(function(err, docs) {
          if(err) return res.status(500).send(err);
          aclu.propertiesFilter(req, docs)
          .then(function(docs) {
            res.json(docs);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        });
      });

      version.post('/', aclu.schemaAccess(['body', 'objInterface'], true), function(req, res, next) {
        if(!req.body.objSecurity) req.body.objSecurity = {inmutable: false};
        req.body.objSecurity.owner = req.pgid;
        schu.validate(req.body)
        .then(function() {
          dc.insertOne(req.body)
          .then(function(inserted) {
            if(req.body.objInterface) req.body.objInterface.forEach(function(iface) {
              wqueue.emit("insert:"+iface, inserted.ops[0]);
            });
            evtu.emitGroupEvent('insert:document', inserted.ops[0]);
            res.send(inserted.ops[0]);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        })
        .catch(function(err) {
          res.status(400).send(err);
        });
      });

      version.get('/:id', aclu.readFilter, function(req, res, next) {
        dc.find(extend({"_id": new oid(req.params.id)}, req.filter)).limit(1).next(function(err, doc) {
          if(err) return res.status(500).send(err);
          if(!doc) return res.status(404).send('Document Not Found');
          aclu.propertiesFilter(req, doc)
          .then(function(doc) {
            res.json(doc);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        });
      });

      version.put('/:id/lock', aclu.access(['params', 'id'], 'update'), function(req, res, next) {
        dc.findOneAndUpdate({"_id": new oid(req.params.id)}, {$set: {"objSecurity.locked": {user: req.pgid[0], date: moment().utc().format()}}}, {returnOriginal: false})
        .then(function(doc) {
          if(!doc) return Promise.reject('Document Not Found');
          aclu.propertiesFilter(req, doc)
          .then(function(doc) {
            res.json(doc);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        })
        .catch(function(err) {
          res.status(400).send(err);
        });
      });

      version.delete('/:id/lock', aclu.access(['params', 'id'], 'update'), function(req, res, next) {
        dc.findOneAndUpdate({"_id": new oid(req.params.id)}, {$unset: {"objSecurity.locked": ""}}, {returnOriginal: false})
        .then(function(doc) {
          if(!doc) return Promise.reject('Document Not Found');
          aclu.propertiesFilter(req, doc)
          .then(function(doc) {
            res.json(doc);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        })
        .catch(function(err) {
          res.status(400).send(err);
        });
      });

      version.put('/:id', aclu.schemaAccess(['body', 'objInterface'], true), aclu.access(['params', 'id'], 'update', ['body']), function(req, res, next) {
        if(req.body._id) delete req.body._id;
        var old = null;
        dc.find({"_id": new oid(req.params.id)}).limit(1).next(function(err, doc) {
          old = extend({}, doc);
          delete doc._id;
          tc.insertOne(doc)
          .then(function(i) {
            return tc.findOneAndUpdate({"_id": i.insertedId}, {$set: req.body}, {returnOriginal: false});
          })
          .then(function(u) {
            tc.deleteOne({"_id": u.value._id});
            return schu.validate(u.value);
          })
          .then(function() {
            dc.findOneAndUpdate({"_id": new oid(req.params.id)}, {$set: req.body}, {returnOriginal: false})
            .then(function(updated) {
              if(updated.value.objInterface) updated.value.objInterface.forEach(function(iface) {
                wqueue.emit("update:"+iface, updated.value, old);
              });
              evtu.emitGroupEvent('update:document', updated.value, old);
              res.send(updated.value);
            })
            .catch(function(err) {
              res.status(500).send(err);
            });
          })
          .catch(function(err) {
            res.status(400).send(err);
          });
        });
      });

      version.delete('/:id', aclu.access(['params', 'id'], 'delete'), function(req, res, next) {
        dc.findOneAndDelete({"_id": new oid(req.params.id)})
        .then(function(deleted) {
          if(deleted.value.objInterface) deleted.value.objInterface.forEach(function(iface) {
            wqueue.emit("delete:"+iface, null, deleted.value);
          });
          evtu.emitGroupEvent('delete:document', null, deleted.value);
          res.status(204).send();
        })
        .catch(function(err) {
          res.status(500).send(err);
        });
      });

      version.put('/:id/replace', aclu.access(['params', 'id'], 'replace'), function(req, res, next) {
        if(req.body._id) delete req.body._id;
        var old = null;
        dc.find({"_id": new oid(req.params.id)}).limit(1).next(function(err, doc) {
          old = doc;
          req.newInts = (req.body.objInterface||[]).filter(function(iface) {
            return !(doc.objInterface||[]).includes(iface);
          });
          aclu.schemaAccess(['newInts'], true)(req, res, function(err) {
            if(err) return res.status(500).send(err);
            schu.validate(req.body)
            .then(function() {
              dc.findOneAndUpdate({"_id": new oid(req.params.id)}, req.body, {returnOriginal: false})
              .then(function(updated) {
                if(updated.value.objInterface) updated.value.objInterface.forEach(function(iface) {
                  wqueue.emit("update:"+iface, updated.value, old);
                });
                evtu.emitGroupEvent('update:document', inserted.ops[0], old);
                res.send(updated.value);
              })
              .catch(function(err) {
                res.status(500).send(err);
              });
            })
            .catch(function(err) {
              res.status(400).send(err);
            });
          });
        });
      });

      version.post('/binary/', function(req, res, next) {
        var writeFile = function(filePath, fileName) {
          fs.ensureFile(filePath, function(err) {
            if(err) return res.status(500).send("Could not create file directory");
            var stream = fs.createWriteStream(filePath);
            stream.on('error', function(err) {
              res.status(500).send("Could not create file");
            });
            req.pipe(stream);
            req.on('end', function() {
              //Guardar documento en mongo y devolverlo
              //Por ahora, todos los documentos son de tipo "internal"
              dc.insertOne({
                objName: req.query.name,
                objInterface: [ids.BinaryInterface],
                objSecurity: {
                  inmutable: false,
                  owner: req.pgid
                },
                path: url.resolve('/api/v1/binary/', fileName),
                internal: true})
              .then(function(inserted) {
                res.send(inserted.ops[0]);
                wqueue.emit("insert:"+ids.BinaryInterface, inserted.ops[0]);
              })
              .catch(function(err) {
                res.status(400).send(err);
              });
            });
            req.on('error', function(err) {
              res.status(500).send("Could not create file");
            });
          });
        };
        var mkName = function() {
          var fileName = crypto.createHash('md5').update(Math.random()+"").update(new Date().toISOString()).digest('hex');
          var filePath = path.join((config.filePath||path.join(__dirname, '..', 'documents')), fileName.substr(0, 2), fileName);
          fs.stat(filePath, function(err) {
            if(err) writeFile(filePath, fileName);
            else mkName();
          });
        };
        mkName();
      });

      version.get('/binary/:id', function(req, res, next) {
        var filePath = path.join((config.filePath||path.join(__dirname, '..', 'documents')), req.params.id.substr(0, 2), req.params.id);
        fs.stat(filePath, function(err) {
          if(err) return res.status(404).send('File not Found');
          var stream = fs.createReadStream(filePath);
          stream.on('error', function(err) {
            res.status(500).send(err);
          });
          stream.pipe(res);
        });
      });
    })
    .catch(function(err) {
      console.log(err);
    });
  })
  .catch(function(err) {
    console.log('Could not connect to Mongo '+mongoUrl+' '+err);
    process.exit();
  });

  return version;
};
