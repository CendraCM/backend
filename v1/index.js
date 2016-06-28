var mongo = require('mongo-factory');
var oid = require('mongodb').ObjectID;
var express = require('express');
var extend = require('extend');
var config = require('/etc/service-config/service');
var url = 'mongodb://'+config.mongo.host+':'+config.mongo.port+'/'+config.mongo.db;
var fs = require('fs-extra');
var path = requrie('path');
var crypto = require('crypto');

if(process.env.NODE_ENV == 'ci-testing') {
  url += '-ci-testing';
}
var JSV = require("JSV").JSV;
var jsv = JSV.createEnvironment();
var Promise = require('promise');

if(config.redis) {
  var queue = new require('redis-event-queue')(config.redis).workqueue;
} else {
  var queue = new require('events')();
}


module.exports = function() {
  var version = express.Router();
  mongo.getConnection(url)
  .then(function(db) {
    var dc = db.collection('documents');
    var sc = db.collection('schemas');
    var tc = db.collection('temp');

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
      require('trigges')(db, queue);
      return ids;
    }).then(function(ids) {


      var schu = require('./util/schema')(ids, dc, sc);
      var aclu = require('./util/acl')(ids, dc, sc);


      version.get('/schema', aclu.readFilter, function(req, res, next) {
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

      /*version.get('/schema/reduce', aclu.access(['query', 'schemas'], 'read'), function(req, res, next) {
        var schemas = req.query.schemas.map(function(schemaID) {
          return new oid(schemaID);
        });
        schemas.unshift(ids.BaseObjectInterface);
        schu.reduce(req, extend({_id: {$in: schemas}}, req.filter))
        .then(function(sch) {
          res.json(sch);
        })
        .catch(function(err) {
          res.status(500).send(err);
        });
      });*/

      version.post('/schema', function(req, res, next) {
        aclu.groups(req)
        .then(function() {
          if(!req.body.objSecurity) req.body.objSecurity = {inmutable: false};
          req.body.objSecurity.owner = req.pgid||[];
          return schu.validate(req.body);
        })
        .then(function() {
          sc.insertOne(req.body)
          .then(function(inserted) {
            res.send(inserted.ops);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        })
        .catch(function(err) {
          res.status(400).send(err.errors);
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

      version.get('/', aclu.readFilter, function(req, res, next) {
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

      version.post('/', aclu.schemaAccess(['body']), function(req, res, next) {
        if(!req.body.objSecurity) req.body.objSecurity = {inmutable: false};
        req.body.objSecurity.owner = req.pgid;
        schu.validate(req.body)
        .then(function() {
          dc.insertOne(req.body)
          .then(function(inserted) {
            res.send(inserted.ops);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        })
        .catch(function(err) {
          res.status(400).send(report.errors);
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

      version.put('/:id', aclu.access(['params', 'id'], 'update', ['body']), function(req, res, next) {
        if(req.body._id) delete req.body._id;
        dc.find({"_id": new oid(req.params.id)}).limit(1).next(function(err, doc) {
          delete doc._id;
          tc.insertOne(doc)
          .then(function(i) {
            return tc.findOneAndUpdate({"_id": new oid(i.insertedId)}, {$set: req.body});
          })
          .then(function(u) {
            tc.deleteOne({"_id": new oid(i.insertedId)});
            return schu.validate(u.value);
          })
          .then(function() {
            dc.updateOne({"_id": new oid(req.params.id)}, {$set: req.body}).then(function(updated) {
              res.send(updated.upsertedId);
            })
            .catch(function(err) {
              res.status(500).send(err);
            });
          })
          .catch(function(err) {
            res.status(400).send(report.errors);
          });
        });
      });

      version.delete('/:id', aclu.access(['params', 'id'], 'delete'), function(req, res, next) {
        dc.deleteOne({"_id": new oid(req.params.id)})
        .then(function(deleted) {
          res.status(204).send();
        })
        .catch(function(err) {
          res.status(500).send(err);
        });
      });

      version.put('/:id/replace', aclu.access(['params', 'id'], 'replace'), function(req, res, next) {
        if(req.body._id) delete req.body._id;
        schu.validate(req.body)
        .then(function() {
          dc.updateOne({"_id": new oid(req.params.id)}, req.body)
          .then(function(updated) {
            res.send(updated.upsertedId);
          })
          .catch(function(err) {
            res.status(500).send(err);
          });
        })
        .catch(function(err) {
          res.status(400).send(err);
        });
      });

      version.post('/binary/', function(req, res, next) {
        var writeFile = function(filePath) {
          fs.ensureDir(filePath, function(err) {
            if(err) return res.status(500).send("Could not create file directory");
            var stream = fs.createWriteStream(filePath);
            req.pipe(stream);
            req.on('end', function() {
              //Guardar documento en mongo y devolverlo
              //Por ahora, todos los documentos son de tipo "internal"
              dc.insertOne({
                objName: req.query.name,
                objSecurity: {
                  inmutable: false,
                  owner: req.pgid
                },
                path: filePath,
                internal: true})
              .then(function(inserted) {
                res.send(inserted.ops);
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
          var fileName = crypto.createHash('md5').update(Math.random()).update(Date.toISOString()).digest('hex');
          var filePath = path.join((config.filePath||path.join(__dirname, '..', 'documents')), fileName.substr(0, 2), fileName);
          fs.stat(filePath, function(err) {
            if(err) writeFile(filePath);
            else mkName();
          });
        };
        mkName();
      });

      version.get('/binary/:id', function(req, res, next) {
        var filePath = path.join((config.filePath||path.join(__dirname, '..', 'documents')), fileName.substr(0, 2), fileName);
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
    console.log('Could not connect to Mongo '+url+' '+err);
    process.exit();
  });

  return version;
};
