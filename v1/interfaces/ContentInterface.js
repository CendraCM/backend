module.exports = {
  type: 'object',
  objName: 'ContentInterface',
  objIcon: 'archive',
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
    contentType: {
      type: 'string'
    }
  }
};
