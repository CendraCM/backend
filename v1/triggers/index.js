var fs = require('fs');
var Promise = require('promise');


module.exports = function(db, queue) {
  var dc = db.collection('documents');
  var sc = db.collection('schemas');
  var ids = {};

  var schu = require('../util/schema')(ids, dc, sc);

  var wrapper = {
    insertOne: function(doc, options, callback) {
      return schu.validate(doc).then(function() {
        return dc.insertOne(doc, options, callback);
      });
    },
    insertMany: function(docs, options, callback) {
      return Promise.all(docs.map(schu.validate)).then(function() {
        return dc.insertMany(docs, options, callback);
      });
    },
    updateOne: function(filter, update, options, callback) {
      return schu.validate(update).then(function() {
        return dc.updateOne(filter, update, options, callback);
      });
    },
    updateMany: function(filter, update, options, callback) {
      return schu.validate(update).then(function() {
        return dc.updateMany(filter, update, options, callback);
      });
    },
    find: dc.find,
    findOne: dc.findOne,
    count: dc.count
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
