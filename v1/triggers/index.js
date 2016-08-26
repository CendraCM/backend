var fs = require('fs');
var Promise = require('promise');


module.exports = function(db, queue, evtu) {
  var dc = db.collection('documents');
  var sc = db.collection('schemas');
  var ids = {};

  var schu = require('../util/schema')(ids, dc, sc);

  var wrapper = {
    tg: {
      insertOne: function(doc, options, callback) {
        return wrapper.insertOne(doc, options)
          .then(function(result) {
            result.ops.forEach(function(doc) {
              if(doc.objInterface) doc.objInterface.forEach(function(ifId) {
                queue.emit('insert:'+ifId, doc);
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
                queue.emit('insert:'+ifId, doc);
              });
            });
            return Promise.resolve(result);
          }, function(err) {
            return Promise.reject(err);
          })
          .nodeify(callback);
      },
      updateOne: function(filter, update, options, callback) {
        return wrapper.updateOne(filter, update, options)
          .then(function(result) {
            dc.find(filter).limit(1)
            .next(function(err, doc) {
              if(!err && doc && doc.objInterface) doc.objInterface.forEach(function(ifId) {
                queue.emit('update:'+ifId, doc);
              });
            });
            return Promise.resolve(result);
          }, function(err) {
            return Promise.reject(err);
          })
          .nodeify(callback);
      },
      updateMany: function(filter, update, options, callback) {
        return wrapper.updateMany(filter, update, options)
          .then(function(result) {
            dc.find(filter)
            .then(function(docs) {
              docs.forEach(function(doc) {
                if(doc.objInterface) doc.objInterface.forEach(function(ifId) {
                  queue.emit('update:'+ifId, doc);
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
            evtu.emitGroupEvent('insert:document', doc);
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
              evtu.emitGroupEvent('insert:document', doc);
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

  var addTg = function(name) {
    process.nextTick(function() {
      queue.removeAllListeners('insert:'+ids[name]);
      queue.removeAllListeners('update:'+ids[name]);
      queue.removeAllListeners('delete:'+ids[name]);
      try {
        var schTg = require('./'+name);
        var triggers = schTg(queue, ids, wrapper);
        for(var iud in triggers) {
          if(triggers[iud] instanceof Array) {
            triggers[iud].forEach(function(fn) {
              if(fn instanceof Function) {
                if(iud.toLowerCase().indexOf("i")!== -1) queue.on('insert:'+ids[name], fn);
                if(iud.toLowerCase().indexOf("u")!== -1) queue.on('update:'+ids[name], fn);
                if(iud.toLowerCase().indexOf("d")!== -1) queue.on('delete:'+ids[name], fn);
              }
            });
          } else if(triggers[iud] instanceof Function) {
            if(iud.toLowerCase().indexOf("i")!== -1) queue.on('insert:'+ids[name], triggers[iud]);
            if(iud.toLowerCase().indexOf("u")!== -1) queue.on('update:'+ids[name], triggers[iud]);
            if(iud.toLowerCase().indexOf("d")!== -1) queue.on('delete:'+ids[name], triggers[iud]);
          }
        }
      } catch(e){}
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

  queue.on('insert:schema', readSch);

  fs.watch(__dirname, readSch);

  readSch();

};
