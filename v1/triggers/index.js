var fs = require('fs');
var schUtil = require('../util');
var JSV = require("JSV").JSV;
var jsv = JSV.createEnvironment();
var Promise = require('promise');


moudle.exports = function(db, queue) {
  var dc = db.collection('documents');
  var sc = db.collection('schemas');
  var ids = {};


  var validate = function(doc) {
    var objInterface = (doc.objInterface || []).map(function(schemaID) {
      return new oid(schemaID);
    });
    objInterface.unshift(ids.BaseObjectInterface);
    return schUtil.reduceSchema(objInterface)
    .then(function(base) {
      var report = jsv.validate(doc, base);
      if(report.errors.length) {
        return Promise.reject(report.errors);
      }
      return Promise.resolve();
    });
  };

  var wrapper = {
    insertOne: function(doc, options, callback) {
      return validate(doc).then(function() {
        return dc.insertOne(doc, options, callback);
      });
    },
    insertMany: function(docs, options, callback) {
      return Promise.all(docs.map(validate)).then(function() {
        return dc.insertMany(docs, options, callback);
      });
    },
    updateOne: function(filter, update, options, callback) {
      return validate(update).then(function() {
        return dc.updateOne(filter, update, options, callback);
      });
    },
    updateMany: function(filter, update, options, callback) {
      return validate(update).then(function() {
        return dc.updateMany(filter, update, options, callback);
      });
    },
    find: dc.find,
    findOne: dc.findOne,
    count: dc.count
  };

  var readSch = function() {
    sc.find().toArray(function(err, schs) {
      schs.forEach(function(sch) {
        ids[sch.objName] = sch._id;
        addTg(sch.objName);
      });
    });
  }

  var addTg = function(name) {
    process.nextTick(function() {
      queue.removeAllListeners('insert:'+name);
      queue.removeAllListeners('update:'+name);
      queue.removeAllListeners('delete:'+name);
      try {
        var schTg = require('./'+name)
        var triggers = schTg(queue, ids, wrapper);
        for(var iud in triggers) {
          if(iud.toLowerCase().indexOf("i")!== -1) {
            if(triggers[iud] instanceof Array) {
              triggers[iud].forEach(function(fn) {
                if(fn instanceof Function) queue.on('insert:'+name, fn);
              });
            } else if(triggers[iud] instanceof Function) {
              queue.on('insert:'+name, triggers[iud]);
            }
          }
          if(iud.toLowerCase().indexOf("u")!== -1) {
            if(triggers[iud] instanceof Array) {
              triggers[iud].forEach(function(fn) {
                if(fn instanceof Function) queue.on('update:'+name, fn);
              });
            } else if(triggers[iud] instanceof Function) {
              queue.on('update:'+name, triggers[iud]);
            }
          }
          if(iud.toLowerCase().indexOf("d")!== -1) {
            if(triggers[iud] instanceof Array) {
              triggers[iud].forEach(function(fn) {
                if(fn instanceof Function) queue.on('delete:'+name, fn);
              });
            } else if(triggers[iud] instanceof Function) {
              queue.on('delete:'+name, triggers[iud]);
            }
          }
        }
      } catch(e){
        if(triggers[name]) delete triggers[name]
      }
    })
  };



}
