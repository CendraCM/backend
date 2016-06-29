module.exports = {
  type: 'object',
  objName: 'BinaryInterface',
  objSecurity: {
    inmutable: true,
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
      type: 'string'
    },
    internal: {
      type: 'boolean',
      default: true
    }
  }
};