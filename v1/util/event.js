var Promise = require('promise');

module.exports = function(bqueue, aclu, dc, ids) {
  return {
    emitGroupEvent: function(event, newDocs, oldDocs) {
      if(!Array.isArray(newDocs)) newDocs = [newDocs];
      if(!Array.isArray(oldDocs)) oldDocs = [oldDocs];
      (newDocs||oldDocs).forEach(function(doc, i) {
        dc.find({objInterface: ids.GroupInterface, rootGroup: true})
        .toArray(function(err, groups) {
          if(groups) groups.forEach(function(group) {
            bqueue.emit(group._id+':root:'+event, newDocs[i]||null, oldDocs[i]||null);
          });
        });
        var objSecurity = doc.objSecurity;
        if(objSecurity) {
          if(objSecurity.owner) {
            objSecurity.owner.forEach(function(owner) {
              bqueue.emit(owner+':'+event, newDocs[i]||null, oldDocs[i]||null);
            });
          }
          if(objSecurity.acl) {
            for(var j in objSecurity.acl) {
              aclu.propertiesFilter({gid: [j]}, [newDocs[i]||null, oldDocs[i]||null])
              .then(function(docs) {
                bqueue.emit(j+':'+event, docs[0], docs[1]);
              });
            }
          }
        }
      });
    }
  };
};
