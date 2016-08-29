var oid = require('mongodb').ObjectID;
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
        var gobj = group.ops[0];
        gobj.objSecurity.owner = [group.insertedId.toString()];
        dc.updateOne({_id: group.insertedId}, gobj);
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
        doc._id = new oid(doc._id);
        doc.user.rootFolder = [obj.home.insertedId.toString()];
        doc.objSecurity.owner = [obj.group.insertedId.toString()];
        dc.tg.updateOne({_id: doc._id}, doc).then(function(result) {
          console.log(result);
        })
        .catch(function(error) {
          console.log(error);
        });
      });
    }
  };
};
