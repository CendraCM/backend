module.exports = {
  type: 'object',
  objName: 'BinaryInterface',
  objSecurity: {
    inmutable: true,
    implementable: ['any'],
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
    path: {
      type: 'string',
      required: true
    },
    store: {
      type: 'string',
      objImplements: {name: 'StoreInterface'}
    },
    internal: {
      type: 'boolean',
      default: true
    }
  }
};
