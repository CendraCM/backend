module.exports = {
  type: 'object',
  objName: 'UserInterface',
  objSecurity: {
    inmutable: true,
    implementable: ['system'],
    acl: {
      "group:public": {
        write: false,
        properties: {
          "properties:all": false
        }
      }
    }
  },
  properties: {
    externalId: {
      type: 'array',
      items: {
        type: 'string'
      },
      uniqueItems: true,
      minItems: 1,
      required: true
    },
    rootFolder: {
      type: 'array',
      items: {
        type: 'string',
        objImplements: {name: 'FolderInterface'}
      },
      uniqueItems: true,
      minItems: 1
    }
  }
};
