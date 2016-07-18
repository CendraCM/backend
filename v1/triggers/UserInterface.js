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
      }).then(function(group) {
        return dc.insertOne({
          objName: 'Home',
          objInterface: [ids.FolderInterface.toHexString()],
          objSecurity: {
            inmutable: false,
            owner: [group.insertedId.toHexString()]
          },
          folder: {
            isCategory: false,
            rootFolder: true,
            objLinks: []
          }
        });
      })
      .then(function(home) {
        doc.baseDirectory = [home._id.toHexString()];
        dc.updateOne({_id: doc._id}, doc);
      });
    }
  };
};
