var Promise = require('promise');

module.exports = function(bqueue, aclu) {
  return {
    emitGroupEvent: function(event, docs) {
      if(!Array.isArray(docs)) docs = [docs];
      docs.forEach(function(doc) {
        bqueue.emit('root:'+event, doc);
        var objSecurity = doc.objSecurity;
        if(objSecurity) {
          if(objSecurity.owner) {
            objSecurity.owner.forEach(function(owner) {
              bqueue.emit(owner+':'+event, doc);
            });
          }
          if(objSecurity.acl) {
            for(var i in objSecurity.acl) {
              aclu.propertiesFilter({gid: [i]}, doc)
              .then(function(doc) {
                bqueue.emit(i+':'+event, doc);
              });
            }
          }
        }
      });
    }
  };
};
