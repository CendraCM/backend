module.exports = function(emitter, ids, dc) {
  return {
    i: function(doc){
      dc.insertOne({
        objName: doc.objName+'Group',
        objInterface: [ids.GroupInterface.toString()],
        objSecurity: {
          inmutable: false
        },
        group: {
          personalGroup: true,
          rootGroup: false,
          objLinks: [doc._id.toString()]
        }
      }).then(function(group) {
        dc.updateOne({_id: group.insertedId}, {$set: {"objSecurity.owner": [group.insertedId.toString()]}})
        .then(function(result) {
          console.log(result);
        })
        .catch(function(error) {
          console.log(error);
        });
        return dc.insertOne({
          objName: 'Home',
          objInterface: [ids.FolderInterface.toString()],
          objSecurity: {
            inmutable: false,
            owner: [group.insertedId.toString()]
          },
          folder: {
            isCategory: false,
            rootFolder: true,
            objLinks: []
          }
        })
        .then(function(home) {
          return {home: home, group: group};
        });
      })
      .then(function(obj) {
        doc.user.baseDirectory = [obj.home.insertedId.toString()];
        doc.objSecurity.owner = [obj.group.insertedId.toString()];
        dc.updateOne({_id: doc._id}, doc).then(function(result) {
          console.log(result);
        })
        .catch(function(error) {
          console.log(error);
        });
      });
    }
  };
};
