var Promise = require('promise');
var oid = require('mongodb').ObjectID;
var JSV = require("JSV").JSV;
var jsv = JSV.createEnvironment();

module.exports = function(ids, dc, sc) {

  var aclu = require('./acl')(ids, dc, sc);

  var isEmptyObject = function(obj) {
    for(var i in obj) {
      return false;
    }
    return true;
  };

  var compatible = function(sch1, sch2) {
    if(sch1 != sch2) {
      if(isEmptyObject(sch1)||isEmptyObject(sch2)) return true;
      if(sch1.type != sch2.type) return false;
      if(sch1.type == 'object') {
        for(var i in sch1.properties) {
          if(sch2.properties.hasOwnProperty(i) && !compatible(sch1.properties[i], sch2.properties[i])) return false;
        }
      }
      if(sch1.type == 'array') {
        //Hay por lo menos un items no definido?
        if(!sch1.items||!sch2.items) return true;
        //Ambos items son array?
        var arrayEquals = true;
        if(Array.isArray(sch1.items) && Array.isArray(sch2.items)) {
          var min = sch1.items.length<sch2.items.length?sch1.items:sch2.items;
          var max = sch1.items.length<sch2.items.length?sch2.items:sch1.items;
          min.forEach(function(item, i) {
            if(arrayEquals) {
              arrayEquals = compatible(item, max[i]);
            }
          });
          return arrayEquals;
        }
        //Hay un items que es array y otro object?
        if(Array.isArray(sch1.items) || Array.isArray(sch2.items)) {
          var arr = Array.isArray(sch1.items)?sch1.items:sch2.items;
          var obj = sch2.items==arr?sch1.items:sch2.items;
          arr.forEach(function(item, i) {
            if(arrayEquals) {
              arrayEquals = compatible(item, obj);
            }
          });
          return arrayEquals;
        }
        //Ambos items son object
        return compatible(sch1.items, sch2.items);
      }
    }
    return true;
  };

  var reduce = function(req, filter) {
    return new Promise(function(resolve, reject) {
      if(Array.isArray(filter)) filter = {'_id': {$in: filter}};
      sc.find(filter).toArray(function(err, schs) {
        if(err) return reject(err);
        resolve(schs);
      });
    })
    .then(function(schs) {
      return new Promise(function(resolve, reject) {
        try {
          var schemas = schs.reduce(function(memo, item) {
            if(!compatible(memo, item)) throw 'Incompatible Schemas';
            if(!memo.objInterface) memo.objInterface=[];
            memo.objInterface.push(item._id);
            return extend(true, memo, item);
          }, {});
          aclu.propertiesFilter(req, schemas)
          .then(function(schemas) {
            resolve(schemas);
          })
          .catch(function(error) {
            reject(error);
          });
        } catch(error) {
          return reject(error);
        }

      });
    });
  };

  var validate = function(doc) {
    return sc.find({_id: ids.BaseObjectInterface}).limit(1).next()
      .then(function(iBase) {
        var report = jsv.validate(doc, iBase);
        if(report.errors.length) {
          return Promise.reject(report.errors);
        }
        return Promise.resolve();
      })
      .then(function() {
        if(!doc.objInterface) return Promise.resolve();
        var iPromises = doc.objInterface.map(function(schemaID) {
          return new Promise(function(resolve, reject) {
            sc.find({_id: new oid(schemaID)}).limit(1).next(function(err, sch) {
              if(err) return reject(err);
              var name = sch.objName;
              var strname = sch.objName.substr(0, sch.objName.indexOf("Interface"));
              var subdoc = doc[name] || doc[name.toLowerCase()] || doc[strname] || doc[strname.toLowerCase()];
              var report = jsv.validate(subdoc||{}, sch);
              if(report.errors.length) {
                err = {};
                err[sch.objName] = report.errors;
                return reject(err);
              }
              return resolve();
            });
          });
        });
        return Promise.all(iPromises);
      });
  };

  var idToOID = function(from) {
    if(!Array.isArray(from)) from = [from];
    return function(req, res, next) {
      var data = from.reduce(function(memo, key) {
        return memo[key];
      }, req);
      var srchId = function(data) {
        switch(typeof data) {
          case 'object':
            if(data._id) return trValue(data, '_id');
            for(var i in data) {
              srchId(data[i]);
            }
            break;
          case 'array':
            data.forEach(srchId);
            break;
        }
      };
      var trValue = function(data, key) {
        switch(typeof data[key]) {
          case 'string':
            data[key] = new oid(data[key]);
            break;
          case 'object':
            for(var i in data[key]) {
              trValue(data[key], i);
            }
            break;
          case 'array':
            data.forEach(trValue);
            break;
        }
      };
      srchId(data);
      next();
    };
  };

  return {
    isEmptyObject: isEmptyObject,
    compatible: compatible,
    reduce: reduce,
    validate: validate,
    idToOID: idToOID
  };
};
