module.exports = function(emitter, ids, dc) {
  return {
    i: function(doc){
      dc.insertOne({
        objName: doc.objName+'Group',
        objInterface: [ids.GroupInterface],
        objSecurity: {
          inmutable: false
        },
        personalGroup: true,
        rootGroup: false,
        objLinks: [doc._id]
      });
    }
  };
};
