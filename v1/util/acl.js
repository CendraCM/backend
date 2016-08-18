var Promise = require('promise');
var oid = require('mongodb').ObjectID;

module.exports = function(ids, dc, sc) {

  var groups = function(req) {
    return new Promise(function(resolve, reject){
      if(req.user) return resolve();
      if(req.user || !req.token||!req.token.sub) return resolve();
      dc.find({objInterface: ids.UserInterface, externalId: req.token.sub}).limit(1).then(function(err, user) {
        if(user) req.user = user;
        resolve();
      });
    })
    .then(function() {
      if(req.groups||!req.user) return Promise.resolve();
      return new Promise(function(resolve, reject) {
        dc.find({objInterface: ids.GroupInterface, objLinks: user._id}).limit(1).then(function(err, groups) {
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
        req.groups.forEach(function(group) {
          if(!req.root) req.root=group.rootGroup;
          req.gid.push(group._id);
          if(req.personalGroup) req.pgid.push(group._id);
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
        if(req.gid.indexOf(doc._id)!==-1) return resolve(doc);
        if(doc.objSecurity.acl && doc.objSecurity.acl["group:public"] && doc.objSecurity.acl["group:public"].properties && doc.objSecurity.acl["group:public"].properties.hasOwnProperty("properties:all")) {
          return resolve(doc);
        }
        isOwner = false;
        hasAllProperties = false;
        allowedProps = [];
        req.gid.forEach(function(id) {
          if(!isOwner && !hasAllProperties) {
            if(doc.owner.indexOf(id) !== -1) isOwner = true;
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
        req.filter.$or.push({_id: {$in: req.gid.map(function(id) {return new oid(id);})}});

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

  var schemaAccess = function(from, fromInterface) {
    return function(req, res, next) {
      if(req.schs) return access(['schs'], 'read')(req, res, next);
      var ids = from.reduce(function(memo, key) {
        return memo[key];
      }, req);
      if(!Array.isArray(ids)) ids = [ids];
      if(fromInterface) {
        req.schs = ids;
        if(!req.schs.length) return next();
        access(['schs'], 'read')(req, res, next);
      } else {
        dc.find({_id: {$in: ids.map(function(id) { return new oid(id); })}}).toArray(function(err, docs) {
          req.schs = [];
          docs.forEach(function(doc) {
            if(doc.objInterface) doc.objInterface.forEach(function(ifName) {
              if(req.schs.indexOf(ifName) === -1) req.schs.push(ifName);
            });
          });
          if(!req.schs.length) return next();
          access(['schs'], 'read')(req, res, next);
        });
      }

    };
  };

  var access = function(from, action, props) {
    return function(req, res, next) {
      //return next();
      var ids = from.reduce(function(memo, key) {
        return memo[key];
      }, req);
      if(props) {
        props = props.reduce(function(memo, key) {
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
            if(req.groups.length || action == 'read') {
              if(req.gid.indexOf(doc._id)!==-1) return resolve();
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
                req.gid.forEach(function(id) {
                  if(!hasWriteAccess && doc.objSecurity.acl[id]) {
                    hasReadAccess = true;
                    if(doc.objSecurity.acl[id].write) hasWriteAccess = true;
                  }
                  if(hasReadAccess && !hasAllProperties && doc.objSecurity.acl[id].properties && doc.objSecurity.acl[id].properties.hasOwnProperty("properties:all")) {
                    hasReadAllProperties = true;
                    if(doc.objSecurity.acl[id].properties["properties:all"]) hasAllProperties = true;
                  }
                  if(hasReadAccess && !hasAllProperties && doc.objSecurity.acl[id].properties) {
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
    schemaAccess: schemaAccess
  };
};
