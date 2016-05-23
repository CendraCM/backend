module.exports = {
  type: 'object',
  objName: 'StoreInterface',
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
    baseUrl: {
      type: 'string',
      required: true
    }
  }
};
