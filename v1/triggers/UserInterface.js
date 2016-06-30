module.exports = function(emitter, ids, dc) {
  return {
    i: function(doc){
      dc.insertOne({
        objName: doc.objName+'Group',
        objInterface: [ids.GroupInterface.toHexString()],
        objSecurity: {
          inmutable: false
        },
        group: {
          personalGroup: true,
          rootGroup: false,
          objLinks: [doc._id.toHexString()]
        }
      });
    }
  };
};
