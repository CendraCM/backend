var Promise = require('promise');
var oid = require('mongodb').ObjectID;
var moment = require('moment');

module.exports = function(ids, dc, sc) {

  var groups = function(req) {
    return new Promise(function(resolve, reject){
      if(req.user || !req.token || !req.token.sub) return resolve();
      dc.find({objInterface: ids.UserInterface.toHexString(), "user.externalId": req.token.sub}).limit(1).next(function(err, user) {
        if(user) req.user = user;
        resolve();
      });
    })
    .then(function() {
      if(req.groups||!req.user) return Promise.resolve();
      return new Promise(function(resolve, reject) {
        dc.find({objInterface: ids.GroupInterface.toHexString(), "group.objLinks": req.user._id.toHexString()}).toArray(function(err, groups) {
          if(groups) req.groups = groups;
          resolve();
        });
      });
    })
    .then(function() {
      req.root = req.root||false;
      req.gid=req.gid||[];
      req.pgid = req.pgid||[];
      if(!req.gid.length && req.groups && req.groups.length) {
        req.groups.forEach(function(instance) {
          if(!req.root) req.root=instance.group.rootGroup;
          if(!req.system) req.system=instance.group.systemGroup;
          req.gid.push(instance._id.toString());
          if(instance.group.personalGroup) req.pgid.push(instance._id.toString());
        });
      }
      if(!req.groups) req.groups=[];
      return Promise.resolve();
    });
  };

  var propertiesFilter = function(req, docs) {
    //return Promise.resolve(docs);
    var wasNotArray = false;
    if(!Array.isArray(docs)) {
      wasNotArray=true;
      docs = [docs];
    }
    if(req.root) return Promise.resolve(docs);
    return Promise.all(docs.map(function(doc) {
      return new Promise(function(resolve, reject) {
        if(req.gid.concat((req.user&&req.user._id.toHexString())||[]).indexOf(doc._id.toHexString())!==-1) return resolve(doc);
        if(doc.objSecurity.acl && doc.objSecurity.acl["group:public"] && doc.objSecurity.acl["group:public"].properties && doc.objSecurity.acl["group:public"].properties.hasOwnProperty("properties:all")) {
          return resolve(doc);
        }
        isOwner = false;
        hasAllProperties = false;
        allowedProps = [];
        req.gid.forEach(function(id) {
          if(!isOwner && !hasAllProperties) {
            if(doc.objSecurity.owner.indexOf(id) !== -1) isOwner = true;
            if(!isOwner && doc.objSecurity.acl[id] && doc.objSecurity.acl[id].properties && doc.objSecurity.acl[id].properties.hasOwnProperty('properties:all')) {
              hasAllProperties = true;
            }
            if(!isOwner && !hasAllProperties && doc.objSecurity.acl[id] && doc.objSecurity.acl[id].properties) {
              for(var i in doc.objSecurity.acl[id].properties) {
                if(allowedProps.indexOf(i) === -1)
                  allowedProps.push(i);
              }
            }
          }
        });
        if(isOwner || hasAllProperties) return resolve(doc);
        Object.keys(doc).forEach(function(key) {
          if(key.substr(0,3) != 'obj' && allowedProps.indexOf(key) === -1) {
            delete doc[key];
          }
        });
        resolve(doc);
      });
    }))
    .then(function(docs) {
      return (wasNotArray)?docs[0]:docs;
    });
  };

  var readFilter = function(req, res, next) {
    req.filter = {};
    //return next();
    groups(req)
    .then(function() {
      //Get all public documents
      if(req.root) {
        req.filter={};
        return next();
      }
      req.filter = {"objSecurity.acl.group:public": {$exists: true}};
      if(req.groups.length) {
        req.filter = {$or: [req.filter]};

        //Is the same object
        req.filter.$or.push({_id: {$in: req.gid.map(function(id) {return new oid(id);}).concat([req.user._id])}});

        //Group is owner
        req.filter.$or.push({"objSecurity.owner": {$in: req.gid}});

        //Group has read access
        req.gid.forEach(function(id) {
          var filter = {};
          filter["objSecurity.acl."+id]={$exists: true};
          req.filter.$or.push(filter);
        });
      }
      next();
    });
  };

  var schemaImplementable = function(req, schs) {
    return Promise.all(schs.map(function(sch) {
      return new Promise(function(resolve, reject) {
        if(sch.objSecurity.implementable.includes('none')) return reject({status: 403, msg: "Access Forbiden"});
        if(req.root) return resolve();
        if(sch.objSecurity.implementable.includes('any')) return resolve();
        if(sch.objSecurity.implementable.includes('system') && req.system) return resolve();
        var intersectedOwners = (sch.objSecurity.owner||[]).filter(function(owner) {
          return req.gid.includes(owner);
        });
        if(intersectedOwners.length) return resolve();
        var intersectedAllowed = sch.objSecurity.implementable.filter(function(allowed) {
          return req.gid.allowed;
        });
        if(intersectedAllowed.length) return resolve();
        return reject({status: 403, msg: "Access Forbiden"});
      });
    }));
  };

  var schemaAccess = function(from, fromInterface) {
    return function(req, res, next) {
      groups(req)
      .then(function() {
        var isImplementable = function() {
          sc.find({_id: {$in: req.schs.map(function(id) { return new oid(id);})}}).toArray(function(err, schs) {
            schemaImplementable(req, schs)
            .then(function(){
              next();
            })
            .catch(function(err) {
              res.status(err.status).send(err.msg);
            });
          });
        };
        if(req.schs) return isImplementable();

        var ids = from.reduce(function(memo, key) {
          return memo[key];
        }, req);
        if(!Array.isArray(ids)) ids = [ids];

        if(fromInterface) {
          req.schs = ids;
          if(!req.schs.length) return next();
          isImplementable();
        } else {
          dc.find({_id: {$in: ids.map(function(id) { return new oid(id); })}}).toArray(function(err, docs) {
            req.schs = [];
            docs.forEach(function(doc) {
              if(doc.objInterface) doc.objInterface.forEach(function(ifName) {
                if(req.schs.indexOf(ifName) === -1) req.schs.push(ifName);
              });
            });
            if(!req.schs.length) return next();
            isImplementable();
          });
        }

      });
    };
  };

  var access = function(from, action, prs) {
    return function(req, res, next) {
      //return next();
      var ids = from.reduce(function(memo, key) {
        return memo[key];
      }, req);
      if(prs) {
        props = prs.reduce(function(memo, key) {
          return memo[key];
        }, req);
      }
      if(!Array.isArray(ids)) ids = [ids];
      groups(req)
      .then(function() {
        if(req.docs) Promise.resolve();
        return new Promise(function(resolve, reject) {
          dc.find({_id: {$in: ids.map(function(id) { return new oid(id);})}}).toArray(function(err, docs) {
            resolve(docs);
          });
        });
      })
      .then(function(docs) {
        if(req.docs) Promise.resolve();
        return new Promise(function(resolve, reject) {
          sc.find({_id: {$in: ids.map(function(id) { return new oid(id);})}}).toArray(function(err, schs) {
            resolve(docs.concat(schs));
          });
        });
      })
      .then(function(docs) {
        if(!req.docs) req.docs = docs;
        Promise.all(req.docs.map(function(doc) {
          return new Promise(function(resolve, reject) {
            if(!doc) return reject({status: 404, msg: "Document not found"});
            if(action != 'read' && doc.objSecurity.inmutable) return reject({status: 403, msg: "Document is inmutable"});
            if(req.root) return resolve();
            if(action != 'read' && !req.root && doc.objSecurity.locked && !req.gid.includes(doc.objSecurity.locked.user) && moment(doc.objSecurity.locked.date).isSameOrAfter(moment().subtract(1, 'd'))) {
              return reject({status: 409, msg: "Document locked for update"});
            }
            if(req.groups.length || action == 'read') {
              if(req.gid.indexOf(doc._id.toString())!==-1) return resolve();
              if(doc.objSecurity.owner) {
                var isOwner = false;
                doc.objSecurity.owner.forEach(function(owner) {
                  if(!isOwner && req.gid.indexOf(owner)!==-1) isOwner = true;
                });
                if(isOwner) return resolve();
              }
              //delete and replace can only be done by root or owner
              if(['delete', 'replace'].indexOf(action) === -1  && doc.objSecurity.acl) {
                var doResolve = true;
                var hasWriteAccess = false;
                var hasReadAccess = false;
                var hasReadAllProperties = false;
                var hasAllProperties = false;
                var allowedProps = [];
                if(doc.objSecurity.acl["group:public"]) {
                  hasReadAccess = true;
                  if(doc.objSecurity.acl["group:public"].write) hasWriteAccess = true;
                  if(doc.objSecurity.acl["group:public"].properties && doc.objSecurity.acl["group:public"].properties.hasOwnProperty("properties:all")) {
                    hasReadAllProperties = true;
                    if(doc.objSecurity.acl["group:public"].properties["properties:all"]) hasAllProperties = true;
                  }
                }
                if(hasReadAllProperties && action == 'read') return resolve();
                req.gid.forEach(function(id) {
                  if(!hasWriteAccess && doc.objSecurity.acl[id]) {
                    hasReadAccess = true;
                    if(doc.objSecurity.acl[id].write) hasWriteAccess = true;
                  }
                  if(hasReadAccess && !hasAllProperties && doc.objSecurity.acl[id] && doc.objSecurity.acl[id].properties && doc.objSecurity.acl[id].properties.hasOwnProperty("properties:all")) {
                    hasReadAllProperties = true;
                    if(doc.objSecurity.acl[id].properties["properties:all"]) hasAllProperties = true;
                  }
                  if(hasReadAccess && !hasAllProperties && doc.objSecurity.acl[id] && doc.objSecurity.acl[id].properties) {
                    for(var i in doc.objSecurity.acl[id].properties) {
                      if(allowedProps.indexOf(i) === -1 && doc.objSecurity.acl[id].properties[i])
                        allowedProps.push(i);
                    }
                  }
                });
                if(!hasReadAccess) return reject({status: 403, msg: "Access Forbiden"});
                if(hasReadAllProperties && action == 'read') return resolve();
                if(props) {
                  for(var i in props) {
                    if(action != 'read' && i.substr(0,3)=='obj' && !hasWriteAccess) {
                      doResolve = false;
                      break;
                    } else if(action != 'read' && !hasAllProperties && allowedProps.indexOf(i) === -1) {
                      doResolve = false;
                      break;
                    } else if(allowedProps.indexOf(i) === -1) {
                      doResolve = false;
                      break;
                    }
                  }
                }
                if(doResolve) return resolve();
              }
            }
            reject({status: 403, msg: "Access Forbiden"});
          });
        }))
        .then(function(){
          next();
        })
        .catch(function(err) {
          res.status(err.status).send(err.msg);
        });
      });
    };
  };

  return {
    groups: groups,
    propertiesFilter: propertiesFilter,
    readFilter: readFilter,
    access: access,
    schemaImplementable: schemaImplementable,
    schemaAccess: schemaAccess
  };
};
