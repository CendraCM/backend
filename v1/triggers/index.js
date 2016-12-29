var fs = require('fs');
var Promise = require('promise');
var jsonpatch = require('fast-json-patch');


module.exports = function(db, queue, evtu) {
  var dc = db.collection('documents');
  var sc = db.collection('schemas');
  var vc = db.collection('versions');
  var ids = {};

  var schu = require('../util/schema')(ids, dc, sc);

  var wrapper = {
    tg: {
      insertOne: function(doc, options, callback) {
        return wrapper.insertOne(doc, options)
          .then(function(result) {
            result.ops.forEach(function(doc) {
              if(doc.objInterface) doc.objInterface.forEach(function(ifId) {
                queue.emit('insert:'+ifId, doc, null, {type: 'trigger'});
              });
            });
            return Promise.resolve(result);
          }, function(err) {
            return Promise.reject(err);
          })
          .nodeify(callback);
      },
      insertMany: function(docs, options, callback) {
        return wrapper.insertMany(docs, options)
          .then(function(result) {
            result.ops.forEach(function(doc) {
              if(doc.objInterface) doc.objInterface.forEach(function(ifId) {
                queue.emit('insert:'+ifId, doc, null, {type: 'trigger'});
              });
            });
            return Promise.resolve(result);
          }, function(err) {
            return Promise.reject(err);
          })
          .nodeify(callback);
      },
      updateOne: function(filter, update, options, callback) {
        var old;
        return new Promise(function(resolve, reject) {
            dc.find(filter).limit(1).next(function(err, doc) {
              if(err) return reject(err);
              old = doc;
              resolve();
            });
          })
          .then(function() {
            return wrapper.updateOne(filter, update, options);
          })
          .then(function(result) {
            dc.find(filter).limit(1)
            .next(function(err, doc) {
              if(!err && doc && doc.objInterface) doc.objInterface.forEach(function(ifId) {
                queue.emit('update:'+ifId, doc, old, {type: 'trigger'});
              });
            });
            return Promise.resolve(result);
          })
          .nodeify(callback);
      },
      updateMany: function(filter, update, options, callback) {
        var olds;
        return dc.find(filter)
          .then(function(result) {
            olds = result;
            return wrapper.updateMany(filter, update, options);
          })
          .then(function(result) {
            dc.find(filter)
            .then(function(docs) {
              docs.forEach(function(doc) {
                var old = olds.filter(function(old) {
                  return doc._id == old._id;
                })[0];
                if(doc.objInterface) doc.objInterface.forEach(function(ifId) {
                  queue.emit('update:'+ifId, doc, old, {type: 'trigger'});
                });
              });
            });
            return Promise.resolve(result);
          }, function(err) {
            return Promise.reject(err);
          })
          .nodeify(callback);
      }
    },
    insertOne: function(doc, options, callback) {
      return new Promise(function(resolve, reject) {
        schu.validate(doc)
        .then(function() {
          dc.insertOne(doc, options, function(err, result) {
            if(err) return reject(err);
            evtu.emitGroupEvent('insert:document', doc);
            resolve(result);
          });
        });
      }).nodeify(callback);

    },
    insertMany: function(docs, options, callback) {
      return Promise.all(docs.map(schu.validate))
      .then(function() {
        return dc.insertMany(docs, options)
        .then(function(result) {
          docs.forEach(function(doc) {
            evtu.emitGroupEvent('insert:document', doc);
          });
          return Promise.resolve(result);
        });
      })
      .nodeify(callback);
    },
    updateOne: function(filter, update, options, callback) {
      return new Promise(function(resolve, reject) {
        schu.validate(update).then(function() {
          return dc.updateOne(filter, update, options);
        })
        .then(function(result) {
          dc.findOne(filter)
          .then(function(doc) {
            evtu.emitGroupEvent('update:document', doc);
          });
          return resolve(result);
        })
        .catch(reject);
      })
      .nodeify(callback);
    },
    updateMany: function(filter, update, options, callback) {
      return new Promise(function(resolve, reject) {
        return schu.validate(update).then(function() {
          return dc.updateMany(filter, update, options);
        })
        .then(function(result) {
          dc.find(filter)
          .then(function(docs) {
            docs.forEach(function(doc) {
              evtu.emitGroupEvent('update:document', doc);
            });
          });
          resolve(result);
        });
      })
      .nodeify(callback);
    },
    find: dc.find.bind(dc),
    findOne: dc.findOne.bind(dc),
    count: dc.count.bind(dc)
  };

  var versionIns = function(type, newDoc, oldDoc, user) {
    var verDoc = {
      doc: newDoc._id,
      type: type,
      objName: newDoc.objName,
      versions: [{
        type: 'create',
        time: Date.now(),
        fw: jsonpatch.compare({}, newDoc),
        user: user
      }]
    };
    vc.insert(verDoc);
  };

  var versionUpd = function(newDoc, oldDoc, user) {
    vc.findOneAndUpdate({doc: oldDoc._id}, {
      $push: {
        versions: {
          type: 'modify',
          time: Date.now(),
          bck: jsonpatch.compare(newDoc, oldDoc),
          fw: jsonpatch.compare(oldDoc, newDoc),
          user: user
        }
      }
    });
  };

  var versionDel = function(newDoc, oldDoc, user) {
    vc.findOneAndUpdate({doc: oldDoc._id}, {
      $push: {
        versions: {
          type: 'remove',
          time: Date.now(),
          bck: jsonpatch.compare({}, oldDoc),
          user: user
        }
      }
    });
  };

  var addTg = function(name) {
    process.nextTick(function() {
      queue.removeAllListeners('insert:'+ids[name]);
      queue.removeAllListeners('update:'+ids[name]);
      queue.removeAllListeners('delete:'+ids[name]);
      var insFn = [];
      var updFn = [];
      var delFn = [];
      try {
        var schTg = require('./'+name);
        var triggers = schTg(queue, ids, wrapper);
        for(var iud in triggers) {
          if(triggers[iud] instanceof Array) {
            var tg = triggers[iud].filter(function(fn) {
              return fn instanceof Function;
            });
            if(iud.toLowerCase().indexOf("i")!== -1) insFn = insFn.concat(tg);
            if(iud.toLowerCase().indexOf("u")!== -1) updFn = updFn.concat(tg);
            if(iud.toLowerCase().indexOf("d")!== -1) delFn = delFn.concat(tg);
          } else if(triggers[iud] instanceof Function) {
            if(iud.toLowerCase().indexOf("i")!== -1) insFn.push(triggers[iud]);
            if(iud.toLowerCase().indexOf("u")!== -1) updFn.push(triggers[iud]);
            if(iud.toLowerCase().indexOf("d")!== -1) delFn.push(triggers[iud]);
          }
        }
      } catch(e){}
      insFn.push(function(newDoc, oldDoc, user) {
        versionIns('document', newDoc, oldDoc, user);
      });
      updFn.push(versionUpd);
      delFn.push(versionDel);
      queue.on('insert:'+ids[name], function(doc, old, user) {
        insFn.forEach(function(fn) {
          fn(doc, null, user);
        });
      });
      queue.on('update:'+ids[name], function(doc, old, user) {
        updFn.forEach(function(fn) {
          fn(doc, old, user);
        });
      });
      queue.on('delete:'+ids[name], function(doc, old, user) {
        updFn.forEach(function(fn) {
          fn(null, old, user);
        });
      });
    });
  };

  var readSch = function() {
    console.log('leyendo configuraciones de triggers');
    sc.find().toArray(function(err, schs) {
      schs.forEach(function(sch) {
        ids[sch.objName] = sch._id;
        addTg(sch.objName);
      });
    });
  };

  queue.on('insert:schema', function(newDoc, oldDoc, user) {
    readSch();
    versionIns('schema', newDoc, oldDoc, user);
  });
  queue.on('update:schema', versionUpd);
  queue.on('delete:schema', versionDel);

  fs.watch(__dirname, readSch);

  readSch();

};
