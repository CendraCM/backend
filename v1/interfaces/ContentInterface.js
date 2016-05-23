module.exports = {
  type: 'object',
  objName: 'ContentInterface',
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
    contentType: {
      type: 'string'
    }
  }
};
